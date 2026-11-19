import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MenuAction, RepoDescriptor, RepoState, WebviewView } from '@shared/protocol/types';
import { Icon } from './Icon';
import { Dropdown, IconButton, MenuItem, Spinner } from './Menu';
import { Avatar } from './StatusBadge';

interface ToolbarProps {
  state: RepoState | null;
  repos: RepoDescriptor[];
  activeRepo: string | null;
  busy: { busy: boolean; label?: string };
  view: WebviewView;
  onSelectRepo: (root: string) => void;
  onOpenRepository: () => void;
  onFetch: () => void;
  onPull: () => void;
  onPush: () => void;
  onForcePush?: () => void;
  onQuickLaunch: () => void;
  onViewChange: (view: WebviewView) => void;
  onCheckout: (name: string, remote?: string) => void;
  onMenuAction: (action: MenuAction, payload?: Record<string, unknown>) => void;
  onStashAction: (action: MenuAction, payload?: Record<string, unknown>) => void;
  onRefresh: () => void;
  progressActive: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function Toolbar(props: ToolbarProps): React.ReactElement {
  const { state, busy } = props;
  const branch = state?.repo.head ?? null;

  return (
    <header className="toolbar">
      <div className="toolbar-group toolbar-left">
        <button
          type="button"
          className="icon-button sidebar-toggle"
          title={props.sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          onClick={props.onToggleSidebar}
        >
          <Icon name="sidebar" size={16} />
        </button>
        <button type="button" className="toolbar-button quick-launch" title="Quick Launch (⌘⌥P)" onClick={props.onQuickLaunch}>
          <Icon name="search" size={16} />
          <span className="toolbar-label">Quick Launch</span>
        </button>
        <div className="toolbar-divider" />
        <button type="button" className="toolbar-button" title="Fetch all remotes" onClick={props.onFetch}>
          <Icon name="fetch" size={16} />
          <span className="toolbar-label">Fetch</span>
        </button>
        <button type="button" className="toolbar-button" title="Pull current branch" onClick={props.onPull}>
          <Icon name="pull" size={16} />
          <span className="toolbar-label">Pull</span>
        </button>
        <button type="button" className="toolbar-button" title="Push current branch" onClick={props.onPush}>
          <Icon name="push" size={16} />
          <span className="toolbar-label">Push</span>
        </button>
        <Dropdown
          label="Stash"
          icon="archive"
          title="Stash changes"
          items={stashItems(props)}
        />
      </div>

      <div className="toolbar-center">
        <RepoBranchPicker {...props} branch={branch} />
      </div>

      <div className="toolbar-group toolbar-right">
        {busy.busy && !props.progressActive ? (
          <div className="busy-indicator" title={busy.label}>
            <Spinner size={14} />
            <span className="busy-label">{busy.label ?? 'Working'}</span>
          </div>
        ) : null}
        <div className="view-switch">
          <button
            type="button"
            className={`view-switch-button${props.view === 'changes' ? ' active' : ''}`}
            title="Local Changes (⌘1)"
            onClick={() => props.onViewChange('changes')}
          >
            <Icon name="list" size={14} />
            <span className="toolbar-label">Changes</span>
          </button>
          <button
            type="button"
            className={`view-switch-button${props.view === 'history' ? ' active' : ''}`}
            title="All Commits (⌘2)"
            onClick={() => props.onViewChange('history')}
          >
            <Icon name="commit" size={14} />
            <span className="toolbar-label">Commits</span>
          </button>
        </div>
        <Dropdown
          label="Branch"
          icon="branch"
          align="right"
          items={branchItems(props)}
        />
        <Dropdown
          label="Open in"
          icon="external"
          align="right"
          items={openInItems(props)}
        />
        <IconButton
          icon="feedback"
          title="Send feedback"
          onClick={() => props.onMenuAction('feedback')}
        />
        <IconButton
          icon="refresh"
          title="Refresh repository"
          onClick={props.onRefresh}
        />
      </div>
    </header>
  );
}

function stashItems(props: ToolbarProps): MenuItem[] {
  return [
    {
      label: 'Stash Changes…',
      icon: 'archive',
      shortcut: '⌘⇧S',
      onSelect: () => props.onStashAction('stashSave')
    },
    {
      label: 'Stash including Untracked Files',
      icon: 'archive',
      onSelect: () => props.onStashAction('stashSaveUntracked')
    },
    {
      label: 'Stash Staged Only',
      icon: 'stage',
      onSelect: () => props.onStashAction('stashStaged')
    },
    { separator: true },
    {
      label: 'Apply Latest Stash',
      icon: 'pull',
      onSelect: () => props.onStashAction('stashApply', { index: 0 })
    },
    {
      label: 'Pop Latest Stash',
      icon: 'push',
      onSelect: () => props.onStashAction('stashPop', { index: 0 })
    },
  ];
}

function branchItems(props: ToolbarProps): MenuItem[] {
  return [
    { label: 'New Branch…', icon: 'plus', onSelect: () => props.onMenuAction('newBranch') },
    { label: 'New Tag…', icon: 'tag', onSelect: () => props.onMenuAction('newTag') },
    { separator: true },
    { label: 'Checkout Branch…', icon: 'branch', onSelect: () => props.onMenuAction('checkoutBranch') },
    { label: 'Merge Branch…', icon: 'merge', onSelect: () => props.onMenuAction('mergeBranch') },
    { label: 'Rebase Current onto…', icon: 'rebase', onSelect: () => props.onMenuAction('rebaseBranch') },
    { separator: true },
    { label: 'Rename Current Branch…', icon: 'code', onSelect: () => props.onMenuAction('renameBranch') },
    { label: 'Delete Branch…', icon: 'trash', danger: true, onSelect: () => props.onMenuAction('deleteBranch') },
    { label: 'Set Upstream…', icon: 'link', onSelect: () => props.onMenuAction('setUpstream') },
    { separator: true },
    { label: 'Push Current Branch', icon: 'push', onSelect: () => props.onPush() },
    {
      label: 'Force Push (with lease)',
      icon: 'push',
      danger: true,
      onSelect: () => props.onForcePush?.()
    },
    { label: 'Show All Commits', icon: 'commit', onSelect: () => props.onViewChange('history') }
  ];
}

function openInItems(props: ToolbarProps): MenuItem[] {
  return [
    { label: 'Finder / Explorer', icon: 'folderOpen', onSelect: () => props.onMenuAction('openFinder') },
    { label: 'Terminal', icon: 'terminal', onSelect: () => props.onMenuAction('openTerminal') },
    { label: 'New Window', icon: 'external', onSelect: () => props.onMenuAction('openNewWindow') },
    { separator: true },
    { label: 'Copy Repository Path', icon: 'copy', onSelect: () => props.onMenuAction('copyPath') },
    { label: 'Open Repository…', icon: 'folder', onSelect: props.onOpenRepository }
  ];
}

function RepoBranchPicker(props: ToolbarProps & { branch: string | null }): React.ReactElement {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 20);
    } else {
      setQuery('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('blur', close);
    return () => window.removeEventListener('blur', close);
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchor({ x: rect.left + rect.width / 2, y: rect.bottom + 6 });
    setOpen(true);
  };

  const term = query.trim().toLowerCase();
  const localBranches = (props.state?.branches ?? [])
    .slice()
    .sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name))
    .filter((branch) => !term || branch.name.toLowerCase().includes(term));
  const remoteBranches = (props.state?.remotes ?? [])
    .flatMap((remote) => remote.branches)
    .filter((branch) => !term || branch.fullName.toLowerCase().includes(term))
    .slice(0, term ? 40 : 12);
  const visibleRepos = props.repos.filter(
    (repo) => !term || repo.name.toLowerCase().includes(term) || repo.root.toLowerCase().includes(term)
  );

  return (
    <div className="repo-picker">
      <button ref={buttonRef} type="button" className={`repo-picker-button${open ? ' open' : ''}`} onClick={toggle}>
        <span className="repo-picker-icon">
          <Icon name="repo" size={18} />
        </span>
        <span className="repo-picker-text">
          <span className="repo-picker-name">{props.state?.repo.name ?? 'No repository'}</span>
          <span className="repo-picker-branch">
            <Icon name="branch" size={11} />
            {props.branch ?? 'detached HEAD'}
            {props.state?.repo.ahead ? <span className="ahead-behind"> ↑{props.state.repo.ahead}</span> : null}
            {props.state?.repo.behind ? <span className="ahead-behind"> ↓{props.state.repo.behind}</span> : null}
          </span>
        </span>
        <Icon name="chevronDown" size={12} className="repo-picker-chevron" />
      </button>
      {open && anchor
        ? createPortal(
            <div className="picker-backdrop" onMouseDown={() => setOpen(false)}>
              <div
                className="picker"
                style={{ left: Math.max(8, anchor.x - 190), top: anchor.y }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="picker-search">
                  <Icon name="search" size={14} />
                  <input
                    ref={inputRef}
                    value={query}
                    placeholder="Search repositories and branches"
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setOpen(false);
                    }}
                  />
                </div>
                <div className="picker-scroll">
                  {visibleRepos.length > 1 ? (
                    <>
                      <div className="picker-section-title">Repositories</div>
                      {visibleRepos.map((repo) => (
                        <button
                          key={repo.root}
                          type="button"
                          className={`picker-row${repo.root === props.activeRepo ? ' selected' : ''}`}
                          onClick={() => {
                            props.onSelectRepo(repo.root);
                            setOpen(false);
                          }}
                        >
                          <Icon name="repo" size={15} />
                          <span className="picker-row-main">{repo.name}</span>
                          {repo.dirty ? <span className="dirty-dot" /> : null}
                          <span className="picker-row-side">{repo.branch ?? ''}</span>
                        </button>
                      ))}
                    </>
                  ) : null}
                  <div className="picker-section-title">
                    Branches <span className="picker-count">{localBranches.length}</span>
                  </div>
                  {localBranches.map((branch) => (
                    <button
                      key={branch.name}
                      type="button"
                      className={`picker-row${branch.current ? ' selected' : ''}`}
                      onClick={() => {
                        props.onCheckout(branch.name);
                        setOpen(false);
                      }}
                    >
                      {branch.current ? <Icon name="check" size={14} /> : <Icon name="branch" size={14} />}
                      <span className="picker-row-main">{branch.name}</span>
                      {branch.ahead ? <span className="sync-count sync-ahead">↑{branch.ahead}</span> : null}
                      {branch.behind ? <span className="sync-count sync-behind">↓{branch.behind}</span> : null}
                    </button>
                  ))}
                  {remoteBranches.length ? (
                    <>
                      <div className="picker-section-title">
                        Remotes <span className="picker-count">{remoteBranches.length}</span>
                      </div>
                      {remoteBranches.map((branch) => (
                        <button
                          key={branch.fullName}
                          type="button"
                          className="picker-row"
                          onClick={() => {
                            props.onCheckout(branch.name, branch.remote ?? undefined);
                            setOpen(false);
                          }}
                        >
                          <Icon name="cloud" size={14} />
                          <span className="picker-row-main">{branch.fullName}</span>
                        </button>
                      ))}
                    </>
                  ) : null}
                  {!localBranches.length && !remoteBranches.length ? (
                    <div className="picker-empty">No branches match “{query}”.</div>
                  ) : null}
                </div>
                <button type="button" className="picker-footer" onClick={props.onOpenRepository}>
                  <Icon name="plus" size={14} /> Open another repository…
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
