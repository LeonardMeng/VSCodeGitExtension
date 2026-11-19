import { ChangeFile } from '@shared/protocol/types';

export interface FolderNode {
  kind: 'folder';
  name: string;
  path: string;
  children: TreeNode[];
  depth: number;
}

export interface FileNode {
  kind: 'file';
  name: string;
  path: string;
  file: ChangeFile;
  depth: number;
}

export type TreeNode = FolderNode | FileNode;

export interface FlatRow {
  kind: 'folder' | 'file';
  name: string;
  path: string;
  depth: number;
  file?: ChangeFile;
  folder?: FolderNode;
  expanded?: boolean;
  hasChildren?: boolean;
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** Builds a sorted folder/file tree from a flat list of changed files. */
export function buildFileTree(files: ChangeFile[], rootName?: string): TreeNode[] {
  const root: FolderNode = {
    kind: 'folder',
    name: rootName ?? '',
    path: rootName ?? '',
    children: [],
    depth: 0
  };
  const folders = new Map<string, FolderNode>();
  folders.set(root.path, root);

  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let current = root;
    let prefix = '';
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      prefix = prefix ? `${prefix}/${part}` : part;
      let folder = folders.get(prefix);
      if (!folder) {
        folder = { kind: 'folder', name: part, path: prefix, children: [], depth: current.depth + 1 };
        folders.set(prefix, folder);
        current.children.push(folder);
      }
      current = folder;
    }
    current.children.push({
      kind: 'file',
      name: parts[parts.length - 1] ?? file.path,
      path: file.path,
      file,
      depth: current.depth + 1
    });
  }

  const sort = (folder: FolderNode) => {
    folder.children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      return compareNames(a.name, b.name);
    });
    for (const child of folder.children) {
      if (child.kind === 'folder') sort(child);
    }
  };
  sort(root);

  const normalizeDepth = (folder: FolderNode) => {
    for (const child of folder.children) {
      child.depth = folder.depth + 1;
      if (child.kind === 'folder') normalizeDepth(child);
    }
  };
  normalizeDepth(root);
  return root.children;
}

export function allFolderPaths(nodes: TreeNode[], result: string[] = []): string[] {
  for (const node of nodes) {
    if (node.kind === 'folder') {
      result.push(node.path);
      allFolderPaths(node.children, result);
    }
  }
  return result;
}

export function collectFolderPaths(nodes: TreeNode[]): string[] {
  return allFolderPaths(nodes);
}

/** Flattens a tree into the rows visible with the given expanded folder set. */
export function flattenTree(nodes: TreeNode[], expanded: Set<string>, depth = 0): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const node of nodes) {
    if (node.kind === 'folder') {
      const isExpanded = expanded.has(node.path);
      rows.push({
        kind: 'folder',
        name: node.name,
        path: node.path,
        depth,
        folder: node,
        expanded: isExpanded,
        hasChildren: node.children.length > 0
      });
      if (isExpanded) {
        rows.push(...flattenTree(node.children, expanded, depth + 1));
      }
    } else {
      rows.push({
        kind: 'file',
        name: node.name,
        path: node.path,
        depth,
        file: node.file
      });
    }
  }
  return rows;
}

/** Flattens without folders, showing full paths for the list view. */
export function flattenFiles(nodes: TreeNode[], result: ChangeFile[] = []): ChangeFile[] {
  for (const node of nodes) {
    if (node.kind === 'folder') flattenFiles(node.children, result);
    else result.push(node.file);
  }
  return result;
}

export interface BranchLike {
  name: string;
  fullName?: string;
  isRemote?: boolean;
  remote?: string | null;
}

export interface BranchFolder<T extends BranchLike> {
  kind: 'branchFolder';
  name: string;
  path: string;
  children: BranchNode<T>[];
}

export interface BranchLeaf<T extends BranchLike> {
  kind: 'branch';
  name: string;
  path: string;
  branch: T;
}

export type BranchNode<T extends BranchLike> = BranchFolder<T> | BranchLeaf<T>;

/** Groups branches by their `/` prefixes like Fork does. */
export function buildBranchTree<T extends BranchLike>(branches: T[], group = true): BranchNode<T>[] {
  if (!group) {
    return branches
      .slice()
      .sort((a, b) => compareNames(a.name, b.name))
      .map((branch) => ({ kind: 'branch' as const, name: branch.name, path: branch.name, branch }));
  }

  const root: BranchFolder<T> = { kind: 'branchFolder', name: '', path: '', children: [] };
  for (const branch of branches) {
    const parts = branch.name.split('/').filter(Boolean);
    let current = root;
    let prefix = '';
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      prefix = prefix ? `${prefix}/${part}` : part;
      let folder = current.children.find(
        (child): child is BranchFolder<T> => child.kind === 'branchFolder' && child.name === part
      );
      if (!folder) {
        folder = { kind: 'branchFolder', name: part, path: prefix, children: [] };
        current.children.push(folder);
      }
      current = folder;
    }
    current.children.push({
      kind: 'branch',
      name: parts[parts.length - 1] ?? branch.name,
      path: branch.name,
      branch
    });
  }

  const sort = (folder: BranchFolder<T>) => {
    folder.children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'branchFolder' ? -1 : 1;
      return compareNames(a.name, b.name);
    });
    for (const child of folder.children) {
      if (child.kind === 'branchFolder') sort(child);
    }
  };
  sort(root);
  return root.children;
}

export function branchFolderPaths<T extends BranchLike>(nodes: BranchNode<T>[], prefix = ''): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    if (node.kind === 'branchFolder') {
      const path = prefix ? `${prefix}/${node.name}` : node.name;
      result.push(path);
      result.push(...branchFolderPaths(node.children, path));
    }
  }
  return result;
}

export function filterBranchTree<T extends BranchLike>(nodes: BranchNode<T>[], query: string): BranchNode<T>[] {
  const term = query.trim().toLowerCase();
  if (!term) return nodes;
  const result: BranchNode<T>[] = [];
  for (const node of nodes) {
    if (node.kind === 'branch') {
      if (node.branch.name.toLowerCase().includes(term)) result.push(node);
    } else {
      const children = filterBranchTree(node.children, query);
      if (children.length || node.name.toLowerCase().includes(term)) {
        result.push({ ...node, children });
      }
    }
  }
  return result;
}
