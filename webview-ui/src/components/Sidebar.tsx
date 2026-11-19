import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BranchInfo,
  MenuAction,
  RepoState,
  SidebarSection,
  SubmoduleInfo,
  TagInfo,
  WebviewView
} from '@shared/protocol/types';
import { AppConfig } from '@shared/protocol/types';
import { Icon, IconName } from './Icon';
import { MenuItem, useContextMenu } from './Menu';
import { buildBranchTree, BranchNode, filterBranchTree } from '../utils/tree';
import { formatRelative, shortSha } from '../utils/format';

interface SidebarProps {
  state: RepoState;
  view: WebviewView;
  config: AppConfig;
  focusSection: { section: SidebarSection; nonce: number } | null;
  onViewChange: (view: WebviewView, section?: SidebarSection) => void;
  onOpenCommits: (ref: string | null) => void;
  onCheckout: (name: string, remote?: string) => void;
  onStashSelect: (index: number) => void;
  onStashAction: (action: MenuAction, index: number) => void;
  onMenuAction: (action: MenuAction, payload?: Record<string, unknown>) => void;
  onCopy: (text: string) => void;
  onPushToast: (level: 'info' | 'warn' | 'error', message: string) => void;
  onOpenRepository: () => void;
}

const SECTION_ORDER: SidebarSection[] = ['branches', 'remotes', 'tags', 'stashes', 'submodules'];

const SECTION_TITLES: Record<SidebarSection, string> = {
  local: 'Local Changes',
  commits: 'All Commits',
  branches: 'Branches',
  remotes: 'Remotes',
  tags: 'Tags',
  stashes: 'Stashes',
  submodules: 'Submodules'
};

export function Sidebar(props: SidebarProps): React.ReactElement {
  const { state, config, view, focusSection } = props;
  const [filter, setFilter] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Set<SidebarSection>>(new Set());
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [collapsedRemotes, setCollapsedRemotes] = useState<Set<string>>(new Set());
  const filterRef = useRef<HTMLInputElement>(null);
  const { openMenu, menuNode } = useContextMenu();

  useEffect(() => {
    if (!focusSection) return;
    setCollapsedSections((current) => {
      const next = new Set(current);
      next.delete(focusSection.section);
      return next;
    });
    const timer = window.setTimeout(() => {
      document
        .getElementById(`sidebar-section-${focusSection.section}`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [focusSection]);

  const filterTerm = filter.trim().toLowerCase();
  const changedCount = state.files.length;
  const isFiltering = filterTerm.length > 0;

  const toggleSection = (section: SidebarSection) => {
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const toggleFolder = (key: string) => {
    setCollapsedFolders((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filteredTags = state.tags.filter((tag) => !filterTerm || tag.name.toLowerCase().includes(filterTerm));
  const filteredStashes = state.stashes.filter(
    (stash) => !filterTerm || stash.message.toLowerCase().includes(filterTerm)
  );
  const filteredSubmodules = state.submodules.filter(
    (submodule) => !filterTerm || submodule.path.toLowerCase().includes(filterTerm)
  );
  const filteredRemotes = state.remotes
    .map((remote) => ({
      ...remote,
      branches: remote.branches.filter(
        (branch) => !filterTerm || branch.fullName.toLowerCase().includes(filterTerm)
      )
    }))
    .filter((remote) => remote.branches.length > 0 || !filterTerm);

  const repoMenu: MenuItem[] = [
    { label: 'Refresh', icon: 'refresh', shortcut: '⌘R', onSelect: () => props.onMenuAction('refresh') },
    { label: 'Fetch All Remotes', icon: 'fetch', onSelect: () => props.onMenuAction('fetch') },
    { separator: true },
    { label: 'Open Repository…', icon: 'folderOpen', onSelect: props.onOpenRepository },
    { label: 'Open in Finder', icon: 'folder', onSelect: () => props.onMenuAction('openFinder') },
    { label: 'Open Terminal', icon: 'terminal', onSelect: () => props.onMenuAction('openTerminal') },
    { separator: true },
    { label: 'Settings', icon: 'settings', onSelect: () => props.onMenuAction('settings') },
    { label: 'About ForkGit', icon: 'info', onSelect: () => props.onMenuAction('about') }
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-repo-row">
          <div className="sidebar-repo-name" title={state.repo.root}>
            <Icon name="repo" size={14} />
            <span>{state.repo.name}</span>
          </div>
          <button
            type="button"
            className="sidebar-more"
            title="Repository actions"
            onClick={(event) => openMenu(event, repoMenu)}
          >
            <Icon name="dots" size={15} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <button
            type="button"
            className={`sidebar-nav-item${view === 'changes' ? ' active' : ''}`}
            onClick={() => props.onViewChange('changes')}
          >
            <Icon name="list" size={15} />
            <span className="sidebar-nav-label">Local Changes</span>
            <span className="sidebar-nav-count">{changedCount}</span>
          </button>
          <button
            type="button"
            className={`sidebar-nav-item${view === 'history' ? ' active' : ''}`}
            onClick={() => props.onViewChange('history')}
          >
            <Icon name="commit" size={15} />
            <span className="sidebar-nav-label">All Commits</span>
          </button>
        </nav>

        <div className="sidebar-tools">
          <button
            type="button"
            className="sidebar-tool"
            title="Branches"
            onClick={() => {
              setFilter('');
              filterRef.current?.focus();
              document.getElementById('sidebar-section-branches')?.scrollIntoView({ block: 'nearest' });
            }}
          >
            <Icon name="branch" size={15} />
          </button>
          <button
            type="button"
            className={`sidebar-tool${isFiltering ? ' active' : ''}`}
            title="Filter"
            onClick={() => filterRef.current?.focus()}
          >
            <Icon name="search" size={15} />
          </button>
        </div>

        <div className="sidebar-filter">
          <Icon name="search" size={13} />
          <input
            ref={filterRef}
            value={filter}
            placeholder="Filter branches, tags, stashes…"
            spellCheck={false}
            onChange={(event) => setFilter(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setFilter('');
            }}
          />
          {filter ? (
            <button type="button" className="sidebar-filter-clear" onClick={() => setFilter('')} title="Clear filter">
              <Icon name="close" size={11} />
            </button>
          ) : (
            <span className="sidebar-filter-hint">⌘F</span>
          )}
        </div>
      </div>

      <div className="sidebar-scroll">
        <SidebarSectionBlock
          id="branches"
          title="Branches"
          count={state.branches.length}
          collapsed={!isFiltering && collapsedSections.has('branches')}
          onToggle={() => toggleSection('branches')}
          onAction={() => props.onMenuAction('newBranch')}
          actionTitle="New branch"
          actionIcon="plus"
        >
          <BranchTree
            branches={state.branches}
            group={config.groupByPrefix}
            filter={filterTerm}
            collapsedFolders={collapsedFolders}
            onToggleFolder={toggleFolder}
            isRemote={false}
            onShowCommits={(branch) => props.onOpenCommits(branch.name)}
            onCheckout={(branch) => props.onCheckout(branch.name)}
            onContextMenu={(event, branch) => openMenu(event, branchMenu(branch, false, props))}
          />
        </SidebarSectionBlock>

        <SidebarSectionBlock
          id="remotes"
          title="Remotes"
          count={state.remotes.reduce((sum, remote) => sum + remote.branches.length, 0)}
          collapsed={!isFiltering && collapsedSections.has('remotes')}
          onToggle={() => toggleSection('remotes')}
        >
          {filteredRemotes.length ? (
            filteredRemotes.map((remote) => {
              const remoteKey = `remote:${remote.name}`;
              const collapsed = !isFiltering && collapsedRemotes.has(remoteKey);
              return (
                <div className="remote-group" key={remote.name}>
                  <button
                    type="button"
                    className="remote-group-header"
                    title={remote.url ?? remote.name}
                    onClick={() => {
                      setCollapsedRemotes((current) => {
                        const next = new Set(current);
                        if (next.has(remoteKey)) next.delete(remoteKey);
                        else next.add(remoteKey);
                        return next;
                      });
                    }}
                  >
                    <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={11} />
                    <Icon name="cloud" size={14} />
                    <span className="remote-group-name">{remote.name}</span>
                    <span className="tree-count">{remote.branches.length}</span>
                  </button>
                  {collapsed ? null : (
                    <BranchTree
                      branches={remote.branches}
                      group={config.groupByPrefix}
                      filter={filterTerm}
                      collapsedFolders={collapsedFolders}
                      onToggleFolder={toggleFolder}
                      isRemote
                      onShowCommits={(branch) => props.onOpenCommits(branch.fullName)}
                      onCheckout={(branch) => props.onCheckout(branch.name, branch.remote ?? undefined)}
                      onContextMenu={(event, branch) => openMenu(event, branchMenu(branch, true, props))}
                    />
                  )}
                </div>
              );
            })
          ) : (
            <div className="sidebar-empty">No remotes configured</div>
          )}
        </SidebarSectionBlock>

        <SidebarSectionBlock
          id="tags"
          title="Tags"
          count={state.tags.length}
          collapsed={!isFiltering && collapsedSections.has('tags')}
          onToggle={() => toggleSection('tags')}
          onAction={() => props.onMenuAction('newTag')}
          actionTitle="New tag"
          actionIcon="plus"
        >
          {filteredTags.length ? (
            filteredTags.map((tag) => (
              <TagRow
                key={tag.name}
                tag={tag}
                onShow={() => props.onOpenCommits(tag.name)}
                onContextMenu={(event) => openMenu(event, tagMenu(tag, props))}
              />
            ))
          ) : (
            <div className="sidebar-empty">{filterTerm ? 'No matching tags' : 'No tags'}</div>
          )}
        </SidebarSectionBlock>

        <SidebarSectionBlock
          id="stashes"
          title="Stashes"
          count={state.stashes.length}
          collapsed={!isFiltering && collapsedSections.has('stashes')}
          onToggle={() => toggleSection('stashes')}
          onAction={() => props.onMenuAction('stashSave')}
          actionTitle="Stash changes"
          actionIcon="plus"
        >
          {filteredStashes.length ? (
            filteredStashes.map((stash) => (
              <button
                key={stash.ref}
                type="button"
                className="sidebar-row stash-row"
                title={`${stash.ref} · ${stash.message}`}
                onClick={() => props.onStashSelect(stash.index)}
                onContextMenu={(event) => openMenu(event, stashMenu(stash.index, props))}
              >
                <Icon name="archive" size={14} />
                <span className="sidebar-row-label">{stash.message}</span>
                <span className="sidebar-row-meta">{formatRelative(stash.updatedAt)}</span>
              </button>
            ))
          ) : (
            <div className="sidebar-empty">{filterTerm ? 'No matching stashes' : 'No stashes'}</div>
          )}
        </SidebarSectionBlock>

        <SidebarSectionBlock
          id="submodules"
          title="Submodules"
          count={state.submodules.length}
          collapsed={!isFiltering && collapsedSections.has('submodules')}
          onToggle={() => toggleSection('submodules')}
        >
          {filteredSubmodules.length ? (
            filteredSubmodules.map((submodule) => (
              <SubmoduleRow
                key={submodule.path}
                submodule={submodule}
                onOpen={() => props.onMenuAction('submoduleOpen', { path: submodule.path })}
                onContextMenu={(event) => openMenu(event, submoduleMenu(submodule, props))}
              />
            ))
          ) : (
            <div className="sidebar-empty">{filterTerm ? 'No matching submodules' : 'No submodules'}</div>
          )}
        </SidebarSectionBlock>

        <div className="sidebar-footer">
          <span>{state.repo.gitVersion ? `Git ${state.repo.gitVersion}` : 'Git'}</span>
          {state.repo.operation ? <span className="sidebar-operation">{state.repo.operation} in progress</span> : null}
        </div>
      </div>
      {menuNode}
    </aside>
  );
}

function SidebarSectionBlock({
  id,
  title,
  count,
  collapsed,
  onToggle,
  onAction,
  actionTitle,
  actionIcon,
  children
}: {
  id: SidebarSection;
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  onAction?: () => void;
  actionTitle?: string;
  actionIcon?: IconName;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="sidebar-section" id={`sidebar-section-${id}`}>
      <div className="sidebar-section-header">
        <button type="button" className="sidebar-section-toggle" onClick={onToggle}>
          <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={11} />
          <span className="sidebar-section-title">{title}</span>
          <span className="sidebar-section-count">{count}</span>
        </button>
        {onAction ? (
          <button type="button" className="sidebar-section-action" title={actionTitle} onClick={onAction}>
            <Icon name={actionIcon ?? 'plus'} size={13} />
          </button>
        ) : null}
      </div>
      {collapsed ? null : <div className="sidebar-section-body">{children}</div>}
    </section>
  );
}

function BranchTree({
  branches,
  group,
  filter,
  collapsedFolders,
  onToggleFolder,
  isRemote,
  onShowCommits,
  onCheckout,
  onContextMenu
}: {
  branches: BranchInfo[];
  group: boolean;
  filter: string;
  collapsedFolders: Set<string>;
  onToggleFolder: (key: string) => void;
  isRemote: boolean;
  onShowCommits: (branch: BranchInfo) => void;
  onCheckout: (branch: BranchInfo) => void;
  onContextMenu: (event: React.MouseEvent, branch: BranchInfo) => void;
}): React.ReactElement {
  const nodes = useMemo(() => {
    const tree = buildBranchTree(
      branches.map((branch) => ({ ...branch, name: isRemote ? branch.name : branch.name })),
      group
    );
    return filter ? filterBranchTree(tree, filter) : tree;
  }, [branches, group, filter, isRemote]);

  const renderNodes = (items: BranchNode<BranchInfo>[], depth: number, prefix: string): React.ReactNode =>
    items.map((node) => {
      if (node.kind === 'branchFolder') {
        const key = `${isRemote ? 'r' : 'l'}:${prefix}${node.name}`;
        const collapsed = !filter && collapsedFolders.has(key);
        return (
          <React.Fragment key={key}>
            <button
              type="button"
              className="tree-folder branch-folder"
              style={{ paddingLeft: 10 + depth * 12 }}
              onClick={() => onToggleFolder(key)}
            >
              <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={10} />
              <Icon name={collapsed ? 'folder' : 'folderOpen'} size={14} className="folder-icon" />
              <span className="tree-folder-name">{node.name}</span>
              <span className="tree-count">{countLeaves(node)}</span>
            </button>
            {collapsed ? null : renderNodes(node.children, depth + 1, `${prefix}${node.name}/`)}
          </React.Fragment>
        );
      }
      const branch = node.branch;
      return (
        <button
          key={`${isRemote ? 'r' : 'l'}:${branch.fullName}`}
          type="button"
          className={`sidebar-row branch-row${branch.current ? ' current' : ''}`}
          style={{ paddingLeft: 20 + depth * 12 }}
          title={`${branch.fullName}${branch.subject ? `\n${branch.subject}` : ''}\n\nClick to view commits · double-click to checkout`}
          onClick={() => onShowCommits(branch)}
          onDoubleClick={() => onCheckout(branch)}
          onContextMenu={(event) => onContextMenu(event, branch)}
        >
          <Icon
            name={branch.current ? 'check' : isRemote ? 'cloud' : 'branch'}
            size={13}
            className={branch.current ? 'branch-current-icon' : 'branch-icon'}
          />
          <span className="sidebar-row-label">{node.name}</span>
          {branch.ahead ? <span className="sync-count sync-ahead">↑{branch.ahead}</span> : null}
          {branch.behind ? <span className="sync-count sync-behind">↓{branch.behind}</span> : null}
        </button>
      );
    });

  if (!nodes.length) return <div className="sidebar-empty">No matching branches</div>;
  return <div className="branch-tree">{renderNodes(nodes, 0, '')}</div>;
}

function countLeaves(node: BranchNode<BranchInfo>): number {
  if (node.kind === 'branch') return 1;
  return node.children.reduce((sum, child) => sum + countLeaves(child), 0);
}

function TagRow({
  tag,
  onShow,
  onContextMenu
}: {
  tag: TagInfo;
  onShow: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      className="sidebar-row tag-row"
      title={`${tag.name}${tag.message ? `\n${tag.message}` : ''}`}
      onClick={onShow}
      onContextMenu={onContextMenu}
    >
      <Icon name="tag" size={13} />
      <span className="sidebar-row-label">{tag.name}</span>
      {tag.annotated ? <span className="sidebar-row-meta">tag</span> : null}
    </button>
  );
}

function SubmoduleRow({
  submodule,
  onOpen,
  onContextMenu
}: {
  submodule: SubmoduleInfo;
  onOpen: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      className="sidebar-row submodule-row"
      title={`${submodule.path}${submodule.url ? `\n${submodule.url}` : ''}`}
      onClick={onOpen}
      onContextMenu={onContextMenu}
    >
      <Icon name="repo" size={13} />
      <span className="sidebar-row-label">{submodule.path}</span>
      {submodule.status !== 'clean' ? (
        <span className="submodule-dirty" title={submodule.status}>
          *
        </span>
      ) : null}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Context menus                                                       */
/* ------------------------------------------------------------------ */

function branchMenu(branch: BranchInfo, isRemote: boolean, props: SidebarProps): MenuItem[] {
  if (isRemote) {
    return [
      {
        label: 'Checkout as Local Branch',
        icon: 'branch',
        onSelect: () => props.onCheckout(branch.name, branch.remote ?? undefined)
      },
      {
        label: 'Show Commits',
        icon: 'commit',
        onSelect: () => props.onOpenCommits(branch.fullName)
      },
      {
        label: 'Merge into Current Branch',
        icon: 'merge',
        onSelect: () => props.onMenuAction('mergeBranch', { name: branch.fullName })
      },
      {
        label: 'Rebase Current onto This',
        icon: 'rebase',
        onSelect: () => props.onMenuAction('rebaseBranch', { name: branch.fullName })
      },
      { separator: true },
      {
        label: 'New Branch from Here…',
        icon: 'plus',
        onSelect: () => props.onMenuAction('createBranchFrom', { from: branch.fullName })
      },
      { label: 'Copy Branch Name', icon: 'copy', onSelect: () => props.onCopy(branch.fullName) },
      { separator: true },
      {
        label: 'Delete Remote Branch…',
        icon: 'trash',
        danger: true,
        onSelect: () => props.onMenuAction('deleteBranch', { name: branch.fullName, remote: true })
      }
    ];
  }
  const items: MenuItem[] = [
    {
      label: branch.current ? 'Checkout' : 'Checkout',
      icon: 'branch',
      disabled: branch.current,
      onSelect: () => props.onCheckout(branch.name)
    },
    {
      label: 'Show Commits',
      icon: 'commit',
      onSelect: () => props.onOpenCommits(branch.name)
    },
    { separator: true },
    {
      label: 'New Branch from Here…',
      icon: 'plus',
      onSelect: () => props.onMenuAction('createBranchFrom', { from: branch.name })
    },
    {
      label: 'Merge into Current Branch',
      icon: 'merge',
      disabled: branch.current,
      onSelect: () => props.onMenuAction('mergeBranch', { name: branch.name })
    },
    {
      label: 'Rebase Current onto This',
      icon: 'rebase',
      disabled: branch.current,
      onSelect: () => props.onMenuAction('rebaseBranch', { name: branch.name })
    },
    { separator: true },
    {
      label: 'Rename Branch…',
      icon: 'code',
      disabled: !branch.current,
      onSelect: () => props.onMenuAction('renameBranch', { name: branch.name })
    },
    {
      label: 'Delete Branch…',
      icon: 'trash',
      danger: true,
      disabled: branch.current,
      onSelect: () => props.onMenuAction('deleteBranch', { name: branch.name })
    },
    {
      label: 'Set Upstream…',
      icon: 'link',
      disabled: !branch.current,
      onSelect: () => props.onMenuAction('setUpstream')
    },
    { separator: true },
    {
      label: 'Push Branch',
      icon: 'push',
      disabled: !branch.current,
      onSelect: () => props.onMenuAction('pushBranch', { name: branch.name })
    },
    { label: 'Copy Branch Name', icon: 'copy', onSelect: () => props.onCopy(branch.name) }
  ];
  if (branch.upstream) {
    items.splice(items.length - 2, 0, {
      label: `Copy Upstream (${branch.upstream})`,
      icon: 'copy',
      onSelect: () => props.onCopy(branch.upstream ?? '')
    });
  }
  return items;
}

function tagMenu(tag: TagInfo, props: SidebarProps): MenuItem[] {
  return [
    { label: 'Show Commits', icon: 'commit', onSelect: () => props.onOpenCommits(tag.name) },
    {
      label: 'Checkout Tag (detached)',
      icon: 'branch',
      onSelect: () => props.onCheckout(tag.name)
    },
    { separator: true },
    {
      label: 'Push Tag',
      icon: 'push',
      onSelect: () => props.onMenuAction('pushTag', { name: tag.name })
    },
    {
      label: 'Delete Tag…',
      icon: 'trash',
      danger: true,
      onSelect: () => props.onMenuAction('deleteTag', { name: tag.name })
    },
    { separator: true },
    { label: 'Copy Tag Name', icon: 'copy', onSelect: () => props.onCopy(tag.name) },
    { label: 'Copy Commit SHA', icon: 'copy', onSelect: () => props.onCopy(tag.sha) }
  ];
}

function stashMenu(index: number, props: SidebarProps): MenuItem[] {
  return [
    { label: 'Preview Stash', icon: 'eye', onSelect: () => props.onStashSelect(index) },
    { separator: true },
    {
      label: 'Apply Stash',
      icon: 'save',
      onSelect: () => props.onStashAction('stashApply', index)
    },
    {
      label: 'Pop Stash',
      icon: 'archive',
      onSelect: () => props.onStashAction('stashPop', index)
    },
    { separator: true },
    {
      label: 'Drop Stash…',
      icon: 'trash',
      danger: true,
      onSelect: () => props.onStashAction('stashDrop', index)
    },
    { label: 'Copy Stash Ref', icon: 'copy', onSelect: () => props.onCopy(`stash@{${index}}`) }
  ];
}

function submoduleMenu(submodule: SubmoduleInfo, props: SidebarProps): MenuItem[] {
  return [
    {
      label: 'Open Submodule',
      icon: 'external',
      onSelect: () => props.onMenuAction('submoduleOpen', { path: submodule.path })
    },
    {
      label: 'Update Submodule',
      icon: 'refresh',
      onSelect: () => props.onMenuAction('submoduleUpdate', { path: submodule.path })
    },
    {
      label: 'Initialize & Update',
      icon: 'fetch',
      onSelect: () => props.onMenuAction('submoduleUpdate', { path: submodule.path, init: true })
    },
    { separator: true },
    { label: 'Copy Path', icon: 'copy', onSelect: () => props.onCopy(submodule.path) },
    ...(submodule.sha
      ? [{ label: `Copy SHA (${shortSha(submodule.sha, 7)})`, icon: 'copy' as const, onSelect: () => props.onCopy(submodule.sha ?? '') }]
      : [])
  ];
}
