import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GitRepository } from '../src/git/Repository';

const TMP_ROOT = path.join(process.cwd(), '.tmp-test');

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      GIT_CONFIG_NOSYSTEM: '1'
    }
  });
}

function makeRepo(): string {
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  const root = fs.mkdtempSync(path.join(TMP_ROOT, 'repo-'));
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.name', 'Test']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  return root;
}

function writeLines(file: string, lines: string[]): void {
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
}

function readLines(file: string): string[] {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
}

describe('GitRepository integration', () => {
  let root: string;
  let repo: GitRepository;

  beforeEach(async () => {
    root = makeRepo();
    const file = path.join(root, 'file.txt');
    writeLines(file, Array.from({ length: 30 }, (_, index) => `line ${index + 1}`));
    fs.writeFileSync(path.join(root, 'other.txt'), 'alpha\nbeta\n', 'utf8');
    git(root, ['add', '.']);
    git(root, ['commit', '-qm', 'initial commit']);
    repo = new GitRepository(root);
    await repo.refresh();
  });

  afterEach(() => {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('reads status, branches and the current HEAD', async () => {
    const state = await repo.refresh();
    expect(state.repo.head).toBe('main');
    expect(state.repo.headSha).toBeTruthy();
    expect(state.repo.hasChanges).toBe(false);
    expect(state.branches.find((branch) => branch.name === 'main')?.current).toBe(true);
    expect(state.repo.gitVersion).toMatch(/\d+\.\d+/);
  });

  it('stages, unstages and discards a single hunk without touching the others', async () => {
    const file = path.join(root, 'file.txt');
    const lines = readLines(file);
    lines[2] = 'LINE 3';
    lines[24] = 'LINE 25';
    writeLines(file, lines);
    await repo.refresh();

    const worktreeDiff = await repo.getDiff(
      { kind: 'worktree', path: 'file.txt' },
      { contextLines: 3 }
    );
    expect(worktreeDiff.editable).toBe(true);
    expect(worktreeDiff.hunks).toHaveLength(2);

    await repo.applyDiff(
      { kind: 'worktree', path: 'file.txt' },
      0,
      undefined,
      'stage',
      { contextLines: 3 }
    );

    const staged = git(root, ['show', ':file.txt']);
    expect(staged).toContain('LINE 3');
    expect(staged).not.toContain('LINE 25');
    expect(fs.readFileSync(file, 'utf8')).toContain('LINE 25');

    const indexDiff = await repo.getDiff({ kind: 'index', path: 'file.txt' }, { contextLines: 3 });
    expect(indexDiff.hunks).toHaveLength(1);
    const remainingDiff = await repo.getDiff(
      { kind: 'worktree', path: 'file.txt' },
      { contextLines: 3 }
    );
    expect(remainingDiff.hunks).toHaveLength(1);

    await repo.applyDiff(
      { kind: 'index', path: 'file.txt' },
      0,
      undefined,
      'unstage',
      { contextLines: 3 }
    );
    expect(git(root, ['show', ':file.txt'])).toBe(git(root, ['show', 'HEAD:file.txt']));

    // Discard the hunk around line 25; the worktree change around line 3 stays.
    const fresh = await repo.getDiff({ kind: 'worktree', path: 'file.txt' }, { contextLines: 3 });
    expect(fresh.hunks).toHaveLength(2);
    await repo.applyDiff(
      { kind: 'worktree', path: 'file.txt' },
      1,
      undefined,
      'discard',
      { contextLines: 3 }
    );
    const after = readLines(file);
    expect(after[2]).toBe('LINE 3');
    expect(after[24]).toBe('line 25');
  });

  it('stages selected lines of a hunk', async () => {
    const file = path.join(root, 'file.txt');
    const lines = readLines(file);
    lines[2] = 'LINE 3';
    writeLines(file, lines);
    await repo.refresh();

    const diff = await repo.getDiff({ kind: 'worktree', path: 'file.txt' }, { contextLines: 3 });
    const hunk = diff.hunks[0];
    const indexes = hunk.lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.kind === 'del' || line.kind === 'add')
      .map(({ index }) => index);
    expect(indexes.length).toBe(2);

    await repo.applyDiff(
      { kind: 'worktree', path: 'file.txt' },
      0,
      indexes,
      'stage',
      { contextLines: 3 }
    );
    const staged = git(root, ['show', ':file.txt']);
    expect(staged).toContain('LINE 3');
    expect(staged.split('\n')).not.toContain('line 3');
  });

  it('stages an untracked file hunk', async () => {
    fs.writeFileSync(path.join(root, 'new.txt'), 'new one\nnew two\n', 'utf8');
    await repo.refresh();
    const diff = await repo.getDiff({ kind: 'worktree', path: 'new.txt' }, { contextLines: 3 });
    expect(diff.status).toBe('A');
    expect(diff.hunks).toHaveLength(1);
    await repo.applyDiff(
      { kind: 'worktree', path: 'new.txt' },
      0,
      undefined,
      'stage',
      { contextLines: 3 }
    );
    expect(git(root, ['show', ':new.txt'])).toBe('new one\nnew two\n');
  });

  it('commits, reads history and supports amend', async () => {
    const file = path.join(root, 'file.txt');
    fs.appendFileSync(file, 'tail\n');
    await repo.refresh();
    await repo.stageFiles(['file.txt']);
    await repo.commit('add tail', 'with body', false);

    const state = await repo.refresh();
    expect(state.files).toHaveLength(0);
    const page = await repo.getHistory({ offset: 0, limit: 10 });
    expect(page.commits[0].subject).toBe('add tail');
    expect(page.commits[0].body).toContain('with body');
    expect(page.headSha).toBe(page.commits[0].sha);

    fs.appendFileSync(file, 'tail 2\n');
    await repo.refresh();
    await repo.stageFiles(['file.txt']);
    await repo.commit('add tail amended', '', true);
    const amended = await repo.getHistory({ offset: 0, limit: 2 });
    expect(amended.commits[0].subject).toBe('add tail amended');
    expect(amended.commits).toHaveLength(2);
  });

  it('stashes and restores changes', async () => {
    const file = path.join(root, 'file.txt');
    fs.appendFileSync(file, 'stashed line\n');
    await repo.refresh();
    const saved = await repo.cli.stashSave('WIP test', true);
    expect(saved).toBe(true);
    const state = await repo.refresh();
    expect(state.files).toHaveLength(0);
    expect(state.stashes).toHaveLength(1);
    expect(state.stashes[0].message).toContain('WIP test');
    const stashFiles = await repo.getStashFiles(0);
    expect(stashFiles.length).toBeGreaterThan(0);
    expect(stashFiles.some((file) => file.path === 'file.txt')).toBe(true);
    const history = await repo.getHistory({ offset: 0, limit: 10 });
    expect(history.commits.some((commit) => commit.subject.startsWith('On main: WIP test'))).toBe(false);
    expect(history.total).toBe(1);

    await repo.cli.stashApply(0, true);
    expect(fs.readFileSync(file, 'utf8')).toContain('stashed line');
    const after = await repo.refresh();
    expect(after.files.length).toBeGreaterThan(0);
  });

  it('detects renames and tags', async () => {
    git(root, ['mv', 'other.txt', 'renamed.txt']);
    await repo.refresh();
    const state = await repo.refresh();
    const renamed = state.files.find((file) => file.path === 'renamed.txt');
    expect(renamed?.oldPath).toBe('other.txt');
    expect(renamed?.indexStatus).toBe('R');

    await repo.cli.createTag('v1.0.0', 'Release', 'HEAD');
    const tagged = await repo.refresh();
    expect(tagged.tags.find((tag) => tag.name === 'v1.0.0')?.annotated).toBe(true);
  });

  it('loads commit details, file diffs and a file tree', async () => {
    const file = path.join(root, 'file.txt');
    fs.appendFileSync(file, 'details\n');
    await repo.refresh();
    await repo.stageFiles(['file.txt']);
    await repo.commit('detail commit', '', false);
    const page = await repo.getHistory({ offset: 0, limit: 2 });
    const sha = page.commits[0].sha;
    const detail = await repo.getCommitDetail(sha);
    expect(detail.files.find((entry) => entry.path === 'file.txt')?.additions).toBe(1);
    const diff = await repo.getCommitFileDiff(sha, 'file.txt', { contextLines: 3 });
    expect(diff.hunks.length).toBeGreaterThan(0);
    expect(diff.editable).toBe(false);
    const tree = await repo.getFileTree(sha);
    expect(tree.entries.find((entry) => entry.path === 'file.txt')).toBeTruthy();
  });

  it('handles an empty repository without a HEAD', async () => {
    const emptyRoot = makeRepo();
    try {
      const emptyRepo = new GitRepository(emptyRoot);
      const state = await emptyRepo.refresh();
      expect(state.repo.headSha).toBeNull();
      expect(state.files).toHaveLength(0);
      const history = await emptyRepo.getHistory({ offset: 0, limit: 10 });
      expect(history.commits).toHaveLength(0);
    } finally {
      fs.rmSync(emptyRoot, { recursive: true, force: true });
    }
  });
});
