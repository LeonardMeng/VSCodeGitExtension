import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { AppConfig, FromWebviewMessage, InitPayload, ToWebviewMessage, WebviewView } from '../protocol/types';
import { GitService } from '../git/GitService';

export class MainPanel implements vscode.Disposable {
  static readonly viewType = 'forkgit.main';
  private static current: MainPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private ready = false;
  private view: WebviewView = 'changes';
  private initialSection?: string;
  private pendingFocusCommit?: string;

  private constructor(
    private panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly service: GitService
  ) {
    this.panel.webview.html = this.getHtml(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      (message: FromWebviewMessage) => {
        void this.handleMessage(message);
      },
      undefined,
      this.disposables
    );

    this.disposables.push(
      this.service.onDidChange((payload) => {
        this.post({
          type: 'state',
          state: payload.state,
          repos: payload.repos,
          activeRepo: payload.activeRepo
        });
        if (!payload.state) {
          this.post({
            type: 'init',
            payload: this.initPayload()
          });
        }
      }),
      this.service.onDidBusy(({ busy, label }) => {
        this.post({ type: 'busy', busy, label });
      }),
      this.service.onDidProgress((progress) => {
        this.post({ type: 'progress', progress });
      }),
      this.service.onDidWantView(({ view, section }) => {
        this.view = view;
        this.reveal();
        this.post({ type: 'view', view, section: section as any });
      }),
      this.service.onDidFocusCommit((sha) => {
        if (!this.ready) {
          this.pendingFocusCommit = sha;
          return;
        }
        this.post({ type: 'focusCommit', sha });
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('forkgit')) {
          this.post({ type: 'config', config: this.service.config });
        }
      }),
      this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables)
    );
  }

  static createOrShow(
    context: vscode.ExtensionContext,
    service: GitService,
    view: WebviewView = 'changes',
    section?: string
  ): MainPanel {
    if (MainPanel.current) {
      MainPanel.current.view = view;
      MainPanel.current.reveal();
      if (MainPanel.current.ready) {
        MainPanel.current.post({ type: 'view', view, section: section as any });
      }
      return MainPanel.current;
    }
    const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'media');
    const panel = vscode.window.createWebviewPanel(
      MainPanel.viewType,
      'Git',
      { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [mediaRoot]
      }
    );
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');
    const instance = new MainPanel(panel, context, service);
    instance.view = view;
    instance.initialSection = section;
    MainPanel.current = instance;
    return instance;
  }

  static revive(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, service: GitService): MainPanel {
    const instance = new MainPanel(panel, context, service);
    MainPanel.current = instance;
    return instance;
  }

  get webviewPanel(): vscode.WebviewPanel {
    return this.panel;
  }

  reveal(): void {
    this.panel.reveal(undefined, false);
  }

  setView(view: WebviewView, section?: string): void {
    this.view = view;
    this.post({ type: 'view', view, section: section as any });
  }

  private initPayload(): InitPayload {
    const payload = this.service.statePayload();
    return {
      state: payload.state,
      repos: payload.repos,
      activeRepo: payload.activeRepo,
      config: this.service.config,
      view: this.view
    };
  }

  private post(message: ToWebviewMessage): void {
    if (!this.panel) return;
    void this.panel.webview.postMessage(message);
  }

  private async handleMessage(message: FromWebviewMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'ready':
          this.ready = true;
          this.post({ type: 'init', payload: this.initPayload() });
          if (this.initialSection) {
            this.post({ type: 'view', view: this.view, section: this.initialSection as any });
            this.initialSection = undefined;
          }
          if (this.pendingFocusCommit) {
            this.post({ type: 'focusCommit', sha: this.pendingFocusCommit });
            this.pendingFocusCommit = undefined;
          }
          return;
        case 'refresh':
          await this.service.refresh();
          return;
        case 'selectRepo':
          await this.service.selectRepository(message.root);
          return;
        case 'openRepository':
          await this.service.openRepositoryDialog();
          return;
        case 'setView':
          this.view = message.view;
          return;
        case 'focusSection':
          return;
        case 'getDiff': {
          try {
            const diff = await this.service.getDiff(message.scope, message.options);
            this.post({ type: 'diff', requestId: message.requestId, diff });
          } catch (err) {
            this.post({
              type: 'diffError',
              requestId: message.requestId,
              error: err instanceof Error ? err.message : String(err)
            });
          }
          return;
        }
        case 'applyDiff':
          await this.service.applyDiff(
            message.scope,
            message.hunkIndex,
            message.lineIndexes,
            message.action,
            message.options,
            message.hunkHeader
          );
          return;
        case 'stageFiles':
          await this.service.stageFiles(message.paths);
          return;
        case 'unstageFiles':
          await this.service.unstageFiles(message.paths);
          return;
        case 'discardFiles':
          await this.service.discardFiles(message.paths);
          return;
        case 'openFile':
          await this.service.openFile(message.path, message.sha);
          return;
        case 'showInFolder':
          await this.service.showInFolder(message.path);
          return;
        case 'addToGitignore':
          await this.service.addToGitignore(message.paths);
          return;
        case 'fileHistory':
          await this.service.fileHistory(message.path);
          return;
        case 'blame':
          await this.service.blame(message.path);
          return;
        case 'commit':
          await this.service.commit(message.subject, message.description, message.amend);
          return;
        case 'loadCommitMessage': {
          const repo = this.service.requireActive();
          const result = await repo.loadCommitMessage(message.amend);
          this.post({
            type: 'commitMessage',
            subject: result.subject,
            description: result.description
          });
          return;
        }
        case 'getHistory': {
          const page = await this.service.getHistory({
            offset: message.offset,
            limit: message.limit,
            ref: message.ref,
            search: message.search
          });
          this.post({ type: 'history', requestId: message.requestId, page });
          return;
        }
        case 'getCommitDetail': {
          const detail = await this.service.getCommitDetail(message.sha);
          this.post({ type: 'commitDetail', requestId: message.requestId, detail });
          return;
        }
        case 'getCommitFileDiff': {
          const diff = await this.service.getCommitFileDiff(
            message.sha,
            message.path,
            message.options,
            message.oldPath,
            message.parentIndex ?? 0
          );
          this.post({ type: 'commitFileDiff', requestId: message.requestId, diff });
          return;
        }
        case 'getFileTree': {
          const result = await this.service.getFileTree(message.sha, message.path);
          this.post({
            type: 'fileTree',
            requestId: message.requestId,
            sha: message.sha,
            entries: result.entries,
            truncated: result.truncated
          });
          return;
        }
        case 'commitAction':
          await this.service.commitAction(message.sha, message.action, message.parentIndex ?? 0);
          return;
        case 'checkoutBranch':
          await this.service.checkoutBranch(message.name, message.remote);
          return;
        case 'createBranch':
          await this.service.createBranch(message.name, message.from, message.checkout ?? true);
          return;
        case 'deleteBranch':
          await this.service.deleteBranch(message.name, message.remote ?? false, message.force ?? false);
          return;
        case 'renameBranch':
          await this.service.renameBranch(message.name);
          return;
        case 'mergeBranch':
          await this.service.mergeBranch(message.name);
          return;
        case 'rebaseBranch':
          await this.service.rebaseBranch(message.name);
          return;
        case 'pushBranch':
          await this.service.pushBranch(message.name, message.force ?? false);
          return;
        case 'setUpstream':
          await this.service.setUpstream(message.branch);
          return;
        case 'fetch':
          await this.service.fetch(message.all ?? true);
          return;
        case 'pull':
          await this.service.pull();
          return;
        case 'push':
          await this.service.push(message.force ?? false);
          return;
        case 'stashSave':
          await this.service.stashSave({
            message: message.message,
            includeUntracked: message.includeUntracked,
            stagedOnly: message.stagedOnly
          });
          return;
        case 'stashApply':
          await this.service.stashApply(message.index, message.pop ?? false);
          return;
        case 'stashDrop':
          await this.service.stashDrop(message.index);
          return;
        case 'stashPreview': {
          const files = await this.service.stashPreview(message.index);
          this.post({
            type: 'stashPreview',
            requestId: message.requestId,
            index: message.index,
            files,
            error: files ? undefined : 'Unable to read the stash.'
          });
          return;
        }
        case 'createTag':
          await this.service.createTag(message.name, message.message, message.sha);
          return;
        case 'deleteTag':
          await this.service.deleteTag(message.name, message.remote);
          return;
        case 'pushTag':
          await this.service.pushTag(message.name);
          return;
        case 'submoduleUpdate':
          await this.service.submoduleUpdate(message.path, message.init ?? true);
          return;
        case 'submoduleOpen':
          await this.service.submoduleOpen(message.path);
          return;
        case 'menuAction':
          await this.service.menuAction(message.action, message.payload);
          return;
        case 'copyToClipboard':
          await vscode.env.clipboard.writeText(message.text);
          return;
        case 'showQuickLaunch':
          await this.service.quickLaunch();
          return;
        case 'openUrl':
          await vscode.env.openExternal(vscode.Uri.parse(message.url));
          return;
        case 'getRecentCommitMessages': {
          const repo = this.service.active;
          this.post({ type: 'recentCommits', messages: repo?.getRecentMessages() ?? [] });
          return;
        }
        case 'showMessage': {
          const text = `ForkGit: ${message.message}`;
          if (message.level === 'error') void vscode.window.showErrorMessage(text);
          else if (message.level === 'warn') void vscode.window.showWarningMessage(text);
          else void vscode.window.showInformationMessage(text);
          return;
        }
        default:
          return;
      }
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      if ('requestId' in message && typeof (message as { requestId?: number }).requestId === 'number') {
        this.post({ type: 'requestError', requestId: (message as { requestId: number }).requestId, error: text });
      }
      this.post({ type: 'toast', level: 'error', message: text });
      this.post({ type: 'busy', busy: false });
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const mediaRoot = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'webview', 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'webview', 'main.css'));
    const nonce = getNonce();
    const exists = fs.existsSync(
      path.join(this.context.extensionUri.fsPath, 'media', 'webview', 'main.js')
    );
    if (!exists) {
      return `<!DOCTYPE html><html><body style="font-family: var(--vscode-font-family); padding: 24px;">
        <h2>ForkGit webview is not built</h2>
        <p>Run <code>npm run build</code> in the extension folder, then reopen this panel.</p>
      </body></html>`;
    }
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource} data:;" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>ForkGit</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose(): void {
    MainPanel.current = undefined;
    this.panel.dispose();
    for (const disposable of this.disposables) disposable.dispose();
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
