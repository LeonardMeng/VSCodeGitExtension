import { DiffHunk, DiffLine, FileDiff, StatusCode } from '../../protocol/types';

function unquoteGitPath(raw: string): string {
  let value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
    value = value.replace(/\\([\\"abfnrtv]|[0-7]{1,3})/g, (_match, code: string) => {
      switch (code) {
        case 'a':
          return '\x07';
        case 'b':
          return '\b';
        case 'f':
          return '\f';
        case 'n':
          return '\n';
        case 'r':
          return '\r';
        case 't':
          return '\t';
        case 'v':
          return '\v';
        case '\\':
          return '\\';
        case '"':
          return '"';
        default:
          return String.fromCharCode(parseInt(code, 8));
      }
    });
  }
  return value;
}

function stripPrefix(value: string, prefix: string): string {
  const unquoted = unquoteGitPath(value);
  if (unquoted === '/dev/null') return '/dev/null';
  return unquoted.startsWith(prefix) ? unquoted.slice(prefix.length) : unquoted;
}

interface MutableDiff {
  oldPath: string;
  newPath: string;
  status: StatusCode;
  binary: boolean;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  modeChange?: string;
  submodule: boolean;
  newFile: boolean;
  deletedFile: boolean;
  renamed: boolean;
}

function parseHunkHeader(line: string): {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  section: string;
} | null {
  const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/.exec(line);
  if (!match) return null;
  return {
    oldStart: Number(match[1]),
    oldLines: match[2] === undefined ? 1 : Number(match[2]),
    newStart: Number(match[3]),
    newLines: match[4] === undefined ? 1 : Number(match[4]),
    section: match[5] ?? ''
  };
}

/**
 * Parses a unified diff (`git diff --no-color` / `git show -p`) into one or more
 * file diffs. Supports renames, adds, deletes, binary files and submodule
 * entries; hunk line numbers are resolved for rendering.
 */
export function parseUnifiedDiff(
  output: string,
  defaults: Partial<Pick<FileDiff, 'editable' | 'side' | 'meta' | 'error'>> = {}
): FileDiff[] {
  const results: FileDiff[] = [];
  if (!output.trim()) return results;

  let current: MutableDiff | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  const finish = () => {
    if (!current) return;
    const path = current.deletedFile ? current.oldPath : current.newPath;
    if (!path || path === '/dev/null') {
      current = null;
      currentHunk = null;
      return;
    }
    const oldPath = current.oldPath && current.oldPath !== path ? current.oldPath : undefined;
    const diff: FileDiff = {
      path,
      oldPath,
      status: current.status,
      binary: current.binary,
      hunks: current.hunks,
      additions: current.additions,
      deletions: current.deletions,
      editable: defaults.editable ?? false,
      side: defaults.side,
      submodule: current.submodule,
      modeChange: current.modeChange,
      meta: defaults.meta,
      error: defaults.error
    };
    if (current.binary) diff.tooLarge = false;
    results.push(diff);
    current = null;
    currentHunk = null;
  };

  const lines = output.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;

    if (line.startsWith('diff --git ')) {
      finish();
      current = {
        oldPath: '',
        newPath: '',
        status: 'M',
        binary: false,
        hunks: [],
        additions: 0,
        deletions: 0,
        submodule: false,
        newFile: false,
        deletedFile: false,
        renamed: false
      };
      const rest = line.slice('diff --git '.length);
      const match = /^"?a\/(.+?)"? "?b\/(.+?)"?$/.exec(rest);
      if (match) {
        current.oldPath = unquoteGitPath(match[1]);
        current.newPath = unquoteGitPath(match[2]);
      }
      continue;
    }

    if (!current) continue;

    if (line.startsWith('new file mode ')) {
      current.newFile = true;
      current.status = 'A';
      continue;
    }
    if (line.startsWith('deleted file mode ')) {
      current.deletedFile = true;
      current.status = 'D';
      continue;
    }
    if (line.startsWith('old mode ') || line.startsWith('new mode ')) {
      current.modeChange = line;
      continue;
    }
    if (line.startsWith('rename from ')) {
      current.renamed = true;
      current.oldPath = unquoteGitPath(line.slice('rename from '.length));
      current.status = 'R';
      continue;
    }
    if (line.startsWith('rename to ')) {
      current.renamed = true;
      current.newPath = unquoteGitPath(line.slice('rename to '.length));
      current.status = 'R';
      continue;
    }
    if (line.startsWith('copy from ')) {
      current.oldPath = unquoteGitPath(line.slice('copy from '.length));
      current.status = 'C';
      continue;
    }
    if (line.startsWith('copy to ')) {
      current.newPath = unquoteGitPath(line.slice('copy to '.length));
      current.status = 'C';
      continue;
    }
    if (line.startsWith('Binary files ')) {
      current.binary = true;
      currentHunk = null;
      continue;
    }
    if (line.startsWith('GIT binary patch')) {
      current.binary = true;
      currentHunk = null;
      continue;
    }
    if (line.startsWith('--- ')) {
      const value = line.slice(4).split('\t')[0];
      current.oldPath = stripPrefix(value, 'a/');
      continue;
    }
    if (line.startsWith('+++ ')) {
      const value = line.slice(4).split('\t')[0];
      current.newPath = stripPrefix(value, 'b/');
      continue;
    }
    if (line.startsWith('@@')) {
      const header = parseHunkHeader(line);
      if (!header) continue;
      oldLine = header.oldStart;
      newLine = header.newStart;
      currentHunk = {
        index: current.hunks.length,
        header: line,
        section: header.section,
        oldStart: header.oldStart,
        oldLines: header.oldLines,
        newStart: header.newStart,
        newLines: header.newLines,
        lines: []
      };
      current.hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('\\')) {
      const last = currentHunk.lines[currentHunk.lines.length - 1];
      if (last) last.noNewline = true;
      continue;
    }

    const prefix = line[0];
    if (prefix === ' ') {
      currentHunk.lines.push({
        kind: 'context',
        oldLine,
        newLine,
        text: line.slice(1)
      });
      oldLine++;
      newLine++;
    } else if (prefix === '-') {
      currentHunk.lines.push({
        kind: 'del',
        oldLine,
        newLine: null,
        text: line.slice(1)
      });
      oldLine++;
      current.deletions++;
    } else if (prefix === '+') {
      currentHunk.lines.push({
        kind: 'add',
        oldLine: null,
        newLine,
        text: line.slice(1)
      });
      newLine++;
      current.additions++;
    } else if (line.startsWith('Subproject commit ')) {
      current.submodule = true;
    } else if (line.startsWith('@@')) {
      // handled above
    } else {
      // The hunk ended (unknown trailer). Stop consuming lines into it but keep
      // parsing metadata for subsequent files.
      currentHunk = null;
    }
  }

  finish();
  return results;
}

/** Builds an all-added diff for a file that is not tracked by git yet. */
export function syntheticDiff(
  path: string,
  content: string,
  options: { editable?: boolean; maxLines?: number } = {}
): FileDiff {
  const maxLines = options.maxLines ?? 20000;
  const normalized = content.replace(/\r\n/g, '\n');
  const rawLines = normalized.split('\n');
  if (rawLines.length && rawLines[rawLines.length - 1] === '') rawLines.pop();
  const truncated = rawLines.length > maxLines;
  const lines = rawLines.slice(0, maxLines);
  const diffLines: DiffLine[] = lines.map((text, index) => ({
    kind: 'add' as const,
    oldLine: null,
    newLine: index + 1,
    text
  }));
  const hunk: DiffHunk = {
    index: 0,
    header: `@@ -0,0 +1,${lines.length} @@`,
    section: '',
    oldStart: 0,
    oldLines: 0,
    newStart: 1,
    newLines: lines.length,
    lines: diffLines
  };
  return {
    path,
    status: 'A',
    binary: false,
    hunks: [hunk],
    additions: lines.length,
    deletions: 0,
    editable: options.editable ?? false,
    tooLarge: truncated
  };
}

/** Builds an empty diff (used for whitespace-only or metadata-only changes). */
export function emptyDiff(path: string, status: StatusCode = 'M', editable = false): FileDiff {
  return {
    path,
    status,
    binary: false,
    hunks: [],
    additions: 0,
    deletions: 0,
    editable
  };
}

/** Converts a diff back into a patch Git can apply (`git apply`), if ever needed. */
export function fileDiffToPatch(diff: FileDiff): string {
  if (diff.binary) return '';
  const oldPath = diff.oldPath ?? diff.path;
  const lines: string[] = [];
  lines.push(`diff --git a/${oldPath} b/${diff.path}`);
  if (diff.status === 'A') lines.push(`new file mode 100644`);
  if (diff.status === 'D') lines.push(`deleted file mode 100644`);
  lines.push(diff.status === 'A' ? '--- /dev/null' : `--- a/${oldPath}`);
  lines.push(diff.status === 'D' ? '+++ /dev/null' : `+++ b/${diff.path}`);
  for (const hunk of diff.hunks) {
    lines.push(hunk.header);
    for (const line of hunk.lines) {
      const prefix = line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' ';
      lines.push(prefix + line.text);
      if (line.noNewline) lines.push('\\ No newline at end of file');
    }
  }
  return lines.join('\n') + '\n';
}

export function isLikelyBinary(buffer: Buffer): boolean {
  const length = Math.min(buffer.length, 8000);
  for (let i = 0; i < length; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}
