# Changelog

## 0.1.0

### Added

- Fork-style Git panel with a responsive internal sidebar (branches, remotes, tags, stashes, submodules), changed-file tree, diff viewer and commit box.
- Branch grouping by `/`, ahead/behind counts, checkout (local and remote tracking), create, rename, delete, merge, rebase, push, force push with lease and upstream configuration.
- Staged / unstaged file lists with tree and flat modes, multi-select, drag-and-drop, stage / unstage / discard and context menus.
- Hunk-level and line-level staging, unstaging and discarding. Patches are applied directly to index/worktree text and written with `git hash-object` + `git update-index`, so partial staging also works when the index already contains changes.
- Unified and side-by-side diffs, word-level highlighting, whitespace and line-ending display, wrap, context-line controls, full-file mode, hunk navigation and a minimap.
- All Commits view with a colored SVG commit graph, reference badges, HEAD-relative dimming, search and incremental loading with virtual scrolling.
- Commit detail panel with Commit / Changes / File Tree tabs, per-parent comparison and file-level open / history / blame actions.
- Stash save (untracked / staged-only), preview, apply, pop and drop; autostash on checkout, pull, merge and rebase.
- Lightweight and annotated tags (create, push, delete, checkout), submodule listing and update/open.
- Multi-repository tabs, Activity Bar navigator, status bar, Quick Launch, deep links and VS Code command / menu integration.
- Mock browser preview (`npm run dev:web`) for UI development.
- Vitest tests for parsers, patches and graph layout; real temporary-repository integration tests; `@vscode/test-electron` extension host test.
