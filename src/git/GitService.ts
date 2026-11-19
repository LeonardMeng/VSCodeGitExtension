import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  AppConfig,
  CommitAction,
  DiffOptions,
  DiffScope,
  FileDiff,
  HistoryPage,
  MenuAction,
  RepoDescriptor,
  RepoState,
  RepositoryInfo,
  WebviewView
} from '../protocol/types';
import { GitCli, GitError, findRepositoryRoot } from './GitCli';
import { GitRepository } from './Repository';

export interface StatePayload {
  state: RepoState | null;
  repos: RepoDescriptor[];
  activeRepo: string | null;
}

export class GitService implements vscode.Disposable {
  private readonly repos = new Map<string, GitRepository>();
  private activeRoot: string | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  private busyLabel: string | null = null;
  private gitApi: any;
  private readonly apiRepoSubscriptions = new Map<string, vscode.Disposable>();
  private refreshTimer: NodeJS.Timeout | undefined;
  private autoFetchTimer: NodeJS.Timeout | undefined;
  private apiOpenSubscription: vscode.Disposable | undefined;
  private readonly output: vscode.OutputChannel;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly onDidChangeEmitter = new vscode.EventEmitter<StatePayload>();
  private readonly onDidBusyEmitter = new vscode.EventEmitter<{ busy: boolean; label?: string }>();
  private readonly onDidWantViewEmitter = new vscode.EventEmitter<{ view: WebviewView; section?: string }>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  readonly onDidBusy = this.onDidBusyEmitter.event;
  readonly onDidWantView = this.onDidWantViewEmitter.event;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.output = vscode.window.createOutputChannel('ForkGit');
    this.disposables.push(this.output);
  }

  get config(): AppConfig {
    const cfg = vscode.workspace.getConfiguration('forkgit');
    return {
      changesViewMode: cfg.get<'tree' | 'list'>('changes.viewMode', 'tree'),
      diffMode: cfg.get<'unified' | 'split'>('diff.mode', 'unified'),
      contextLines: cfg.get<number>('diff.contextLines', 3),
      showWhitespace: cfg.get<boolean>('diff.showWhitespace', false),
      wordWrap: cfg.get<boolean>('diff.wordWrap', false),
      groupByPrefix: cfg.get<boolean>('branches.groupByPrefix', true),
      pullRebase: cfg.get<boolean>('pull.rebase', false),
      autoStash: cfg.get<boolean>('checkout.autoStash', true),
      confirmDestructive: cfg.get<boolean>('confirmDestructiveActions', true),
      historyPageSize: cfg.get<number>('history.pageSize', 300)
    };
  }

  private gitPath(): string {
    return vscode.workspace.getConfiguration('forkgit').get<string>('gitPath', '');
  }

  async initialize(): Promise<void> {
    await this.discoverRepositories();
    if (this.activeRoot) {
      try {
        await this.requireActive().refresh();
      } catch (err) {
        this.reportError(err);
      }
    }
    this.emitState();
    this.applyAutoFetch();
  }

  /** Re-reads the auto-fetch interval; safe to call after config changes. */
  applyAutoFetch(): void {
    if (this.autoFetchTimer) {
      clearInterval(this.autoFetchTimer);
      this.autoFetchTimer = undefined;
    }
    const interval = vscode.workspace.getConfiguration('forkgit').get<number>('fetch.autoInterval', 0);
    if (interval > 0) {
      this.autoFetchTimer = setInterval(
        () => {
          void this.fetch(true).catch(() => undefined);
        },
        Math.max(1, interval) * 60_000
      );
    }
  }

  private async discoverRepositories(): Promise<void> {
    const roots = new Set<string>();
    const gitPath = this.gitPath();

    try {
      const gitExtension = vscode.extensions.getExtension<{ getAPI(version: number): any }>('vscode.git');
      if (gitExtension) {
        const exports = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();
        const api = exports?.getAPI?.(1);
        this.gitApi = api;
        for (const repo of api?.repositories ?? []) {
          const root: string | undefined = repo?.rootUri?.fsPath;
          if (root) roots.add(root);
          this.watchApiRepository(repo);
        }
        if (api?.onDidOpenRepository && !this.apiOpenSubscription) {
          this.apiOpenSubscription = api.onDidOpenRepository((repo: any) => {
            this.watchApiRepository(repo);
            void this.discoverRepositories().then(() => this.emitState());
          });
        }
      }
    } catch (err) {
      this.output.appendLine(`[discover] git extension API unavailable: ${String(err)}`);
    }

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      try {
        const root = await findRepositoryRoot(folder.uri.fsPath, gitPath);
        if (root) roots.add(root);
      } catch {
        // ignore
      }
    }

    for (const root of roots) {
      if (!this.repos.has(root)) {
        this.repos.set(root, new GitRepository(root, gitPath));
      }
    }
    if (!this.activeRoot && roots.size) {
      this.activeRoot = [...roots][0];
    }
    if (this.activeRoot && !this.repos.has(this.activeRoot)) {
      this.activeRoot = this.repos.keys().next().value ?? null;
    }
  }

  private watchApiRepository(repo: any): void {
    const root: string | undefined = repo?.rootUri?.fsPath;
    if (!root || this.apiRepoSubscriptions.has(root)) return;
    try {
      const disposable = repo.state?.onDidChange?.(() => this.scheduleRefresh());
      if (disposable) this.apiRepoSubscriptions.set(root, disposable);
    } catch {
      // optional integration with the built-in Git extension
    }
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.refresh();
    }, 400);
  }

  async addRepository(root: string): Promise<void> {
    const gitPath = this.gitPath();
    const selected = path.resolve(root);
    let normalized = selected;
    try {
      const cli = new GitCli(selected, gitPath);
      normalized = (await cli.repoRoot()) ?? selected;
    } catch {
      // use the selected folder; the repository check below reports any error
    }
    if (!this.repos.has(normalized)) {
      const repo = new GitRepository(normalized, gitPath);
      await repo.refresh();
      this.repos.set(normalized, repo);
    }
    this.activeRoot = normalized;
    this.emitState();
  }

  async reconfigureGitPath(): Promise<void> {
    const gitPath = this.gitPath();
    for (const root of [...this.repos.keys()]) {
      try {
        this.repos.set(root, new GitRepository(root, gitPath));
      } catch (err) {
        this.output.appendLine(`[reconfigure] ${root}: ${String(err)}`);
      }
    }
    await this.refreshAll();
  }

  async selectRepository(root: string): Promise<void> {
    if (!this.repos.has(root)) return;
    this.activeRoot = root;
    try {
      await this.repos.get(root)?.refresh();
    } catch (err) {
      this.reportError(err);
    }
    this.emitState();
  }

  get active(): GitRepository | null {
    return this.activeRoot ? this.repos.get(this.activeRoot) ?? null : null;
  }

  get activeRepoRoot(): string | null {
    return this.activeRoot;
  }

  get repositories(): GitRepository[] {
    return [...this.repos.values()];
  }

  requireActive(): GitRepository {
    const repo = this.active;
    if (!repo) throw new Error('No Git repository is open.');
    return repo;
  }

  descriptors(): RepoDescriptor[] {
    return this.repositories.map((repo) => ({
      root: repo.root,
      name: repo.name,
      branch: repo.latest?.repo.head ?? null,
      dirty: !!repo.latest?.repo.hasChanges
    }));
  }

  statePayload(): StatePayload {
    return {
      state: this.active?.latest ?? null,
      repos: this.descriptors(),
      activeRepo: this.activeRoot
    };
  }

  private emitState(): void {
    this.onDidChangeEmitter.fire(this.statePayload());
  }

  private emitBusy(busy: boolean, label?: string): void {
    this.busyLabel = busy ? label ?? 'Working' : null;
    this.onDidBusyEmitter.fire({ busy, label });
  }

  get busy(): string | null {
    return this.busyLabel;
  }

  async refresh(): Promise<RepoState | null> {
    const repo = this.active;
    if (!repo) return null;
    try {
      const state = await repo.refresh();
      this.emitState();
      return state;
    } catch (err) {
      this.reportError(err);
      this.emitState();
      return null;
    }
  }

  async refreshAll(): Promise<void> {
    for (const repo of this.repositories) {
      try {
        await repo.refresh();
      } catch (err) {
        this.output.appendLine(`[refresh] ${repo.name}: ${String(err)}`);
      }
    }
    this.emitState();
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn);
    this.tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private reportError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.output.appendLine(`[error] ${message}`);
    if (err instanceof GitError) {
      this.output.appendLine(`$ git ${err.args.join(' ')}`);
      if (err.stderr) this.output.appendLine(err.stderr);
    }
    if (/cancel+ed/i.test(message)) return;
    const short = message.length > 600 ? message.slice(0, 600) + '…' : message;
    void vscode.window.showErrorMessage(`ForkGit: ${short}`, 'Show Output').then((choice) => {
      if (choice === 'Show Output') this.output.show();
    });
  }

  private notifyConflict(message: string): void {
    void vscode.window
      .showWarningMessage(`ForkGit: ${message}`, 'Open Changes')
      .then((choice) => {
        if (choice === 'Open Changes') void vscode.commands.executeCommand('workbench.view.scm');
      });
  }

  private isConflictError(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err);
    return /CONFLICT|Automatic merge failed|needs merge|Resolve all conflicts|could not apply/i.test(message);
  }

  /**
   * Runs a mutation against the active repository with a busy indicator, a
   * serialized queue, error reporting and a final refresh.
   */
  async run<T>(label: string, fn: (repo: GitRepository) => Promise<T>): Promise<T | undefined> {
    const repo = this.active;
    if (!repo) {
      this.reportError(new Error('No Git repository is open.'));
      return undefined;
    }
    this.emitBusy(true, label);
    try {
      const result = await this.enqueue(() => fn(repo));
      return result;
    } catch (err) {
      if (this.isConflictError(err)) {
        this.notifyConflict(
          err instanceof Error ? err.message.split('\n')[0] : 'The operation stopped because of conflicts.'
        );
        this.output.appendLine(String(err));
      } else {
        this.reportError(err);
      }
      return undefined;
    } finally {
      try {
        await repo.refresh();
      } catch (err) {
        this.output.appendLine(`[refresh] ${String(err)}`);
      }
      this.emitBusy(false);
      this.emitState();
    }
  }

  private async withProgress<T>(title: string, task: () => Promise<T>): Promise<T> {
    return vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `ForkGit: ${title}`, cancellable: false },
      () => task()
    );
  }

  private async confirm(message: string, action = 'Continue'): Promise<boolean> {
    if (!this.config.confirmDestructive) return true;
    const choice = await vscode.window.showWarningMessage(message, { modal: true }, action);
    return choice === action;
  }

  private async input(
    title: string,
    prompt: string,
    value?: string,
    validate?: (value: string) => string | null
  ): Promise<string | undefined> {
    return vscode.window.showInputBox({
      title,
      prompt,
      value,
      ignoreFocusOut: true,
      validateInput: validate ? (input) => validate(input) ?? undefined : undefined
    });
  }

  private async pickBranch(title: string, includeRemotes = true, placeholder?: string): Promise<string | undefined> {
    const repo = this.requireActive();
    const branches = repo.latest?.branches ?? [];
    const items: Array<vscode.QuickPickItem & { value: string }> = [];
    for (const branch of branches) {
      items.push({
        label: branch.name,
        description: branch.current ? 'current' : `${branch.ahead ? `↑${branch.ahead}` : ''}${branch.behind ? ` ↓${branch.behind}` : ''}`,
        value: branch.name
      });
    }
    if (includeRemotes) {
      for (const remote of repo.latest?.remotes ?? []) {
        for (const branch of remote.branches) {
          items.push({
            label: branch.fullName,
            description: remote.name,
            value: branch.fullName
          });
        }
      }
    }
    const picked = await vscode.window.showQuickPick(items, { title, placeHolder: placeholder, matchOnDescription: true });
    return picked?.value;
  }

  async fetch(all = true): Promise<void> {
    await this.run(all ? 'Fetching all remotes' : 'Fetching', async (repo) => {
      await this.withProgress('Fetching…', () =>
        repo.cli.run(all ? ['fetch', '--all', '--prune'] : ['fetch', '--prune'], { timeout: 300_000 })
      );
      void vscode.window.setStatusBarMessage('ForkGit: fetch complete', 3000);
    });
  }

  async pull(): Promise<void> {
    const repo = this.active;
    if (!repo) return;
    const state = repo.latest;
    if (!state?.repo.upstream) {
      const answer = await vscode.window.showWarningMessage(
        `Branch "${state?.repo.head ?? 'HEAD'}" has no upstream configured.`,
        'Set Upstream',
        'Cancel'
      );
      if (answer === 'Set Upstream') await this.setUpstream();
      return;
    }
    const rebase = this.config.pullRebase;
    const autostash = this.config.autoStash;
    await this.run(rebase ? 'Pulling (rebase)' : 'Pulling', async (active) => {
      const args = ['pull'];
      if (rebase) args.push('--rebase');
      if (autostash) args.push('--autostash');
      await this.withProgress('Pulling…', () => active.cli.run(args, { timeout: 300_000 }));
    });
  }

  async push(force = false): Promise<void> {
    const repo = this.active;
    if (!repo) return;
    const state = repo.latest;
    if (!state) return;
    if (!state.repo.head) {
      this.reportError(new Error('Cannot push while HEAD is detached.'));
      return;
    }
    if (force && !(await this.confirm(`Force push "${state.repo.head}" with lease?`, 'Force Push'))) return;
    const branch = state.repo.head;
    const remotes = state.remotes.map((remote) => remote.name);
    const upstream = state.repo.upstream;
    await this.run(force ? 'Force pushing' : 'Pushing', async (active) => {
      const args = ['push'];
      if (force) args.push('--force-with-lease');
      if (upstream) {
        args.push(upstream.split('/')[0], branch);
      } else {
        const remote =
          remotes.includes('origin') || remotes.length <= 1
            ? remotes[0]
            : await vscode.window.showQuickPick(remotes, { title: 'Choose a remote to push to' });
        if (!remote) throw new Error('Cancelled');
        args.push('-u', remote, branch);
      }
      await this.withProgress('Pushing…', () => active.cli.run(args, { timeout: 300_000 }));
    });
  }

  async checkoutBranch(name: string, remote?: string): Promise<void> {
    const repo = this.active;
    if (!repo) return;
    const state = repo.latest;
    const current = state?.repo.head;
    const dirty = !!state?.repo.hasChanges;
    let stashed = false;
    let localName = name;
    if (!remote && name.includes('/')) {
      const maybeRemote = name.slice(0, name.indexOf('/'));
      const short = name.slice(name.indexOf('/') + 1);
      if (
        state?.remotes.some((group) => group.name === maybeRemote) &&
        !state.branches.some((branch) => branch.name === name)
      ) {
        remote = maybeRemote;
        localName = short;
      }
    }
    await this.run(`Switching to ${localName}`, async (active) => {
      if (dirty && this.config.autoStash) {
        const saved = await active.cli.stashSave(
          `Autostash. Switch from '${current ?? 'detached HEAD'}' to '${localName}'`,
          true
        );
        stashed = saved;
      }
      try {
        if (remote) await active.cli.checkoutRemoteBranch(remote, localName);
        else await active.cli.checkout(localName);
      } catch (err) {
        if (stashed) {
          try {
            await active.cli.stashApply(0, true);
          } catch (popError) {
            this.output.appendLine(`[autostash] ${String(popError)}`);
          }
        }
        throw err;
      }
      if (stashed) {
        try {
          await active.cli.stashApply(0, true);
        } catch (popError) {
          this.notifyConflict(
            'Your local changes were saved to a stash but could not be restored automatically. Apply the stash manually.'
          );
          this.output.appendLine(`[autostash] ${String(popError)}`);
        }
      }
    });
  }

  async createBranch(name?: string, from?: string, checkout = true): Promise<void> {
    const repo = this.active;
    if (!repo) return;
    const branchName =
      name ??
      (await this.input('New Branch', 'Branch name', '', (value) => {
        const trimmed = value.trim();
        if (!trimmed) return 'Enter a branch name';
        if (/\s/.test(trimmed)) return 'Branch names cannot contain spaces';
        if (/[~^:?*[\\]/.test(trimmed)) return 'Branch name contains an invalid character';
        return null;
      }));
    if (!branchName) return;
    const createFrom = from ?? repo.latest?.repo.headSha ?? 'HEAD';
    const doCheckout =
      checkout ||
      (await vscode.window.showQuickPick(['Checkout now', 'Create only'], { title: 'Create branch' })) ===
        'Checkout now';
    await this.run(`Creating branch ${branchName}`, async (active) => {
      if (doCheckout) await active.cli.checkoutNewBranch(branchName, createFrom);
      else await active.cli.run(['branch', branchName, createFrom]);
    });
  }

  async deleteBranch(name: string, remote = false, force = false): Promise<void> {
    const repo = this.active;
    if (!repo) return;
    if (remote) {
      const remoteName = name.split('/')[0];
      const branchName = name.slice(remoteName.length + 1);
      if (!(await this.confirm(`Delete remote branch "${name}"?`, 'Delete'))) return;
      await this.run(`Deleting ${name}`, async (active) => {
        await active.cli.run(['push', remoteName, '--delete', branchName], { timeout: 120_000 });
      });
      return;
    }
    if (!(await this.confirm(`Delete branch "${name}"?`, 'Delete'))) return;
    await this.run(`Deleting ${name}`, async (active) => {
      try {
        await active.cli.deleteBranch(name, force);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!force && /not fully merged/i.test(message)) {
          const answer = await vscode.window.showWarningMessage(
            `Branch "${name}" is not fully merged. Delete it anyway?`,
            { modal: true },
            'Delete Anyway'
          );
          if (answer === 'Delete Anyway') await active.cli.deleteBranch(name, true);
          else throw new Error('Cancelled');
        } else {
          throw err;
        }
      }
    });
  }

  async renameBranch(name?: string, branchName?: string): Promise<void> {
    const repo = this.active;
    if (!repo) return;
    const current = branchName ?? repo.latest?.repo.head;
    if (!current) {
      this.reportError(new Error('Checkout a branch before renaming.'));
      return;
    }
    const next = name ?? (await this.input('Rename Branch', 'New name', current));
    if (!next || next === current) return;
    await this.run(`Renaming ${current}`, (active) => active.cli.renameBranch(current, next));
  }

  async mergeBranch(name?: string): Promise<void> {
    const target = name ?? (await this.pickBranch('Merge into current branch'));
    if (!target) return;
    if (!(await this.confirm(`Merge "${target}" into the current branch?`, 'Merge'))) return;
    await this.run(`Merging ${target}`, async (active) => {
      await active.cli.run(['merge', '--no-edit', ...(this.config.autoStash ? ['--autostash'] : []), target], {
        timeout: 300_000
      });
    });
  }

  async rebaseBranch(name?: string): Promise<void> {
    const target = name ?? (await this.pickBranch('Rebase current branch onto'));
    if (!target) return;
    if (!(await this.confirm(`Rebase the current branch onto "${target}"?`, 'Rebase'))) return;
    await this.run(`Rebasing onto ${target}`, async (active) => {
      await active.cli.run(['rebase', ...(this.config.autoStash ? ['--autostash'] : []), target], {
        timeout: 300_000
      });
    });
  }

  async pushBranch(branch?: string, force = false): Promise<void> {
    if (branch) {
      await this.push(force);
      return;
    }
    await this.push(force);
  }

  async setUpstream(): Promise<void> {
    const repo = this.active;
    if (!repo) return;
    const branch = repo.latest?.repo.head;
    if (!branch) return;
    const remotes = repo.latest?.remotes ?? [];
    const remote = remotes.length === 1 ? remotes[0].name : await vscode.window.showQuickPick(remotes.map((r) => r.name), { title: 'Choose a remote' });
    if (!remote) return;
    const candidates = (repo.latest?.remotes.find((group) => group.name === remote)?.branches ?? []).map(
      (entry) => entry.fullName
    );
    const fallback = `${remote}/${branch}`;
    const upstream =
      (await vscode.window.showQuickPick(
        candidates.length ? candidates : [fallback],
        { title: `Upstream for "${branch}"`, matchOnDescription: true }
      )) ?? fallback;
    await this.run('Setting upstream', (active) =>
      active.cli.run(['branch', `--set-upstream-to=${upstream}`, branch])
    );
  }

  async stashSave(options: { message?: string; includeUntracked?: boolean; stagedOnly?: boolean } = {}): Promise<void> {
    const repo = this.active;
    if (!repo) return;
    if (!repo.latest?.repo.hasChanges) {
      void vscode.window.showInformationMessage('ForkGit: nothing to stash.');
      return;
    }
    let message = options.message;
    if (message === undefined) {
      message = await this.input('Stash Changes', 'Optional stash message', '');
      if (message === undefined) return;
    }
    await this.run('Stashing changes', async (active) => {
      const saved = await active.cli.stashSave(message || undefined, options.includeUntracked ?? true, options.stagedOnly ?? false);
      if (!saved) void vscode.window.showInformationMessage('ForkGit: nothing to stash.');
    });
  }

  async stashApply(index: number, pop = false): Promise<void> {
    await this.run(pop ? 'Popping stash' : 'Applying stash', async (active) => {
      await active.cli.stashApply(index, pop);
      if (pop) {
        // index shifted; nothing else to do
      }
    });
  }

  async stashDrop(index: number): Promise<void> {
    if (!(await this.confirm(`Drop stash@{${index}}?`, 'Drop'))) return;
    await this.run('Dropping stash', (active) => active.cli.stashDrop(index));
  }

  async createTag(name?: string, message?: string, sha?: string): Promise<void> {
    const repo = this.active;
    if (!repo) return;
    const tagName =
      name ??
      (await this.input('New Tag', 'Tag name', '', (value) => {
        const trimmed = value.trim();
        if (!trimmed) return 'Enter a tag name';
        if (/\s/.test(trimmed)) return 'Tag names cannot contain spaces';
        return null;
      }));
    if (!tagName) return;
    let tagMessage = message;
    if (tagMessage === undefined) {
      tagMessage = await this.input('New Tag', 'Optional annotation message (leave empty for a lightweight tag)', '');
      if (tagMessage === undefined) return;
    }
    const target = sha ?? repo.latest?.repo.headSha ?? 'HEAD';
    await this.run(`Creating tag ${tagName}`, async (active) => {
      await active.cli.createTag(tagName, tagMessage || undefined, target);
    });
    const choice = await vscode.window.showInformationMessage(`Tag "${tagName}" created.`, 'Push Tag');
    if (choice === 'Push Tag') await this.pushTag(tagName);
  }

  async deleteTag(name: string, remote?: string): Promise<void> {
    if (!(await this.confirm(`Delete tag "${name}"?`, 'Delete'))) return;
    await this.run(`Deleting tag ${name}`, async (active) => {
      if (remote) {
        await active.cli.run(['push', remote, '--delete', name], { timeout: 120_000 });
      } else {
        await active.cli.deleteTag(name);
      }
    });
  }

  async pushTag(name: string): Promise<void> {
    const repo = this.active;
    if (!repo) return;
    const remotes = repo.latest?.remotes.map((group) => group.name) ?? [];
    const remote =
      remotes.includes('origin') || remotes.length <= 1
        ? remotes[0]
        : await vscode.window.showQuickPick(remotes, { title: 'Push tag to remote' });
    if (!remote) return;
    await this.run(`Pushing tag ${name}`, async (active) => {
      await active.cli.run(['push', remote, name], { timeout: 180_000 });
    });
  }

  async submoduleUpdate(subPath: string, init = true): Promise<void> {
    await this.run(`Updating ${subPath}`, async (active) => {
      const args = ['submodule', 'update'];
      if (init) args.push('--init');
      args.push('--recursive', '--', subPath);
      await active.cli.run(args, { timeout: 300_000 });
    });
  }

  async submoduleOpen(subPath: string): Promise<void> {
    const repo = this.requireActive();
    const absolute = path.join(repo.root, subPath);
    if (!fs.existsSync(absolute)) {
      this.reportError(new Error(`Submodule is not initialized: ${subPath}`));
      return;
    }
    await this.addRepository(absolute);
    this.onDidWantViewEmitter.fire({ view: 'changes' });
  }

  async commitAction(sha: string, action: CommitAction, parentIndex = 0): Promise<void> {
    const repo = this.active;
    if (!repo) return;
    switch (action) {
      case 'checkout': {
        if (!(await this.confirm(`Checkout commit ${sha.slice(0, 7)} (detached HEAD)?`, 'Checkout'))) return;
        const dirty = !!repo.latest?.repo.hasChanges;
        if (dirty) {
          const answer = await vscode.window.showWarningMessage(
            'You have uncommitted changes. Stash them first?',
            { modal: true },
            'Stash and Checkout'
          );
          if (answer !== 'Stash and Checkout') return;
        }
        await this.run('Checking out commit', async (active) => {
          if (dirty) await active.cli.stashSave(`Autostash. Checkout ${sha.slice(0, 7)}`, true);
          await active.cli.checkout(sha, { detach: true });
        });
        break;
      }
      case 'cherryPick': {
        if (!(await this.confirm(`Cherry-pick ${sha.slice(0, 7)} onto the current branch?`, 'Cherry-pick'))) return;
        await this.run('Cherry-picking', (active) => active.cli.run(['cherry-pick', sha], { timeout: 180_000 }));
        break;
      }
      case 'revert': {
        if (!(await this.confirm(`Revert commit ${sha.slice(0, 7)}?`, 'Revert'))) return;
        await this.run('Reverting', (active) =>
          active.cli.run(['revert', '--no-edit', sha], { timeout: 180_000 })
        );
        break;
      }
      case 'reset': {
        const mode = await vscode.window.showQuickPick(
          [
            { label: 'Soft', description: 'Keep changes staged', value: '--soft' },
            { label: 'Mixed', description: 'Keep changes in the working tree', value: '--mixed' },
            { label: 'Hard', description: 'Discard all changes', value: '--hard' }
          ],
          { title: `Reset current branch to ${sha.slice(0, 7)}` }
        );
        if (!mode) return;
        if (mode.value === '--hard' && !(await this.confirm('Hard reset will discard working tree changes. Continue?', 'Reset'))) {
          return;
        }
        await this.run(`Reset ${mode.label}`, (active) => active.cli.run(['reset', mode.value, sha]));
        break;
      }
      case 'branchHere': {
        const name = await this.input('New Branch at Commit', 'Branch name', '');
        if (!name) return;
        await this.run('Creating branch', (active) => active.cli.run(['branch', name, sha]));
        break;
      }
      case 'tagHere': {
        await this.createTag(undefined, undefined, sha);
        break;
      }
      case 'copySha':
        await vscode.env.clipboard.writeText(sha);
        break;
      default:
        break;
    }
  }

  async stashPreview(index: number): Promise<FileDiff[] | null> {
    try {
      const repo = this.requireActive();
      return await repo.getStashFiles(index);
    } catch (err) {
      this.reportError(err);
      return null;
    }
  }

  async getDiff(scope: DiffScope, options: DiffOptions): Promise<FileDiff> {
    const repo = this.requireActive();
    return repo.getDiff(scope, options);
  }

  async getHistory(request: {
    offset: number;
    limit: number;
    ref?: string | null;
    search?: string | null;
  }): Promise<HistoryPage> {
    return this.requireActive().getHistory(request);
  }

  async getCommitDetail(sha: string) {
    return this.requireActive().getCommitDetail(sha);
  }

  async getCommitFileDiff(
    sha: string,
    path: string,
    options: DiffOptions,
    oldPath?: string,
    parentIndex = 0
  ): Promise<FileDiff> {
    return this.requireActive().getCommitFileDiff(sha, path, options, oldPath, parentIndex);
  }

  async getFileTree(sha: string, path?: string) {
    return this.requireActive().getFileTree(sha, path);
  }

  async applyDiff(
    scope: DiffScope,
    hunkIndex: number,
    lineIndexes: number[] | undefined,
    action: 'stage' | 'unstage' | 'discard',
    options: DiffOptions,
    hunkHeader?: string
  ): Promise<void> {
    if (action === 'discard') {
      const what = lineIndexes?.length ? `${lineIndexes.length} selected line${lineIndexes.length === 1 ? '' : 's'}` : 'this hunk';
      if (!(await this.confirm(`Discard ${what}? This cannot be undone.`, 'Discard'))) return;
    }
    await this.run(`Applying ${action}`, async (repo) => {
      await repo.applyDiff(scope, hunkIndex, lineIndexes, action, options, hunkHeader);
    });
  }

  async stageFiles(paths: string[]): Promise<void> {
    await this.run('Staging files', (repo) => repo.stageFiles(paths));
  }

  async unstageFiles(paths: string[]): Promise<void> {
    await this.run('Unstaging files', (repo) => repo.unstageFiles(paths));
  }

  async discardFiles(paths: string[]): Promise<void> {
    if (!(await this.confirm(`Discard changes in ${paths.length} file${paths.length === 1 ? '' : 's'}?`, 'Discard'))) {
      return;
    }
    await this.run('Discarding changes', (repo) => repo.discardFiles(paths));
  }

  async commit(subject: string, description: string, amend: boolean): Promise<void> {
    await this.run(amend ? 'Amending commit' : 'Committing', async (repo) => {
      const result = await repo.commit(subject, description, amend);
      const summary = result.message.split('\n')[0];
      void vscode.window.setStatusBarMessage(`ForkGit: committed ${summary}`, 4000);
    });
    this.context.workspaceState.update('forkgit.lastCommitSubject', subject);
  }

  async openRepositoryDialog(): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: 'Open Repository',
      title: 'Open a Git repository'
    });
    if (!picked?.[0]) return;
    const root = picked[0].fsPath;
    if (!fs.existsSync(root)) return;
    try {
      await this.addRepository(root);
      await vscode.commands.executeCommand('forkgit.open');
    } catch (err) {
      this.reportError(err);
    }
  }

  async quickLaunch(): Promise<void> {
    const repo = this.active;
    const items: Array<vscode.QuickPickItem & { run: () => Promise<unknown> | unknown }> = [];
    const push = (label: string, description: string, run: () => Promise<unknown> | unknown) => {
      items.push({ label, description, run });
    };
    push('Local Changes', `${repo?.latest?.files.length ?? 0} changed files`, () => this.onDidWantViewEmitter.fire({ view: 'changes' }));
    push('All Commits', 'Commit history and graph', () => this.onDidWantViewEmitter.fire({ view: 'history' }));
    push('Fetch', 'Fetch all remotes', () => this.fetch(true));
    push('Pull', 'Pull the current branch', () => this.pull());
    push('Push', 'Push the current branch', () => this.push(false));
    push('Stash Changes', 'Stash the working tree', () => this.stashSave({ includeUntracked: true }));
    push('New Branch', 'Create and checkout a branch', () => this.createBranch());
    push('New Tag', 'Tag the current commit', () => this.createTag());
    push('Refresh', 'Reload repository state', () => this.refresh());
    push('Open Settings', 'ForkGit settings', () => vscode.commands.executeCommand('workbench.action.openSettings', 'forkgit'));

    const branches = repo?.latest?.branches ?? [];
    if (branches.length) {
      items.push({ label: 'Branches', kind: vscode.QuickPickItemKind.Separator, run: () => undefined } as any);
      for (const branch of branches) {
        push(
          branch.name,
          branch.current ? 'current branch' : `${branch.ahead ? `↑${branch.ahead} ` : ''}${branch.behind ? `↓${branch.behind}` : ''}`.trim(),
          () => this.checkoutBranch(branch.name)
        );
      }
    }
    if (this.repositories.length > 1) {
      items.push({ label: 'Repositories', kind: vscode.QuickPickItemKind.Separator, run: () => undefined } as any);
      for (const descriptor of this.descriptors()) {
        push(descriptor.name, descriptor.root, () => this.selectRepository(descriptor.root));
      }
    }

    const picked = await vscode.window.showQuickPick(items, {
      title: 'ForkGit Quick Launch',
      matchOnDescription: true,
      placeHolder: 'Search branches, commands and repositories'
    });
    if (picked) await picked.run();
  }

  async fileHistory(filePath: string): Promise<void> {
    const repo = this.requireActive();
    const result = await repo.cli.runSafe([
      'log',
      '--follow',
      '--max-count=200',
      '--date=short',
      '--format=%H%x1f%h%x1f%an%x1f%ad%x1f%s',
      '--',
      filePath
    ]);
    if (result.code !== 0) throw new Error(result.stderr.trim());
    const items: Array<vscode.QuickPickItem & { sha: string }> = result.stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [sha, short, author, date, subject] = line.split('\x1f');
        return {
          label: subject ?? short,
          description: `${short}  ${author}  ${date}`,
          sha: sha ?? ''
        };
      });
    if (!items.length) {
      void vscode.window.showInformationMessage('No history for this file.');
      return;
    }
    const picked = await vscode.window.showQuickPick(items, {
      title: `History — ${filePath}`,
      matchOnDescription: true
    });
    if (picked) {
      this.onDidWantViewEmitter.fire({ view: 'history' });
      this.onDidFocusCommitEmitter.fire(picked.sha);
    }
  }

  private readonly onDidFocusCommitEmitter = new vscode.EventEmitter<string>();
  readonly onDidFocusCommit = this.onDidFocusCommitEmitter.event;

  async blame(filePath: string): Promise<void> {
    const repo = this.requireActive();
    const result = await repo.cli.runSafe(['blame', '--line-porcelain', '--', filePath], {
      maxBuffer: 64 * 1024 * 1024
    });
    if (result.code !== 0) throw new Error(result.stderr.trim() || 'Unable to run git blame.');
    const lines: string[] = [];
    let author = '';
    let time = 0;
    let sha = '';
    for (const line of result.stdout.split('\n')) {
      if (/^[0-9a-f]{40} /.test(line)) {
        sha = line.slice(0, 8);
      } else if (line.startsWith('author ')) {
        author = line.slice(7);
      } else if (line.startsWith('author-time ')) {
        time = Number(line.slice(12)) * 1000;
      } else if (line.startsWith('\t')) {
        const date = new Date(time);
        const stamp = `${sha} ${author.slice(0, 14).padEnd(14)} ${date.toISOString().slice(0, 10)}`;
        lines.push(`${stamp} │ ${line.slice(1)}`);
      }
    }
    const content = lines.join('\n');
    const uri = vscode.Uri.from({ scheme: 'forkgit-blame', path: `/${filePath}`, query: `rev=${Date.now()}` });
    this.contentProvider.set(uri.toString(), content);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Active });
  }

  async openFile(filePath: string, sha?: string): Promise<void> {
    const repo = this.requireActive();
    if (sha) {
      const content = await repo.cli.buffer(['show', `${sha}:${filePath}`]);
      const uri = vscode.Uri.from({ scheme: 'forkgit-blob', path: `/${filePath}`, query: `rev=${sha}` });
      this.contentProvider.set(uri.toString(), content);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: true });
      return;
    }
    const uri = vscode.Uri.file(path.join(repo.root, filePath));
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: true });
  }

  async showInFolder(filePath: string): Promise<void> {
    const repo = this.requireActive();
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(path.join(repo.root, filePath)));
  }

  async addToGitignore(paths: string[]): Promise<void> {
    await this.run('Updating .gitignore', (repo) => repo.addToGitignore(paths));
  }

  async menuAction(action: MenuAction, payload?: Record<string, unknown>): Promise<void> {
    switch (action) {
      case 'stashSave':
        await this.stashSave({});
        break;
      case 'stashSaveUntracked':
        await this.stashSave({ includeUntracked: true });
        break;
      case 'stashStaged':
        await this.stashSave({ stagedOnly: true });
        break;
      case 'stashApply':
        await this.stashApply(Number(payload?.index ?? 0), false);
        break;
      case 'stashPop':
        await this.stashApply(Number(payload?.index ?? 0), true);
        break;
      case 'stashDrop':
        await this.stashDrop(Number(payload?.index ?? 0));
        break;
      case 'fetch':
        await this.fetch(true);
        break;
      case 'newBranch':
        await this.createBranch();
        break;
      case 'newTag':
        await this.createTag();
        break;
      case 'checkoutBranch': {
        const name = payload?.name ? String(payload.name) : await this.pickBranch('Checkout branch');
        if (!name) break;
        await this.checkoutBranch(name);
        break;
      }
      case 'renameBranch':
        await this.renameBranch(undefined, payload?.name ? String(payload.name) : undefined);
        break;
      case 'deleteBranch': {
        const name = payload?.name ? String(payload.name) : await this.pickBranch('Delete branch');
        if (!name) break;
        await this.deleteBranch(name, Boolean(payload?.remote), false);
        break;
      }
      case 'mergeBranch':
        await this.mergeBranch(payload?.name ? String(payload.name) : undefined);
        break;
      case 'rebaseBranch':
        await this.rebaseBranch(payload?.name ? String(payload.name) : undefined);
        break;
      case 'pushBranch':
        await this.pushBranch(payload?.name ? String(payload.name) : undefined);
        break;
      case 'setUpstream':
        await this.setUpstream();
        break;
      case 'pushTag':
        if (payload?.name) await this.pushTag(String(payload.name));
        break;
      case 'deleteTag':
        if (payload?.name) await this.deleteTag(String(payload.name));
        break;
      case 'submoduleOpen':
        if (payload?.path) await this.submoduleOpen(String(payload.path));
        break;
      case 'submoduleUpdate':
        if (payload?.path) await this.submoduleUpdate(String(payload.path), Boolean(payload?.init));
        break;
      case 'createBranchFrom':
        await this.createBranch(undefined, payload?.from ? String(payload.from) : undefined, true);
        break;
      case 'createTagAt':
        await this.createTag(undefined, undefined, payload?.sha ? String(payload.sha) : undefined);
        break;
      case 'openFinder': {
        const repo = this.requireActive();
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(repo.root));
        break;
      }
      case 'openTerminal': {
        const repo = this.requireActive();
        const terminal = vscode.window.createTerminal({ cwd: repo.root, name: `Git — ${repo.name}` });
        terminal.show();
        break;
      }
      case 'openNewWindow': {
        const repo = this.requireActive();
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(repo.root), true);
        break;
      }
      case 'copyPath': {
        const repo = this.requireActive();
        await vscode.env.clipboard.writeText(payload?.path ? String(payload.path) : repo.root);
        break;
      }
      case 'feedback':
        await vscode.env.openExternal(vscode.Uri.parse('https://github.com/parkerzhai/VSCodeGitExtension/issues'));
        break;
      case 'settings':
        await vscode.commands.executeCommand('workbench.action.openSettings', 'forkgit');
        break;
      case 'refresh':
        await this.refresh();
        break;
      case 'about':
        await vscode.window.showInformationMessage(
          'ForkGit — Fork-level Git inside VS Code. Version 0.1.0.'
        );
        break;
      default:
        break;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Virtual documents                                                   */
  /* ------------------------------------------------------------------ */

  private readonly contentProvider = new (class implements vscode.TextDocumentContentProvider {
    private readonly contents = new Map<string, string | Uint8Array>();
    private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this.emitter.event;
    set(key: string, value: string | Uint8Array): void {
      this.contents.set(key, value);
      try {
        this.emitter.fire(vscode.Uri.parse(key));
      } catch {
        // ignore
      }
    }
    provideTextDocumentContent(uri: vscode.Uri): string {
      const value = this.contents.get(uri.toString());
      if (value === undefined) return '';
      if (typeof value === 'string') return value;
      return Buffer.from(value).toString('utf8');
    }
  })();

  registerProviders(): vscode.Disposable[] {
    return [
      vscode.workspace.registerTextDocumentContentProvider('forkgit-blame', this.contentProvider),
      vscode.workspace.registerTextDocumentContentProvider('forkgit-blob', this.contentProvider)
    ];
  }

  dispose(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (this.autoFetchTimer) clearInterval(this.autoFetchTimer);
    for (const disposable of this.apiRepoSubscriptions.values()) disposable.dispose();
    this.apiRepoSubscriptions.clear();
    this.apiOpenSubscription?.dispose();
    this.onDidChangeEmitter.dispose();
    this.onDidBusyEmitter.dispose();
    this.onDidWantViewEmitter.dispose();
    this.onDidFocusCommitEmitter.dispose();
    for (const disposable of this.disposables) disposable.dispose();
  }
}
