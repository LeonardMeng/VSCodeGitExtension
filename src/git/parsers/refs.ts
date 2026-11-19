import { BranchInfo, CommitRef, RemoteGroup, TagInfo } from '../../protocol/types';

const FIELD = '\x1f';
const RECORD = '\x1e';

export interface RefSnapshot {
  branches: BranchInfo[];
  remotes: RemoteGroup[];
  tags: TagInfo[];
  refsBySha: Map<string, CommitRef[]>;
  remoteUrls: Map<string, string | null>;
  localRefsBySha: Map<string, string[]>;
  remoteRefsBySha: Map<string, string[]>;
  tagsBySha: Map<string, string[]>;
}

interface RawRef {
  refname: string;
  sha: string;
  objectType: string;
  peeled: string;
  upstream: string;
  head: string;
  subject: string;
  author: string;
  updatedAt: number;
  track: string;
  contents?: string;
}

function parseTrack(track: string): { ahead: number; behind: number } {
  const ahead = /ahead (\d+)/.exec(track);
  const behind = /behind (\d+)/.exec(track);
  return { ahead: ahead ? Number(ahead[1]) : 0, behind: behind ? Number(behind[1]) : 0 };
}

function unescapeRefName(name: string): string {
  return name;
}

/**
 * Parses `git for-each-ref` with fields separated by NUL and records by RS (0x1e).
 * The format used by Repository must match REF_FORMAT.
 */
export const REF_FORMAT = [
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

export function parseRefs(output: string): RefSnapshot {
  const branches: BranchInfo[] = [];
  const remoteMap = new Map<string, RemoteGroup>();
  const tags: TagInfo[] = [];
  const refsBySha = new Map<string, CommitRef[]>();
  const localRefsBySha = new Map<string, string[]>();
  const remoteRefsBySha = new Map<string, string[]>();
  const tagsBySha = new Map<string, string[]>();

  const addTo = (map: Map<string, string[]>, sha: string, name: string) => {
    const existing = map.get(sha);
    if (existing) {
      if (!existing.includes(name)) existing.push(name);
    } else {
      map.set(sha, [name]);
    }
  };
  const addRef = (ref: CommitRef, sha: string) => {
    const list = refsBySha.get(sha);
    if (list) list.push(ref);
    else refsBySha.set(sha, [ref]);
  };

  for (const record of output.split(RECORD)) {
    if (!record || record === '\n') continue;
    const clean = record.replace(/^\r?\n/, '');
    const fields = clean.split(FIELD);
    if (fields.length < 9) continue;
    const raw: RawRef = {
      refname: fields[0],
      sha: fields[1],
      objectType: fields[2] || 'commit',
      peeled: fields[3] || '',
      upstream: fields[4] || '',
      head: fields[5] || '',
      subject: fields[6] || '',
      author: fields[7] || '',
      updatedAt: Number(fields[8] || 0),
      track: fields[9] || ''
    };
    if (!raw.refname || !raw.sha) continue;
    const name = unescapeRefName(raw.refname);

    if (name.startsWith('refs/heads/')) {
      const short = name.slice('refs/heads/'.length);
      const { ahead, behind } = parseTrack(raw.track);
      const branch: BranchInfo = {
        name: short,
        fullName: short,
        remote: null,
        isRemote: false,
        current: raw.head === '*',
        sha: raw.sha,
        upstream: raw.upstream || null,
        ahead,
        behind,
        subject: raw.subject,
        author: raw.author,
        updatedAt: raw.updatedAt * 1000
      };
      branches.push(branch);
      addRef({ name: short, kind: 'local', current: branch.current, upstream: branch.upstream }, raw.sha);
      addTo(localRefsBySha, raw.sha, short);
    } else if (name.startsWith('refs/remotes/')) {
      const full = name.slice('refs/remotes/'.length);
      if (full.endsWith('/HEAD')) continue;
      const slash = full.indexOf('/');
      if (slash <= 0) continue;
      const remote = full.slice(0, slash);
      const short = full.slice(slash + 1);
      const branch: BranchInfo = {
        name: short,
        fullName: full,
        remote,
        isRemote: true,
        current: false,
        sha: raw.sha,
        upstream: null,
        ahead: 0,
        behind: 0,
        subject: raw.subject,
        author: raw.author,
        updatedAt: raw.updatedAt * 1000
      };
      const group = remoteMap.get(remote) ?? { name: remote, url: null, branches: [] };
      group.branches.push(branch);
      remoteMap.set(remote, group);
      addRef({ name: full, kind: 'remote', remote }, raw.sha);
      addTo(remoteRefsBySha, raw.sha, full);
    } else if (name.startsWith('refs/tags/')) {
      const short = name.slice('refs/tags/'.length);
      const annotated = raw.objectType === 'tag';
      const sha = annotated ? raw.peeled || raw.sha : raw.sha;
      tags.push({
        name: short,
        sha,
        annotated,
        message: annotated ? raw.subject : null,
        updatedAt: raw.updatedAt * 1000
      });
      addRef({ name: short, kind: 'tag' }, sha);
      addTo(tagsBySha, sha, short);
    }
  }

  branches.sort((a, b) => a.name.localeCompare(b.name));
  for (const group of remoteMap.values()) {
    group.branches.sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    branches,
    remotes: [...remoteMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    tags,
    refsBySha,
    remoteUrls: new Map(),
    localRefsBySha,
    remoteRefsBySha,
    tagsBySha
  };
}

/** Parses `git remote -v` output. */
export function parseRemotes(output: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of output.split('\n')) {
    const match = /^(\S+)\s+(\S+)\s+\((fetch|push)\)$/.exec(line.trim());
    if (match && match[3] === 'fetch') {
      map.set(match[1], match[2]);
    }
  }
  return map;
}

/** Parses `git stash list --format=...` records separated by RS. */
export function parseStashes(output: string): import('../../protocol/types').StashEntry[] {
  const stashes: import('../../protocol/types').StashEntry[] = [];
  let index = 0;
  for (const record of output.split(RECORD)) {
    const clean = record.replace(/^\r?\n/, '');
    if (!clean.trim()) continue;
    const fields = clean.split(FIELD);
    if (fields.length < 5) continue;
    stashes.push({
      index: index++,
      ref: fields[0] || `stash@{${index - 1}}`,
      sha: fields[1] || '',
      message: fields[2] || '',
      branch: /^On ([^:]+):/.exec(fields[2] || '')?.[1] ?? null,
      author: fields[4] || '',
      updatedAt: Number(fields[5] || 0) * 1000
    });
  }
  return stashes;
}

export const STASH_FORMAT = ['%gd', '%H', '%gs', '%s', '%an', '%ct'].join('\x1f') + '\x1e';

/** Parses `git submodule status` output. */
export function parseSubmodules(output: string): import('../../protocol/types').SubmoduleInfo[] {
  const result: import('../../protocol/types').SubmoduleInfo[] = [];
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const flag = line[0];
    const rest = line.slice(1).trim();
    const parts = rest.split(/\s+/);
    if (parts.length < 2) continue;
    const sha = parts[0];
    const subPath = parts[1];
    const description = parts.slice(2).join(' ');
    let status: 'clean' | 'modified' | 'uninitialized' | 'conflict' = 'clean';
    if (flag === '-') status = 'uninitialized';
    else if (flag === '+') status = 'modified';
    else if (flag === 'U') status = 'conflict';
    const name = subPath.split('/').filter(Boolean).pop() ?? subPath;
    result.push({ path: subPath, name, url: null, sha, description: description || null, status });
  }
  result.sort((a, b) => a.path.localeCompare(b.path));
  return result;
}

/** Parses .gitmodules into path -> {name,url,branch}. */
export function parseGitmodules(text: string): Map<string, { name: string; url: string | null; branch: string | null }> {
  const map = new Map<string, { name: string; url: string | null; branch: string | null }>();
  let current: { name: string; url: string | null; branch: string | null } | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('[submodule')) {
      if (current) map.set(current.name, current);
      const match = /"([^"]+)"/.exec(line);
      current = { name: match?.[1] ?? '', url: null, branch: null };
    } else if (current) {
      const match = /^(\w+)\s*=\s*(.*)$/.exec(line);
      if (match) {
        if (match[1] === 'path') {
          current.name = match[2];
          map.set(current.name, current);
        } else if (match[1] === 'url') {
          current.url = match[2];
        } else if (match[1] === 'branch') {
          current.branch = match[2];
        }
      }
    }
  }
  return map;
}
