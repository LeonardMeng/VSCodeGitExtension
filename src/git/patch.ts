import { DiffHunk, FileDiff } from '../protocol/types';

export interface ContentModel {
  text: string;
  lines: string[];
  eol: '\n' | '\r\n';
  trailingNewline: boolean;
}

export class PatchConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PatchConflictError';
  }
}

export function contentFrom(text: string): ContentModel {
  const eol: '\n' | '\r\n' = text.includes('\r\n') ? '\r\n' : '\n';
  const normalized = text.replace(/\r\n/g, '\n');
  const trailingNewline = normalized.endsWith('\n');
  const lines = normalized === '' ? [] : normalized.split('\n');
  if (trailingNewline) lines.pop();
  return { text, lines, eol, trailingNewline };
}

export function contentToString(model: Pick<ContentModel, 'lines' | 'eol' | 'trailingNewline'>): string {
  return model.lines.join(model.eol) + (model.trailingNewline && model.lines.length ? model.eol : '');
}

export function allChangeLineIndexes(hunk: DiffHunk): number[] {
  const result: number[] = [];
  hunk.lines.forEach((line, index) => {
    if (line.kind === 'add' || line.kind === 'del') result.push(index);
  });
  return result;
}

export interface ApplyOptions {
  /** hunkIndex -> line indexes inside that hunk's `lines` array */
  selection: Map<number, Set<number>>;
  /**
   * forward: base content is the old side of the diff (e.g. index when staging)
   * reverse: base content is the new side of the diff (e.g. worktree when discarding)
   */
  direction: 'forward' | 'reverse';
}

export interface ApplyResult {
  lines: string[];
  trailingNewline: boolean;
  changed: boolean;
}

function assertLine(actual: string | undefined, expected: string, context: string): void {
  if (actual !== expected) {
    throw new PatchConflictError(
      `The file changed while the patch was being prepared (${context}). Refresh and try again.`
    );
  }
}

/**
 * Applies the selected lines of a parsed diff to a text file WITHOUT invoking
 * git apply. This is used to produce the exact blob that should live in the
 * index (stage/unstage) or in the working tree (discard) and works even when
 * the index and the working tree already contain other partial changes.
 */
export function applyDiffToContent(
  base: ContentModel,
  diff: Pick<FileDiff, 'hunks'>,
  options: ApplyOptions
): ApplyResult {
  const baseLines = base.lines;
  const output: string[] = [];
  let cursor = 0;

  for (const hunk of diff.hunks) {
    const selected = options.selection.get(hunk.index) ?? new Set<number>();
    if (!selected.size) continue;

    const anchor = options.direction === 'forward' ? hunk.oldStart : hunk.newStart;
    const startIndex = anchor === 0 ? 0 : anchor - 1;
    if (startIndex < cursor) {
      throw new PatchConflictError('Overlapping hunks while applying the patch.');
    }
    while (cursor < startIndex && cursor < baseLines.length) {
      output.push(baseLines[cursor]);
      cursor++;
    }

    for (let i = 0; i < hunk.lines.length; i++) {
      const line = hunk.lines[i];
      const isSelected = selected.has(i);

      if (options.direction === 'forward') {
        if (line.kind === 'context') {
          assertLine(baseLines[cursor], line.text, `context at line ${line.oldLine ?? '?'}`);
          output.push(baseLines[cursor]);
          cursor++;
        } else if (line.kind === 'del') {
          assertLine(baseLines[cursor], line.text, `removal at line ${line.oldLine ?? '?'}`);
          if (!isSelected) output.push(baseLines[cursor]);
          cursor++;
        } else if (line.kind === 'add' && isSelected) {
          output.push(line.text);
        }
      } else {
        if (line.kind === 'context') {
          assertLine(baseLines[cursor], line.text, `context at line ${line.newLine ?? '?'}`);
          output.push(baseLines[cursor]);
          cursor++;
        } else if (line.kind === 'del' && isSelected) {
          output.push(line.text);
        } else if (line.kind === 'add') {
          assertLine(baseLines[cursor], line.text, `addition at line ${line.newLine ?? '?'}`);
          if (!isSelected) output.push(baseLines[cursor]);
          cursor++;
        }
      }
    }
  }

  while (cursor < baseLines.length) {
    output.push(baseLines[cursor]);
    cursor++;
  }

  const changed =
    output.length !== baseLines.length || output.some((line, index) => line !== baseLines[index]);

  let trailingNewline = base.trailingNewline;
  // If the last emitted line is an added line that git flagged as having no
  // trailing newline, mirror that.
  for (let h = diff.hunks.length - 1; h >= 0; h--) {
    const hunk = diff.hunks[h];
    const selected = options.selection.get(hunk.index);
    if (!selected?.size) continue;
    for (let i = hunk.lines.length - 1; i >= 0; i--) {
      const line = hunk.lines[i];
      if (line.kind === 'add' && selected.has(i) && line.noNewline) {
        trailingNewline = false;
      }
      break;
    }
    break;
  }

  return { lines: output, trailingNewline, changed };
}

/** Builds the selection map for a whole hunk. */
export function hunkSelection(diff: FileDiff, hunkIndex: number): Map<number, Set<number>> {
  const hunk = diff.hunks.find((entry) => entry.index === hunkIndex);
  const map = new Map<number, Set<number>>();
  if (hunk) map.set(hunkIndex, new Set(allChangeLineIndexes(hunk)));
  return map;
}

/** Builds a selection map from line indexes. */
export function lineSelection(
  diff: FileDiff,
  hunkIndex: number,
  lineIndexes: number[]
): Map<number, Set<number>> {
  const map = new Map<number, Set<number>>();
  const hunk = diff.hunks.find((entry) => entry.index === hunkIndex);
  if (!hunk) return map;
  const valid = new Set<number>();
  for (const index of lineIndexes) {
    const line = hunk.lines[index];
    if (line && (line.kind === 'add' || line.kind === 'del')) valid.add(index);
  }
  if (valid.size) map.set(hunkIndex, valid);
  return map;
}

/** Extracts the selected added/removed line counts for a selection. */
export function selectionStats(
  hunk: DiffHunk,
  selection: Set<number>
): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  hunk.lines.forEach((line, index) => {
    if (!selection.has(index)) return;
    if (line.kind === 'add') additions++;
    else if (line.kind === 'del') deletions++;
  });
  return { additions, deletions };
}
