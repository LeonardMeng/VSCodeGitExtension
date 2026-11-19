# Changelog

## 0.2.0

- Added a visible progress bar with percentages for fetch, pull and push. Git stderr progress is parsed incrementally, mapped to an overall percentage, and mirrored to the webview, status bar and VS Code notification.
- Added `push N` / `pull N` counters to every local branch in the sidebar, relative to its upstream. Branches without an upstream are marked, and upstream configuration now works for any branch from its context menu.
- Added progress parser and real `git push --progress` streaming tests.
- Updated the README screenshots for branch counters and operation progress.

## 0.1.1

- Fixed a misleading `Git executable not found: git` error when the actual problem was a repository folder that had been moved or deleted. ForkGit now validates the working directory first and reports `Repository folder not found`.
- Improved the missing-Git error with a direct hint to set `forkgit.gitPath` or fix `PATH`.
- Added common macOS Git locations (`/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`) to the child process `PATH`, and support for `~` in `forkgit.gitPath`.
- Stale repositories whose folders no longer exist are now pruned instead of being refreshed repeatedly.
- Added regression tests and a Troubleshooting section to the README.
- Test repositories now live in the OS temporary directory, so running the test suite no longer creates repositories inside the open workspace.

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
- Clear diagnostics for missing Git installations and missing repository folders, plus fallback PATH entries for common macOS Git locations.
- Vitest tests for parsers, patches and graph layout; real temporary-repository integration tests; `@vscode/test-electron` extension host test.
