import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface GitRunOptions {
  cwd?: string;
  input?: string | Buffer;
  timeout?: number;
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
  allowNonZero?: boolean;
  onStderr?: (chunk: string) => void;
}

export interface GitResult {
  stdout: string;
  stderr: string;
  code: number;
  args: string[];
}

export class GitError extends Error {
  readonly code: number;
  readonly stderr: string;
  readonly args: string[];

  constructor(message: string, args: string[], code: number, stderr: string) {
    super(message);
    this.name = 'GitError';
    this.args = args;
    this.code = code;
    this.stderr = stderr;
  }
}

let cachedGitVersion: string | null = null;
let cachedGitPath: string | null = null;

function normalizeGitExecutable(gitPath?: string): string {
  const trimmed = gitPath?.trim();
  if (!trimmed) return 'git';
  if (trimmed === '~') return os.homedir();
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return trimmed;
}

/**
 * VS Code launched from the macOS Dock (or another GUI launcher) does not
 * always inherit the PATH of the user's shell. Add the usual Git locations so
 * `spawn('git')` still works when Homebrew or a manual install is not on the
 * extension host's PATH.
 */
function gitEnvironment(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const current = process.env.PATH ?? '';
  const candidates =
    process.platform === 'win32'
      ? [
          path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'cmd'),
          path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Git', 'cmd'),
          current
        ]
      : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', current];
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const entry of candidates) {
    if (!entry) continue;
    for (const part of entry.split(path.delimiter)) {
      if (part && !seen.has(part)) {
        seen.add(part);
        parts.push(part);
      }
    }
  }
  return {
    ...process.env,
    LC_ALL: 'C',
    LANG: 'C',
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
    PATH: parts.join(path.delimiter),
    ...extra
  };
}

function assertWorkingDirectory(cwd: string): void {
  try {
    if (fs.statSync(cwd).isDirectory()) return;
  } catch {
    // fall through
  }
  throw new Error(
    `Repository folder not found: ${cwd}. The folder may have been moved or deleted; reload the window or reopen the repository.`
  );
}

export async function detectGitVersion(gitPath?: string): Promise<string> {
  if (cachedGitVersion && cachedGitPath === (gitPath ?? '')) return cachedGitVersion;
  const result = await runGit(['--version'], process.cwd(), undefined, gitPath);
  const match = /git version (\S+)/.exec(result.stdout);
  cachedGitVersion = match?.[1] ?? result.stdout.trim();
  cachedGitPath = gitPath ?? '';
  return cachedGitVersion;
}

export async function runGit(
  args: string[],
  cwd: string,
  input?: string | Buffer,
  gitPath?: string,
  options: Omit<GitRunOptions, 'cwd' | 'input'> = {}
): Promise<GitResult> {
  const exe = normalizeGitExecutable(gitPath);
  const fullArgs = ['-c', 'core.quotepath=false', '-c', 'color.ui=false', ...args];
  try {
    assertWorkingDirectory(cwd);
  } catch (err) {
    return Promise.reject(err);
  }

  return new Promise<GitResult>((resolve, reject) => {
    const child = spawn(exe, fullArgs, {
      cwd,
      env: gitEnvironment(options.env),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const maxBuffer = options.maxBuffer ?? 64 * 1024 * 1024;

    const timer = options.timeout
      ? setTimeout(() => {
          if (settled) return;
          settled = true;
          child.kill('SIGKILL');
          reject(
            new GitError(
              `git ${args[0]} timed out after ${Math.round((options.timeout ?? 0) / 1000)}s`,
              args,
              -1,
              stderr
            )
          );
        }, options.timeout)
      : null;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (stdout.length > maxBuffer) {
        child.kill('SIGKILL');
        if (!settled) {
          settled = true;
          if (timer) clearTimeout(timer);
          reject(new GitError('git output exceeded the maximum buffer size', args, -1, stderr));
        }
      }
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      if (stderr.length > maxBuffer) stderr = stderr.slice(0, maxBuffer);
      options.onStderr?.(chunk);
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      const code = (err as NodeJS.ErrnoException).code;
      const message =
        code === 'ENOENT'
          ? `Git executable not found: ${exe}. Set "forkgit.gitPath" to the absolute path of git or add git to PATH.`
          : code === 'EACCES'
            ? `Git executable is not executable: ${exe}. Check its file permissions.`
            : `Failed to run git: ${err.message}`;
      reject(new GitError(message, args, -1, stderr));
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      const resultCode = code ?? -1;
      const result: GitResult = { stdout, stderr, code: resultCode, args };
      if (resultCode !== 0 && !options.allowNonZero) {
        reject(
          new GitError(
            stderr.trim() || `git ${args.join(' ')} exited with code ${resultCode}`,
            args,
            resultCode,
            stderr
          )
        );
      } else {
        resolve(result);
      }
    });

    if (input !== undefined && input !== null) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

export class GitCli {
  readonly cwd: string;
  readonly gitPath: string;
  private gitVersion: string | null = null;

  constructor(cwd: string, gitPath = '') {
    this.cwd = cwd;
    this.gitPath = gitPath;
  }

  async version(): Promise<string> {
    if (!this.gitVersion) {
      this.gitVersion = await detectGitVersion(this.gitPath);
    }
    return this.gitVersion;
  }

  async run(args: string[], options: GitRunOptions = {}): Promise<GitResult> {
    return runGit(args, options.cwd ?? this.cwd, options.input, this.gitPath, options);
  }

  async runSafe(args: string[], options: GitRunOptions = {}): Promise<GitResult> {
    return this.run(args, { ...options, allowNonZero: true });
  }

  /** Runs git and trims trailing whitespace from stdout. */
  async text(args: string[], options: GitRunOptions = {}): Promise<string> {
    const result = await this.run(args, options);
    return result.stdout.replace(/\s+$/, '');
  }

  async lines(args: string[], options: GitRunOptions = {}): Promise<string[]> {
    const output = await this.text(args, options);
    return output.length ? output.split(/\r?\n/) : [];
  }

  /** Runs git with stdout as a binary buffer. Used for image diffs. */
  async buffer(args: string[], options: GitRunOptions = {}): Promise<Buffer> {
    const exe = normalizeGitExecutable(this.gitPath);
    const fullArgs = ['-c', 'core.quotepath=false', ...args];
    return new Promise<Buffer>((resolve, reject) => {
      const child = spawn(exe, fullArgs, {
        cwd: options.cwd ?? this.cwd,
        env: gitEnvironment(options.env),
        stdio: ['pipe', 'pipe', 'pipe']
      });
      const chunks: Buffer[] = [];
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve(Buffer.concat(chunks));
        else reject(new GitError(stderr.trim() || 'git failed', args, code ?? -1, stderr));
      });
      if (options.input) child.stdin.write(options.input);
      child.stdin.end();
    });
  }

  async repoRoot(): Promise<string | null> {
    const result = await this.runSafe(['rev-parse', '--show-toplevel']);
    if (result.code !== 0) return null;
    const root = result.stdout.trim();
    return root ? path.resolve(root) : null;
  }

  async gitDir(): Promise<string> {
    const output = await this.text(['rev-parse', '--git-dir']);
    return path.resolve(this.cwd, output);
  }

  async commonDir(): Promise<string> {
    const output = await this.text(['rev-parse', '--git-common-dir']);
    return path.resolve(this.cwd, output);
  }

  async isInsideWorkTree(): Promise<boolean> {
    const result = await this.runSafe(['rev-parse', '--is-inside-work-tree']);
    return result.code === 0 && result.stdout.trim() === 'true';
  }

  async headSha(): Promise<string | null> {
    const result = await this.runSafe(['rev-parse', '--verify', 'HEAD']);
    if (result.code !== 0) return null;
    return result.stdout.trim() || null;
  }

  async currentBranch(): Promise<string | null> {
    const result = await this.runSafe(['symbolic-ref', '--quiet', '--short', 'HEAD']);
    if (result.code !== 0) return null;
    return result.stdout.trim() || null;
  }

  async isAncestor(ancestor: string, descendant: string): Promise<boolean> {
    const result = await this.runSafe(['merge-base', '--is-ancestor', ancestor, descendant]);
    return result.code === 0;
  }

  async config(key: string): Promise<string | null> {
    const result = await this.runSafe(['config', '--get', key]);
    if (result.code !== 0) return null;
    const value = result.stdout.trim();
    return value || null;
  }

  async setConfig(key: string, value: string): Promise<void> {
    await this.run(['config', key, value]);
  }

  async hasStagedChanges(): Promise<boolean> {
    const result = await this.runSafe(['diff', '--cached', '--quiet']);
    return result.code !== 0;
  }

  async add(paths: string[]): Promise<void> {
    if (!paths.length) return;
    await this.run(['add', '--all', '--', ...paths]);
  }

  async addIntentToAdd(paths: string[]): Promise<void> {
    if (!paths.length) return;
    await this.runSafe(['add', '--intent-to-add', '--', ...paths]);
  }

  async unstage(paths: string[]): Promise<void> {
    if (!paths.length) return;
    const head = await this.headSha();
    if (head) {
      await this.run(['reset', '-q', 'HEAD', '--', ...paths]);
    } else {
      await this.runSafe(['rm', '--cached', '-r', '--ignore-unmatch', '--', ...paths]);
    }
  }

  async restoreWorktree(paths: string[]): Promise<void> {
    if (!paths.length) return;
    await this.run(['restore', '--worktree', '--', ...paths]);
  }

  async checkout(ref: string, options: { detach?: boolean; force?: boolean } = {}): Promise<void> {
    const args = ['checkout'];
    if (options.force) args.push('--force');
    if (options.detach) args.push('--detach');
    args.push(ref);
    await this.run(args, { timeout: 120_000 });
  }

  async checkoutNewBranch(name: string, from?: string): Promise<void> {
    const args = ['checkout', '-b', name];
    if (from) args.push(from);
    await this.run(args, { timeout: 120_000 });
  }

  async checkoutRemoteBranch(remote: string, branch: string): Promise<void> {
    const localName = branch;
    const existing = await this.runSafe(['rev-parse', '--verify', '--quiet', `refs/heads/${localName}`]);
    if (existing.code === 0) {
      await this.checkout(localName);
      return;
    }
    await this.run(['checkout', '--track', '-b', localName, `${remote}/${branch}`], { timeout: 120_000 });
  }

  async branchList(remote?: string): Promise<string[]> {
    const args = remote
      ? ['branch', '-r', '--format=%(refname:short)']
      : ['branch', '--format=%(refname:short)'];
    const result = await this.runSafe(args);
    if (result.code !== 0) return [];
    return result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  async deleteBranch(name: string, force = false): Promise<void> {
    await this.run(['branch', force ? '-D' : '-d', name]);
  }

  async renameBranch(oldName: string, newName: string): Promise<void> {
    await this.run(['branch', '-m', oldName, newName]);
  }

  async merge(name: string): Promise<void> {
    await this.run(['merge', '--no-edit', name], { timeout: 120_000 });
  }

  async rebase(name: string): Promise<void> {
    await this.run(['rebase', name], { timeout: 120_000 });
  }

  async createTag(name: string, message?: string, sha?: string): Promise<void> {
    const args = ['tag'];
    if (message) args.push('-a', name, '-m', message);
    else args.push(name);
    if (sha) args.push(sha);
    await this.run(args);
  }

  async deleteTag(name: string): Promise<void> {
    await this.run(['tag', '-d', name]);
  }

  async stashSave(message?: string, includeUntracked = false, stagedOnly = false): Promise<boolean> {
    const args = ['stash', 'push'];
    if (includeUntracked) args.push('--include-untracked');
    if (stagedOnly) args.push('--staged');
    if (message) args.push('-m', message);
    const result = await this.runSafe(args, { timeout: 120_000 });
    return result.code === 0 && !/No local changes to save/i.test(result.stdout);
  }

  async stashApply(index: number, pop = false): Promise<void> {
    await this.run(['stash', pop ? 'pop' : 'apply', `stash@{${index}}`], { timeout: 120_000 });
  }

  async stashDrop(index: number): Promise<void> {
    await this.run(['stash', 'drop', `stash@{${index}}`]);
  }
}

/** Returns true when the path looks like a git repository and git can be run there. */
export async function isGitRepository(dir: string, gitPath = ''): Promise<boolean> {
  try {
    if (!fs.existsSync(dir)) return false;
    const cli = new GitCli(dir, gitPath);
    return await cli.isInsideWorkTree();
  } catch {
    return false;
  }
}

/** Finds the nearest repository containing the given path (walks up). */
export async function findRepositoryRoot(start: string, gitPath = ''): Promise<string | null> {
  let dir = path.resolve(start);
  try {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) dir = path.dirname(dir);
  } catch {
    return null;
  }
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
