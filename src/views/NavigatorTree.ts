import * as vscode from 'vscode';
import { GitService } from '../git/GitService';

type Section = 'local' | 'commits' | 'branches' | 'remotes' | 'tags' | 'stashes' | 'submodules';

interface NavigatorItem {
  kind: 'repo' | 'section';
  root?: string;
  section?: Section;
  label: string;
  description?: string;
  icon?: string;
}

export class NavigatorTreeProvider implements vscode.TreeDataProvider<NavigatorItem> {
  private readonly emitter = new vscode.EventEmitter<NavigatorItem | undefined | null | void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly service: GitService) {}

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(item: NavigatorItem): vscode.TreeItem {
    if (item.kind === 'repo') {
      const repo = this.service.repositories.find((entry) => entry.root === item.root);
      const state = repo?.latest;
      const current = item.root === this.service.activeRepoRoot;
      const treeItem = new vscode.TreeItem(
        item.label,
        this.service.repositories.length > 1
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.None
      );
      treeItem.id = `repo:${item.root}`;
      treeItem.description = state?.repo.head ?? '';
      treeItem.iconPath = new vscode.ThemeIcon(current ? 'repo' : 'repo');
      if (this.service.repositories.length === 1) {
        treeItem.command = {
          command: 'forkgit.open',
          title: 'Open Git Panel'
        };
      } else {
        treeItem.command = {
          command: 'forkgit.selectRepository',
          title: 'Select Repository',
          arguments: [item.root]
        };
      }
      treeItem.contextValue = 'forkgit.repo';
      return treeItem;
    }

    const treeItem = new vscode.TreeItem(item.label, vscode.TreeItemCollapsibleState.None);
    treeItem.description = item.description;
    treeItem.iconPath = item.icon ? new vscode.ThemeIcon(item.icon) : undefined;
    treeItem.id = `${item.root}:${item.section}`;
    treeItem.command = {
      command: 'forkgit.openSection',
      title: item.label,
      arguments: [item.section, item.root]
    };
    treeItem.contextValue = 'forkgit.section';
    return treeItem;
  }

  getChildren(element?: NavigatorItem): NavigatorItem[] {
    if (!this.service.repositories.length) return [];

    if (!element) {
      if (this.service.repositories.length === 1) {
        return this.sectionsFor(this.service.repositories[0].root, this.service.repositories[0].name);
      }
      return this.service.repositories.map((repo) => ({
        kind: 'repo' as const,
        root: repo.root,
        label: repo.name
      }));
    }

    if (element.kind === 'repo' && element.root) {
      return this.sectionsFor(element.root, element.label);
    }
    return [];
  }

  private sectionsFor(root: string, _repoName: string): NavigatorItem[] {
    const repo = this.service.repositories.find((entry) => entry.root === root);
    const state = repo?.latest;
    const fileCount = state?.files.length ?? 0;
    const staged = state?.files.filter((file) => file.staged).length ?? 0;
    const branches = state?.branches.length ?? 0;
    const remotes = state?.remotes.reduce((sum, group) => sum + group.branches.length, 0) ?? 0;
    const tags = state?.tags.length ?? 0;
    const stashes = state?.stashes.length ?? 0;
    const submodules = state?.submodules.length ?? 0;
    const current = state?.repo.head;
    return [
      {
        kind: 'section',
        root,
        section: 'local',
        label: 'Local Changes',
        description: fileCount ? `${fileCount}${staged ? ` · ${staged} staged` : ''}` : 'clean',
        icon: fileCount ? 'diff' : 'check'
      },
      {
        kind: 'section',
        root,
        section: 'commits',
        label: 'All Commits',
        description: current ?? '',
        icon: 'git-commit'
      },
      {
        kind: 'section',
        root,
        section: 'branches',
        label: 'Branches',
        description: String(branches),
        icon: 'git-branch'
      },
      {
        kind: 'section',
        root,
        section: 'remotes',
        label: 'Remotes',
        description: String(remotes),
        icon: 'cloud'
      },
      {
        kind: 'section',
        root,
        section: 'tags',
        label: 'Tags',
        description: String(tags),
        icon: 'tag'
      },
      {
        kind: 'section',
        root,
        section: 'stashes',
        label: 'Stashes',
        description: String(stashes),
        icon: 'archive'
      },
      {
        kind: 'section',
        root,
        section: 'submodules',
        label: 'Submodules',
        description: String(submodules),
        icon: 'package'
      }
    ];
  }
}
