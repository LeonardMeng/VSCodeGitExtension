/**
 * Shared data model between the extension host and the webview.
 * Keep this file dependency-free so it can be imported from both sides.
 */

export type StatusCode = 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | 'T' | '?' | '!';

export interface Person {
  name: string;
  email: string;
  date: number;
}

export interface RepositoryInfo {
  root: string;
  name: string;
  /** Branch short name, or "HEAD" when detached. */
  head: string | null;
  headSha: string | null;
  detached: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  remotes: string[];
  hasChanges: boolean;
  /** merge / rebase / cherry-pick / revert / bisect when an operation is in progress. */
  operation: string | null;
  gitVersion: string;
  submoduleCount: number;
}

export interface BranchInfo {
  /** Short name without the remote prefix, e.g. "feature/login". */
  name: string;
  /** Fully qualified short name, e.g. "origin/feature/login". */
  fullName: string;
  remote: string | null;
  isRemote: boolean;
  current: boolean;
  sha: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  subject: string;
  author: string;
  updatedAt: number;
}

export interface RemoteGroup {
  name: string;
  url: string | null;
  branches: BranchInfo[];
}

export interface TagInfo {
  name: string;
  sha: string;
  annotated: boolean;
  message: string | null;
  updatedAt: number;
}

export interface StashEntry {
  index: number;
  ref: string;
  sha: string;
  message: string;
  branch: string | null;
  author: string;
  updatedAt: number;
}

export interface SubmoduleInfo {
  path: string;
  name: string;
  url: string | null;
  sha: string | null;
  description: string | null;
  status: 'clean' | 'modified' | 'uninitialized' | 'conflict';
  branch?: string | null;
}

export interface ChangeFile {
  path: string;
  oldPath?: string;
  /** Status in the index (staged side). */
  indexStatus?: StatusCode;
  /** Status in the working tree (unstaged side). */
  worktreeStatus?: StatusCode;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  ignored: boolean;
  conflicted: boolean;
  /** Status used for badges when shown in the staged list. */
  stagedBadge?: StatusCode;
  /** Status used for badges when shown in the unstaged list. */
  unstagedBadge?: StatusCode;
}

export interface RepoState {
  repo: RepositoryInfo;
  files: ChangeFile[];
  branches: BranchInfo[];
  remotes: RemoteGroup[];
  tags: TagInfo[];
  stashes: StashEntry[];
  submodules: SubmoduleInfo[];
  recentCommits: string[];
  busy: boolean;
  operationLabel: string | null;
  refreshedAt: number;
}

export interface RepoDescriptor {
  root: string;
  name: string;
  branch: string | null;
  dirty: boolean;
}

export interface AppConfig {
  changesViewMode: 'tree' | 'list';
  diffMode: 'unified' | 'split';
  contextLines: number;
  showWhitespace: boolean;
  wordWrap: boolean;
  groupByPrefix: boolean;
  pullRebase: boolean;
  autoStash: boolean;
  confirmDestructive: boolean;
  historyPageSize: number;
}

/* ------------------------------------------------------------------ */
/* Diffs                                                               */
/* ------------------------------------------------------------------ */

export type DiffLineKind = 'context' | 'add' | 'del';

export interface DiffLine {
  kind: DiffLineKind;
  oldLine: number | null;
  newLine: number | null;
  text: string;
  /** The line was followed by "\ No newline at end of file". */
  noNewline?: boolean;
}

export interface DiffHunk {
  index: number;
  header: string;
  section: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffImage {
  mime: string;
  oldDataUri?: string;
  newDataUri?: string;
  oldLabel?: string;
  newLabel?: string;
}

export interface FileDiff {
  path: string;
  oldPath?: string;
  status: StatusCode;
  binary: boolean;
  image?: DiffImage;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  /** True when the viewer may stage/unstage/discard hunks and lines. */
  editable: boolean;
  /** "staged" or "unstaged" for working-tree diffs. */
  side?: 'staged' | 'unstaged';
  tooLarge?: boolean;
  submodule?: boolean;
  modeChange?: string;
  error?: string;
  /** Commit / stash metadata for the header. */
  meta?: {
    sha?: string;
    subject?: string;
    author?: string;
    date?: number;
    stashIndex?: number;
    stashMessage?: string;
  };
}

export type DiffScope =
  | { kind: 'worktree'; path: string; oldPath?: string }
  | { kind: 'index'; path: string; oldPath?: string }
  | { kind: 'commit'; sha: string; path: string; oldPath?: string; parent?: string }
  | { kind: 'stash'; index: number }
  | { kind: 'stashFile'; index: number; path: string };

export interface DiffOptions {
  contextLines: number;
  ignoreWhitespace?: boolean;
  fullFile?: boolean;
}

/* ------------------------------------------------------------------ */
/* Operation progress                                                  */
/* ------------------------------------------------------------------ */

export type ProgressOperation = 'fetch' | 'pull' | 'push';

export interface OperationProgress {
  operation: ProgressOperation;
  label: string;
  /** Overall percentage, or null when Git has not reported a phase yet. */
  percent: number | null;
  detail: string;
}

/* ------------------------------------------------------------------ */
/* Commit history                                                      */
/* ------------------------------------------------------------------ */

export interface CommitRef {
  name: string;
  kind: 'local' | 'remote' | 'tag';
  remote?: string;
  current?: boolean;
  /** Local branch whose upstream is this ref, for sync badges. */
  upstream?: string | null;
}

export interface GraphEdge {
  lane: number;
  kind: 'first' | 'merge';
}

export interface GraphRow {
  lane: number;
  laneCount: number;
  /** Lanes entering this row that terminate in the node (merge convergence). */
  incoming: number[];
  /** Lanes leaving from the node towards its parents. */
  outgoing: GraphEdge[];
  /** Lanes passing straight through this row. */
  through: number[];
  /** Color index per lane. */
  colors: number[];
  node: 'commit' | 'merge' | 'root';
  /** First row of a page has no line entering from the top. */
  startsAtTop?: boolean;
}

export interface CommitSummary {
  sha: string;
  shortSha: string;
  parents: string[];
  author: Person;
  committer: Person;
  subject: string;
  body: string;
  refs: CommitRef[];
  /** Whether the commit is an ancestor of HEAD (used to dim other rows). */
  inHead: boolean;
  graph: GraphRow;
}

export interface HistoryPage {
  commits: CommitSummary[];
  offset: number;
  limit: number;
  hasMore: boolean;
  total: number | null;
  headSha: string | null;
  /** Ref used to produce the page, if the user clicked a branch. */
  baseRef: string | null;
  search: string | null;
}

export interface CommitFileEntry {
  path: string;
  oldPath?: string;
  status: StatusCode;
  additions: number;
  deletions: number;
  binary: boolean;
}

export interface CommitDetail {
  commit: CommitSummary;
  fullBody: string;
  files: CommitFileEntry[];
  branches: string[];
  tags: string[];
  additions: number;
  deletions: number;
}

export interface FileTreeEntry {
  path: string;
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
}

/* ------------------------------------------------------------------ */
/* Webview messages                                                    */
/* ------------------------------------------------------------------ */

export type WebviewView = 'changes' | 'history';

export type SidebarSection =
  | 'local'
  | 'commits'
  | 'branches'
  | 'remotes'
  | 'tags'
  | 'stashes'
  | 'submodules';

export type DiffAction = 'stage' | 'unstage' | 'discard';

export type CommitAction =
  | 'checkout'
  | 'cherryPick'
  | 'revert'
  | 'reset'
  | 'branchHere'
  | 'tagHere'
  | 'copySha'
  | 'copySubject'
  | 'compareWithWorktree';

export type MenuAction =
  | 'stashSave'
  | 'stashSaveUntracked'
  | 'stashStaged'
  | 'stashApply'
  | 'stashPop'
  | 'stashDrop'
  | 'fetch'
  | 'newBranch'
  | 'newTag'
  | 'checkoutBranch'
  | 'renameBranch'
  | 'deleteBranch'
  | 'mergeBranch'
  | 'rebaseBranch'
  | 'pushBranch'
  | 'setUpstream'
  | 'openFinder'
  | 'openTerminal'
  | 'openNewWindow'
  | 'copyPath'
  | 'feedback'
  | 'settings'
  | 'refresh'
  | 'about'
  | 'pushTag'
  | 'deleteTag'
  | 'submoduleOpen'
  | 'submoduleUpdate'
  | 'createBranchFrom'
  | 'createTagAt';

export interface InitPayload {
  state: RepoState | null;
  repos: RepoDescriptor[];
  activeRepo: string | null;
  config: AppConfig;
  view: WebviewView;
}

export type FromWebviewMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'selectRepo'; root: string }
  | { type: 'openRepository' }
  | { type: 'setView'; view: WebviewView; section?: SidebarSection }
  | { type: 'focusSection'; section: SidebarSection }
  | { type: 'getDiff'; requestId: number; scope: DiffScope; options: DiffOptions }
  | { type: 'applyDiff'; scope: DiffScope; hunkIndex: number; lineIndexes?: number[]; action: DiffAction; options: DiffOptions; hunkHeader?: string }
  | { type: 'stageFiles'; paths: string[] }
  | { type: 'unstageFiles'; paths: string[] }
  | { type: 'discardFiles'; paths: string[] }
  | { type: 'openFile'; path: string; sha?: string; oldPath?: string }
  | { type: 'showInFolder'; path: string }
  | { type: 'addToGitignore'; paths: string[] }
  | { type: 'fileHistory'; path: string; sha?: string }
  | { type: 'blame'; path: string }
  | { type: 'commit'; subject: string; description: string; amend: boolean }
  | { type: 'loadCommitMessage'; amend: boolean }
  | { type: 'getHistory'; requestId: number; offset: number; limit: number; ref?: string | null; search?: string | null }
  | { type: 'getCommitDetail'; requestId: number; sha: string }
  | { type: 'getCommitFileDiff'; requestId: number; sha: string; path: string; oldPath?: string; options: DiffOptions; parentIndex?: number }
  | { type: 'getFileTree'; requestId: number; sha: string; path?: string }
  | { type: 'commitAction'; sha: string; action: CommitAction; parentIndex?: number }
  | { type: 'checkoutBranch'; name: string; remote?: string }
  | { type: 'createBranch'; name?: string; from?: string; checkout?: boolean }
  | { type: 'deleteBranch'; name: string; remote?: boolean; force?: boolean }
  | { type: 'renameBranch'; name?: string }
  | { type: 'mergeBranch'; name?: string }
  | { type: 'rebaseBranch'; name?: string }
  | { type: 'pushBranch'; name?: string; force?: boolean }
  | { type: 'setUpstream'; branch?: string }
  | { type: 'fetch'; all?: boolean }
  | { type: 'pull' }
  | { type: 'push'; force?: boolean }
  | { type: 'stashSave'; message?: string; includeUntracked?: boolean; stagedOnly?: boolean }
  | { type: 'stashApply'; index: number; pop?: boolean }
  | { type: 'stashDrop'; index: number }
  | { type: 'stashPreview'; requestId: number; index: number }
  | { type: 'createTag'; name?: string; message?: string; sha?: string }
  | { type: 'deleteTag'; name: string; remote?: string }
  | { type: 'pushTag'; name: string }
  | { type: 'submoduleUpdate'; path: string; init?: boolean }
  | { type: 'submoduleOpen'; path: string }
  | { type: 'menuAction'; action: MenuAction; payload?: Record<string, unknown> }
  | { type: 'copyToClipboard'; text: string }
  | { type: 'showQuickLaunch' }
  | { type: 'openUrl'; url: string }
  | { type: 'getRecentCommitMessages' }
  | { type: 'showMessage'; level: 'info' | 'warn' | 'error'; message: string };

export type ToWebviewMessage =
  | { type: 'init'; payload: InitPayload }
  | { type: 'state'; state: RepoState | null; repos: RepoDescriptor[]; activeRepo: string | null }
  | { type: 'config'; config: AppConfig }
  | { type: 'diff'; requestId: number; diff: FileDiff }
  | { type: 'diffError'; requestId: number; error: string }
  | { type: 'requestError'; requestId: number; error: string }
  | { type: 'history'; requestId: number; page: HistoryPage }
  | { type: 'commitDetail'; requestId: number; detail: CommitDetail }
  | { type: 'commitFileDiff'; requestId: number; diff: FileDiff }
  | { type: 'fileTree'; requestId: number; sha: string; entries: FileTreeEntry[]; truncated: boolean }
  | { type: 'stashPreview'; requestId: number; index: number; files: FileDiff[] | null; error?: string }
  | { type: 'busy'; busy: boolean; label?: string }
  | { type: 'progress'; progress: OperationProgress | null }
  | { type: 'view'; view: WebviewView; section?: SidebarSection }
  | { type: 'commitMessage'; subject: string; description: string }
  | { type: 'recentCommits'; messages: string[] }
  | { type: 'toast'; level: 'info' | 'warn' | 'error'; message: string }
  | { type: 'focusCommit'; sha: string }
  | { type: 'openDiffMode'; mode: 'unified' | 'split' };

export interface GraphPalette {
  colors: string[];
}
