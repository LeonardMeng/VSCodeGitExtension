import * as vscode from 'vscode';
import { GitService } from './git/GitService';
import { MainPanel } from './panels/MainPanel';
import { NavigatorTreeProvider } from './views/NavigatorTree';
import { SidebarSection } from './protocol/types';

let service: GitService | undefined;
let statusBar: vscode.StatusBarItem | undefined;
let treeProvider: NavigatorTreeProvider | undefined;

function sectionToView(section: SidebarSection): 'changes' | 'history' {
  return section === 'commits' ? 'history' : 'changes';
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  service = new GitService(context);
  try {
    await service.initialize();
  } catch (err) {
    console.error('[ForkGit] initialize failed', err);
  }

  context.subscriptions.push(service);
  context.subscriptions.push(...service.registerProviders());

  treeProvider = new NavigatorTreeProvider(service);
  const treeView = vscode.window.createTreeView('forkgit.navigator', {
    treeDataProvider: treeProvider,
    showCollapseAll: false
  });
  context.subscriptions.push(treeView);

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'forkgit.open';
  context.subscriptions.push(statusBar);

  const updateChrome = () => {
    const state = service?.active?.latest;
    if (treeProvider) treeProvider.refresh();
    if (!statusBar) return;
    if (!state) {
      statusBar.hide();
      void vscode.commands.executeCommand('setContext', 'forkgit.hasRepository', false);
      return;
    }
    const branch = state.repo.head ?? `detached@${state.repo.headSha?.slice(0, 7) ?? '?'}`;
    const changes = state.files.length;
    statusBar.text = `$(git-branch) ${branch}${state.repo.ahead ? ` $(arrow-up)${state.repo.ahead}` : ''}${state.repo.behind ? ` $(arrow-down)${state.repo.behind}` : ''}${changes ? ` $(diff)${changes}` : ''}`;
    statusBar.tooltip = new vscode.MarkdownString(
      [
        `**${state.repo.name}**`,
        `Branch: \`${branch}\``,
        state.repo.upstream ? `Upstream: \`${state.repo.upstream}\`` : 'No upstream configured',
        `${changes} changed file${changes === 1 ? '' : 's'}`,
        state.operationLabel ? `⚠ ${state.operationLabel} in progress` : '',
        '',
        `_${state.repo.root}_`
      ]
        .filter(Boolean)
        .join('\n\n')
    );
    statusBar.show();
    void vscode.commands.executeCommand('setContext', 'forkgit.hasRepository', true);
  };

  context.subscriptions.push(service.onDidChange(updateChrome));
  context.subscriptions.push(
    service.onDidProgress((progress) => {
      if (!statusBar) return;
      if (!progress) {
        updateChrome();
        return;
      }
      statusBar.text = `$(sync~spin) ${progress.label}${
        progress.percent === null ? '' : ` ${progress.percent}%`
      }`;
      statusBar.tooltip = progress.detail;
      statusBar.show();
    })
  );
  context.subscriptions.push(
    service.onDidWantView(({ view, section }) => {
      MainPanel.createOrShow(context, service!, view, section);
    })
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration('forkgit.gitPath')) {
        await service?.reconfigureGitPath();
        updateChrome();
      }
      if (event.affectsConfiguration('forkgit.fetch.autoInterval')) {
        service?.applyAutoFetch();
      }
    })
  );
  updateChrome();

  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri(uri: vscode.Uri) {
        const params = new URLSearchParams(uri.query);
        const section = (params.get('section') ?? undefined) as SidebarSection | undefined;
        const view = section ? sectionToView(section) : 'changes';
        MainPanel.createOrShow(context, service!, view, section);
      }
    }),
    vscode.commands.registerCommand('forkgit.open', () => {
      MainPanel.createOrShow(context, service!);
    }),
    vscode.commands.registerCommand('forkgit.quickLaunch', () => service?.quickLaunch()),
    vscode.commands.registerCommand('forkgit.fetch', () => service?.fetch(true)),
    vscode.commands.registerCommand('forkgit.pull', () => service?.pull()),
    vscode.commands.registerCommand('forkgit.push', () => service?.push(false)),
    vscode.commands.registerCommand('forkgit.stash', () =>
      service?.stashSave({ includeUntracked: true })
    ),
    vscode.commands.registerCommand('forkgit.createBranch', () => service?.createBranch()),
    vscode.commands.registerCommand('forkgit.refresh', async () => {
      await service?.refresh();
      treeProvider?.refresh();
    }),
    vscode.commands.registerCommand('forkgit.openRepository', () => service?.openRepositoryDialog()),
    vscode.commands.registerCommand('forkgit.showHistory', () => {
      MainPanel.createOrShow(context, service!, 'history');
    }),
    vscode.commands.registerCommand('forkgit.openChanges', () => {
      MainPanel.createOrShow(context, service!, 'changes');
    }),
    vscode.commands.registerCommand(
      'forkgit.openSection',
      async (section?: SidebarSection, root?: string) => {
        if (root) await service?.selectRepository(root);
        if (!section) {
          MainPanel.createOrShow(context, service!, 'changes');
          return;
        }
        MainPanel.createOrShow(context, service!, sectionToView(section), section);
      }
    ),
    vscode.commands.registerCommand('forkgit.selectRepository', async (root: string) => {
      await service?.selectRepository(root);
      MainPanel.createOrShow(context, service!, 'changes');
    }),
    vscode.window.registerWebviewPanelSerializer(MainPanel.viewType, {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel) {
        MainPanel.revive(panel, context, service!);
      }
    })
  );

  // Refresh when files change in the workspace. A short debounce keeps git
  // status calls cheap while editing large projects.
  let refreshTimer: NodeJS.Timeout | undefined;
  const scheduleRefresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      void service?.refresh();
    }, 900);
  };
  const watcher = vscode.workspace.createFileSystemWatcher('**/*');
  context.subscriptions.push(
    watcher,
    watcher.onDidChange(scheduleRefresh),
    watcher.onDidCreate(scheduleRefresh),
    watcher.onDidDelete(scheduleRefresh),
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused) scheduleRefresh();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      await service?.initialize();
      treeProvider?.refresh();
    })
  );

  context.subscriptions.push({
    dispose: () => {
      if (refreshTimer) clearTimeout(refreshTimer);
    }
  });
}

export function deactivate(): void {
  statusBar?.dispose();
  service?.dispose();
  service = undefined;
}
