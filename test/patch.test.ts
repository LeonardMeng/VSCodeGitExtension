import { describe, expect, it } from 'vitest';
import { applyDiffToContent, contentFrom, contentToString } from '../src/git/patch';
import { parseUnifiedDiff } from '../src/git/parsers/diff';

const patch = `diff --git a/a.txt b/a.txt
index 1111111..2222222 100644
--- a/a.txt
+++ b/a.txt
@@ -1,5 +1,6 @@
 one
 two
-three
+THREE
+THREE-B
 four
 five
`;

describe('patch application', () => {
  const diff = parseUnifiedDiff(patch)[0];

  it('applies selected additions and deletions forward', () => {
    const base = contentFrom('one\ntwo\nthree\nfour\nfive\n');
    const selection = new Map([[0, new Set([2, 3, 4])]]);
    const result = applyDiffToContent(base, diff, { selection, direction: 'forward' });
    expect(result.lines).toEqual(['one', 'two', 'THREE', 'THREE-B', 'four', 'five']);
    expect(contentToString({ ...result, eol: '\n' })).toBe('one\ntwo\nTHREE\nTHREE-B\nfour\nfive\n');
  });

  it('keeps unselected changes as context when applying forward', () => {
    const base = contentFrom('one\ntwo\nthree\nfour\nfive\n');
    const selection = new Map([[0, new Set([4])]]);
    const result = applyDiffToContent(base, diff, { selection, direction: 'forward' });
    expect(result.lines).toEqual(['one', 'two', 'three', 'THREE-B', 'four', 'five']);
  });

  it('applies selected changes in reverse against the new side', () => {
    const base = contentFrom('one\ntwo\nTHREE\nTHREE-B\nfour\nfive\n');
    const selection = new Map([[0, new Set([2, 3, 4])]]);
    const result = applyDiffToContent(base, diff, { selection, direction: 'reverse' });
    expect(result.lines).toEqual(['one', 'two', 'three', 'four', 'five']);
  });

  it('rejects a stale patch when context does not match', () => {
    const base = contentFrom('one\ntwo\nCHANGED\nfour\nfive\n');
    const selection = new Map([[0, new Set([2, 3, 4])]]);
    expect(() => applyDiffToContent(base, diff, { selection, direction: 'forward' })).toThrow(
      /changed while the patch was being prepared/
    );
  });

  it('preserves CRLF line endings', () => {
    const base = contentFrom('one\r\ntwo\r\nthree\r\nfour\r\nfive\r\n');
    const selection = new Map([[0, new Set([2, 3, 4])]]);
    const result = applyDiffToContent(base, diff, { selection, direction: 'forward' });
    expect(contentToString({ ...result, eol: base.eol })).toBe(
      'one\r\ntwo\r\nTHREE\r\nTHREE-B\r\nfour\r\nfive\r\n'
    );
  });
});
