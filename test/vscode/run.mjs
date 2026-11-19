import { runTests } from '@vscode/test-electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ensureDemoRepository } from './fixture.mjs';

delete process.env.ELECTRON_RUN_AS_NODE;

const projectRoot = process.cwd();
const workspace = path.join(projectRoot, '.vscode-test', 'demo');
const extensionTestsPath = path.join(projectRoot, '.vscode-test', 'out', 'suite.js');

if (!fs.existsSync(path.join(projectRoot, 'media', 'webview', 'main.js'))) {
  console.error('Build the webview first: npm run build');
  process.exit(1);
}

ensureDemoRepository(workspace);

runTests({
  version: '1.95.3',
  extensionDevelopmentPath: projectRoot,
  extensionTestsPath,
  launchArgs: [
    `--folder-uri=${pathToFileURL(workspace).href}`,
    '--disable-workspace-trust',
    '--disable-telemetry',
    '--disable-updates',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-gpu',
    '--remote-debugging-port=9333'
  ]
})
  .then(() => {
    console.log('VS Code integration tests passed');
  })
  .catch((error) => {
    console.error('VS Code integration tests failed:', error);
    process.exit(1);
  });
