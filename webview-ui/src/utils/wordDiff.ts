export interface WordSegment {
  text: string;
  changed: boolean;
}

export interface WordDiffResult {
  old: WordSegment[];
  new: WordSegment[];
}

const TOKEN_REGEX = /(\s+|[A-Za-z0-9_]+|[^\sA-Za-z0-9_])/g;

function tokenize(text: string): string[] {
  const tokens = text.match(TOKEN_REGEX);
  return tokens ?? (text ? [text] : []);
}

function pushSegment(segments: WordSegment[], text: string, changed: boolean): void {
  const last = segments[segments.length - 1];
  if (last && last.changed === changed) {
    last.text += text;
  } else {
    segments.push({ text, changed });
  }
}

/**
 * Small LCS word diff used to highlight the actually changed tokens inside a
 * removed/added pair of lines. Falls back to a whole-line highlight for very
 * long lines.
 */
export function wordDiff(oldText: string, newText: string): WordDiffResult {
  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);
  if (oldTokens.length > 900 || newTokens.length > 900) {
    if (oldText === newText) {
      return { old: [{ text: oldText, changed: false }], new: [{ text: newText, changed: false }] };
    }
    return {
      old: [{ text: oldText, changed: true }],
      new: [{ text: newText, changed: true }]
    };
  }

  const n = oldTokens.length;
  const m = newTokens.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        oldTokens[i] === newTokens[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const oldSegments: WordSegment[] = [];
  const newSegments: WordSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldTokens[i] === newTokens[j]) {
      pushSegment(oldSegments, oldTokens[i], false);
      pushSegment(newSegments, newTokens[j], false);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      pushSegment(oldSegments, oldTokens[i], true);
      i++;
    } else {
      pushSegment(newSegments, newTokens[j], true);
      j++;
    }
  }
  while (i < n) {
    pushSegment(oldSegments, oldTokens[i], true);
    i++;
  }
  while (j < m) {
    pushSegment(newSegments, newTokens[j], true);
    j++;
  }

  return { old: oldSegments, new: newSegments };
}
