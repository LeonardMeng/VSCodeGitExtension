import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppConfig,
  CommitAction,
  CommitSummary,
  RepoState
} from '@shared/protocol/types';
import { RequestFn, PushToast } from '../bridgeTypes';
import { Icon } from './Icon';
import { EmptyState, IconButton, MenuItem, Spinner, useContextMenu } from './Menu';
import { Avatar, Chip } from './StatusBadge';
import { CommitGraph, GRAPH_ROW_HEIGHT, graphColumnWidth } from './CommitGraph';
import { CommitDetailPanel } from './CommitDetailPanel';
import { formatDate } from '../utils/format';

interface HistoryViewProps {
  state: RepoState;
  config: AppConfig;
  request: RequestFn;
  baseRef: string | null;
  onBaseRefChange: (ref: string | null) => void;
  focusCommit: { sha: string; nonce: number } | null;
  onCopy: (text: string) => void;
  onOpenFile: (path: string, sha?: string) => void;
  onFileHistory: (path: string) => void;
  onBlame: (path: string) => void;
  onCommitAction: (sha: string, action: CommitAction) => void;
  onPushToast: PushToast;
}

export function HistoryView(props: HistoryViewProps): React.ReactElement {
  const { state, config, request, baseRef, focusCommit } = props;
  const [commits, setCommits] = useState<CommitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [detail, setDetail] = useState<import('@shared/protocol/types').CommitDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listHeight, setListHeight] = useState(400);
  const [scrollTop, setScrollTop] = useState(0);
  const [detailHeight, setDetailHeight] = useState(370);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const { openMenu, menuNode } = useContextMenu();

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const requestToken = useRef(0);
  const detailToken = useRef(0);
  const stateRef = useRef({ loading: false, loadingMore: false, hasMore: false, offset: 0 });
  const detailResize = useRef<{ y: number; height: number } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 320);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const loadPage = useCallback(
    async (offset: number, append: boolean) => {
      if (append && (stateRef.current.loadingMore || !stateRef.current.hasMore)) return;
      const token = ++requestToken.current;
      if (append) {
        setLoadingMore(true);
        stateRef.current.loadingMore = true;
      } else {
        setLoading(true);
        setError(null);
        stateRef.current.loading = true;
        stateRef.current.hasMore = false;
        setCommits([]);
      }
      try {
        const message = await request<import('@shared/protocol/types').ToWebviewMessage & { type: 'history' }>(
          (requestId) => ({
            type: 'getHistory',
            requestId,
            offset,
            limit: config.historyPageSize,
            ref: baseRef,
            search: search || null
          }),
          ['history']
        );
        if (token !== requestToken.current || message.type !== 'history') return;
        const page = message.page;
        setCommits((current) => {
          const next = append ? [...current, ...page.commits] : page.commits;
          stateRef.current.offset = next.length;
          return next;
        });
        setHasMore(page.hasMore);
        stateRef.current.hasMore = page.hasMore;
        setTotal(page.total);
        if (!append && page.commits.length) {
          setSelectedSha((current) =>
            current && page.commits.some((commit) => commit.sha === current) ? current : page.commits[0].sha
          );
          if (scrollRef.current) scrollRef.current.scrollTop = 0;
          setScrollTop(0);
        }
      } catch (err) {
        if (token !== requestToken.current) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        props.onPushToast('error', message);
      } finally {
        if (token === requestToken.current) {
          setLoading(false);
          setLoadingMore(false);
          stateRef.current.loading = false;
          stateRef.current.loadingMore = false;
        }
      }
    },
    [baseRef, search, config.historyPageSize, request, props]
  );

  useEffect(() => {
    void loadPage(0, false);
  }, [baseRef, search, config.historyPageSize, state.repo.headSha]);

  useEffect(() => {
    if (!selectedSha) {
      setDetail(null);
      return;
    }
    const token = ++detailToken.current;
    setDetailLoading(true);
    void request<import('@shared/protocol/types').ToWebviewMessage & { type: 'commitDetail' }>(
      (requestId) => ({ type: 'getCommitDetail', requestId, sha: selectedSha }),
      ['commitDetail']
    )
      .then((message) => {
        if (token !== detailToken.current) return;
        if (message.type === 'commitDetail') setDetail(message.detail);
      })
      .catch((err: Error) => {
        if (token !== detailToken.current) return;
        props.onPushToast('error', err.message);
      })
      .finally(() => {
        if (token === detailToken.current) setDetailLoading(false);
      });
  }, [selectedSha, request, props.onPushToast]);

  useEffect(() => {
    if (!focusCommit) return;
    setSelectedSha(focusCommit.sha);
    const index = commits.findIndex((commit) => commit.sha === focusCommit.sha);
    if (index >= 0 && scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, index * GRAPH_ROW_HEIGHT - 120);
      setScrollTop(scrollRef.current.scrollTop);
    }
  }, [focusCommit, commits]);

  useEffect(() => {
    const element = scrollBoxRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setListHeight(element.clientHeight));
    observer.observe(element);
    setListHeight(element.clientHeight);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!detailResize.current) return;
      const delta = detailResize.current.y - event.clientY;
      setDetailHeight(Math.max(180, Math.min(window.innerHeight - 220, detailResize.current.height + delta)));
    };
    const onUp = () => {
      detailResize.current = null;
      document.body.classList.remove('resizing');
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const startDetailResize = (event: React.MouseEvent) => {
    detailResize.current = { y: event.clientY, height: detailHeight };
    document.body.classList.add('resizing');
    event.preventDefault();
  };

  const maxLanes = useMemo(
    () => commits.reduce((max, commit) => Math.max(max, commit.graph.laneCount), 1),
    [commits]
  );
  const graphWidth = graphColumnWidth(maxLanes);
  const showDate = viewportWidth >= 1120;
  const showAuthor = viewportWidth > 900;
  const gridTemplate = showDate
    ? `${graphWidth}px minmax(200px, 1fr) 148px 72px 158px`
    : showAuthor
      ? `${graphWidth}px minmax(180px, 1fr) 140px 70px`
      : `${graphWidth}px minmax(160px, 1fr) 70px`;

  const start = Math.max(0, Math.floor(scrollTop / GRAPH_ROW_HEIGHT) - 10);
  const end = Math.min(commits.length, start + Math.ceil(listHeight / GRAPH_ROW_HEIGHT) + 20);
  const visible = commits.slice(start, end);

  const onScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    setScrollTop(element.scrollTop);
    if (
      element.scrollTop + element.clientHeight >= element.scrollHeight - 500 &&
      stateRef.current.hasMore &&
      !stateRef.current.loadingMore
    ) {
      void loadPage(stateRef.current.offset, true);
    }
  };

  const commitMenu = (commit: CommitSummary): MenuItem[] => [
    {
      label: 'Checkout Commit (detached)',
      icon: 'branch',
      onSelect: () => props.onCommitAction(commit.sha, 'checkout')
    },
    {
      label: 'Create Branch Here…',
      icon: 'plus',
      onSelect: () => props.onCommitAction(commit.sha, 'branchHere')
    },
    {
      label: 'Create Tag Here…',
      icon: 'tag',
      onSelect: () => props.onCommitAction(commit.sha, 'tagHere')
    },
    { separator: true },
    {
      label: 'Cherry-pick Commit',
      icon: 'commit',
      onSelect: () => props.onCommitAction(commit.sha, 'cherryPick')
    },
    {
      label: 'Revert Commit',
      icon: 'undo',
      onSelect: () => props.onCommitAction(commit.sha, 'revert')
    },
    {
      label: 'Reset Current Branch to Here…',
      icon: 'refresh',
      danger: true,
      onSelect: () => props.onCommitAction(commit.sha, 'reset')
    },
    { separator: true },
    { label: 'Copy SHA', icon: 'copy', onSelect: () => props.onCopy(commit.sha) },
    { label: 'Copy Commit Message', icon: 'copy', onSelect: () => props.onCopy(commit.subject) }
  ];

  const selectedCommit =
    detail?.commit ?? commits.find((commit) => commit.sha === selectedSha) ?? null;

  return (
    <div className="history-view">
      <div className="history-toolbar">
        <div className="history-search">
          <Icon name="search" size={14} />
          <input
            value={searchInput}
            placeholder="Search commits, authors, SHA or file path"
            spellCheck={false}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          {searchInput ? (
            <button type="button" className="search-clear" onClick={() => setSearchInput('')} title="Clear search">
              <Icon name="close" size={11} />
            </button>
          ) : null}
        </div>
        {baseRef ? (
          <div className="base-ref-chip" title={`Showing commits reachable from ${baseRef}`}>
            <Icon name="branch" size={12} />
            <span>{baseRef}</span>
            <button type="button" onClick={() => props.onBaseRefChange(null)} title="Show all commits">
              <Icon name="close" size={10} />
            </button>
          </div>
        ) : (
          <div className="history-scope">
            <Icon name="commit" size={13} /> All branches
          </div>
        )}
        <div className="history-toolbar-spacer" />
        <div className="history-count">
          {loading ? (
            <>
              <Spinner size={12} /> Loading…
            </>
          ) : (
            <>
              {total !== null ? `${total.toLocaleString()} commits` : `${commits.length} loaded`}
              {search ? ` · “${search}”` : ''}
            </>
          )}
        </div>
        {hasMore ? (
          <button
            type="button"
            className="secondary-button small"
            onClick={() => void loadPage(stateRef.current.offset, true)}
            disabled={loadingMore}
          >
            {loadingMore ? <Spinner size={12} /> : <Icon name="chevronDown" size={12} />} Load more
          </button>
        ) : null}
        <IconButton icon="refresh" title="Reload history" onClick={() => void loadPage(0, false)} />
      </div>

      <div className="commit-list-wrapper" ref={scrollBoxRef}>
        <div className="commit-list-header" style={{ gridTemplateColumns: gridTemplate }}>
          <div className="graph-header" />
          <div>Commit</div>
          {showAuthor ? <div>Author</div> : null}
          <div>SHA</div>
          {showDate ? <div>Date</div> : null}
        </div>
        <div className="commit-list-scroll" ref={scrollRef} onScroll={onScroll}>
          {loading && !commits.length ? (
            <div className="commit-list-loading">
              <Spinner size={20} />
              <span>Loading commit history…</span>
            </div>
          ) : error ? (
            <EmptyState icon="alert" title="Unable to load history" description={error} />
          ) : !commits.length ? (
            <EmptyState
              icon="commit"
              title={search ? 'No matching commits' : 'No commits yet'}
              description={
                search
                  ? 'Try a different message, author, SHA prefix or file path.'
                  : 'Commits will appear here once the repository has history.'
              }
            />
          ) : (
            <div className="commit-list-spacer" style={{ height: commits.length * GRAPH_ROW_HEIGHT }}>
              {visible.map((commit, index) => {
                const absoluteIndex = start + index;
                const isHead = commit.sha === (state.repo.headSha ?? '');
                const selected = commit.sha === selectedSha;
                const rowRefs = prepareRefs(commit);
                return (
                  <div
                    key={commit.sha}
                    className={`commit-row${selected ? ' selected' : ''}${isHead ? ' head' : ''}${commit.inHead ? '' : ' dimmed'}`}
                    style={{
                      top: absoluteIndex * GRAPH_ROW_HEIGHT,
                      gridTemplateColumns: gridTemplate
                    }}
                    onClick={() => setSelectedSha(commit.sha)}
                    onDoubleClick={() => props.onCommitAction(commit.sha, 'checkout')}
                    onContextMenu={(event) => openMenu(event, commitMenu(commit))}
                    title={`${commit.subject}\n${commit.author.name} · ${formatDate(commit.author.date)}\n${commit.sha}`}
                  >
                    <div className="commit-graph-cell" style={{ width: graphWidth }}>
                      <CommitGraph row={commit.graph} isHead={isHead} width={graphWidth} />
                    </div>
                    <div className="commit-message-cell">
                      {rowRefs.map((ref) => (
                        <RefBadge key={`${ref.kind}:${ref.name}`} refItem={ref} />
                      ))}
                      <span className="commit-row-subject">{commit.subject || '(no subject)'}</span>
                      {commit.body ? (
                        <span className="commit-body-indicator" title="This commit has a multi-line description">
                          ↩
                        </span>
                      ) : null}
                    </div>
                    {showAuthor ? (
                      <div className="commit-author-cell">
                        <Avatar name={commit.author.name} size={17} />
                        <span>{commit.author.name}</span>
                      </div>
                    ) : null}
                    <div className="commit-sha-cell">{commit.shortSha}</div>
                    {showDate ? <div className="commit-date-cell">{formatDate(commit.author.date)}</div> : null}
                  </div>
                );
              })}
              {loadingMore ? (
                <div className="commit-load-more-indicator" style={{ top: commits.length * GRAPH_ROW_HEIGHT }}>
                  <Spinner size={14} /> Loading more commits…
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="h-splitter" onMouseDown={startDetailResize} title="Resize commit details" />

      <div className="commit-detail-wrapper" style={{ height: selectedCommit ? detailHeight : 170 }}>
        <CommitDetailPanel
          detail={detail}
          selectedCommit={selectedCommit}
          loading={detailLoading}
          config={config}
          request={request}
          onCopy={props.onCopy}
          onOpenFile={props.onOpenFile}
          onFileHistory={props.onFileHistory}
          onBlame={props.onBlame}
          onSelectSha={setSelectedSha}
          onCommitAction={props.onCommitAction}
          onPushToast={props.onPushToast}
          onClose={() => setSelectedSha(null)}
        />
      </div>
      {menuNode}
    </div>
  );
}

function RefBadge({ refItem }: { refItem: ReturnType<typeof prepareRefs>[number] }): React.ReactElement {
  if (refItem.kind === 'tag') {
    return (
      <Chip tone="orange" icon="tag" title={`Tag ${refItem.name}`}>
        {refItem.name}
      </Chip>
    );
  }
  if (refItem.kind === 'remote') {
    return (
      <Chip tone="red" icon="cloud" title={`Remote-only ref ${refItem.name}`}>
        {refItem.name}
      </Chip>
    );
  }
  if (refItem.current) {
    return (
      <Chip
        tone="accent-outline"
        icon="check"
        title={`Current branch (${refItem.upstream ? `tracking ${refItem.upstream}` : 'no upstream'})`}
      >
        {refItem.name}
      </Chip>
    );
  }
  return (
    <Chip tone="yellow" icon="branch" title="Local-only branch">
      {refItem.name}
    </Chip>
  );
}

function prepareRefs(commit: CommitSummary): CommitSummary['refs'] {
  const localNames = new Set(
    commit.refs.filter((ref) => ref.kind === 'local').map((ref) => ref.name)
  );
  return commit.refs.filter((ref) => {
    if (ref.kind === 'remote') {
      const short = ref.name.replace(/^[^/]+\//, '');
      if (localNames.has(short)) return false;
    }
    return true;
  });
}
