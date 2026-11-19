import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import {
  ChangeFile,
  CommitDetail,
  CommitFileEntry,
  CommitRef,
  CommitSummary,
  DiffOptions,
  DiffScope,
  FileDiff,
  FileTreeEntry,
  GraphRow,
  HistoryPage,
  Person,
  RepoState,
  RepositoryInfo,
  StatusCode,
  StashEntry,
  SubmoduleInfo
} from '../protocol/types';
import { GitCli } from './GitCli';
import { layoutGraph } from './graph';
import {
  isLikelyBinary,
  parseUnifiedDiff,
  syntheticDiff,
  emptyDiff
} from './parsers/diff';
import {
  parseGitmodules,
  parseRefs,
  parseRemotes,
  parseStashes,
  parseSubmodules,
  RefSnapshot,
  STASH_FORMAT
} from './parsers/refs';
import { parseStatus } from './parsers/status';
import {
  applyDiffToContent,
  contentFrom,
  contentToString,
  hunkSelection,
  lineSelection,
  PatchConflictError
} from './patch';

const LOG_FIELD = '\x1f';
const LOG_RECORD = '\x1e';
const LOG_FORMAT = [
  '%H',
  '%P',
  '%an',
  '%ae',
  '%at',
  '%cn',
  '%ce',
  '%ct',
  '%s',
  '%b'
].join('%x1f') + '%x1e';

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml'
};

interface RawLogCommit {
  sha: string;
  parents: string[];
  author: Person;
  committer: Person;
  subject: string;
  body: string;
  refs: CommitRef[];
  inHead: boolean;
}

function mapStatusCode(code: string | undefined): StatusCode | undefined {
  if (!code || code === '.') return undefined;
  switch (code) {
    case 'M':
    case 'A':
    case 'D':
    case 'R':
    case 'C':
    case 'U':
    case 'T':
    case '?':
    case '!':
      return code;
    default:
      return 'M';
  }
}

function shortSha(sha: string, length = 7): string {
  return sha.slice(0, length);
}

function toRelative(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join('/');
}

function ensureInside(root: string, relative: string): string {
  const normalized = relative.replace(/\\/g, '/').replace(/^\/+/, '');
  const absolute = path.resolve(root, normalized);
  const withSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (absolute !== root && !absolute.startsWith(withSep)) {
    throw new Error(`Path escapes the repository: ${relative}`);
  }
  return absolute;
}

function imageMime(filePath: string): string | null {
  return IMAGE_TYPES[path.extname(filePath).toLowerCase()] ?? null;
}

function dataUri(buffer: Buffer, mime: string): string {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function parseLog(output: string): RawLogCommit[] {
  const commits: RawLogCommit[] = [];
  for (const record of output.split(LOG_RECORD)) {
    const clean = record.replace(/^\r?\n/, '');
    if (!clean.trim()) continue;
    const fields = clean.split(LOG_FIELD);
    if (fields.length < 9) continue;
    const sha = fields[0].trim();
    if (!/^[0-9a-f]{7,64}$/i.test(sha)) continue;
    const body = fields.slice(9).join(LOG_FIELD).replace(/^\n+/, '').replace(/\n+$/, '');
    commits.push({
      sha,
      parents: fields[1].trim() ? fields[1].trim().split(/\s+/) : [],
      author: {
        name: fields[2],
        email: fields[3],
        date: Number(fields[4] || 0) * 1000
      },
      committer: {
        name: fields[5],
        email: fields[6],
        date: Number(fields[7] || 0) * 1000
      },
      subject: fields[8],
      body,
      refs: [],
      inHead: true
    });
  }
  return commits;
}

function parseNameStatus(output: string): Map<string, { status: StatusCode; oldPath?: string }> {
  const map = new Map<string, { status: StatusCode; oldPath?: string }>();
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const code = parts[0]?.[0] ?? 'M';
    if ((code === 'R' || code === 'C') && parts.length >= 3) {
      map.set(parts[2], { status: code, oldPath: parts[1] });
    } else if (parts[1]) {
      map.set(parts[1], { status: code as StatusCode });
    }
  }
  return map;
}

function parseNumstat(output: string): Map<string, { additions: number; deletions: number; binary: boolean }> {
  const map = new Map<string, { additions: number; deletions: number; binary: boolean }>();
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const additions = parts[0] === '-' ? 0 : Number(parts[0]);
    const deletions = parts[1] === '-' ? 0 : Number(parts[1]);
    const binary = parts[0] === '-' && parts[1] === '-';
    const filePath = parts[parts.length - 1];
    map.set(filePath, { additions, deletions, binary });
  }
  return map;
}

export interface HistoryRequest {
  offset: number;
  limit: number;
  ref?: string | null;
  search?: string | null;
}

export class GitRepository {
  readonly root: string;
  readonly cli: GitCli;
  readonly name: string;

  latest: RepoState | null = null;
  private refsSnapshot: RefSnapshot | null = null;
  private headSet: { sha: string; commits: Set<string>; at: number } | null = null;
  private recent: string[] = [];
  private countCache = new Map<string, { value: number; at: number }>();

  constructor(root: string, gitPath = '') {
    this.root = root;
    this.name = path.basename(root);
    this.cli = new GitCli(root, gitPath);
  }

  private async readOperation(gitDir: string): Promise<string | null> {
    const checks: Array<[string, string]> = [
      ['MERGE_HEAD', 'Merging'],
      ['rebase-merge', 'Rebasing'],
      ['rebase-apply', 'Rebasing'],
      ['CHERRY_PICK_HEAD', 'Cherry-picking'],
      ['REVERT_HEAD', 'Reverting'],
      ['BISECT_LOG', 'Bisecting']
    ];
    for (const [entry, label] of checks) {
      try {
        await fsp.access(path.join(gitDir, entry));
        return label;
      } catch {
        // not in progress
      }
    }
    return null;
  }

  private async readRecentMessages(): Promise<string[]> {
    const result = await this.cli.runSafe(['log', '-n', '40', '--format=%s']);
    if (result.code !== 0) return this.recent;
    const fromGit = result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const merged: string[] = [];
    for (const message of [...this.recent, ...fromGit]) {
      if (message && !merged.includes(message)) merged.push(message);
    }
    return merged.slice(0, 50);
  }

  rememberCommitMessage(message: string): void {
    const subject = message.split('\n')[0].trim();
    if (!subject) return;
    this.recent = [subject, ...this.recent.filter((entry) => entry !== subject)].slice(0, 50);
  }

  async refresh(): Promise<RepoState> {
    const gitDir = await this.cli.gitDir();
    const [statusResult, refsResult, remotesResult, stashResult, submoduleResult, headSha, branch, operation, gitVersion, recent] =
      await Promise.all([
        this.cli.run(['status', '--porcelain=v2', '-z', '--branch', '--untracked-files=all'], {
          maxBuffer: 64 * 1024 * 1024
        }),
        this.cli.run(['for-each-ref', `--format=${REF_FORMAT_WITH_RECORD}`]),
        this.cli.runSafe(['remote', '-v']),
        this.cli.runSafe(['stash', 'list', `--format=${STASH_FORMAT}`]),
        this.cli.runSafe(['submodule', 'status', '--recursive']),
        this.cli.headSha(),
        this.cli.currentBranch(),
        this.readOperation(gitDir),
        this.cli.version(),
        this.readRecentMessages()
      ]);

    const status = parseStatus(statusResult.stdout);
    const refs = parseRefs(refsResult.stdout);
    const remoteUrls = parseRemotes(remotesResult.stdout);
    this.refsSnapshot = refs;

    for (const remote of refs.remotes) {
      remote.url = remoteUrls.get(remote.name) ?? null;
    }

    let submodules: SubmoduleInfo[] = [];
    if (submoduleResult.code === 0) {
      submodules = parseSubmodules(submoduleResult.stdout);
      try {
        const modulesText = await fsp.readFile(path.join(this.root, '.gitmodules'), 'utf8');
        const modules = parseGitmodules(modulesText);
        for (const submodule of submodules) {
          const meta = modules.get(submodule.path);
          if (meta) {
            submodule.url = meta.url;
            submodule.branch = meta.branch;
            if (meta.name) submodule.name = meta.name.split('/').pop() ?? meta.name;
          }
        }
      } catch {
        // no .gitmodules
      }
    }

    let stashes: StashEntry[] = [];
    if (stashResult.code === 0) {
      stashes = parseStashes(stashResult.stdout).map((stash) => ({
        ...stash,
        branch: stash.branch
      }));
    }

    const files = status.files.filter((file) => !file.ignored);
    const headOid = headSha ?? status.branch.oid;
    const repo: RepositoryInfo = {
      root: this.root,
      name: this.name,
      head: branch ?? status.branch.head,
      headSha: headOid,
      detached: status.branch.detached || (!branch && !!headOid),
      upstream: status.branch.upstream,
      ahead: status.branch.ahead,
      behind: status.branch.behind,
      remotes: refs.remotes.map((group) => group.name),
      hasChanges: files.some((file) => file.staged || file.unstaged),
      operation,
      gitVersion,
      submoduleCount: submodules.length
    };

    const state: RepoState = {
      repo,
      files,
      branches: refs.branches,
      remotes: refs.remotes,
      tags: refs.tags,
      stashes,
      submodules,
      recentCommits: recent,
      busy: false,
      operationLabel: operation,
      refreshedAt: Date.now()
    };
    this.latest = state;
    return state;
  }

  fileByPath(filePath: string): ChangeFile | undefined {
    const normalized = filePath.replace(/\\/g, '/');
    return this.latest?.files.find(
      (file) => file.path === normalized || file.oldPath === normalized
    );
  }

  private async headHistory(): Promise<Set<string>> {
    const head = await this.cli.headSha();
    if (!head) return new Set();
    if (this.headSet && this.headSet.sha === head && Date.now() - this.headSet.at < 15_000) {
      return this.headSet.commits;
    }
    const result = await this.cli.runSafe(['rev-list', 'HEAD', '--max-count=30000']);
    const commits = new Set<string>();
    if (result.code === 0) {
      for (const line of result.stdout.split('\n')) {
        if (line.trim()) commits.add(line.trim());
      }
    }
    this.headSet = { sha: head, commits, at: Date.now() };
    return commits;
  }

  private decorateRefs(raw: RawLogCommit[], refs: RefSnapshot, headSha: string | null): void {
    for (const commit of raw) {
      const list = refs.refsBySha.get(commit.sha) ?? [];
      const seen = new Set<string>();
      const decorated: CommitRef[] = [];
      for (const ref of list) {
        const key = `${ref.kind}:${ref.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        decorated.push(ref);
      }
      decorated.sort((a, b) => {
        const rank = (ref: CommitRef) => (ref.current ? 0 : ref.kind === 'local' ? 1 : ref.kind === 'remote' ? 2 : 3);
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      });
      commit.refs = decorated;
      commit.inHead = !headSha || commit.sha === headSha || (this.headSet?.commits.has(commit.sha) ?? false);
    }
  }

  private makeGraphRow(sha: string, parents: string[]): GraphRow {
    return {
      lane: 0,
      laneCount: 1,
      incoming: [],
      outgoing: parents.map((_, index) => ({ lane: 0, kind: index === 0 ? 'first' : 'merge' })),
      through: [],
      colors: [0],
      node: parents.length === 0 ? 'root' : parents.length > 1 ? 'merge' : 'commit',
      startsAtTop: true
    };
  }

  private async countCommits(ref?: string | null): Promise<number | null> {
    const key = ref ?? '--all';
    const cached = this.countCache.get(key);
    if (cached && Date.now() - cached.at < 20_000) return cached.value;
    const args = ['rev-list', '--count'];
    if (ref) args.push(ref);
    else args.push('--exclude=refs/stash', '--all');
    const result = await this.cli.runSafe(args);
    if (result.code !== 0) return null;
    const value = Number(result.stdout.trim());
    if (!Number.isFinite(value)) return null;
    this.countCache.set(key, { value, at: Date.now() });
    return value;
  }

  private async fetchLog(args: string[]): Promise<RawLogCommit[]> {
    const result = await this.cli.runSafe(['log', ...args, `--format=${LOG_FORMAT}`], {
      maxBuffer: 128 * 1024 * 1024
    });
    if (result.code !== 0) return [];
    return parseLog(result.stdout);
  }

  private async searchLog(query: string, limit: number): Promise<RawLogCommit[]> {
    const term = query.trim();
    if (!term) return [];
    const base = ['--exclude=refs/stash', '--all', '--date-order', `--max-count=${Math.min(limit, 1500)}`];
    const results = new Map<string, RawLogCommit>();

    const queries: string[][] = [
      [...base, '-i', '--grep', term],
      [...base, '-i', '--author', term]
    ];
    if (/^[0-9a-f]{4,40}$/i.test(term)) {
      queries.push(['--exclude=refs/stash', '--all', `--max-count=${Math.min(limit, 1500)}`, term]);
    }
    if (term.includes('/') || term.includes('.')) {
      queries.push([...base, '--', term]);
    }

    for (const args of queries) {
      const commits = await this.fetchLog(args);
      for (const commit of commits) {
        if (!results.has(commit.sha)) results.set(commit.sha, commit);
      }
    }

    return [...results.values()]
      .sort((a, b) => b.committer.date - a.committer.date)
      .slice(0, Math.min(limit, 1500));
  }

  private toSummary(commit: RawLogCommit, graph: GraphRow): CommitSummary {
    return {
      sha: commit.sha,
      shortSha: shortSha(commit.sha),
      parents: commit.parents,
      author: commit.author,
      committer: commit.committer,
      subject: commit.subject,
      body: commit.body.slice(0, 8000),
      refs: commit.refs,
      inHead: commit.inHead,
      graph
    };
  }

  async getHistory(request: HistoryRequest): Promise<HistoryPage> {
    const pageSize = Number.isFinite(request.limit) ? Math.max(1, Math.min(request.limit, 2000)) : 300;
    const offset = Math.max(0, Math.floor(request.offset || 0));
    const search = request.search?.trim() || null;
    const ref = request.ref?.trim() || null;

    const headSha = await this.cli.headSha();
    await this.headHistory();
    const refsResult = await this.cli.run(['for-each-ref', `--format=${REF_FORMAT_WITH_RECORD}`]);
    const freshRefs = parseRefs(refsResult.stdout);
    this.refsSnapshot = freshRefs;

    let raw: RawLogCommit[];
    if (search) {
      raw = await this.searchLog(search, 1500);
    } else {
      const args = [];
      if (ref) args.push(ref);
      else args.push('--exclude=refs/stash', '--all');
      args.push('--date-order', `--max-count=${offset + pageSize}`);
      raw = await this.fetchLog(args);
    }

    this.decorateRefs(raw, freshRefs, headSha);

    const graphRows = layoutGraph(raw.map((commit) => ({ sha: commit.sha, parents: commit.parents })));
    const pageRaw = raw.slice(offset, offset + pageSize);
    const commits = pageRaw.map((commit, index) =>
      this.toSummary(commit, graphRows[offset + index] ?? this.makeGraphRow(commit.sha, commit.parents))
    );

    let total: number | null = null;
    if (search) {
      total = raw.length >= 1500 ? null : raw.length;
    } else {
      total = await this.countCommits(ref);
    }

    const hasMore = search
      ? offset + pageRaw.length < raw.length
      : total !== null
        ? offset + pageRaw.length < total
        : pageRaw.length === pageSize;

    return {
      commits,
      offset,
      limit: pageSize,
      hasMore,
      total,
      headSha,
      baseRef: ref,
      search
    };
  }

  async getCommit(sha: string): Promise<{ raw: RawLogCommit; summary: CommitSummary }> {
    const commits = await this.fetchLog(['-1', sha]);
    const commit = commits[0];
    if (!commit) throw new Error(`Commit not found: ${sha}`);
    const refs = this.refsSnapshot?.refsBySha.get(commit.sha) ?? [];
    commit.refs = refs;
    const head = await this.cli.headSha();
    commit.inHead = !head || commit.sha === head || (await this.cli.isAncestor(commit.sha, head));
    return { raw: commit, summary: this.toSummary(commit, this.makeGraphRow(commit.sha, commit.parents)) };
  }

  async getCommitDetail(sha: string): Promise<CommitDetail> {
    const { summary } = await this.getCommit(sha);
    const parent = summary.parents[0];
    const [nameStatusResult, numstatResult] = await Promise.all([
      parent
        ? this.cli.runSafe(['diff', '--name-status', '-M', '-C', parent, sha])
        : this.cli.runSafe(['diff-tree', '--root', '--no-commit-id', '--name-status', '-r', '-M', '-C', sha]),
      parent
        ? this.cli.runSafe(['diff', '--numstat', '-M', '-C', parent, sha])
        : this.cli.runSafe(['diff-tree', '--root', '--no-commit-id', '--numstat', '-r', '-M', '-C', sha])
    ]);

    const names = parseNameStatus(nameStatusResult.stdout);
    const stats = parseNumstat(numstatResult.stdout);
    const files: CommitFileEntry[] = [...names.entries()].map(([filePath, info]) => {
      const stat = stats.get(filePath);
      return {
        path: filePath,
        oldPath: info.oldPath,
        status: info.status,
        additions: stat?.additions ?? 0,
        deletions: stat?.deletions ?? 0,
        binary: stat?.binary ?? false
      };
    });
    files.sort((a, b) => a.path.localeCompare(b.path));

    const refs = summary.refs;
    return {
      commit: summary,
      fullBody: summary.body,
      files,
      branches: refs.filter((ref) => ref.kind === 'local' || ref.kind === 'remote').map((ref) => ref.name),
      tags: refs.filter((ref) => ref.kind === 'tag').map((ref) => ref.name),
      additions: files.reduce((sum, file) => sum + file.additions, 0),
      deletions: files.reduce((sum, file) => sum + file.deletions, 0)
    };
  }

  async getFileTree(sha: string, dir?: string): Promise<{ entries: FileTreeEntry[]; truncated: boolean }> {
    const args = ['ls-tree', '-r', '-l', '-z', sha];
    if (dir) args.push('--', dir);
    const result = await this.cli.runSafe(args, { maxBuffer: 128 * 1024 * 1024 });
    if (result.code !== 0) throw new Error(result.stderr.trim() || 'Unable to read the commit tree');
    const entries: FileTreeEntry[] = [];
    let truncated = false;
    for (const record of result.stdout.split('\0')) {
      if (!record) continue;
      if (entries.length >= 30000) {
        truncated = true;
        break;
      }
      const match = /^(\d{5,6}) (\w+) ([0-9a-f]+) +(\d+|-)\t(.*)$/.exec(record);
      if (!match) continue;
      entries.push({
        mode: match[1],
        type: match[2] as FileTreeEntry['type'],
        sha: match[3],
        size: match[4] === '-' ? undefined : Number(match[4]),
        path: match[5]
      });
    }
    return { entries, truncated };
  }

  private diffArgsForScope(scope: DiffScope, options: DiffOptions): string[] {
    const context = options.fullFile ? 999_999 : Math.max(0, Math.min(options.contextLines ?? 3, 100));
    const common = ['--no-color', '--no-ext-diff', '--no-textconv', `-U${context}`];
    if (options.ignoreWhitespace) common.push('-w');

    if (scope.kind === 'worktree') {
      return ['diff', ...common, '--find-renames', '--', scope.path, ...(scope.oldPath ? [scope.oldPath] : [])];
    }
    if (scope.kind === 'index') {
      return ['diff', '--cached', ...common, '--find-renames', '--', scope.path, ...(scope.oldPath ? [scope.oldPath] : [])];
    }
    if (scope.kind === 'commit') {
      const parent = scope.parent;
      if (parent) {
        return ['diff', ...common, '-M', parent, scope.sha, '--', scope.path, ...(scope.oldPath ? [scope.oldPath] : [])];
      }
      return ['diff-tree', '-p', '--root', '--no-commit-id', ...common, '-M', scope.sha, '--', scope.path];
    }
    if (scope.kind === 'stash') {
      return ['diff', ...common, `stash@{${scope.index}}^`, `stash@{${scope.index}}`];
    }
    return ['diff', ...common, `stash@{${scope.index}}^`, `stash@{${scope.index}}`, '--', scope.path];
  }

  private async readWorktreeFile(filePath: string): Promise<Buffer | null> {
    try {
      return await fsp.readFile(ensureInside(this.root, filePath));
    } catch {
      return null;
    }
  }

  private async blobAt(rev: string, filePath: string): Promise<Buffer | null> {
    try {
      return await this.cli.buffer(['show', `${rev}:${filePath}`]);
    } catch {
      return null;
    }
  }

  private async imageFor(scope: DiffScope, filePath: string, oldPath?: string): Promise<FileDiff['image'] | undefined> {
    const mime = imageMime(filePath);
    if (!mime) return undefined;
    let oldBuffer: Buffer | null = null;
    let newBuffer: Buffer | null = null;
    let oldLabel: string | undefined;
    let newLabel: string | undefined;

    if (scope.kind === 'worktree') {
      oldBuffer = await this.blobAt(':0', oldPath ?? filePath);
      newBuffer = await this.readWorktreeFile(filePath);
      oldLabel = 'Index';
      newLabel = 'Working tree';
    } else if (scope.kind === 'index') {
      oldBuffer = await this.blobAt('HEAD', oldPath ?? filePath);
      newBuffer = await this.blobAt(':0', filePath);
      oldLabel = 'HEAD';
      newLabel = 'Index';
    } else if (scope.kind === 'commit') {
      oldBuffer = scope.parent ? await this.blobAt(scope.parent, oldPath ?? filePath) : null;
      newBuffer = await this.blobAt(scope.sha, filePath);
      oldLabel = scope.parent ? shortSha(scope.parent) : 'empty';
      newLabel = shortSha(scope.sha);
    }

    if ((oldBuffer?.length ?? 0) > 12 * 1024 * 1024 || (newBuffer?.length ?? 0) > 12 * 1024 * 1024) {
      return undefined;
    }
    if (!oldBuffer && !newBuffer) return undefined;
    return {
      mime,
      oldDataUri: oldBuffer ? dataUri(oldBuffer, mime) : undefined,
      newDataUri: newBuffer ? dataUri(newBuffer, mime) : undefined,
      oldLabel,
      newLabel
    };
  }

  async getDiff(
    scope: DiffScope,
    options: DiffOptions,
    meta?: FileDiff['meta']
  ): Promise<FileDiff> {
    if (scope.kind === 'stash') {
      throw new Error('Use getStashPreview for stash diffs');
    }

    if (scope.kind === 'worktree' || scope.kind === 'index') {
      const file = this.fileByPath(scope.path);
      const untracked = scope.kind === 'worktree' && file?.untracked;
      if (untracked) {
        const buffer = await this.readWorktreeFile(scope.path);
        if (!buffer) throw new Error(`File not found: ${scope.path}`);
        const image = await this.imageFor(scope, scope.path, scope.oldPath);
        if (image || isLikelyBinary(buffer)) {
          return {
            path: scope.path,
            status: 'A',
            binary: true,
            image,
            hunks: [],
            additions: 0,
            deletions: 0,
            editable: true,
            side: 'unstaged'
          };
        }
        const text = buffer.toString('utf8');
        if (text.length > 4 * 1024 * 1024) {
          return {
            path: scope.path,
            status: 'A',
            binary: false,
            hunks: [],
            additions: 0,
            deletions: 0,
            editable: false,
            tooLarge: true,
            side: 'unstaged',
            error: 'This file is too large to display.'
          };
        }
        const diff = syntheticDiff(scope.path, text, { editable: true });
        diff.side = 'unstaged';
        return diff;
      }

      const args = this.diffArgsForScope(scope, options);
      const result = await this.cli.runSafe(args, { maxBuffer: 64 * 1024 * 1024 });
      if (result.code !== 0) {
        return {
          ...emptyDiff(scope.path, mapStatusCode(file?.worktreeStatus ?? file?.indexStatus) ?? 'M', true),
          error: result.stderr.trim() || 'Unable to compute diff'
        };
      }
      const parsed = parseUnifiedDiff(result.stdout, {
        editable: true,
        side: scope.kind === 'index' ? 'staged' : 'unstaged'
      });
      const diff =
        parsed.find((entry) => entry.path === scope.path) ??
        parsed.find((entry) => entry.oldPath === scope.path || entry.oldPath === scope.oldPath) ??
        parsed[0];
      if (!diff) {
        return {
          ...emptyDiff(scope.path, mapStatusCode(file?.worktreeStatus ?? file?.indexStatus) ?? 'M', true),
          side: scope.kind === 'index' ? 'staged' : 'unstaged'
        };
      }
      if (diff.binary) {
        diff.image = await this.imageFor(scope, scope.path, scope.oldPath);
      }
      return diff;
    }

    if (scope.kind === 'stashFile') {
      const diff = await this.getStashFileDiff(scope.index, scope.path);
      if (!diff) throw new Error('File not found in stash');
      return diff;
    }

    const result = await this.cli.runSafe(this.diffArgsForScope(scope, options), {
      maxBuffer: 64 * 1024 * 1024
    });
    if (result.code !== 0) {
      return {
        ...emptyDiff(scope.path, 'M', false),
        error: result.stderr.trim() || 'Unable to compute diff',
        editable: false
      };
    }
    const parsed = parseUnifiedDiff(result.stdout, { editable: false, meta });
    const fallbackStatus = mapStatusCode(this.commitFileStatus(scope.sha, scope.path)) ?? 'M';
    const diff = parsed[0] ?? emptyDiff(scope.path, fallbackStatus, false);
    diff.editable = false;
    diff.meta = meta;
    if (diff.binary) {
      diff.image = await this.imageFor(scope, scope.path, scope.oldPath);
    }
    return diff;
  }

  private commitFileStatus(sha: string, filePath: string): StatusCode | undefined {
    void sha;
    void filePath;
    return undefined;
  }

  async getCommitFileDiff(
    sha: string,
    filePath: string,
    options: DiffOptions,
    oldPath?: string,
    parentIndex = 0
  ): Promise<FileDiff> {
    const commits = await this.fetchLog(['-1', sha]);
    const commit = commits[0];
    if (!commit) throw new Error(`Commit not found: ${sha}`);
    const parent = commit.parents[parentIndex] ?? commit.parents[0] ?? null;
    const scope: DiffScope = { kind: 'commit', sha, path: filePath, oldPath, parent: parent ?? undefined };
    const diff = await this.getDiff(scope, options, {
      sha,
      subject: commit.subject,
      author: commit.author.name,
      date: commit.author.date
    });
    if (!diff.hunks.length && !diff.binary) {
      const nameStatus = await this.cli.runSafe(
        parent
          ? ['diff', '--name-status', parent, sha, '--', filePath]
          : ['diff-tree', '--root', '--no-commit-id', '--name-status', '-r', sha, '--', filePath]
      );
      const map = parseNameStatus(nameStatus.stdout);
      const info = map.get(filePath);
      if (info) diff.status = info.status;
    }
    return diff;
  }

  async getStashFiles(index: number): Promise<FileDiff[]> {
    let result = await this.cli.runSafe(
      ['stash', 'show', '-p', '--no-color', '--include-untracked', `stash@{${index}}`],
      { maxBuffer: 64 * 1024 * 1024 }
    );
    if (result.code !== 0) {
      result = await this.cli.runSafe(['stash', 'show', '-p', '--no-color', `stash@{${index}}`], {
        maxBuffer: 64 * 1024 * 1024
      });
    }
    if (result.code !== 0) throw new Error(result.stderr.trim() || 'Unable to read stash');
    const parsed = parseUnifiedDiff(result.stdout, { editable: false });
    const stashes = this.latest?.stashes ?? [];
    const stash = stashes.find((entry) => entry.index === index);
    for (const diff of parsed) {
      diff.meta = { stashIndex: index, stashMessage: stash?.message, subject: stash?.message };
      diff.editable = false;
    }
    return parsed;
  }

  async getStashFileDiff(index: number, filePath: string): Promise<FileDiff | null> {
    const files = await this.getStashFiles(index);
    return files.find((file) => file.path === filePath) ?? null;
  }

  private async indexContent(filePath: string): Promise<{ model: ReturnType<typeof contentFrom>; exists: boolean }> {
    const buffer = await this.blobAt(':0', filePath);
    if (!buffer) return { model: contentFrom(''), exists: false };
    return { model: contentFrom(buffer.toString('utf8')), exists: true };
  }

  private async indexMode(filePath: string): Promise<string> {
    const result = await this.cli.runSafe(['ls-files', '-s', '--', filePath]);
    if (result.code === 0) {
      const match = /^(\d{6})\s+[0-9a-f]+\s+\d+\t/.exec(result.stdout);
      if (match) return match[1];
    }
    try {
      const stat = await fsp.stat(ensureInside(this.root, filePath));
      return stat.mode & 0o111 ? '100755' : '100644';
    } catch {
      return '100644';
    }
  }

  private async writeIndex(filePath: string, content: string, mode?: string): Promise<void> {
    const fileMode = mode ?? (await this.indexMode(filePath));
    const hash = await this.cli.run(['hash-object', '-w', '--stdin'], { input: content });
    const sha = hash.stdout.trim();
    await this.cli.run(['update-index', '--add', '--cacheinfo', fileMode, sha, filePath]);
  }

  private async removeFromIndex(filePath: string): Promise<void> {
    await this.cli.runSafe(['update-index', '--force-remove', '--', filePath]);
  }

  private async writeWorktree(filePath: string, content: string): Promise<void> {
    const absolute = ensureInside(this.root, filePath);
    const dir = path.dirname(absolute);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(absolute, content, 'utf8');
  }

  async applyDiff(
    scope: DiffScope,
    hunkIndex: number,
    lineIndexes: number[] | undefined,
    action: 'stage' | 'unstage' | 'discard',
    options: DiffOptions,
    hunkHeader?: string
  ): Promise<void> {
    if (scope.kind !== 'worktree' && scope.kind !== 'index') {
      throw new Error('This diff is read-only.');
    }
    if (action === 'stage' && scope.kind !== 'worktree') throw new Error('Nothing to stage in this view.');
    if (action === 'unstage' && scope.kind !== 'index') throw new Error('Nothing to unstage in this view.');

    const file = this.fileByPath(scope.path);

    if (action === 'discard' && scope.kind === 'worktree' && file?.untracked) {
      // Handled by the selected line logic below so partial discards keep the rest.
    }

    const diff = await this.getDiff(scope, options);
    const hunk = diff.hunks.find((entry) => entry.index === hunkIndex);
    if (!hunk) throw new Error('The change is no longer available. Refresh and try again.');
    if (hunkHeader && hunk.header !== hunkHeader) {
      throw new Error('The diff changed while you were reviewing it. Refresh and try again.');
    }

    const selection = lineIndexes?.length
      ? lineSelection(diff, hunkIndex, lineIndexes)
      : hunkSelection(diff, hunkIndex);
    if (!selection.size) return;

    // stage: index -> worktree (forward, base is the old/index side)
    // unstage: HEAD -> index (reverse, base is the new/index side)
    // discard: index -> worktree (reverse, base is the new/worktree side)
    const direction: 'forward' | 'reverse' =
      action === 'stage' && scope.kind === 'worktree' ? 'forward' : 'reverse';

    let base: { model: ReturnType<typeof contentFrom>; exists: boolean } | null = null;
    let target: { lines: string[]; trailingNewline: boolean };
    let eol: '\n' | '\r\n' = '\n';

    if (action === 'stage') {
      base = await this.indexContent(scope.path);
      eol = base.model.eol;
      const source = await this.readWorktreeFile(scope.path);
      const sourceModel = source ? contentFrom(source.toString('utf8')) : null;
      const result = applyDiffToContent(base.model, diff, { selection, direction });
      target = result;
      if (!base.exists && sourceModel) {
        target.trailingNewline = sourceModel.trailingNewline;
        eol = sourceModel.eol;
      }
    } else if (action === 'unstage') {
      base = await this.indexContent(scope.path);
      eol = base.model.eol;
      const result = applyDiffToContent(base.model, diff, { selection, direction });
      target = result;
    } else {
      const worktree = await this.readWorktreeFile(scope.path);
      if (!worktree) throw new Error(`File not found: ${scope.path}`);
      const model = contentFrom(worktree.toString('utf8'));
      eol = model.eol;
      target = applyDiffToContent(model, diff, { selection, direction });
    }

    if (!target) throw new Error('Could not apply the selected change.');

    const content = contentToString({ lines: target.lines, eol, trailingNewline: target.trailingNewline });

    if (action === 'stage') {
      if (target.lines.length === 0 && !base?.exists) {
        const worktree = await this.readWorktreeFile(scope.path);
        if (!worktree) {
          await this.removeFromIndex(scope.path);
          return;
        }
      }
      await this.writeIndex(scope.path, content);
    } else if (action === 'unstage') {
      const head = await this.cli.runSafe(['cat-file', '-e', `HEAD:${scope.path}`]);
      if (target.lines.length === 0 && head.code !== 0) {
        await this.removeFromIndex(scope.path);
      } else {
        await this.writeIndex(scope.path, content);
      }
    } else {
      if (file?.untracked && target.lines.length === 0) {
        try {
          await fsp.unlink(ensureInside(this.root, scope.path));
        } catch {
          // already gone
        }
      } else {
        await this.writeWorktree(scope.path, content);
      }
    }

    await this.refresh();
  }

  private expandPaths(paths: string[]): string[] {
    const result = new Set<string>();
    for (const raw of paths) {
      const normalized = raw.replace(/\\/g, '/');
      const file = this.fileByPath(normalized);
      result.add(normalized);
      if (file?.oldPath) result.add(file.oldPath);
      if (file?.path) result.add(file.path);
    }
    return [...result];
  }

  async stageFiles(paths: string[]): Promise<void> {
    const expanded = this.expandPaths(paths);
    if (!expanded.length) return;
    await this.cli.add(expanded);
    await this.refresh();
  }

  async unstageFiles(paths: string[]): Promise<void> {
    const expanded = this.expandPaths(paths);
    if (!expanded.length) return;
    await this.cli.unstage(expanded);
    await this.refresh();
  }

  async discardFiles(paths: string[]): Promise<void> {
    const untracked: string[] = [];
    const tracked: string[] = [];
    const stagedOnly: string[] = [];
    const conflicted: string[] = [];
    for (const raw of paths) {
      const file = this.fileByPath(raw);
      if (!file) {
        untracked.push(raw);
        continue;
      }
      const withRename = file.oldPath ? [file.oldPath, file.path] : [file.path];
      if (file.untracked) untracked.push(file.path);
      else if (file.conflicted) conflicted.push(file.path);
      else if (file.staged && !file.unstaged) stagedOnly.push(...withRename);
      else tracked.push(...withRename);
    }
    if (conflicted.length) {
      throw new Error(
        `Conflicted files must be resolved manually: ${conflicted.join(', ')}`
      );
    }
    for (const filePath of untracked) {
      try {
        await fsp.rm(ensureInside(this.root, filePath), { recursive: true, force: true });
      } catch {
        // ignore missing files
      }
    }
    if (tracked.length) {
      const result = await this.cli.runSafe(['restore', '--worktree', '--', ...tracked]);
      if (result.code !== 0) {
        throw new Error(result.stderr.trim() || 'Unable to discard changes');
      }
    }
    if (stagedOnly.length) {
      const result = await this.cli.runSafe([
        'restore',
        '--source=HEAD',
        '--staged',
        '--worktree',
        '--',
        ...stagedOnly
      ]);
      if (result.code !== 0) {
        throw new Error(result.stderr.trim() || 'Unable to discard changes');
      }
    }
    await this.refresh();
  }

  async commit(subject: string, description: string, amend: boolean): Promise<{ message: string }> {
    const trimmed = subject.trim();
    if (!trimmed && !amend) throw new Error('Please enter a commit subject.');
    const message = trimmed + (description.trim() ? `\n\n${description.trim()}` : '');
    const args = ['commit', '-F', '-'];
    if (amend) args.push('--amend');
    const result = await this.cli.run(args, { input: message + '\n', timeout: 180_000 });
    this.rememberCommitMessage(trimmed || 'Amend commit');
    await this.refresh();
    return { message: result.stdout.trim() };
  }

  async loadCommitMessage(amend: boolean): Promise<{ subject: string; description: string }> {
    if (!amend) return { subject: '', description: '' };
    const result = await this.cli.runSafe(['log', '-1', '--format=%B']);
    if (result.code !== 0) return { subject: '', description: '' };
    const text = result.stdout.replace(/\s+$/, '');
    const lines = text.split('\n');
    const subject = lines[0] ?? '';
    const description = lines.slice(1).join('\n').replace(/^\n+/, '');
    return { subject, description };
  }

  async addToGitignore(paths: string[]): Promise<void> {
    const ignorePath = path.join(this.root, '.gitignore');
    let existing = '';
    try {
      existing = await fsp.readFile(ignorePath, 'utf8');
    } catch {
      existing = '';
    }
    const entries = new Set(existing.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
    for (const raw of paths) {
      const normalized = raw.replace(/\\/g, '/');
      if (!entries.has(normalized) && !entries.has(`/${normalized}`)) {
        entries.add(normalized);
      }
    }
    const suffix = existing.endsWith('\n') || !existing ? '' : '\n';
    await fsp.writeFile(ignorePath, existing + suffix + [...entries].join('\n') + '\n', 'utf8');
    await this.refresh();
  }

  getRecentMessages(): string[] {
    return this.recent.length ? this.recent : this.latest?.recentCommits ?? [];
  }
}

// Kept separate to make it obvious the record terminator must match parseRefs().
const REF_FORMAT_WITH_RECORD = [
  '%(refname)',
  '%(objectname)',
  '%(objecttype)',
  '%(*objectname)',
  '%(upstream:short)',
  '%(HEAD)',
  '%(subject)',
  '%(authorname)',
  '%(committerdate:unix)',
  '%(upstream:track)'
].join('\x1f') + '\x1e';
