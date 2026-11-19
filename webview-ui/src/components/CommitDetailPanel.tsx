import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppConfig,
  ChangeFile,
  CommitAction,
  CommitDetail,
  CommitSummary,
  DiffOptions,
  FileDiff,
  FileTreeEntry
} from '@shared/protocol/types';
import { RequestFn, PushToast } from '../bridgeTypes';
import { Icon } from './Icon';
import { EmptyState, IconButton, MenuItem, Spinner, useContextMenu } from './Menu';
import { Avatar, Chip, FileTypeIcon, StatusBadge } from './StatusBadge';
import { DiffViewer } from './DiffViewer';
import {
  buildFileTree,
  collectFolderPaths,
  flattenTree,
  TreeNode
} from '../utils/tree';
import { baseName, dirName, formatBytes, formatDate, shortSha } from '../utils/format';

interface CommitDetailPanelProps {
  detail: CommitDetail | null;
  selectedCommit: CommitSummary | null;
  loading: boolean;
  config: AppConfig;
  request: RequestFn;
  onCopy: (text: string) => void;
  onOpenFile: (path: string, sha?: string) => void;
  onFileHistory: (path: string) => void;
  onBlame: (path: string) => void;
  onSelectSha: (sha: string) => void;
  onCommitAction: (sha: string, action: CommitAction) => void;
  onPushToast: PushToast;
  onClose: () => void;
}

type Tab = 'commit' | 'changes' | 'tree';

export function CommitDetailPanel(props: CommitDetailPanelProps): React.ReactElement {
  const { detail, selectedCommit, loading, config, request } = props;
  const [tab, setTab] = useState<Tab>('commit');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [parentIndex, setParentIndex] = useState(0);
  const [fileDiff, setFileDiff] = useState<FileDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [contextLines, setContextLines] = useState(config.contextLines);
  const [fullFile, setFullFile] = useState(false);
  const [fileFilter, setFileFilter] = useState('');
  const [fileMode, setFileMode] = useState<'tree' | 'list'>('tree');
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const diffToken = useRef(0);
  const { openMenu, menuNode } = useContextMenu();

  const [treeEntries, setTreeEntries] = useState<FileTreeEntry[] | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [treeTruncated, setTreeTruncated] = useState(false);
  const [treeFilter, setTreeFilter] = useState('');
  const [treeShaLoaded, setTreeShaLoaded] = useState<string | null>(null);
  const [treeExpanded, setTreeExpanded] = useState<Set<string>>(new Set());

  const sha = detail?.commit.sha ?? selectedCommit?.sha ?? null;

  useEffect(() => {
    setTab('commit');
    setSelectedPath(detail?.files[0]?.path ?? null);
    setParentIndex(0);
    setFileDiff(null);
    setDiffError(null);
    setTreeEntries(null);
    setTreeShaLoaded(null);
    setTreeError(null);
  }, [sha]);

  useEffect(() => {
    if (tab === 'changes' && !selectedPath && detail?.files.length) {
      setSelectedPath(detail.files[0].path);
    }
  }, [tab, selectedPath, detail]);

  useEffect(() => {
    if (tab !== 'tree' || !detail || treeShaLoaded === detail.commit.sha) return;
    let cancelled = false;
    setTreeLoading(true);
    setTreeError(null);
    void request<import('@shared/protocol/types').ToWebviewMessage & { type: 'fileTree' }>(
      (requestId) => ({ type: 'getFileTree', requestId, sha: detail.commit.sha }),
      ['fileTree']
    )
      .then((message) => {
        if (cancelled || message.type !== 'fileTree') return;
        setTreeEntries(message.entries);
        setTreeTruncated(message.truncated);
        setTreeShaLoaded(message.sha);
      })
      .catch((error: Error) => {
        if (!cancelled) setTreeError(error.message);
      })
      .finally(() => {
        if (!cancelled) setTreeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, detail, treeShaLoaded, request]);

  const selectedFile = detail?.files.find((file) => file.path === selectedPath) ?? null;

  useEffect(() => {
    if (tab !== 'changes' || !detail || !selectedFile) {
      if (tab !== 'changes') setFileDiff(null);
      return;
    }
    const token = ++diffToken.current;
    setDiffLoading(true);
    setDiffError(null);
    void request<import('@shared/protocol/types').ToWebviewMessage & { type: 'commitFileDiff' }>(
      (requestId) => ({
        type: 'getCommitFileDiff',
        requestId,
        sha: detail.commit.sha,
        path: selectedFile.path,
        oldPath: selectedFile.oldPath,
        options: { contextLines, fullFile },
        parentIndex
      }),
      ['commitFileDiff']
    )
      .then((message) => {
        if (token !== diffToken.current) return;
        if (message.type === 'commitFileDiff') setFileDiff(message.diff);
      })
      .catch((error: Error) => {
        if (token !== diffToken.current) return;
        setDiffError(error.message);
        setFileDiff(null);
      })
      .finally(() => {
        if (token === diffToken.current) setDiffLoading(false);
      });
  }, [tab, detail, selectedFile, parentIndex, contextLines, fullFile, request]);

  if (!selectedCommit) {
    return (
      <div className="commit-detail empty">
        <EmptyState
          icon="commit"
          title="Select a commit"
          description="Click a commit in the list to inspect its message, changed files and full tree."
        />
      </div>
    );
  }

  const summary = detail?.commit ?? selectedCommit;
  const parents = summary.parents;
  const parentOptions: MenuItem[] = parents.length
    ? parents.map((parent, index) => ({
        label: `Parent ${index + 1} — ${shortSha(parent)}`,
        icon: 'commit',
        checked: index === parentIndex,
        onSelect: () => {
          setParentIndex(index);
          setFileDiff(null);
        }
      }))
    : [{ label: 'Root commit (no parent)', disabled: true }];

  const changeFiles = (detail?.files ?? []).map(
    (file): ChangeFile => ({
      path: file.path,
      oldPath: file.oldPath,
      indexStatus: file.status,
      staged: true,
      unstaged: false,
      untracked: file.status === 'A',
      ignored: false,
      conflicted: file.status === 'U',
      stagedBadge: file.status
    })
  );

  const fileMenu = (filePath: string): MenuItem[] => [
    { label: 'Open File at This Revision', icon: 'external', onSelect: () => props.onOpenFile(filePath, sha ?? undefined) },
    { label: 'File History', icon: 'history', onSelect: () => props.onFileHistory(filePath) },
    { label: 'Blame at This Revision', icon: 'info', onSelect: () => props.onBlame(filePath) },
    { separator: true },
    { label: 'Copy Path', icon: 'copy', onSelect: () => props.onCopy(filePath) }
  ];

  return (
    <div className="commit-detail">
      <div className="detail-summary">
        <Avatar name={summary.author.name} size={24} />
        <span className="summary-author">{summary.author.name}</span>
        <span className="summary-sha" title={summary.sha}>
          {summary.shortSha}
        </span>
        <span className="summary-date">{formatDate(summary.author.date)}</span>
        <span className="summary-subject" title={summary.subject}>
          {summary.subject}
        </span>
        <div className="summary-stats">
          <span className="stat-add">+{detail?.additions ?? 0}</span>
          <span className="stat-del">−{detail?.deletions ?? 0}</span>
          <span className="stat-files">{detail?.files.length ?? 0} file{(detail?.files.length ?? 0) === 1 ? '' : 's'}</span>
        </div>
        <div className="summary-actions">
          <IconButton icon="copy" title="Copy full SHA" onClick={() => props.onCopy(summary.sha)} />
          <IconButton icon="close" title="Close commit details" onClick={props.onClose} />
        </div>
      </div>

      <div className="detail-tabs-row">
        <div className="detail-tabs">
          <button
            type="button"
            className={`detail-tab${tab === 'commit' ? ' active' : ''}`}
            onClick={() => setTab('commit')}
          >
            Commit
          </button>
          <button
            type="button"
            className={`detail-tab${tab === 'changes' ? ' active' : ''}`}
            onClick={() => setTab('changes')}
          >
            Changes
            {detail?.files.length ? <span className="tab-count">{detail.files.length}</span> : null}
          </button>
          <button
            type="button"
            className={`detail-tab${tab === 'tree' ? ' active' : ''}`}
            onClick={() => setTab('tree')}
          >
            File Tree
          </button>
        </div>
        <div className="detail-tabs-right">
          {tab === 'changes' && parents.length ? (
            <button
              type="button"
              className="parent-picker"
              onClick={(event) => openMenu(event, parentOptions)}
              title="Compare against parent"
            >
              <Icon name="compare" size={13} />
              vs parent {parentIndex + 1} ({shortSha(parents[parentIndex])})
            </button>
          ) : null}
          {loading ? <Spinner size={13} /> : null}
        </div>
      </div>

      <div className="detail-body">
        {!detail && loading ? (
          <div className="detail-loading">
            <Spinner size={18} />
            <span>Loading commit…</span>
          </div>
        ) : tab === 'commit' ? (
          <CommitTab detail={detail} summary={summary} onCopy={props.onCopy} onSelectSha={props.onSelectSha} />
        ) : tab === 'changes' ? (
          <div className="detail-changes">
            <div className="detail-files">
              <div className="detail-files-toolbar">
                <div className="mini-search">
                  <Icon name="search" size={12} />
                  <input
                    value={fileFilter}
                    onChange={(event) => setFileFilter(event.target.value)}
                    placeholder="Filter files"
                    spellCheck={false}
                  />
                </div>
                <IconButton
                  icon={fileMode === 'tree' ? 'list' : 'tree'}
                  title={fileMode === 'tree' ? 'Flat list' : 'Tree view'}
                  onClick={() => setFileMode(fileMode === 'tree' ? 'list' : 'tree')}
                />
              </div>
              <div className="detail-files-list">
                {detail?.files.length ? (
                  <CommitFileList
                    files={changeFiles}
                    mode={fileMode}
                    filter={fileFilter}
                    selectedPath={selectedPath}
                    collapsedFolders={collapsedFolders}
                    onToggleFolder={(path) =>
                      setCollapsedFolders((current) => {
                        const next = new Set(current);
                        if (next.has(path)) next.delete(path);
                        else next.add(path);
                        return next;
                      })
                    }
                    onSelect={setSelectedPath}
                    onContextMenu={(event, path) => openMenu(event, fileMenu(path))}
                    onOpen={(path) => props.onOpenFile(path, sha ?? undefined)}
                  />
                ) : (
                  <div className="section-empty">No changed files</div>
                )}
              </div>
            </div>
            <div className="detail-diff">
              <DiffViewer
                diff={fileDiff}
                loading={diffLoading}
                error={diffError}
                editable={false}
                contextLines={contextLines}
                fullFile={fullFile}
                defaultMode={config.diffMode}
                defaultShowWhitespace={config.showWhitespace}
                defaultWordWrap={config.wordWrap}
                onContextLinesChange={setContextLines}
                onFullFileChange={setFullFile}
                onOpenFile={selectedFile ? () => props.onOpenFile(selectedFile.path, sha ?? undefined) : undefined}
                onFileHistory={selectedFile ? () => props.onFileHistory(selectedFile.path) : undefined}
                onBlame={selectedFile ? () => props.onBlame(selectedFile.path) : undefined}
                onCopy={props.onCopy}
                onToast={props.onPushToast}
                emptyMessage={detail?.files.length ? 'Select a changed file' : 'This commit has no file changes'}
              />
            </div>
          </div>
        ) : (
          <FileTreeTab
            entries={treeEntries}
            loading={treeLoading}
            error={treeError}
            truncated={treeTruncated}
            sha={sha}
            filter={treeFilter}
            onFilterChange={setTreeFilter}
            expanded={treeExpanded}
            onExpandedChange={setTreeExpanded}
            onOpenFile={(path) => props.onOpenFile(path, sha ?? undefined)}
            onCopy={props.onCopy}
            onContextMenu={(event, path) => openMenu(event, fileMenu(path))}
          />
        )}
      </div>
      {menuNode}
    </div>
  );
}

function CommitTab({
  detail,
  summary,
  onCopy,
  onSelectSha
}: {
  detail: CommitDetail | null;
  summary: CommitSummary;
  onCopy: (text: string) => void;
  onSelectSha: (sha: string) => void;
}): React.ReactElement {
  return (
    <div className="commit-tab">
      <div className="commit-meta-grid">
        <div className="meta-label">Commit</div>
        <div className="meta-value">
          <code className="sha-full">{summary.sha}</code>
          <IconButton icon="copy" title="Copy SHA" onClick={() => onCopy(summary.sha)} size={13} />
        </div>

        <div className="meta-label">Author</div>
        <div className="meta-value">
          <Avatar name={summary.author.name} size={18} />
          <strong>{summary.author.name}</strong>
          <span className="meta-dim">&lt;{summary.author.email}&gt;</span>
          <span className="meta-dim">{formatDate(summary.author.date)}</span>
        </div>

        <div className="meta-label">Committer</div>
        <div className="meta-value">
          <strong>{summary.committer.name}</strong>
          <span className="meta-dim">&lt;{summary.committer.email}&gt;</span>
          <span className="meta-dim">{formatDate(summary.committer.date)}</span>
        </div>

        <div className="meta-label">Parents</div>
        <div className="meta-value">
          {summary.parents.length ? (
            summary.parents.map((parent) => (
              <button
                key={parent}
                type="button"
                className="parent-link"
                onClick={() => onSelectSha(parent)}
                title={parent}
              >
                <Icon name="commit" size={12} />
                {shortSha(parent)}
              </button>
            ))
          ) : (
            <span className="meta-dim">Root commit</span>
          )}
        </div>

        {detail?.branches.length ? (
          <>
            <div className="meta-label">Branches</div>
            <div className="meta-value chips">
              {detail.branches.map((branch) => (
                <Chip key={branch} tone="accent" icon="branch">
                  {branch}
                </Chip>
              ))}
            </div>
          </>
        ) : null}

        {detail?.tags.length ? (
          <>
            <div className="meta-label">Tags</div>
            <div className="meta-value chips">
              {detail.tags.map((tag) => (
                <Chip key={tag} tone="orange" icon="tag">
                  {tag}
                </Chip>
              ))}
            </div>
          </>
        ) : null}

        {detail ? (
          <>
            <div className="meta-label">Changes</div>
            <div className="meta-value">
              <span className="stat-add">+{detail.additions}</span>
              <span className="stat-del">−{detail.deletions}</span>
              <span className="meta-dim">{detail.files.length} file{detail.files.length === 1 ? '' : 's'} changed</span>
            </div>
          </>
        ) : null}
      </div>

      <div className="commit-message-block">
        <div className="commit-message-title">Message</div>
        <pre className="commit-message-text">
          <span className="commit-message-subject">{summary.subject}</span>
          {detail?.fullBody ? `\n\n${detail.fullBody}` : ''}
        </pre>
      </div>
    </div>
  );
}

function CommitFileList({
  files,
  mode,
  filter,
  selectedPath,
  collapsedFolders,
  onToggleFolder,
  onSelect,
  onContextMenu,
  onOpen
}: {
  files: ChangeFile[];
  mode: 'tree' | 'list';
  filter: string;
  selectedPath: string | null;
  collapsedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onSelect: (path: string) => void;
  onContextMenu: (event: React.MouseEvent, path: string) => void;
  onOpen: (path: string) => void;
}): React.ReactElement {
  const term = filter.trim().toLowerCase();
  const filtered = term ? files.filter((file) => file.path.toLowerCase().includes(term)) : files;
  const tree = useMemo(() => buildFileTree(filtered), [filtered]);
  const allFolders = useMemo(() => collectFolderPaths(tree), [tree]);
  const expanded = useMemo(
    () => new Set(allFolders.filter((path) => !collapsedFolders.has(path))),
    [allFolders, collapsedFolders]
  );

  if (mode === 'list') {
    return (
      <div className="commit-file-list">
        {filtered
          .slice()
          .sort((a, b) => a.path.localeCompare(b.path))
          .map((file) => (
            <CommitFileRow
              key={file.path}
              file={file}
              depth={0}
              flat
              active={selectedPath === file.path}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              onOpen={onOpen}
            />
          ))}
        {!filtered.length ? <div className="section-empty">No matching files</div> : null}
      </div>
    );
  }

  const rows = flattenTree(tree, expanded);
  return (
    <div className="commit-file-list">
      {rows.map((row) =>
        row.kind === 'folder' ? (
          <button
            key={`folder:${row.path}`}
            type="button"
            className="file-row folder-row"
            style={{ paddingLeft: 8 + row.depth * 12 }}
            onClick={() => onToggleFolder(row.path)}
            title={row.path}
          >
            <Icon name={expanded.has(row.path) ? 'chevronDown' : 'chevronRight'} size={10} />
            <Icon name={expanded.has(row.path) ? 'folderOpen' : 'folder'} size={13} className="folder-icon" />
            <span className="folder-name">{row.name}</span>
          </button>
        ) : (
          <CommitFileRow
            key={`file:${row.file!.path}`}
            file={row.file!}
            depth={row.depth}
            active={selectedPath === row.file!.path}
            onSelect={onSelect}
            onContextMenu={onContextMenu}
            onOpen={onOpen}
          />
        )
      )}
      {!rows.length ? <div className="section-empty">No matching files</div> : null}
    </div>
  );
}

function CommitFileRow({
  file,
  depth,
  flat,
  active,
  onSelect,
  onContextMenu,
  onOpen
}: {
  file: ChangeFile;
  depth: number;
  flat?: boolean;
  active: boolean;
  onSelect: (path: string) => void;
  onContextMenu: (event: React.MouseEvent, path: string) => void;
  onOpen: (path: string) => void;
}): React.ReactElement {
  return (
    <div
      className={`file-row file-row-item${active ? ' active' : ''}`}
      style={{ paddingLeft: 8 + depth * 12 }}
      title={file.path}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(file.path)}
      onDoubleClick={() => onOpen(file.path)}
      onContextMenu={(event) => onContextMenu(event, file.path)}
    >
      {flat ? null : <span className="tree-spacer" />}
      <FileTypeIcon path={file.path} />
      <span className="file-name">
        {flat ? <span className="file-dir">{dirName(file.path) ? `${dirName(file.path)}/` : ''}</span> : null}
        {baseName(file.path)}
      </span>
      <StatusBadge status={file.indexStatus} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* File tree at a revision                                             */
/* ------------------------------------------------------------------ */

interface DirNode {
  kind: 'dir';
  name: string;
  path: string;
  children: TreeEntryNode[];
  fileCount: number;
}

interface FileNode {
  kind: 'file';
  name: string;
  path: string;
  entry: FileTreeEntry;
}

type TreeEntryNode = DirNode | FileNode;

function buildEntryTree(entries: FileTreeEntry[]): TreeEntryNode[] {
  const root: DirNode = { kind: 'dir', name: '', path: '', children: [], fileCount: 0 };
  const dirs = new Map<string, DirNode>([['', root]]);

  for (const entry of entries) {
    const parts = entry.path.split('/').filter(Boolean);
    let parent = root;
    let prefix = '';
    for (let i = 0; i < parts.length - 1; i++) {
      prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
      let dir = dirs.get(prefix);
      if (!dir) {
        dir = { kind: 'dir', name: parts[i], path: prefix, children: [], fileCount: 0 };
        dirs.set(prefix, dir);
        parent.children.push(dir);
      }
      parent = dir;
    }
    parent.children.push({
      kind: 'file',
      name: parts[parts.length - 1] ?? entry.path,
      path: entry.path,
      entry
    });
  }

  const count = (dir: DirNode): number => {
    let total = 0;
    for (const child of dir.children) {
      if (child.kind === 'dir') total += count(child);
      else total += 1;
    }
    dir.fileCount = total;
    return total;
  };
  count(root);

  const sort = (dir: DirNode) => {
    dir.children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const child of dir.children) {
      if (child.kind === 'dir') sort(child);
    }
  };
  sort(root);
  return root.children;
}

function filterEntryTree(nodes: TreeEntryNode[], term: string): TreeEntryNode[] {
  if (!term) return nodes;
  const result: TreeEntryNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'file') {
      if (node.path.toLowerCase().includes(term)) result.push(node);
    } else {
      const children = filterEntryTree(node.children, term);
      if (children.length || node.name.toLowerCase().includes(term)) {
        result.push({ ...node, children });
      }
    }
  }
  return result;
}

function FileTreeTab({
  entries,
  loading,
  error,
  truncated,
  sha,
  filter,
  onFilterChange,
  expanded,
  onExpandedChange,
  onOpenFile,
  onCopy,
  onContextMenu
}: {
  entries: FileTreeEntry[] | null;
  loading: boolean;
  error: string | null;
  truncated: boolean;
  sha: string | null;
  filter: string;
  onFilterChange: (value: string) => void;
  expanded: Set<string>;
  onExpandedChange: (value: Set<string>) => void;
  onOpenFile: (path: string) => void;
  onCopy: (text: string) => void;
  onContextMenu: (event: React.MouseEvent, path: string) => void;
}): React.ReactElement {
  const term = filter.trim().toLowerCase();
  const tree = useMemo(() => buildEntryTree(entries ?? []), [entries]);
  const filtered = useMemo(() => filterEntryTree(tree, term), [tree, term]);
  const initializedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!entries || !sha || initializedFor.current === sha) return;
    initializedFor.current = sha;
    const top = tree.filter((node): node is DirNode => node.kind === 'dir').slice(0, 3).map((node) => node.path);
    if (top.length) onExpandedChange(new Set(top));
  }, [entries, sha, tree, onExpandedChange]);

  if (loading) {
    return (
      <div className="tree-tab-loading">
        <Spinner size={18} />
        <span>Reading repository tree…</span>
      </div>
    );
  }
  if (error) {
    return <EmptyState icon="alert" title="Unable to read the file tree" description={error} />;
  }

  const toggle = (path: string) => {
    const next = new Set(expanded);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    onExpandedChange(next);
  };

  const render = (nodes: TreeEntryNode[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      if (node.kind === 'dir') {
        const isOpen = term ? true : expanded.has(node.path);
        return (
          <React.Fragment key={`d:${node.path}`}>
            <button
              type="button"
              className="file-row folder-row"
              style={{ paddingLeft: 8 + depth * 13 }}
              onClick={() => toggle(node.path)}
              title={node.path}
            >
              <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={10} />
              <Icon name={isOpen ? 'folderOpen' : 'folder'} size={13} className="folder-icon" />
              <span className="folder-name">{node.name}</span>
              <span className="tree-count">{node.fileCount}</span>
            </button>
            {isOpen ? render(node.children, depth + 1) : null}
          </React.Fragment>
        );
      }
      return (
        <button
          key={`f:${node.path}`}
          type="button"
          className="file-row file-row-item tree-file-row"
          style={{ paddingLeft: 8 + depth * 13 }}
          title={`${node.path}${node.entry.type === 'commit' ? ' (submodule)' : ''}`}
          onClick={() => onOpenFile(node.path)}
          onContextMenu={(event) => onContextMenu(event, node.path)}
        >
          <span className="tree-spacer" />
          {node.entry.type === 'commit' ? (
            <Icon name="repo" size={14} className="file-type-icon file-icon-unity" />
          ) : (
            <FileTypeIcon path={node.path} />
          )}
          <span className="file-name">
            {term ? <span className="file-dir">{dirName(node.path) ? `${dirName(node.path)}/` : ''}</span> : null}
            {node.name}
          </span>
          <span className="tree-file-size">{formatBytes(node.entry.size)}</span>
        </button>
      );
    });

  return (
    <div className="file-tree-tab">
      <div className="file-tree-toolbar">
        <div className="mini-search">
          <Icon name="search" size={12} />
          <input
            value={filter}
            onChange={(event) => onFilterChange(event.target.value)}
            placeholder="Filter files"
            spellCheck={false}
          />
        </div>
        <span className="tree-total">
          {entries?.length ?? 0} files{truncated ? ' (truncated)' : ''}
          {sha ? ` · ${shortSha(sha)}` : ''}
        </span>
      </div>
      <div className="file-tree-scroll">
        {filtered.length ? render(filtered, 0) : <div className="section-empty">No matching files</div>}
      </div>
    </div>
  );
}
