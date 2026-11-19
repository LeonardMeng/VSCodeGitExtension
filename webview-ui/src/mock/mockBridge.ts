import type { FromWebviewMessage, ToWebviewMessage } from '@shared/protocol/types';
import type { Bridge } from '../vscode';
import {
  makeCommitDetail,
  makeCommitDiff,
  makeFileTree,
  makeHistoryPage,
  makeMockState,
  makeStashDiff,
  makeWorktreeDiff,
  mockConfig,
  MOCK_COMMITS,
  MOCK_ROOT
} from './mockData';

export function createMockBridge(): Bridge {
  const bridge = new MockBridge();
  return {
    post: (message) => bridge.post(message),
    onMessage: (handler) => bridge.onMessage(handler)
  };
}

class MockBridge {
  private state = makeMockState();
  private handlers = new Set<(message: ToWebviewMessage) => void>();
  private hiddenHunks = new Map<string, Set<number>>();
  private lastRefresh = Date.now();

  onMessage(handler: (message: ToWebviewMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  post(message: FromWebviewMessage): void {
    setTimeout(() => {
      void this.handle(message).catch((err) => this.toast('error', String(err)));
    }, 8);
  }

  private send(message: ToWebviewMessage): void {
    this.handlers.forEach((handler) => handler(message));
  }

  private toast(level: 'info' | 'warn' | 'error', message: string): void {
    this.send({ type: 'toast', level, message });
  }

  private sendState(): void {
    this.send({
      type: 'state',
      state: this.state,
      repos: [
        {
          root: MOCK_ROOT,
          name: 'RealGoClient',
          branch: this.state.repo.head,
          dirty: this.state.files.length > 0
        },
        {
          root: '/Users/parker/WorkSpace/RealGoConfigs',
          name: 'RealGoConfigs',
          branch: 'master',
          dirty: false
        }
      ],
      activeRepo: MOCK_ROOT
    });
  }

  private async busy(label: string, task: () => Promise<void> | void): Promise<void> {
    this.send({ type: 'busy', busy: true, label });
    await new Promise((resolve) => setTimeout(resolve, 220));
    try {
      await task();
    } finally {
      this.send({ type: 'busy', busy: false });
    }
  }

  private updateFiles(mutator: (files: typeof this.state.files) => typeof this.state.files): void {
    this.state = {
      ...this.state,
      files: mutator(this.state.files),
      repo: { ...this.state.repo, hasChanges: this.state.files.length > 0 },
      refreshedAt: ++this.lastRefresh
    };
  }

  private async handle(message: FromWebviewMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.send({
          type: 'init',
          payload: {
            state: this.state,
            repos: [
              { root: MOCK_ROOT, name: 'RealGoClient', branch: this.state.repo.head, dirty: true },
              { root: '/Users/parker/WorkSpace/RealGoConfigs', name: 'RealGoConfigs', branch: 'master', dirty: false }
            ],
            activeRepo: MOCK_ROOT,
            config: mockConfig(),
            view: 'changes'
          }
        });
        return;
      case 'refresh':
        this.state = { ...this.state, refreshedAt: Date.now() };
        this.sendState();
        return;
      case 'selectRepo':
        this.sendState();
        return;
      case 'openRepository':
        this.toast('info', 'Mock mode: choose a repository in the real extension.');
        return;
      case 'setView':
      case 'focusSection':
        return;
      case 'getDiff': {
        const diff =
          message.scope.kind === 'stashFile'
            ? makeStashDiff(message.scope.index)[0]
            : makeWorktreeDiff(this.state, message.scope);
        const key = `${message.scope.kind}:${'path' in message.scope ? message.scope.path : ''}`;
        const hidden = this.hiddenHunks.get(key);
        if (hidden && diff.hunks.length) {
          diff.hunks = diff.hunks.filter((hunk) => !hidden.has(hunk.index));
        }
        this.send({ type: 'diff', requestId: message.requestId, diff });
        return;
      }
      case 'applyDiff':
        await this.busy('Applying change', () => {
          const key = `${message.scope.kind}:${'path' in message.scope ? message.scope.path : ''}`;
          if (!message.lineIndexes?.length) {
            const hidden = this.hiddenHunks.get(key) ?? new Set<number>();
            hidden.add(message.hunkIndex);
            this.hiddenHunks.set(key, hidden);
          }
          this.state = { ...this.state, refreshedAt: Date.now() };
        });
        this.sendState();
        this.toast('info', `Mock: ${message.action} applied.`);
        return;
      case 'stageFiles':
        await this.busy('Staging files', () => {
          this.updateFiles((files) =>
            files.map((file) =>
              message.paths.includes(file.path) && file.unstaged
                ? {
                    ...file,
                    staged: true,
                    unstaged: false,
                    indexStatus: file.worktreeStatus ?? 'M',
                    stagedBadge: file.worktreeStatus ?? 'M',
                    worktreeStatus: undefined,
                    unstagedBadge: undefined
                  }
                : file
            )
          );
        });
        this.sendState();
        return;
      case 'unstageFiles':
        await this.busy('Unstaging files', () => {
          this.updateFiles((files) =>
            files.map((file) =>
              message.paths.includes(file.path) && file.staged
                ? {
                    ...file,
                    staged: false,
                    unstaged: true,
                    worktreeStatus: file.indexStatus ?? 'M',
                    unstagedBadge: file.indexStatus ?? 'M',
                    indexStatus: undefined,
                    stagedBadge: undefined
                  }
                : file
            )
          );
        });
        this.sendState();
        return;
      case 'discardFiles':
        await this.busy('Discarding changes', () => {
          this.updateFiles((files) => files.filter((file) => !message.paths.includes(file.path)));
        });
        this.toast('info', 'Mock: changes discarded.');
        this.sendState();
        return;
      case 'commit':
        await this.busy(message.amend ? 'Amending commit' : 'Committing', () => {
          this.state = {
            ...this.state,
            files: this.state.files.filter((file) => !file.staged),
            recentCommits: [message.subject, ...this.state.recentCommits].slice(0, 50),
            repo: { ...this.state.repo, headSha: MOCK_COMMITS[0].sha },
            refreshedAt: Date.now()
          };
        });
        this.toast('info', `Mock: committed “${message.subject}”.`);
        this.sendState();
        return;
      case 'loadCommitMessage':
        this.send({
          type: 'commitMessage',
          subject: MOCK_COMMITS[0].subject,
          description: MOCK_COMMITS[0].body
        });
        return;
      case 'getHistory': {
        const page = makeHistoryPage(
          message.offset,
          message.limit,
          message.ref,
          message.search
        );
        this.send({ type: 'history', requestId: message.requestId, page });
        return;
      }
      case 'getCommitDetail': {
        this.send({
          type: 'commitDetail',
          requestId: message.requestId,
          detail: makeCommitDetail(message.sha)
        });
        return;
      }
      case 'getCommitFileDiff': {
        this.send({
          type: 'commitFileDiff',
          requestId: message.requestId,
          diff: makeCommitDiff(message.sha, message.path)
        });
        return;
      }
      case 'getFileTree': {
        const tree = makeFileTree(message.sha);
        this.send({
          type: 'fileTree',
          requestId: message.requestId,
          sha: message.sha,
          entries: tree.entries,
          truncated: tree.truncated
        });
        return;
      }
      case 'stashPreview':
        this.send({
          type: 'stashPreview',
          requestId: message.requestId,
          index: message.index,
          files: makeStashDiff(message.index)
        });
        return;
      case 'commitAction':
        this.toast('info', `Mock: ${message.action} ${message.sha.slice(0, 7)}.`);
        return;
      case 'checkoutBranch':
        await this.busy(`Switching to ${message.name}`, () => {
          this.state = {
            ...this.state,
            repo: { ...this.state.repo, head: message.name, upstream: `origin/${message.name}` },
            branches: this.state.branches.map((branch) => ({
              ...branch,
              current: branch.name === message.name
            })),
            refreshedAt: Date.now()
          };
        });
        this.toast('info', `Mock: checked out ${message.name}.`);
        this.sendState();
        return;
      case 'createBranch': {
        const name = message.name ?? `feature/branch-${this.state.branches.length + 1}`;
        this.state = {
          ...this.state,
          branches: [
            ...this.state.branches.map((branch) => ({ ...branch, current: false })),
            {
              name,
              fullName: name,
              remote: null,
              isRemote: false,
              current: true,
              sha: this.state.repo.headSha ?? MOCK_COMMITS[0].sha,
              upstream: null,
              ahead: 0,
              behind: 0,
              subject: 'New branch',
              author: 'parker zhai',
              updatedAt: Date.now()
            }
          ],
          repo: { ...this.state.repo, head: name, upstream: null },
          refreshedAt: Date.now()
        };
        this.toast('info', `Mock: created ${name}.`);
        this.sendState();
        return;
      }
      case 'deleteBranch':
        await this.busy('Deleting branch', () => {
          this.state = {
            ...this.state,
            branches: this.state.branches.filter((branch) => branch.name !== message.name),
            refreshedAt: Date.now()
          };
        });
        this.sendState();
        return;
      case 'renameBranch':
        this.toast('info', 'Mock: branch renamed.');
        return;
      case 'mergeBranch':
      case 'rebaseBranch':
      case 'pushBranch':
      case 'setUpstream':
      case 'pushTag':
      case 'submoduleUpdate':
        this.toast('info', `Mock: ${message.type} complete.`);
        return;
      case 'fetch':
        await this.busy('Fetching', () => {
          this.state = { ...this.state, refreshedAt: Date.now() };
        });
        this.toast('info', 'Mock: fetched all remotes.');
        this.sendState();
        return;
      case 'pull':
        await this.busy('Pulling', () => {
          this.state = { ...this.state, refreshedAt: Date.now() };
        });
        this.toast('info', 'Mock: pull complete.');
        this.sendState();
        return;
      case 'push':
        await this.busy('Pushing', () => {
          this.state = { ...this.state, refreshedAt: Date.now() };
        });
        this.toast('info', 'Mock: push complete.');
        this.sendState();
        return;
      case 'stashSave':
        await this.busy('Stashing changes', () => {
          this.state = {
            ...this.state,
            files: [],
            stashes: [
              {
                index: 0,
                ref: 'stash@{0}',
                sha: MOCK_COMMITS[10].sha,
                message: message.message || `On ${this.state.repo.head}: WIP`,
                branch: this.state.repo.head,
                author: 'parker zhai',
                updatedAt: Date.now()
              },
              ...this.state.stashes.map((stash) => ({ ...stash, index: stash.index + 1 }))
            ],
            repo: { ...this.state.repo, hasChanges: false },
            refreshedAt: Date.now()
          };
        });
        this.toast('info', 'Mock: changes stashed.');
        this.sendState();
        return;
      case 'stashApply':
      case 'stashDrop':
        await this.busy('Updating stash', () => {
          this.state = {
            ...this.state,
            stashes:
              message.type === 'stashDrop' || message.pop
                ? this.state.stashes
                    .filter((stash) => stash.index !== message.index)
                    .map((stash, index) => ({ ...stash, index }))
                : this.state.stashes,
            refreshedAt: Date.now()
          };
        });
        this.toast('info', `Mock: stash ${message.type === 'stashDrop' ? 'dropped' : 'applied'}.`);
        this.sendState();
        return;
      case 'createTag':
        await this.busy('Creating tag', () => {
          this.state = {
            ...this.state,
            tags: [
              ...this.state.tags,
              {
                name: message.name ?? 'v1.0.1',
                sha: message.sha ?? this.state.repo.headSha ?? MOCK_COMMITS[0].sha,
                annotated: !!message.message,
                message: message.message ?? null,
                updatedAt: Date.now()
              }
            ],
            refreshedAt: Date.now()
          };
        });
        this.toast('info', 'Mock: tag created.');
        this.sendState();
        return;
      case 'deleteTag':
        this.state = {
          ...this.state,
          tags: this.state.tags.filter((tag) => tag.name !== message.name),
          refreshedAt: Date.now()
        };
        this.toast('info', 'Mock: tag deleted.');
        this.sendState();
        return;
      case 'submoduleOpen':
        this.toast('info', `Mock: opening ${message.path}.`);
        return;
      case 'menuAction':
        if (message.action === 'refresh') {
          this.sendState();
        } else if (message.action === 'about') {
          this.toast('info', 'ForkGit 0.1.0 — mock preview');
        } else {
          this.toast('info', `Mock: ${message.action}`);
        }
        return;
      case 'copyToClipboard':
        try {
          await navigator.clipboard.writeText(message.text);
          this.toast('info', 'Copied to clipboard.');
        } catch {
          this.toast('warn', 'Clipboard is unavailable in this preview.');
        }
        return;
      case 'showQuickLaunch':
        this.toast('info', 'Mock: Quick Launch opens a native palette in VS Code.');
        return;
      case 'openUrl':
        this.toast('info', message.url);
        return;
      case 'getRecentCommitMessages':
        this.send({ type: 'recentCommits', messages: this.state.recentCommits });
        return;
      case 'showMessage':
        this.toast(message.level, message.message);
        return;
      case 'openFile':
      case 'showInFolder':
      case 'fileHistory':
      case 'blame':
        this.toast('info', `Mock: ${message.type}(${message.path}).`);
        return;
      case 'addToGitignore':
        this.updateFiles((files) => files.filter((file) => !message.paths.includes(file.path)));
        this.toast('info', 'Mock: added to .gitignore.');
        this.sendState();
        return;
      default:
        return;
    }
  }
}
