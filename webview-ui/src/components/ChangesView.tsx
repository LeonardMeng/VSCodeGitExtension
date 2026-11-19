import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppConfig,
  ChangeFile,
  DiffAction,
  DiffOptions,
  DiffScope,
  FileDiff,
  MenuAction,
  RepoState
} from '@shared/protocol/types';
import { RequestFn, PushToast } from '../bridgeTypes';
import { Icon } from './Icon';
import { EmptyState, IconButton, MenuItem, Spinner, useContextMenu } from './Menu';
import { FileTypeIcon, StatusBadge } from './StatusBadge';
import { DiffViewer } from './DiffViewer';
import { CommitBox } from './CommitBox';
import { StashPreviewPanel } from './StashPreviewPanel';
import { buildFileTree, collectFolderPaths, flattenFiles, flattenTree, TreeNode } from '../utils/tree';
import { baseName, dirName, formatBytes, middleEllipsis } from '../utils/format';

type Side = 'staged' | 'unstaged';

interface SelectedFile {
  path: string;
  side: Side;
}

interface StashPreviewState {
  index: number;
  loading: boolean;
  files: FileDiff[] | null;
  error?: string;
}

interface ChangesViewProps {
  state: RepoState;
  config: AppConfig;
  request: RequestFn;
  busy: boolean;
  stashPreview: StashPreviewState | null;
  onCloseStash: () => void;
  onStashAction: (action: MenuAction, index: number) => void;
  onStage: (paths: string[]) => void;
  onUnstage: (paths: string[]) => void;
  onDiscard: (paths: string[]) => void;
  onApplyDiff: (
    scope: DiffScope,
    hunkIndex: number,
    lineIndexes: number[] | undefined,
    action: DiffAction,
    options: DiffOptions,
    hunkHeader?: string
  ) => void;
  onCommit: (subject: string, description: string, amend: boolean) => void;
  onLoadCommitMessage: (amend: boolean) => void;
  onOpenFile: (path: string) => void;
  onShowInFolder: (path: string) => void;
  onAddToGitignore: (paths: string[]) => void;
  onFileHistory: (path: string) => void;
  onBlame: (path: string) => void;
  onCopy: (text: string) => void;
  onPushToast: PushToast;
}

export function ChangesView(props: ChangesViewProps): React.ReactElement {
  const { state, config, request, busy, stashPreview } = props;
  const [selected, setSelected] = useState<SelectedFile | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [leftWidth, setLeftWidth] = useState(() => (window.innerWidth < 900 ? 320 : 480));
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [diffOptions, setDiffOptions] = useState<{ contextLines: number; fullFile: boolean }>({
    contextLines: config.contextLines,
    fullFile: false
  });
  const diffToken = useRef(0);
  const resizing = useRef<{ startX: number; startWidth: number } | null>(null);

  const unstaged = useMemo(
    () => state.files.filter((file) => file.unstaged || file.conflicted),
    [state.files]
  );
  const staged = useMemo(
    () => state.files.filter((file) => file.staged && !file.conflicted),
    [state.files]
  );

  useEffect(() => {
    setSelected((current) => {
      const inUnstaged = (path: string) => unstaged.some((file) => file.path === path);
      const inStaged = (path: string) => staged.some((file) => file.path === path);
      if (current) {
        if (current.side === 'unstaged' && inUnstaged(current.path)) return current;
        if (current.side === 'staged' && inStaged(current.path)) return current;
        if (inUnstaged(current.path)) return { path: current.path, side: 'unstaged' };
        if (inStaged(current.path)) return { path: current.path, side: 'staged' };
      }
      const first = unstaged[0] ?? staged[0];
      if (!first) return null;
      return { path: first.path, side: unstaged[0] ? 'unstaged' : 'staged' };
    });
  }, [state.files, unstaged, staged]);

  useEffect(() => {
    setSelectedPaths((current) => {
      const valid = new Set(
        [...current].filter(
          (path) => unstaged.some((file) => file.path === path) || staged.some((file) => file.path === path)
        )
      );
      return valid.size === current.size ? current : valid;
    });
  }, [state.files, unstaged, staged]);

  useEffect(() => {
    setDiffOptions((current) => ({ ...current, contextLines: config.contextLines }));
  }, [config.contextLines]);

  useEffect(() => {
    if (stashPreview || !selected) {
      setDiff(null);
      setDiffError(null);
      setDiffLoading(false);
      return;
    }
    const file = state.files.find((entry) => entry.path === selected.path);
    if (!file) return;
    const scope: DiffScope =
      selected.side === 'staged'
        ? { kind: 'index', path: selected.path, oldPath: file.oldPath }
        : { kind: 'worktree', path: selected.path, oldPath: file.oldPath };
    const token = ++diffToken.current;
    setDiffLoading(true);
    setDiffError(null);
    setDiff((current) => (current?.path === selected.path ? current : null));
    void request<import('@shared/protocol/types').ToWebviewMessage & { type: 'diff' }>(
      (requestId) => ({
        type: 'getDiff',
        requestId,
        scope,
        options: { contextLines: diffOptions.contextLines, fullFile: diffOptions.fullFile }
      }),
      ['diff']
    )
      .then((message) => {
        if (token !== diffToken.current) return;
        if (message.type === 'diff') {
          setDiff(message.diff);
        }
      })
      .catch((error: Error) => {
        if (token !== diffToken.current) return;
        setDiffError(error.message);
        setDiff(null);
      })
      .finally(() => {
        if (token === diffToken.current) setDiffLoading(false);
      });
  }, [selected, state.refreshedAt, diffOptions.contextLines, diffOptions.fullFile, stashPreview, request, state.files]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const sidebarWidth = viewportWidth > 900 ? (viewportWidth <= 1180 ? 238 : 262) : 0;
  const maxChangesWidth = Math.max(280, Math.min(760, viewportWidth - sidebarWidth - 360));
  const effectiveWidth = Math.min(leftWidth, maxChangesWidth);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!resizing.current) return;
      const delta = event.clientX - resizing.current.startX;
      setLeftWidth(Math.max(280, Math.min(maxChangesWidth, resizing.current.startWidth + delta)));
    };
    const onUp = () => {
      resizing.current = null;
      document.body.classList.remove('resizing');
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const startResize = (event: React.MouseEvent) => {
    resizing.current = { startX: event.clientX, startWidth: effectiveWidth };
    document.body.classList.add('resizing');
    event.preventDefault();
  };

  const handleSelect = (file: ChangeFile, side: Side) => {
    setSelected({ path: file.path, side });
  };

  const handleStage = (paths: string[]) => {
    if (!paths.length) return;
    props.onStage(paths);
    setSelectedPaths(new Set());
  };

  const handleUnstage = (paths: string[]) => {
    if (!paths.length) return;
    props.onUnstage(paths);
    setSelectedPaths(new Set());
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === ' ' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const target = event.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable)
        ) {
          return;
        }
        event.preventDefault();
        const side = selected?.side ?? 'unstaged';
        const candidates = side === 'staged' ? staged : unstaged;
        const paths = selectedPaths.size
          ? candidates.filter((file) => selectedPaths.has(file.path)).map((file) => file.path)
          : candidates.map((file) => file.path);
        if (!paths.length) return;
        if (side === 'staged') handleUnstage(paths);
        else handleStage(paths);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected, selectedPaths, staged, unstaged]);

  const applyDiff = (action: DiffAction, hunkIndex: number, lineIndexes?: number[], hunkHeader?: string) => {
    if (!selected) return;
    const file = state.files.find((entry) => entry.path === selected.path);
    const scope: DiffScope =
      selected.side === 'staged'
        ? { kind: 'index', path: selected.path, oldPath: file?.oldPath }
        : { kind: 'worktree', path: selected.path, oldPath: file?.oldPath };
    props.onApplyDiff(
      scope,
      hunkIndex,
      lineIndexes,
      action,
      { contextLines: diffOptions.contextLines, fullFile: diffOptions.fullFile },
      hunkHeader
    );
  };

  const conflicts = state.files.filter((file) => file.conflicted).length;
  const scope: DiffScope | null = selected
    ? selected.side === 'staged'
      ? { kind: 'index', path: selected.path }
      : { kind: 'worktree', path: selected.path }
    : null;

  return (
    <div className="changes-view">
      <div className="changes-pane" style={{ width: effectiveWidth }}>
        <ChangesPanel
          state={state}
          config={config}
          selected={selected}
          selectedPaths={selectedPaths}
          onSelect={handleSelect}
          onSelectedPathsChange={setSelectedPaths}
          onStage={handleStage}
          onUnstage={handleUnstage}
          onDiscard={(paths) => props.onDiscard(paths)}
          onOpenFile={props.onOpenFile}
          onShowInFolder={props.onShowInFolder}
          onAddToGitignore={props.onAddToGitignore}
          onFileHistory={props.onFileHistory}
          onBlame={props.onBlame}
          onCopy={props.onCopy}
          onPushToast={props.onPushToast}
        />
      </div>
      <div className="v-splitter" onMouseDown={startResize} title="Resize" />
      <div className="editor-pane">
        {state.repo.operation ? (
          <div className="operation-banner">
            <Icon name="alert" size={14} />
            <span>{state.repo.operation} in progress — resolve conflicts and continue when ready.</span>
          </div>
        ) : null}
        {stashPreview ? (
          <StashPreviewPanel
            preview={stashPreview}
            config={config}
            onClose={props.onCloseStash}
            onApply={() => props.onStashAction('stashApply', stashPreview.index)}
            onPop={() => props.onStashAction('stashPop', stashPreview.index)}
            onDrop={() => props.onStashAction('stashDrop', stashPreview.index)}
            onCopy={props.onCopy}
          />
        ) : (
          <>
            <div className="diff-pane">
              <DiffViewer
                diff={diff}
                loading={diffLoading}
                error={diffError}
                editable={!!scope}
                primaryAction={selected?.side === 'staged' ? 'unstage' : 'stage'}
                discardable={selected?.side === 'unstaged'}
                sideLabel={selected ? (selected.side === 'staged' ? 'Staged' : 'Unstaged') : undefined}
                contextLines={diffOptions.contextLines}
                fullFile={diffOptions.fullFile}
                defaultMode={config.diffMode}
                defaultShowWhitespace={config.showWhitespace}
                defaultWordWrap={config.wordWrap}
                onContextLinesChange={(value) => setDiffOptions((current) => ({ ...current, contextLines: value }))}
                onFullFileChange={(value) => setDiffOptions((current) => ({ ...current, fullFile: value }))}
                onApply={applyDiff}
                onOpenFile={selected ? () => props.onOpenFile(selected.path) : undefined}
                onShowInFolder={selected ? () => props.onShowInFolder(selected.path) : undefined}
                onFileHistory={selected ? () => props.onFileHistory(selected.path) : undefined}
                onBlame={selected ? () => props.onBlame(selected.path) : undefined}
                onCopy={props.onCopy}
                onToast={props.onPushToast}
                emptyMessage={state.files.length ? 'Select a file to view changes' : 'Nothing to review'}
                emptyDescription={
                  state.files.length
                    ? 'Choose a modified file in the list to see its diff.'
                    : 'Your working tree matches HEAD. New changes will show up here automatically.'
                }
                emptyIcon={state.files.length ? 'file' : 'check'}
              />
            </div>
            <CommitBox
              request={request}
              branch={state.repo.head}
              headSha={state.repo.headSha}
              stagedCount={staged.length}
              unstagedCount={unstaged.length}
              conflicts={conflicts}
              recentMessages={state.recentCommits}
              busy={busy}
              onCommit={props.onCommit}
              onPushToast={props.onPushToast}
            />
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Changes panel                                                       */
/* ------------------------------------------------------------------ */

interface ChangesPanelProps {
  state: RepoState;
  config: AppConfig;
  selected: SelectedFile | null;
  selectedPaths: Set<string>;
  onSelect: (file: ChangeFile, side: Side) => void;
  onSelectedPathsChange: (paths: Set<string>) => void;
  onStage: (paths: string[]) => void;
  onUnstage: (paths: string[]) => void;
  onDiscard: (paths: string[]) => void;
  onOpenFile: (path: string) => void;
  onShowInFolder: (path: string) => void;
  onAddToGitignore: (paths: string[]) => void;
  onFileHistory: (path: string) => void;
  onBlame: (path: string) => void;
  onCopy: (text: string) => void;
  onPushToast: PushToast;
}

function ChangesPanel(props: ChangesPanelProps): React.ReactElement {
  const { state, config, selected, selectedPaths } = props;
  const [filter, setFilter] = useState('');
  const [mode, setMode] = useState<'tree' | 'list'>(config.changesViewMode);
  const [collapsedUnstaged, setCollapsedUnstaged] = useState<Set<string>>(new Set());
  const [collapsedStaged, setCollapsedStaged] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState<Side | null>(null);
  const largeRepoInitialized = useRef(false);
  const { openMenu, menuNode } = useContextMenu();

  useEffect(() => setMode(config.changesViewMode), [config.changesViewMode]);


  const term = filter.trim().toLowerCase();
  const unstaged = state.files.filter(
    (file) => (file.unstaged || file.conflicted) && (!term || file.path.toLowerCase().includes(term))
  );
  const staged = state.files.filter(
    (file) => file.staged && !file.conflicted && (!term || file.path.toLowerCase().includes(term))
  );
  const allUnstaged = state.files.filter((file) => file.unstaged || file.conflicted);
  const allStaged = state.files.filter((file) => file.staged && !file.conflicted);
  useEffect(() => {
    if (largeRepoInitialized.current) return;
    largeRepoInitialized.current = true;
    if (state.files.length > 800) {
      setCollapsedUnstaged(new Set(collectFolderPaths(buildFileTree(allUnstaged))));
      setCollapsedStaged(new Set(collectFolderPaths(buildFileTree(allStaged))));
    }
  }, [state.files.length, allUnstaged, allStaged]);

  const selectedPathsFor = (side: Side): string[] => {
    const source = side === 'staged' ? allStaged : allUnstaged;
    return source.filter((file) => selectedPaths.has(file.path)).map((file) => file.path);
  };

  const stageSelectedOrAll = () => {
    const paths = selectedPathsFor('unstaged');
    props.onStage(paths.length ? paths : allUnstaged.map((file) => file.path));
  };

  const unstageSelectedOrAll = () => {
    const paths = selectedPathsFor('staged');
    props.onUnstage(paths.length ? paths : allStaged.map((file) => file.path));
  };

  const discardSelected = () => {
    const paths = selectedPathsFor('unstaged');
    if (paths.length) props.onDiscard(paths);
    else if (selected) props.onDiscard([selected.path]);
  };

  const handleClick = (file: ChangeFile, side: Side, event: React.MouseEvent) => {
    const next = new Set(selectedPaths);
    if (event.metaKey || event.ctrlKey) {
      if (next.has(file.path)) next.delete(file.path);
      else next.add(file.path);
    } else if (event.shiftKey) {
      next.add(file.path);
    } else {
      next.clear();
      next.add(file.path);
    }
    props.onSelectedPathsChange(next);
    props.onSelect(file, side);
  };

  const handleDrop = (side: Side, event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(null);
    const raw = event.dataTransfer.getData('application/x-forkgit-files') || event.dataTransfer.getData('text/plain');
    if (!raw) return;
    try {
      const paths: string[] = JSON.parse(raw);
      if (side === 'staged') props.onStage(paths);
      else props.onUnstage(paths);
    } catch {
      // ignore malformed drag data
    }
  };

  const dragPaths = (file: ChangeFile): string[] =>
    selectedPaths.has(file.path) ? [...selectedPaths] : [file.path];

  const fileMenu = (file: ChangeFile, side: Side): MenuItem[] => {
    const items: MenuItem[] = [];
    if (side === 'unstaged') {
      items.push({
        label: 'Stage File',
        icon: 'stage',
        shortcut: 'Space',
        onSelect: () => props.onStage([file.path])
      });
      items.push({ separator: true });
    } else {
      items.push({
        label: 'Unstage File',
        icon: 'unstage',
        onSelect: () => props.onUnstage([file.path])
      });
      items.push({ separator: true });
    }
    items.push(
      { label: 'Open File', icon: 'external', onSelect: () => props.onOpenFile(file.path) },
      { label: 'Show in Finder / Explorer', icon: 'folderOpen', onSelect: () => props.onShowInFolder(file.path) },
      { label: 'File History', icon: 'history', onSelect: () => props.onFileHistory(file.path) },
      { label: 'Blame', icon: 'info', onSelect: () => props.onBlame(file.path) },
      { separator: true },
      { label: 'Copy Path', icon: 'copy', onSelect: () => props.onCopy(file.path) }
    );
    if (side === 'unstaged') {
      items.push({ label: 'Add to .gitignore', icon: 'lock', onSelect: () => props.onAddToGitignore([file.path]) });
      items.push({ separator: true });
      if (file.conflicted) {
        items.push({ label: 'Open File to Resolve Conflict', icon: 'alert', onSelect: () => props.onOpenFile(file.path) });
      } else {
        items.push({
          label: 'Discard Changes…',
          icon: 'discard',
          danger: true,
          onSelect: () => props.onDiscard([file.path])
        });
      }
    }
    return items;
  };

  const displayMenu: MenuItem[] = [
    { label: 'Tree View', icon: 'tree', checked: mode === 'tree', onSelect: () => setMode('tree') },
    { label: 'Flat List', icon: 'list', checked: mode === 'list', onSelect: () => setMode('list') },
    { separator: true },
    {
      label: 'Expand All',
      icon: 'expand',
      onSelect: () => {
        setCollapsedUnstaged(new Set());
        setCollapsedStaged(new Set());
      }
    },
    {
      label: 'Collapse All',
      icon: 'collapse',
      onSelect: () => {
        setCollapsedUnstaged(new Set(collectFolderPaths(buildFileTree(unstaged))));
        setCollapsedStaged(new Set(collectFolderPaths(buildFileTree(staged))));
      }
    },
    { separator: true },
    {
      label: 'Copy All Changed Paths',
      icon: 'copy',
      onSelect: () => props.onCopy(state.files.map((file) => file.path).join('\n'))
    }
  ];

  const expandedUnstaged = new Set(collectFolderPaths(buildFileTree(unstaged)).filter((path) => !collapsedUnstaged.has(path)));
  const expandedStaged = new Set(collectFolderPaths(buildFileTree(staged)).filter((path) => !collapsedStaged.has(path)));

  const toggleFolder = (side: Side, path: string) => {
    const setter = side === 'unstaged' ? setCollapsedUnstaged : setCollapsedStaged;
    setter((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  if (!state.files.length) {
    return (
      <div className="changes-panel">
        <PanelToolbar
          filter={filter}
          onFilterChange={setFilter}
          mode={mode}
          onModeChange={setMode}
          onDisplayMenu={(event) => openMenu(event, displayMenu)}
          onExpandAll={() => {
            setCollapsedUnstaged(new Set());
            setCollapsedStaged(new Set());
          }}
          onCollapseAll={() => {
            setCollapsedUnstaged(new Set(collectFolderPaths(buildFileTree(unstaged))));
            setCollapsedStaged(new Set(collectFolderPaths(buildFileTree(staged))));
          }}
        />
        <EmptyState
          icon="check"
          title="Working tree clean"
          description="Everything is committed. Your working tree matches HEAD."
        />
        {menuNode}
      </div>
    );
  }

  return (
    <div className="changes-panel">
      <PanelToolbar
        filter={filter}
        onFilterChange={setFilter}
        mode={mode}
        onModeChange={setMode}
        onDisplayMenu={(event) => openMenu(event, displayMenu)}
        onExpandAll={() => {
          setCollapsedUnstaged(new Set());
          setCollapsedStaged(new Set());
        }}
        onCollapseAll={() => {
          setCollapsedUnstaged(new Set(collectFolderPaths(buildFileTree(unstaged))));
          setCollapsedStaged(new Set(collectFolderPaths(buildFileTree(staged))));
        }}
      />
      <div className="change-sections">
        <section
          className={`change-section${dragOver === 'staged' ? ' drag-over' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setDragOver('staged');
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node)) return;
            setDragOver((current) => (current === 'staged' ? null : current));
          }}
          onDrop={(event) => handleDrop('staged', event)}
        >
          <div className="change-section-header">
            <div className="change-section-title">
              <Icon name="chevronDown" size={11} />
              <span>Unstaged</span>
              <span className="change-count">{allUnstaged.length}</span>
              {allUnstaged.some((file) => file.conflicted) ? (
                <span className="conflict-pill">conflicts</span>
              ) : null}
            </div>
            <div className="change-section-actions">
              {selectedPathsFor('unstaged').length ? (
                <IconButton
                  icon="discard"
                  title="Discard selected changes"
                  onClick={discardSelected}
                  className="danger-hover"
                />
              ) : null}
              <button
                type="button"
                className="section-button"
                disabled={!allUnstaged.length}
                onClick={stageSelectedOrAll}
                title={selectedPathsFor('unstaged').length ? 'Stage selected files' : 'Stage all changes'}
              >
                Stage
              </button>
            </div>
          </div>
          <div className="change-section-list">
            {unstaged.length ? (
              <FileTreeList
                files={unstaged}
                mode={mode}
                side="unstaged"
                collapsed={collapsedUnstaged}
                expanded={expandedUnstaged}
                onToggleFolder={(path) => toggleFolder('unstaged', path)}
                selected={selected}
                selectedPaths={selectedPaths}
                onClick={handleClick}
                onDoubleClick={(file) => props.onStage([file.path])}
                onContextMenu={(event, file) => openMenu(event, fileMenu(file, 'unstaged'))}
                onDragStart={(file, event) => {
                  const paths = dragPaths(file);
                  event.dataTransfer.setData('application/x-forkgit-files', JSON.stringify(paths));
                  event.dataTransfer.setData('text/plain', paths.join('\n'));
                  event.dataTransfer.effectAllowed = 'move';
                }}
              />
            ) : (
              <div className="section-empty">{term ? 'No matching unstaged files' : 'No unstaged changes'}</div>
            )}
          </div>
        </section>

        <div className="section-splitter" />

        <section
          className={`change-section staged-section${dragOver === 'unstaged' ? ' drag-over' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setDragOver('unstaged');
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node)) return;
            setDragOver((current) => (current === 'unstaged' ? null : current));
          }}
          onDrop={(event) => handleDrop('unstaged', event)}
        >
          <div className="change-section-header">
            <div className="change-section-title">
              <Icon name="chevronDown" size={11} />
              <span>Staged</span>
              <span className="change-count">{allStaged.length}</span>
            </div>
            <div className="change-section-actions">
              <button
                type="button"
                className="section-button"
                disabled={!allStaged.length}
                onClick={unstageSelectedOrAll}
                title={selectedPathsFor('staged').length ? 'Unstage selected files' : 'Unstage all changes'}
              >
                Unstage
              </button>
            </div>
          </div>
          <div className="change-section-list">
            {staged.length ? (
              <FileTreeList
                files={staged}
                mode={mode}
                side="staged"
                collapsed={collapsedStaged}
                expanded={expandedStaged}
                onToggleFolder={(path) => toggleFolder('staged', path)}
                selected={selected}
                selectedPaths={selectedPaths}
                onClick={handleClick}
                onDoubleClick={(file) => props.onUnstage([file.path])}
                onContextMenu={(event, file) => openMenu(event, fileMenu(file, 'staged'))}
                onDragStart={(file, event) => {
                  const paths = dragPaths(file);
                  event.dataTransfer.setData('application/x-forkgit-files', JSON.stringify(paths));
                  event.dataTransfer.setData('text/plain', paths.join('\n'));
                  event.dataTransfer.effectAllowed = 'move';
                }}
              />
            ) : (
              <div className="section-empty">
                <Icon name="check" size={13} /> {term ? 'No matching staged files' : 'No staged changes yet'}
              </div>
            )}
          </div>
        </section>
      </div>
      {menuNode}
    </div>
  );
}

function PanelToolbar({
  filter,
  onFilterChange,
  mode,
  onModeChange,
  onDisplayMenu,
  onExpandAll,
  onCollapseAll
}: {
  filter: string;
  onFilterChange: (value: string) => void;
  mode: 'tree' | 'list';
  onModeChange: (mode: 'tree' | 'list') => void;
  onDisplayMenu: (event: React.MouseEvent) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}): React.ReactElement {
  return (
    <div className="changes-toolbar">
      <div className="changes-search">
        <Icon name="search" size={14} />
        <input
          value={filter}
          onChange={(event) => onFilterChange(event.target.value)}
          placeholder="Search changes"
          spellCheck={false}
        />
        {filter ? (
          <button type="button" className="search-clear" onClick={() => onFilterChange('')} title="Clear search">
            <Icon name="close" size={11} />
          </button>
        ) : null}
      </div>
      <div className="changes-toolbar-actions">
        <IconButton icon="expand" title="Expand all" onClick={onExpandAll} />
        <IconButton icon="collapse" title="Collapse all" onClick={onCollapseAll} />
        <IconButton icon="eye" title="Display options" onClick={onDisplayMenu} />
        <IconButton
          icon={mode === 'tree' ? 'list' : 'tree'}
          title={mode === 'tree' ? 'Switch to flat list' : 'Switch to tree view'}
          onClick={() => onModeChange(mode === 'tree' ? 'list' : 'tree')}
        />
      </div>
    </div>
  );
}

function FileTreeList({
  files,
  mode,
  side,
  collapsed,
  expanded,
  onToggleFolder,
  selected,
  selectedPaths,
  onClick,
  onDoubleClick,
  onContextMenu,
  onDragStart
}: {
  files: ChangeFile[];
  mode: 'tree' | 'list';
  side: Side;
  collapsed: Set<string>;
  expanded: Set<string>;
  onToggleFolder: (path: string) => void;
  selected: SelectedFile | null;
  selectedPaths: Set<string>;
  onClick: (file: ChangeFile, side: Side, event: React.MouseEvent) => void;
  onDoubleClick: (file: ChangeFile) => void;
  onContextMenu: (event: React.MouseEvent, file: ChangeFile) => void;
  onDragStart: (file: ChangeFile, event: React.DragEvent) => void;
}): React.ReactElement {
  const tree = useMemo(() => buildFileTree(files), [files]);
  const rows = useMemo(() => {
    if (mode === 'tree') {
      return flattenTree(tree, expanded).map((row) => ({ row, depth: row.depth }));
    }
    const flat = flattenFiles(tree).sort((a, b) => a.path.localeCompare(b.path));
    return flat.map((file) => ({
      row: {
        kind: 'file' as const,
        name: baseName(file.path),
        path: file.path,
        depth: 0,
        file
      },
      depth: 0
    }));
  }, [tree, expanded, mode]);

  return (
    <div className="file-list" onDragOver={(event) => event.preventDefault()}>
      {rows.map(({ row, depth }) => {
        if (row.kind === 'folder') {
          const isOpen = expanded.has(row.path);
          return (
            <button
              key={`folder:${row.path}`}
              type="button"
              className="file-row folder-row"
              style={{ paddingLeft: 8 + depth * 14 }}
              onClick={() => onToggleFolder(row.path)}
              title={row.path}
            >
              <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={10} />
              <Icon name={isOpen ? 'folderOpen' : 'folder'} size={14} className="folder-icon" />
              <span className="folder-name">{row.name}</span>
              <span className="tree-count">{countFiles(row.folder?.children ?? [])}</span>
            </button>
          );
        }
        const file = row.file!;
        const active = selected?.path === file.path && selected.side === side;
        const badge = side === 'staged' ? file.stagedBadge ?? file.indexStatus : file.unstagedBadge ?? file.worktreeStatus;
        return (
          <div
            key={`file:${side}:${file.path}`}
            className={`file-row file-row-item${active ? ' active' : ''}${selectedPaths.has(file.path) ? ' multi-selected' : ''}${selectedPaths.has(file.path) && selectedPaths.size > 1 ? ' in-multi' : ''}`}
            style={{ paddingLeft: 8 + depth * 14 }}
            title={`${file.path}${file.oldPath ? `\n(renamed from ${file.oldPath})` : ''}`}
            role="button"
            tabIndex={0}
            draggable
            onClick={(event) => onClick(file, side, event)}
            onDoubleClick={() => onDoubleClick(file)}
            onContextMenu={(event) => onContextMenu(event, file)}
            onDragStart={(event) => onDragStart(file, event)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onClick(file, side, event as unknown as React.MouseEvent);
            }}
          >
            {mode === 'tree' ? <span className="tree-spacer" /> : null}
            <FileTypeIcon path={file.path} />
            {mode === 'list' ? (
              <span className="file-name">
                <span className="file-dir">{dirName(file.path) ? `${dirName(file.path)}/` : ''}</span>
                {baseName(file.path)}
              </span>
            ) : (
              <span className="file-name">{row.name}</span>
            )}
            {file.conflicted ? <span className="conflict-dot" title="Conflict">C</span> : null}
            {file.untracked ? (
              <span className="file-tag">untracked</span>
            ) : file.oldPath ? (
              <span className="file-tag">renamed</span>
            ) : null}
            <StatusBadge status={badge} />
          </div>
        );
      })}
    </div>
  );
}

function countFiles(nodes: TreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.kind === 'file') count++;
    else count += countFiles(node.children);
  }
  return count;
}
