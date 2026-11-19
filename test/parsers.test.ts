import { describe, expect, it } from 'vitest';
import { parseStatus } from '../src/git/parsers/status';
import { parseUnifiedDiff, syntheticDiff } from '../src/git/parsers/diff';
import { parseRefs } from '../src/git/parsers/refs';

describe('status parser', () => {
  it('parses branch headers, modified, staged, untracked and rename records', () => {
    const output = [
      '# branch.oid 861a247a946bab696e26c896bb47b28bceb3d939',
      '# branch.head feature/login',
      '# branch.upstream origin/feature/login',
      '# branch.ab +2 -3',
      '1 .M N... 100644 100644 100644 aaaaaaa bbbbbbb dir/a file.txt',
      '1 M. N... 100644 100644 100644 aaaaaaa bbbbbbb staged.txt',
      '2 R. N... 100644 100644 100644 aaaaaaa bbbbbbb R100 new name.txt',
      'old name.txt',
      '? untracked.txt',
      'u UU N... 100644 100644 100644 100644 aaaaaaa bbbbbbb ccccccc conflict.txt'
    ].join('\0');

    const summary = parseStatus(output);
    expect(summary.branch.head).toBe('feature/login');
    expect(summary.branch.upstream).toBe('origin/feature/login');
    expect(summary.branch.ahead).toBe(2);
    expect(summary.branch.behind).toBe(3);
    expect(summary.files).toHaveLength(5);
    expect(summary.files.find((file) => file.path === 'dir/a file.txt')).toMatchObject({
      worktreeStatus: 'M',
      unstaged: true,
      staged: false
    });
    expect(summary.files.find((file) => file.path === 'staged.txt')).toMatchObject({
      indexStatus: 'M',
      staged: true
    });
    const renamed = summary.files.find((file) => file.path === 'new name.txt');
    expect(renamed?.oldPath).toBe('old name.txt');
    expect(renamed?.indexStatus).toBe('R');
    expect(summary.files.find((file) => file.path === 'conflict.txt')).toMatchObject({
      conflicted: true,
      stagedBadge: 'U'
    });
  });
});

describe('diff parser', () => {
  const patch = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,4 +1,5 @@
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 const d = 5;
 const e = 6;
@@ -20,3 +21,3 @@ function x() {
 line
-old
+new
 line
diff --git a/old.txt b/new.txt
similarity index 90%
rename from old.txt
rename to new.txt
diff --git a/bin.png b/bin.png
index 1111111..2222222 100644
Binary files a/bin.png and b/bin.png differ
`;

  it('parses hunks, line numbers, renames and binary files', () => {
    const diffs = parseUnifiedDiff(patch, { editable: true });
    expect(diffs).toHaveLength(3);
    const main = diffs[0];
    expect(main.path).toBe('src/a.ts');
    expect(main.hunks).toHaveLength(2);
    expect(main.hunks[0].lines.map((line) => line.kind)).toEqual([
      'context',
      'del',
      'add',
      'add',
      'context',
      'context'
    ]);
    expect(main.hunks[0].lines[2]).toMatchObject({ newLine: 2, text: 'const b = 3;' });
    expect(main.hunks[1].oldStart).toBe(20);
    expect(main.additions).toBe(3);
    expect(main.deletions).toBe(2);
    expect(diffs[1]).toMatchObject({ path: 'new.txt', oldPath: 'old.txt', status: 'R' });
    expect(diffs[2].binary).toBe(true);
  });

  it('builds a synthetic diff for untracked files', () => {
    const diff = syntheticDiff('new.cs', 'line one\nline two\n', { editable: true });
    expect(diff.status).toBe('A');
    expect(diff.hunks[0].lines).toHaveLength(2);
    expect(diff.hunks[0].lines[1].newLine).toBe(2);
    expect(diff.editable).toBe(true);
  });
});

describe('ref parser', () => {
  it('parses branches, remotes and annotated tags', () => {
    const record = (fields: string[]) => fields.join('\x1f') + '\x1e';
    const output =
      record([
        'refs/heads/main',
        'aaaa',
        'commit',
        '',
        'origin/main',
        '*',
        'Initial commit',
        'Alice',
        '1700000000',
        '[ahead 1, behind 2]'
      ]) +
      record([
        'refs/remotes/origin/main',
        'aaaa',
        'commit',
        '',
        '',
        '',
        'Initial commit',
        'Alice',
        '1700000000',
        ''
      ]) +
      record([
        'refs/remotes/origin/HEAD',
        'aaaa',
        'commit',
        '',
        '',
        '',
        'Initial commit',
        'Alice',
        '1700000000',
        ''
      ]) +
      record([
        'refs/tags/v1.0.0',
        'tagobject',
        'tag',
        'bbbb',
        '',
        '',
        'Release 1.0.0',
        'Alice',
        '1700000100',
        ''
      ]);

    const refs = parseRefs(output);
    expect(refs.branches).toHaveLength(1);
    expect(refs.branches[0]).toMatchObject({
      name: 'main',
      current: true,
      ahead: 1,
      behind: 2,
      upstream: 'origin/main'
    });
    expect(refs.remotes).toHaveLength(1);
    expect(refs.remotes[0].branches).toHaveLength(1);
    expect(refs.tags[0]).toMatchObject({ name: 'v1.0.0', sha: 'bbbb', annotated: true });
    expect(refs.refsBySha.get('bbbb')?.[0]).toMatchObject({ kind: 'tag' });
  });
});
