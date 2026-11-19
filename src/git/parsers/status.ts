import { ChangeFile, StatusCode } from '../../protocol/types';

export interface StatusSummary {
  branch: {
    oid: string | null;
    head: string | null;
    detached: boolean;
    upstream: string | null;
    ahead: number;
    behind: number;
  };
  files: ChangeFile[];
}

const CONFLICT_CODES = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);

function mapIndexCode(code: string): StatusCode | undefined {
  switch (code) {
    case 'M':
      return 'M';
    case 'A':
      return 'A';
    case 'D':
      return 'D';
    case 'R':
      return 'R';
    case 'C':
      return 'C';
    case 'T':
      return 'T';
    case 'U':
      return 'U';
    default:
      return undefined;
  }
}

function mapWorktreeCode(code: string): StatusCode | undefined {
  switch (code) {
    case 'M':
      return 'M';
    case 'D':
      return 'D';
    case 'T':
      return 'T';
    case 'U':
      return 'U';
    case 'A':
      return 'A';
    default:
      return undefined;
  }
}

function splitPrefixFields(record: string, count: number): { fields: string[]; rest: string } {
  const fields: string[] = [];
  let index = 0;
  for (let i = 0; i < count; i++) {
    const next = record.indexOf(' ', index);
    if (next === -1) {
      fields.push(record.slice(index));
      index = record.length;
      break;
    }
    fields.push(record.slice(index, next));
    index = next + 1;
  }
  return { fields, rest: record.slice(index) };
}

/**
 * Parses `git status --porcelain=v2 -z --branch --untracked-files=all`.
 * Records are NUL separated; rename records have an extra NUL separated original path.
 */
export function parseStatus(output: string): StatusSummary {
  const summary: StatusSummary = {
    branch: { oid: null, head: null, detached: false, upstream: null, ahead: 0, behind: 0 },
    files: []
  };

  const parts = output.split('\0');
  for (let i = 0; i < parts.length; i++) {
    const record = parts[i];
    if (!record) continue;

    if (record.startsWith('# branch.oid ')) {
      const oid = record.slice('# branch.oid '.length).trim();
      summary.branch.oid = oid && oid !== '(initial)' ? oid : null;
      continue;
    }
    if (record.startsWith('# branch.head ')) {
      const head = record.slice('# branch.head '.length).trim();
      if (head === '(detached)') {
        summary.branch.detached = true;
        summary.branch.head = null;
      } else {
        summary.branch.head = head;
      }
      continue;
    }
    if (record.startsWith('# branch.upstream ')) {
      summary.branch.upstream = record.slice('# branch.upstream '.length).trim();
      continue;
    }
    if (record.startsWith('# branch.ab ')) {
      const match = /\+(\d+)\s+-(\d+)/.exec(record);
      if (match) {
        summary.branch.ahead = Number(match[1]);
        summary.branch.behind = Number(match[2]);
      }
      continue;
    }
    if (record.startsWith('# ')) continue;

    if (record.startsWith('? ')) {
      const file: ChangeFile = {
        path: record.slice(2),
        unstaged: true,
        staged: false,
        untracked: true,
        ignored: false,
        conflicted: false,
        worktreeStatus: '?',
        unstagedBadge: '?'
      };
      summary.files.push(file);
      continue;
    }
    if (record.startsWith('! ')) {
      summary.files.push({
        path: record.slice(2),
        unstaged: false,
        staged: false,
        untracked: false,
        ignored: true,
        conflicted: false
      });
      continue;
    }

    if (record.startsWith('1 ') || record.startsWith('2 ')) {
      const isRename = record.startsWith('2 ');
      const { fields, rest } = splitPrefixFields(record, isRename ? 9 : 8);
      const xy = fields[1] ?? '..';
      const indexCode = xy[0];
      const worktreeCode = xy[1];
      let path = rest;
      let oldPath: string | undefined;
      if (isRename) {
        oldPath = parts[i + 1];
        i++;
      }
      if (!path) continue;

      const conflicted = CONFLICT_CODES.has(xy) || indexCode === 'U' || worktreeCode === 'U';
      const indexStatus = conflicted ? ('U' as StatusCode) : mapIndexCode(indexCode);
      const worktreeStatus = conflicted ? ('U' as StatusCode) : mapWorktreeCode(worktreeCode);
      const staged = !!indexStatus;
      const unstaged = !!worktreeStatus;

      summary.files.push({
        path,
        oldPath,
        indexStatus,
        worktreeStatus,
        staged,
        unstaged,
        untracked: false,
        ignored: false,
        conflicted,
        stagedBadge: indexStatus,
        unstagedBadge: worktreeStatus
      });
      continue;
    }

    if (record.startsWith('u ')) {
      const { fields, rest } = splitPrefixFields(record, 10);
      const xy = fields[1] ?? 'UU';
      summary.files.push({
        path: rest,
        indexStatus: xy[0] === 'U' ? 'U' : mapIndexCode(xy[0]),
        worktreeStatus: xy[1] === 'U' ? 'U' : mapWorktreeCode(xy[1]),
        staged: true,
        unstaged: true,
        untracked: false,
        ignored: false,
        conflicted: true,
        stagedBadge: 'U',
        unstagedBadge: 'U'
      });
    }
  }

  summary.files.sort((a, b) => a.path.localeCompare(b.path));
  return summary;
}

/** Extracts the untracked/ignored files from porcelain v2 output. */
export function untrackedPaths(output: string): string[] {
  return parseStatus(output)
    .files.filter((file) => file.untracked)
    .map((file) => file.path);
}
