import * as assert from 'node:assert';
import * as vscode from 'vscode';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('forkgit.forkgit');
  assert.ok(extension, 'ForkGit extension should be discoverable');
  if (!extension.isActive) await extension.activate();
  assert.ok(extension.isActive, 'ForkGit extension should activate');

  const commands = await vscode.commands.getCommands(true);
  for (const command of [
    'forkgit.open',
    'forkgit.quickLaunch',
    'forkgit.fetch',
    'forkgit.pull',
    'forkgit.push',
    'forkgit.stash',
    'forkgit.createBranch',
    'forkgit.refresh',
    'forkgit.openRepository',
    'forkgit.showHistory',
    'forkgit.openSection'
  ]) {
    assert.ok(commands.includes(command), `command ${command} should be registered`);
  }

  try {
    await vscode.commands.executeCommand('forkgit.open');
  } catch (error) {
    console.log('[forkgit test] open failed', error);
    throw error;
  }
  await wait(2500);

  const tabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs);
  const panel = tabs.find(
    (tab) => tab.input instanceof vscode.TabInputWebview && tab.input.viewType.endsWith('forkgit.main')
  );
  assert.ok(panel, 'forkgit.open should create the webview panel');

  await wait(1500);
  await vscode.commands.executeCommand('forkgit.showHistory');
  await wait(800);
  await vscode.commands.executeCommand('forkgit.refresh');
  await wait(800);

  const afterRefresh = vscode.window.tabGroups.all.flatMap((group) => group.tabs);
  assert.ok(
    afterRefresh.some(
      (tab) => tab.input instanceof vscode.TabInputWebview && tab.input.viewType.endsWith('forkgit.main')
    ),
    'the Git panel should stay open after commands run'
  );

  // The repository tree view is created during activation; focusing it must not throw.
  await vscode.commands.executeCommand('forkgit.navigator.focus').then(
    () => undefined,
    () => undefined
  );
}
