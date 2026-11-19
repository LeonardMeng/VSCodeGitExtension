import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GitCli, runGit } from '../src/git/GitCli';
import { GitProgressParser } from '../src/git/progress';

describe('GitCli environment handling', () => {
  it('reports a missing repository folder instead of a missing git binary', async () => {
    const missing = path.join(os.tmpdir(), 'forkgit-definitely-missing-repository');
    const cli = new GitCli(missing);
    await expect(cli.run(['rev-parse', '--git-dir'])).rejects.toThrow(/Repository folder not found/);
  });

  it('finds git from common installation paths when PATH is empty', async () => {
    const originalPath = process.env.PATH;
    try {
      process.env.PATH = '';
      const result = await runGit(['--version'], process.cwd());
      expect(result.stdout).toMatch(/git version/);
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it('streams push progress from stderr', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forkgit-push-'));
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'forkgit-remote-'));
    const git = (args: string[], cwd = root) =>
      execFileSync('git', args, {
        cwd,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Test',
          GIT_AUTHOR_EMAIL: 'test@example.com',
          GIT_COMMITTER_NAME: 'Test',
          GIT_COMMITTER_EMAIL: 'test@example.com'
        }
      });
    try {
      git(['init', '-q', '--bare'], bare);
      git(['init', '-q']);
      git(['config', 'user.name', 'Test']);
      git(['config', 'user.email', 'test@example.com']);
      for (let i = 0; i < 20; i++) fs.writeFileSync(path.join(root, `file-${i}.txt`), `line ${i}\n`);
      git(['add', '.']);
      git(['commit', '-qm', 'initial']);
      git(['remote', 'add', 'origin', bare]);

      let stderr = '';
      const cli = new GitCli(root);
      await cli.run(['push', '--progress', '-u', 'origin', 'HEAD'], {
        timeout: 30_000,
        onStderr: (chunk) => {
          stderr += chunk;
        }
      });
      expect(stderr).toMatch(/Writing objects:/);
      const percents: number[] = [];
      const parser = new GitProgressParser('push', (update) => percents.push(update.percent));
      parser.push(stderr);
      parser.end();
      expect(percents.length).toBeGreaterThan(0);
      expect(percents[percents.length - 1]).toBe(100);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(bare, { recursive: true, force: true });
    }
  });
});
