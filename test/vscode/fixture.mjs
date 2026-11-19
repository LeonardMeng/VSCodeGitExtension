import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

function git(cwd, args) {
  execFileSync('git', args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'ForkGit Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'ForkGit Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      GIT_TERMINAL_PROMPT: '0'
    }
  });
}

/** Creates a disposable Git repository used by the VS Code extension host test. */
export function ensureDemoRepository(root) {
  if (fs.existsSync(path.join(root, '.git'))) return root;
  fs.mkdirSync(path.join(root, 'code', 'Assets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'README.md'), '# ForkGit test repository\n');
  const file = path.join(root, 'code', 'Assets', 'AOTGenericReferences.cs');
  fs.writeFileSync(
    file,
    ['using System;', '', 'public class AOTGenericReferences', '{', '    // System.dll', '}'].join('\n') + '\n'
  );
  fs.writeFileSync(path.join(root, 'code', 'Assets', 'link.xml'), '<linker>\n</linker>\n');
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.name', 'ForkGit Test']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'Initial commit']);
  git(root, ['branch', 'feature/login']);
  git(root, ['checkout', '-qb', 'feature/postgresql']);
  const updated = fs
    .readFileSync(file, 'utf8')
    .replace('    // System.dll\n', '    // System.dll\n    // UniWebView-CSharp.dll\n');
  fs.writeFileSync(file, updated);
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'Update - marketplace trading for mining pets']);
  git(root, ['stash', 'push', '-qm', 'WIP: fixture changes']);
  fs.appendFileSync(file, '// local work in progress\n');
  fs.writeFileSync(path.join(root, 'code', 'Assets', 'NewFile.cs'), 'public class NewFile { }\n');
  return root;
}
