import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppConfig,
  FromWebviewMessage,
  InitPayload,
  RepoDescriptor,
  RepoState,
  SidebarSection,
  ToWebviewMessage,
  WebviewView
} from '@shared/protocol/types';
import { nextRequestId, onMessage, post } from './vscode';
import { RequestFn, PushToast } from './bridgeTypes';
import { Toolbar } from './components/Toolbar';
import { RepoBar } from './components/RepoBar';
import { Sidebar } from './components/Sidebar';
import { ChangesView } from './components/ChangesView';
import { HistoryView } from './components/HistoryView';
import { Spinner } from './components/Menu';
import { ToastHost } from './components/ToastHost';
import { Icon } from './components/Icon';

const DEFAULT_CONFIG: AppConfig = {
  changesViewMode: 'tree',
  diffMode: 'unified',
  contextLines: 3,
  showWhitespace: false,
  wordWrap: false,
  groupByPrefix: true,
  pullRebase: false,
  autoStash: true,
  confirmDestructive: true,
  historyPageSize: 300
};

interface PendingRequest {
  resolve: (message: ToWebviewMessage) => void;
  reject: (error: Error) => void;
  expected: Set<string>;
  timer: number;
}

interface StashPreviewState {
  index: number;
  loading: boolean;
  files: import('@shared/protocol/types').FileDiff[] | null;
  error?: string;
}

export default function App(): React.ReactElement {
  const [state, setState] = useState<RepoState | null>(null);
  const [repos, setRepos] = useState<RepoDescriptor[]>([]);
  const [activeRepo, setActiveRepo] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [view, setView] = useState<WebviewView>('changes');
  const [busy, setBusy] = useState<{ busy: boolean; label?: string }>({ busy: false });
  const [toasts, setToasts] = useState<Array<{ id: number; level: 'info' | 'warn' | 'error'; message: string }>>([]);
  const [historyRef, setHistoryRef] = useState<string | null>(null);
  const [focusSection, setFocusSection] = useState<{ section: SidebarSection; nonce: number } | null>(null);
  const [focusCommit, setFocusCommit] = useState<{ sha: string; nonce: number } | null>(null);
  const [stashPreview, setStashPreview] = useState<StashPreviewState | null>(null);
  const [booted, setBooted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 900);

  const pending = useRef(new Map<number, PendingRequest>());
  const toastId = useRef(0);
  const stashRequest = useRef(0);

  const pushToast = useCallback<PushToast>((level, message) => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((current) => [...current.slice(-4), { id, level, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  }, []);

  const request = useCallback(((build, expected) =>
      new Promise<ToWebviewMessage>((resolve, reject) => {
        const requestId = nextRequestId();
        const timer = window.setTimeout(() => {
          pending.current.delete(requestId);
          reject(new Error('The Git operation timed out.'));
        }, 30_000);
        pending.current.set(requestId, {
          resolve: (message) => {
            window.clearTimeout(timer);
            pending.current.delete(requestId);
            resolve(message);
          },
          reject: (error) => {
            window.clearTimeout(timer);
            pending.current.delete(requestId);
            reject(error);
          },
          expected: new Set(expected as string[]),
          timer
        });
        post(build(requestId));
      })) as RequestFn,
    []
  );

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 900) setSidebarOpen(true);
      else if (window.innerWidth < 760) setSidebarOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      if (event.key === '1') {
        event.preventDefault();
        setView('changes');
        post({ type: 'setView', view: 'changes' });
      } else if (event.key === '2') {
        event.preventDefault();
        setView('history');
        post({ type: 'setView', view: 'history' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const off = onMessage((message) => {
      if ('requestId' in message) {
        const entry = pending.current.get(message.requestId);
        if (entry) {
          if (entry.expected.has(message.type)) {
            entry.resolve(message);
          } else if (message.type === 'diffError' || message.type === 'requestError') {
            entry.reject(new Error(message.error));
          }
          return;
        }
      }
      switch (message.type) {
        case 'init': {
          const payload: InitPayload = message.payload;
          setState(payload.state);
          setRepos(payload.repos);
          setActiveRepo(payload.activeRepo);
          setConfig(payload.config);
          setView(payload.view);
          setBooted(true);
          break;
        }
        case 'state':
          setState(message.state);
          setRepos(message.repos);
          setActiveRepo(message.activeRepo);
          break;
        case 'config':
          setConfig(message.config);
          break;
        case 'busy':
          setBusy({ busy: message.busy, label: message.label });
          break;
        case 'view':
          setView(message.view);
          if (message.section) {
            setFocusSection({ section: message.section as SidebarSection, nonce: Date.now() });
          }
          break;
        case 'toast':
          pushToast(message.level, message.message);
          break;
        case 'focusCommit':
          setView('history');
          setFocusCommit({ sha: message.sha, nonce: Date.now() });
          break;
        case 'commitMessage':
        case 'recentCommits':
        case 'diff':
        case 'history':
        case 'commitDetail':
        case 'commitFileDiff':
        case 'fileTree':
        case 'stashPreview':
        case 'diffError':
        case 'requestError':
          break;
        default:
          break;
      }
    });

    post({ type: 'ready' });
    return () => {
      off();
      pending.current.forEach((entry) => window.clearTimeout(entry.timer));
      pending.current.clear();
    };
  }, [pushToast]);

  const closeSidebarOnNarrow = useCallback(() => {
    if (window.innerWidth <= 900) setSidebarOpen(false);
  }, []);

  const onViewChange = useCallback((next: WebviewView, section?: SidebarSection) => {
    setView(next);
    post({ type: 'setView', view: next, section });
    if (section) setFocusSection({ section, nonce: Date.now() });
    if (next === 'changes') setStashPreview(null);
    closeSidebarOnNarrow();
  }, [closeSidebarOnNarrow]);

  const handleSelectRepo = useCallback((root: string) => {
    setActiveRepo(root);
    setHistoryRef(null);
    setStashPreview(null);
    post({ type: 'selectRepo', root });
  }, []);

  const handleOpenRepository = useCallback(() => post({ type: 'openRepository' }), []);

  const handleStashSelect = useCallback(
    (index: number) => {
      const token = ++stashRequest.current;
      setView('changes');
      setStashPreview({ index, loading: true, files: null });
      post({ type: 'setView', view: 'changes' });
      void request<ToWebviewMessage & { type: 'stashPreview' }>(
        (requestId) => ({ type: 'stashPreview', requestId, index }),
        ['stashPreview']
      )
        .then((message) => {
          if (token !== stashRequest.current) return;
          if (message.type !== 'stashPreview') return;
          setStashPreview({
            index,
            loading: false,
            files: message.files,
            error: message.error
          });
        })
        .catch((error) => {
          if (token !== stashRequest.current) return;
          setStashPreview({ index, loading: false, files: null, error: error.message });
        });
    },
    [request]
  );

  const closeStashPreview = useCallback(() => {
    stashRequest.current += 1;
    setStashPreview(null);
  }, []);

  if (!booted) {
    return (
      <div className="boot-screen">
        <div className="boot-logo">
          <Icon name="branch" size={34} />
        </div>
        <Spinner size={18} />
        <div className="boot-text">Loading repository…</div>
      </div>
    );
  }

  const active = state;
  const showView = active ? view : 'changes';

  return (
    <div className="app">
      <Toolbar
        state={active}
        repos={repos}
        activeRepo={activeRepo}
        busy={busy}
        view={view}
        onSelectRepo={handleSelectRepo}
        onOpenRepository={handleOpenRepository}
        onFetch={() => post({ type: 'fetch', all: true })}
        onPull={() => post({ type: 'pull' })}
        onPush={() => post({ type: 'push' })}
        onForcePush={() => post({ type: 'push', force: true })}
        onQuickLaunch={() => post({ type: 'showQuickLaunch' })}
        onViewChange={onViewChange}
        onCheckout={(name, remote) => post({ type: 'checkoutBranch', name, remote })}
        onMenuAction={(action, payload) => post({ type: 'menuAction', action, payload })}
        onStashAction={(action, payload) => post({ type: 'menuAction', action, payload })}
        onRefresh={() => post({ type: 'refresh' })}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((value) => !value)}
      />
      {repos.length > 1 ? (
        <RepoBar repos={repos} activeRepo={activeRepo} onSelect={handleSelectRepo} onAdd={handleOpenRepository} />
      ) : null}
      {active ? (
        <div className={`app-body${sidebarOpen ? ' sidebar-open' : ' sidebar-closed'}`}>
          <Sidebar
            state={active}
            view={showView}
            config={config}
            focusSection={focusSection}
            onViewChange={onViewChange}
            onOpenCommits={(ref) => {
              setHistoryRef(ref);
              onViewChange('history');
              closeSidebarOnNarrow();
            }}
            onCheckout={(name, remote) => post({ type: 'checkoutBranch', name, remote })}
            onStashSelect={(index) => {
              handleStashSelect(index);
              closeSidebarOnNarrow();
            }}
            onStashAction={(action, index) => {
              post({ type: 'menuAction', action, payload: { index } });
              if (action === 'stashApply' || action === 'stashPop' || action === 'stashDrop') {
                closeStashPreview();
              }
            }}
            onMenuAction={(action, payload) => post({ type: 'menuAction', action, payload })}
            onCopy={(text) => post({ type: 'copyToClipboard', text })}
            onPushToast={pushToast}
            onOpenRepository={handleOpenRepository}
          />
          {sidebarOpen ? (
            <div className="sidebar-backdrop" onMouseDown={() => setSidebarOpen(false)} />
          ) : null}
          <div className="main-area">
            {showView === 'history' ? (
              <HistoryView
                state={active}
                config={config}
                request={request}
                baseRef={historyRef}
                onBaseRefChange={setHistoryRef}
                focusCommit={focusCommit}
                onCopy={(text) => post({ type: 'copyToClipboard', text })}
                onOpenFile={(path, sha) => post({ type: 'openFile', path, sha })}
                onFileHistory={(path) => post({ type: 'fileHistory', path })}
                onBlame={(path) => post({ type: 'blame', path })}
                onCommitAction={(sha, action) => post({ type: 'commitAction', sha, action })}
                onPushToast={pushToast}
              />
            ) : (
              <ChangesView
                state={active}
                config={config}
                request={request}
                busy={busy.busy}
                stashPreview={stashPreview}
                onCloseStash={closeStashPreview}
                onStashAction={(action, index) => {
                  post({ type: 'menuAction', action, payload: { index } });
                  if (action === 'stashApply' || action === 'stashPop' || action === 'stashDrop') {
                    closeStashPreview();
                  }
                }}
                onStage={(paths) => post({ type: 'stageFiles', paths })}
                onUnstage={(paths) => post({ type: 'unstageFiles', paths })}
                onDiscard={(paths) => post({ type: 'discardFiles', paths })}
                onApplyDiff={(scope, hunkIndex, lineIndexes, action, options, hunkHeader) =>
                  post({ type: 'applyDiff', scope, hunkIndex, lineIndexes, action, options, hunkHeader })
                }
                onCommit={(subject, description, amend) => post({ type: 'commit', subject, description, amend })}
                onLoadCommitMessage={(amend) => post({ type: 'loadCommitMessage', amend })}
                onOpenFile={(path) => post({ type: 'openFile', path })}
                onShowInFolder={(path) => post({ type: 'showInFolder', path })}
                onAddToGitignore={(paths) => post({ type: 'addToGitignore', paths })}
                onFileHistory={(path) => post({ type: 'fileHistory', path })}
                onBlame={(path) => post({ type: 'blame', path })}
                onCopy={(text) => post({ type: 'copyToClipboard', text })}
                onPushToast={pushToast}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="no-repo">
          <div className="no-repo-mark">
            <Icon name="branch" size={40} />
          </div>
          <h1>No Git repository</h1>
          <p>Open a folder that contains a Git repository to start using ForkGit.</p>
          <div className="no-repo-actions">
            <button type="button" className="primary-button" onClick={handleOpenRepository}>
              <Icon name="folderOpen" size={15} /> Open Repository
            </button>
            <button type="button" className="secondary-button" onClick={() => post({ type: 'refresh' })}>
              <Icon name="refresh" size={15} /> Refresh
            </button>
          </div>
        </div>
      )}
      <ToastHost toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
    </div>
  );
}
