import {
  AppConfig,
  BranchInfo,
  ChangeFile,
  CommitDetail,
  CommitFileEntry,
  CommitRef,
  CommitSummary,
  DiffHunk,
  DiffLine,
  DiffScope,
  FileDiff,
  FileTreeEntry,
  HistoryPage,
  RepoState,
  StashEntry,
  SubmoduleInfo,
  TagInfo
} from '@shared/protocol/types';
import { layoutGraph } from '@shared/git/graph';

export const MOCK_ROOT = '/Users/parker/WorkSpace/RealGoClient';

const AUTHORS = [
  { name: 'Sylar Cheng', email: 'sylar.cheng@example.com' },
  { name: 'parker zhai', email: 'parker.zhai@example.com' },
  { name: 'fangfeixiong', email: 'fangfeixiong@example.com' },
  { name: 'Sylar HaoRan', email: 'haoran@example.com' }
];

const SUBJECTS = [
  'Update - marketplace trading for mining pets',
  'jacketpet',
  'Feature - Jacket event and generated tables',
  "Merge branch 'feature/postgresql' of gitlab.com:realgolab/real-go-client into feature/postgresql",
  'Update - restore test endpoint',
  'Translations and generated config',
  'Feature - achievement system safeguards',
  'Fix errors',
  "Merge branch 'Public-Release/0608' into feature/postgresql",
  'Fix - mining pet page popup error',
  'Update - server endpoint migration tests',
  'Update - ArenaNote LFS asset adjustments',
  'Fix - server migration errors',
  'Update - default text',
  'Update - pet panel and collection counts',
  'Fix configuration error',
  'Export tables',
  'Feature - babydoge textures',
  'Feature - translations',
  'Feature - translation resources',
  'Feature - babydoge assets',
  'Update - hide character badges temporarily',
  "Merge branch 'Sylar/feature/Badge' into Public-Release/0608",
  'Feature - badge logic and config',
  'Feature - AI chat badges',
  'Feature - badge server integration',
  'Fix - marketplace pagination',
  'Update - secondary market filters',
  'Update - mining pet data tables',
  'Improve - resource loading'
];

const MOCK_CONFIG: AppConfig = {
  changesViewMode: 'tree',
  diffMode: 'unified',
  contextLines: 3,
  showWhitespace: false,
  wordWrap: false,
  groupByPrefix: true,
  pullRebase: false,
  autoStash: true,
  confirmDestructive: true,
  historyPageSize: 60
};

export function mockConfig(): AppConfig {
  return { ...MOCK_CONFIG };
}

function shaFor(index: number): string {
  let state = ((index + 1) * 2654435761 + 0x9e3779b9) >>> 0;
  let out = '';
  for (let i = 0; i < 5; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out += state.toString(16).padStart(8, '0');
  }
  return out;
}

function person(index: number, date: number) {
  const author = AUTHORS[index % AUTHORS.length];
  return { name: author.name, email: author.email, date };
}

function fileEntry(
  filePath: string,
  partial: Partial<ChangeFile> = {}
): ChangeFile {
  const worktreeStatus = partial.worktreeStatus ?? (partial.indexStatus ? undefined : 'M');
  const indexStatus = partial.indexStatus;
  return {
    path: filePath,
    staged: !!indexStatus,
    unstaged: !!worktreeStatus,
    untracked: worktreeStatus === '?',
    ignored: false,
    conflicted: false,
    indexStatus,
    worktreeStatus,
    stagedBadge: indexStatus,
    unstagedBadge: worktreeStatus,
    ...partial
  };
}

function generateFiles(): ChangeFile[] {
  const files: ChangeFile[] = [];
  const add = (path: string, partial: Partial<ChangeFile> = {}) => {
    if (!files.some((file) => file.path === path)) files.push(fileEntry(path, partial));
  };

  add('code/Assets/HybridCLRGenerate/AOTGenericReferences.cs');
  add('code/Assets/HybridCLRGenerate/link.xml', { worktreeStatus: 'M', indexStatus: 'M' });
  add('code/Assets/HybridCLRGenerate/UniWebView-CSharp.dll', { worktreeStatus: '?' });
  add('code/Assets/OutRes/UI/UpgradeDivisionMenuPanel/UpgradePanelTitleContainer.mat');
  add('code/Assets/OutRes/UI/UpgradeDivisionMenuPanel/UpgradePanelTitleContainer.mat.meta', { worktreeStatus: '?' });
  add('code/Assets/OutRes/Base/CodeDll/AOTFile.bytes');
  add('code/Assets/OutRes/Base/CodeDll/AppleAuth.dll.bytes', { worktreeStatus: '?' });
  add('code/Assets/OutRes/Base/CodeDll/AppsFlyer.dll.bytes', { indexStatus: 'M', worktreeStatus: 'M' });
  add('code/Assets/OutRes/Base/CodeDll/BuglyAgent.dll.bytes', { worktreeStatus: '?' });
  add('code/Assets/OutRes/Base/CodeDll/CFXRDemo.dll.bytes', { worktreeStatus: '?' });
  add('code/Assets/OutRes/Base/CodeDll/Facebook.Unity.Android.dll.bytes', { worktreeStatus: 'M', indexStatus: 'M' });
  add('code/Assets/OutRes/Base/CodeDll/Facebook.Unity.Android.dll.bytes.meta', { worktreeStatus: '?' });
  add('code/Assets/OutRes/Base/CodeDll/Firebase.Analytics.dll.bytes', { worktreeStatus: 'D' });
  add('code/Assets/OutRes/Base/CodeDll/UniWebView.dll.bytes', { worktreeStatus: '?' });
  add('code/Assets/OutRes/Base/UIPrefabs/MarketPlaceMenuPanel/MarketPlaceMenuPanel.prefab', {
    indexStatus: 'M',
    worktreeStatus: 'M'
  });
  add('code/Assets/OutRes/Base/UIPrefabs/MarketPlaceMenuPanel/MarketPlaceMenuPanel.prefab.meta', {
    worktreeStatus: 'M'
  });
  add('code/Assets/Scripts/UI/MarketPlaceMenuPanelScripts/AttributeFilter/HarvesterAttributeFilterButton.cs', {
    worktreeStatus: 'M'
  });
  add('code/Assets/Scripts/UI/MarketPlaceMenuPanelScripts/AttributeFilter/HarvesterAttributeFilterButton.cs.meta', {
    worktreeStatus: '?'
  });
  add('code/Assets/Scripts/UI/MarketPlaceMenuPanelScripts/AttributeFilter/HarvesterDisplaySorterController.cs', {
    worktreeStatus: 'M'
  });
  add('code/Assets/Scripts/UI/MarketPlaceMenuPanelScripts/AttributeFilter/HarvesterProductsHarvesterCellController.cs', {
    worktreeStatus: 'M',
    indexStatus: 'M'
  });
  add('code/Assets/Scripts/UI/MiningPetMenuPanel/HarvestHub/Datas/HarvestHubFilterDatas.cs', {
    worktreeStatus: 'M'
  });
  add('code/Assets/Scripts/UI/MiningPetMenuPanel/HarvestHub/Datas/HarvestHubFilterController.cs', {
    worktreeStatus: '?'
  });

  const folders = [
    'code/Assets/OutRes/Base/UIAtlas',
    'code/Assets/OutRes/Base/UIPrefabs/MiningPet',
    'code/Assets/OutRes/Base/UIPrefabs/Jacket',
    'code/Assets/OutRes/Characters',
    'code/Assets/OutRes/Effects',
    'code/Assets/OutRes/Scenes',
    'code/Assets/Scripts/Game/Market',
    'code/Assets/Scripts/Game/Mining',
    'code/Assets/Scripts/Game/Jacket',
    'code/Assets/Scripts/Game/Fishing',
    'code/Assets/Scripts/Game/Achievement',
    'code/Assets/Scripts/UI/Common',
    'code/Assets/Scripts/UI/Backpack',
    'code/Assets/Scripts/UI/Chat',
    'code/Assets/Res/Localization',
    'code/Assets/Res/Config',
    'code/Assets/Res/Shaders',
    'code/Assets/Plugins/iOS',
    'code/Packages/com.realgolab.core/Runtime',
    'code/ProjectSettings'
  ];
  const names = [
    'MarketListingController',
    'MarketPurchasePopup',
    'PetDataProvider',
    'PetSkillUpgradePanel',
    'JacketRewardPanel',
    'FishRankingCell',
    'AchievementToast',
    'CommonTipsView',
    'BackpackItemCell',
    'ChatMessageItem',
    'LocalizationTable',
    'GameConfig',
    'UberShader',
    'NativeBridge',
    'CoreEventBus',
    'ProjectSettings'
  ];
  const extensions = ['.cs', '.prefab', '.asset', '.mat', '.png', '.json', '.bytes', '.meta'];
  let i = 0;
  while (files.length < 229) {
    const folder = folders[i % folders.length];
    const name = names[(i * 3 + Math.floor(i / folders.length)) % names.length];
    const ext = extensions[i % extensions.length];
    const suffix = i >= folders.length ? `_${Math.floor(i / folders.length) + 1}` : '';
    const path = `${folder}/${name}${suffix}${ext}`;
    const statusRoll = i % 13;
    const indexStatus = i < 14 ? 'M' : undefined;
    const worktreeStatus =
      statusRoll === 3 ? 'D' : statusRoll === 7 ? '?' : statusRoll === 9 ? 'R' : 'M';
    add(path, { indexStatus, worktreeStatus });
    i++;
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function generateBranches(): BranchInfo[] {
  const list: Array<[string, number, number, string]> = [
    ['feature/postgresql', 2, 1, 'Update - marketplace trading for mining pets'],
    ['feature/login', 0, 4, 'Update - login flow'],
    ['feature/gameplay', 3, 0, 'Feature - combat presentation'],
    ['Public-Release/0305', 0, 18, 'Release 0305'],
    ['Public-Release/0413', 0, 7, 'Release 0413'],
    ['Public-Release/0509', 0, 2, 'Release 0509'],
    ['Public-Release/0608', 0, 1, 'Release 0608'],
    ['Sylar/feature/Badge', 0, 2, 'Feature - badge logic and config'],
    ['master-new-dev-2', 0, 43, 'Merge development branches'],
    ['master', 0, 12, 'Merge branch master'],
    ['master-new', 0, 5, 'Merge branch master-new']
  ];
  return list.map(([name, ahead, behind, subject], index) => ({
    name,
    fullName: name,
    remote: null,
    isRemote: false,
    current: name === 'feature/postgresql',
    sha: shaFor(index * 5),
    upstream: `origin/${name}`,
    ahead,
    behind,
    subject,
    author: AUTHORS[index % AUTHORS.length].name,
    updatedAt: Date.UTC(2026, 7, 19 - index, 2, 37) * 1
  }));
}

function generateRemoteBranches(): BranchInfo[] {
  const names = [
    'master',
    'feature/postgresql',
    'feature/login',
    'LanBo/marketplace',
    'LanBo/chat',
    'Public-Release/0305',
    'Public-Release/0413',
    'Public-Release/0509',
    'Public-Release/0608',
    'Sylar/feature/Badge',
    'Sylar/feature/Jacket',
    'Xiong/master',
    'Xiong/marketplace-harvest',
    'master-new',
    'master-new-dev-2',
    'master-new-ios',
    'master-new-main',
    'master-new-test',
    'realgo-best',
    'realgo-dev-master',
    'upgrade-protocols-test'
  ];
  return names.map((name, index) => ({
    name,
    fullName: `origin/${name}`,
    remote: 'origin',
    isRemote: true,
    current: false,
    sha: shaFor(index * 7 + 3),
    upstream: null,
    ahead: 0,
    behind: 0,
    subject: SUBJECTS[index % SUBJECTS.length],
    author: AUTHORS[index % AUTHORS.length].name,
    updatedAt: Date.UTC(2026, 7, 18 - index, 1, 12)
  }));
}

function generateTags(): TagInfo[] {
  return [
    { name: 'beta-archive-merge', sha: shaFor(41), annotated: false, message: null, updatedAt: Date.UTC(2026, 6, 3) },
    { name: 'v1.0.0', sha: shaFor(55), annotated: true, message: 'Release 1.0.0', updatedAt: Date.UTC(2026, 5, 12) },
    { name: 'release-2026.08', sha: shaFor(23), annotated: true, message: 'August release', updatedAt: Date.UTC(2026, 7, 1) }
  ];
}

function generateStashes(): StashEntry[] {
  return [
    {
      index: 0,
      ref: 'stash@{0}',
      sha: shaFor(70),
      message: "On feature/postgresql: Fork autostash 25 Mar 2026",
      branch: 'feature/postgresql',
      author: 'parker zhai',
      updatedAt: Date.UTC(2026, 2, 25, 3, 4)
    },
    {
      index: 1,
      ref: 'stash@{1}',
      sha: shaFor(71),
      message: "Autostash. Switch from 'master' to 'feature/postgresql'",
      branch: 'feature/postgresql',
      author: 'parker zhai',
      updatedAt: Date.UTC(2026, 2, 24, 8, 30)
    },
    {
      index: 2,
      ref: 'stash@{2}',
      sha: shaFor(72),
      message: 'WIP: UI refactor',
      branch: 'feature/postgresql',
      author: 'Sylar Cheng',
      updatedAt: Date.UTC(2026, 2, 20, 6, 12)
    }
  ];
}

function generateSubmodules(): SubmoduleInfo[] {
  return [
    {
      path: 'code/Assets/AssetBundle',
      name: 'AssetBundle',
      url: 'git@gitlab.com:realgolab/assetbundle.git',
      sha: 'a1b2c3d4',
      description: 'heads/main',
      status: 'modified',
      branch: 'main'
    },
    {
      path: 'code/Assets/Scripts',
      name: 'Scripts',
      url: 'git@gitlab.com:realgolab/scripts.git',
      sha: 'b2c3d4e5',
      description: 'heads/main',
      status: 'clean',
      branch: 'main'
    },
    {
      path: 'RealGoConfigs',
      name: 'RealGoConfigs',
      url: 'git@gitlab.com:realgolab/configs.git',
      sha: 'c3d4e5f6',
      description: 'heads/master',
      status: 'modified',
      branch: 'master'
    }
  ];
}

export function makeMockState(): RepoState {
  const files = generateFiles();
  return {
    repo: {
      root: MOCK_ROOT,
      name: 'RealGoClient',
      head: 'feature/postgresql',
      headSha: shaFor(0),
      detached: false,
      upstream: 'origin/feature/postgresql',
      ahead: 2,
      behind: 1,
      remotes: ['origin'],
      hasChanges: true,
      operation: null,
      gitVersion: '2.50.1',
      submoduleCount: 3
    },
    files,
    branches: generateBranches(),
    remotes: [
      {
        name: 'origin',
        url: 'git@gitlab.com:realgolab/real-go-client.git',
        branches: generateRemoteBranches()
      }
    ],
    tags: generateTags(),
    stashes: generateStashes(),
    submodules: generateSubmodules(),
    recentCommits: SUBJECTS.slice(0, 12),
    busy: false,
    operationLabel: null,
    refreshedAt: Date.now()
  };
}

/* ------------------------------------------------------------------ */
/* Commit history                                                      */
/* ------------------------------------------------------------------ */

const commitCount = 120;
const rawCommits = Array.from({ length: commitCount }, (_, index) => {
  const date = new Date(2026, 7, 19, 12, 37).getTime() - index * 4.7 * 3600 * 1000;
  const parents: string[] = [];
  if (index + 1 < commitCount) parents.push(shaFor(index + 1));
  if (index % 9 === 2 && index + 24 < commitCount) parents.push(shaFor(index + 24));
  if (index % 14 === 5 && index + 8 < commitCount) parents.push(shaFor(index + 8));
  if (index % 17 === 11 && index + 37 < commitCount) parents.push(shaFor(index + 37));
  if (index % 23 === 7 && index + 18 < commitCount) parents.push(shaFor(index + 18));
  const author = person(index, date);
  const subject = SUBJECTS[index % SUBJECTS.length];
  const body =
    index % 6 === 0
      ? 'Add related UI and logic configuration\nUpdate generated tables and asset references\n\n(cherry picked from commit ' + shaFor(index + 3) + ')'
      : '';
  const refs: CommitRef[] = [];
  if (index === 0) {
    refs.push(
      { name: 'feature/postgresql', kind: 'local', current: true, upstream: 'origin/feature/postgresql' },
      { name: 'origin/feature/postgresql', kind: 'remote', remote: 'origin' }
    );
  }
  if (index === 11) refs.push({ name: 'origin/Public-Release/0608', kind: 'remote', remote: 'origin' });
  if (index === 12) refs.push({ name: 'Public-Release/0608', kind: 'local' });
  if (index === 30) refs.push({ name: 'origin/Sylar/feature/Badge', kind: 'remote', remote: 'origin' });
  if (index === 31) refs.push({ name: 'Sylar/feature/Badge', kind: 'local' });
  if (index === 41) refs.push({ name: 'release-2026.08', kind: 'tag' });
  if (index === 55) refs.push({ name: 'v1.0.0', kind: 'tag' });
  return {
    sha: shaFor(index),
    parents,
    author,
    committer: author,
    subject,
    body,
    refs,
    inHead: index < 10 || (index < 62 && index % 9 !== 4) || index >= 70
  };
});
const graphRows = layoutGraph(rawCommits);

export const MOCK_COMMITS: CommitSummary[] = rawCommits.map((commit, index) => ({
  ...commit,
  shortSha: commit.sha.slice(0, 7),
  graph: graphRows[index]
}));

const commitFiles: CommitFileEntry[] = [
  {
    path: 'code/Assets/OutRes/Base/UIPrefabs/MarketPlaceMenuPanel/MarketPlaceMenuPanel.prefab',
    status: 'M',
    additions: 4,
    deletions: 4,
    binary: false
  },
  {
    path: 'code/Assets/Scripts/UI/MarketPlaceMenuPanelScripts/AttributeFilter/HarvesterAttributeFilterButton.cs',
    status: 'A',
    additions: 42,
    deletions: 0,
    binary: false
  },
  {
    path: 'code/Assets/Scripts/UI/MarketPlaceMenuPanelScripts/AttributeFilter/HarvesterProductsHarvesterCellController.cs',
    status: 'M',
    additions: 12,
    deletions: 3,
    binary: false
  },
  {
    path: 'code/Assets/Scripts/UI/MarketPlaceMenuPanelScripts/AttributeFilter/HarvesterDisplaySorterController.cs',
    status: 'M',
    additions: 5,
    deletions: 1,
    binary: false
  },
  {
    path: 'code/Assets/Scripts/UI/MiningPetMenuPanel/HarvestHub/Datas/HarvestHubFilterDatas.cs',
    status: 'M',
    additions: 7,
    deletions: 2,
    binary: false
  },
  {
    path: 'code/Assets/OutRes/Base/UIAtlas/Marketplace.png',
    status: 'A',
    additions: 0,
    deletions: 0,
    binary: true
  },
  {
    path: 'code/Assets/HybridCLRGenerate/AOTGenericReferences.cs',
    status: 'D',
    additions: 0,
    deletions: 8,
    binary: false
  }
];

function line(kind: DiffLine['kind'], oldLine: number | null, newLine: number | null, text: string): DiffLine {
  return { kind, oldLine, newLine, text };
}

function hunk(
  index: number,
  oldStart: number,
  oldLines: number,
  newStart: number,
  newLines: number,
  section: string,
  lines: DiffLine[]
): DiffHunk {
  return {
    index,
    header: `@@ -${oldStart},${oldLines} +${newStart},${newLines} @@ ${section}`,
    section,
    oldStart,
    oldLines,
    newStart,
    newLines,
    lines
  };
}

function aotDiff(): FileDiff {
  const hunks: DiffHunk[] = [
    hunk(
      0,
      23,
      6,
      23,
      7,
      'public class AOTGenericReferences : UnityEngine.MonoBehaviour',
      [
        line('context', 23, 23, '    "StompyRobot.SRF.dll",'),
        line('context', 24, 24, '    "System.Core.dll",'),
        line('context', 25, 25, '    "System.dll",'),
        line('add', null, 26, '    "UniWebView-CSharp.dll",'),
        line('context', 26, 27, '    "Unity.Addressables.dll",'),
        line('context', 27, 28, '    "Unity.InputSystem.dll",'),
        line('context', 28, 29, '    "Unity.Netcode.Runtime.dll",')
      ]
    ),
    hunk(
      1,
      146,
      6,
      147,
      7,
      'public class AOTGenericReferences : UnityEngine.MonoBehaviour',
      [
        line('context', 146, 147, '    // System.Action<System.DateTime>'),
        line('context', 147, 148, '    // System.Action<System.Decimal>'),
        line('context', 148, 149, '    // System.Action<System.ValueTuple<object,double>>'),
        line('del', 149, null, '    // System.Action<System.ValueTuple<object,int,System.Nullable<long>>>'),
        line('add', null, 150, '    // System.Action<System.ValueTuple<object,int,System.Nullable<long>>>'),
        line('add', null, 151, '    // System.Action<System.ValueTuple<object,int,System.Nullable<int>>>'),
        line('context', 150, 152, '    // System.Action<UnityEngine.Color>'),
        line('context', 151, 153, '    // System.Action<UnityEngine.CombineInstance>'),
        line('context', 152, 154, '    // System.Action<UnityEngine.EventSystems.RaycastResult>')
      ]
    ),
    hunk(
      2,
      187,
      7,
      189,
      12,
      'public class AOTGenericReferences : UnityEngine.MonoBehaviour',
      [
        line('context', 187, 189, '    // System.Action<object>'),
        line('context', 188, 190, '    // System.Action<long>'),
        line('context', 189, 191, '    // System.Action<short>'),
        line('add', null, 192, '    // System.Buffers.ArrayPool<int>'),
        line('add', null, 193, '    // System.Buffers.TlsOverPerCoreLockedStacksArrayPool.LockedStack<int>'),
        line('add', null, 194, '    // System.Buffers.TlsOverPerCoreLockedStacksArrayPool.PerCoreLockedStacks<int>'),
        line('add', null, 195, '    // System.Buffers.TlsOverPerCoreLockedStacksArrayPool<int>'),
        line('context', 190, 196, '    // System.ByReference<UnityEngine.Vector4>'),
        line('context', 191, 197, '    // System.ByReference<int>'),
        line('context', 192, 198, '    // System.ByReference<short>'),
        line('context', 193, 199, '    // System.Collections.Concurrent.ConcurrentDictionary<Guid,object>')
      ]
    ),
    hunk(
      3,
      225,
      6,
      237,
      7,
      'public class AOTGenericReferences : UnityEngine.MonoBehaviour',
      [
        line('context', 225, 237, '    // System.Collections.Concurrent.ConcurrentDictionary<Guid,object>'),
        line('context', 226, 238, '    // System.Collections.Generic.ArraySortHelper<System.DateTime>'),
        line('context', 227, 239, '    // System.Collections.Generic.ArraySortHelper<System.Decimal>'),
        line('del', 228, null, '    // System.Collections.Generic.ArraySortHelper<System.ValueTuple<object,double>>'),
        line('add', null, 240, '    // System.Collections.Generic.ArraySortHelper<System.ValueTuple<object,double>>'),
        line('add', null, 241, '    // System.Collections.Generic.ArraySortHelper<System.ValueTuple<object,int>>'),
        line('context', 229, 242, '    // System.Collections.Generic.ArraySortHelper<UnityEngine.Color>'),
        line('context', 230, 243, '    // System.Collections.Generic.ArraySortHelper<UnityEngine.CombineInstance>')
      ]
    ),
    hunk(
      4,
      260,
      7,
      272,
      9,
      'public class AOTGenericReferences : UnityEngine.MonoBehaviour',
      [
        line('context', 260, 272, '    // System.Collections.Generic.Comparer<System.Collections.Generic.KeyValuePair<object,object>>'),
        line('context', 261, 273, '    // System.Collections.Generic.Comparer<System.DateTime>'),
        line('context', 262, 274, '    // System.Collections.Generic.Comparer<System.Decimal>'),
        line('del', 263, null, '    // System.Collections.Generic.Comparer<System.ValueTuple<object,int,System.Nullable<long>>>'),
        line('add', null, 275, '    // System.Collections.Generic.Comparer<System.ValueTuple<object,int,System.Nullable<long>>>'),
        line('add', null, 276, '    // System.Collections.Generic.Comparer<System.ValueTuple<object,int,System.Nullable<int>>>'),
        line('context', 264, 277, '    // System.Collections.Generic.Comparer<UnityEngine.Color>'),
        line('context', 265, 278, '    // System.Collections.Generic.Comparer<UnityEngine.CombineInstance>'),
        line('context', 266, 279, '    // System.Collections.Generic.Comparer<UnityEngine.EventSystems.RaycastResult>')
      ]
    ),
    hunk(
      5,
      297,
      6,
      309,
      8,
      'public class AOTGenericReferences : UnityEngine.MonoBehaviour',
      [
        line('context', 297, 309, '    // System.Collections.Generic.Comparer<UnityEngine.EventSystems.RaycastResult>'),
        line('context', 298, 310, '    // System.Collections.Generic.Comparer<System.DateTime>'),
        line('context', 299, 311, '    // System.Collections.Generic.Comparer<System.Decimal>'),
        line('del', 300, null, '    // System.Collections.Generic.ComparisonComparer<System.Collections.Generic.KeyValuePair<object,object>>.Compare'),
        line('add', null, 312, '    // System.Collections.Generic.ComparisonComparer<System.Collections.Generic.KeyValuePair<object,object>>.Compare'),
        line('add', null, 313, '    // System.Collections.Generic.ComparisonComparer<System.Collections.Generic.KeyValuePair<object,int>>.Compare'),
        line('context', 301, 314, '    // System.Collections.Generic.IComparer<UnityEngine.Color>'),
        line('context', 302, 315, '    // System.Collections.Generic.IComparer<UnityEngine.CombineInstance>')
      ]
    )
  ];
  return {
    path: 'code/Assets/HybridCLRGenerate/AOTGenericReferences.cs',
    status: 'M',
    binary: false,
    hunks,
    additions: 13,
    deletions: 5,
    editable: true,
    side: 'unstaged'
  };
}

function prefabDiff(): FileDiff {
  const hunks: DiffHunk[] = [
    hunk(0, 820, 10, 820, 10, 'RectTransform:', [
      line('context', 820, 820, '  m_Children: []'),
      line('context', 821, 821, '  m_Father: {fileID: 660944399496924496}'),
      line('context', 822, 822, '  m_LocalEulerAnglesHint: {x: 0, y: 0, z: 0}'),
      line('del', 823, null, '  m_AnchorMin: {x: 0, y: 1}'),
      line('del', 824, null, '  m_AnchorMax: {x: 0, y: 1}'),
      line('del', 825, null, '  m_AnchoredPosition: {x: 122.56, y: -22.5}'),
      line('del', 826, null, '  m_SizeDelta: {x: 131.12, y: 45}'),
      line('add', null, 823, '  m_AnchorMin: {x: 0, y: 0}'),
      line('add', null, 824, '  m_AnchorMax: {x: 0, y: 0}'),
      line('add', null, 825, '  m_AnchoredPosition: {x: 0, y: 0}'),
      line('add', null, 826, '  m_SizeDelta: {x: 0, y: 0}'),
      line('context', 827, 827, '  m_Pivot: {x: 0.5, y: 0.5}'),
      line('context', 828, 828, '  --- !u!222 &3528298986387553171'),
      line('context', 829, 829, 'CanvasRenderer:')
    ]),
    hunk(1, 1412, 8, 1412, 7, 'RectTransform:', [
      line('context', 1412, 1412, '  - {fileID: 732203223034874511}'),
      line('context', 1413, 1413, '  m_Father: {fileID: 980374120389661735}'),
      line('context', 1414, 1414, '  m_LocalEulerAnglesHint: {x: 0, y: 0, z: 0}'),
      line('del', 1415, null, '  m_AnchorMin: {x: 0, y: 1}'),
      line('del', 1416, null, '  m_AnchorMax: {x: 0, y: 1}'),
      line('del', 1417, null, '  m_AnchoredPosition: {x: 56.5, y: -30.5}'),
      line('add', null, 1415, '  m_AnchorMin: {x: 0, y: 0}'),
      line('add', null, 1416, '  m_AnchorMax: {x: 0, y: 0}'),
      line('add', null, 1417, '  m_AnchoredPosition: {x: 0, y: 0}'),
      line('context', 1418, 1418, '  m_SizeDelta: {x: 113, y: 49}'),
      line('context', 1419, 1419, '  m_Pivot: {x: 0.5, y: 0.5}'),
      line('context', 1420, 1420, '  --- !u!114 &151506692676521594')
    ]),
    hunk(2, 3135, 5, 3135, 5, 'RectTransform:', [
      line('context', 3135, 3135, '  - {fileID: 5126120013371482446}'),
      line('context', 3136, 3136, '  - {fileID: 7267770624174321635}'),
      line('context', 3137, 3137, '  - {fileID: 3418224685770117195}'),
      line('del', 3138, null, '  m_Enabled: 1'),
      line('add', null, 3138, '  m_Enabled: 0'),
      line('context', 3139, 3139, '  m_EditorHideFlags: 0')
    ])
  ];
  return {
    path: 'code/Assets/OutRes/Base/UIPrefabs/MarketPlaceMenuPanel/MarketPlaceMenuPanel.prefab',
    status: 'M',
    binary: false,
    hunks,
    additions: 12,
    deletions: 12,
    editable: false,
    meta: {
      sha: shaFor(0),
      subject: 'Update - marketplace trading for mining pets',
      author: 'Sylar Cheng',
      date: new Date(2026, 7, 19, 12, 37).getTime()
    }
  };
}

function codeDiff(filePath: string): FileDiff {
  const name = filePath.split('/').pop() ?? 'file.cs';
  const hunks = [
    hunk(0, 42, 8, 42, 10, `namespace Game.UI // ${name}`, [
      line('context', 42, 42, '    public class FilterController : MonoBehaviour'),
      line('context', 43, 43, '    {'),
      line('context', 44, 44, '        private readonly List<FilterData> _filters = new();'),
      line('del', 45, null, '        private int _selectedIndex = 0;'),
      line('add', null, 45, '        private int _selectedIndex = -1;'),
      line('add', null, 46, '        private bool _initialized;'),
      line('context', 46, 47, ''),
      line('context', 47, 48, '        public void Initialize()'),
      line('context', 48, 49, '        {'),
      line('add', null, 50, '            if (_initialized) return;'),
      line('add', null, 51, '            _initialized = true;')
    ]),
    hunk(1, 88, 5, 90, 6, 'public void Refresh()', [
      line('context', 88, 90, '        public void Refresh()'),
      line('context', 89, 91, '        {'),
      line('del', 90, null, '            _selectedIndex = Mathf.Clamp(_selectedIndex, 0, _filters.Count);'),
      line('add', null, 92, '            _selectedIndex = Mathf.Clamp(_selectedIndex, -1, _filters.Count - 1);'),
      line('add', null, 93, '            RebuildCells();'),
      line('context', 91, 94, '        }'),
      line('context', 92, 95, '    }')
    ])
  ];
  return {
    path: filePath,
    status: 'M',
    binary: false,
    hunks,
    additions: 5,
    deletions: 2,
    editable: false
  };
}

function genericDiff(filePath: string, status: FileDiff['status']): FileDiff {
  if (/\.(png|jpg|jpeg|webp|gif|psd)$/i.test(filePath)) {
    return {
      path: filePath,
      status,
      binary: true,
      hunks: [],
      additions: 0,
      deletions: 0,
      editable: false
    };
  }
  const isNew = status === 'A' || status === '?';
  const isDeleted = status === 'D';
  const lines: DiffLine[] = [];
  if (isNew) {
    for (let i = 1; i <= 12; i++) lines.push(line('add', null, i, `// line ${i} of ${filePath}`));
  } else if (isDeleted) {
    for (let i = 1; i <= 8; i++) lines.push(line('del', i, null, `// removed line ${i}`));
  } else {
    lines.push(
      line('context', 10, 10, '// context before'),
      line('del', 11, null, '// old value'),
      line('add', null, 11, '// new value'),
      line('context', 12, 12, '// context after')
    );
  }
  return {
    path: filePath,
    status,
    binary: false,
    hunks: [
      hunk(0, isNew ? 0 : 10, isNew ? 0 : lines.filter((l) => l.kind !== 'add').length, isNew ? 1 : 10, isNew ? 12 : lines.filter((l) => l.kind !== 'del').length, '', lines)
    ],
    additions: lines.filter((l) => l.kind === 'add').length,
    deletions: lines.filter((l) => l.kind === 'del').length,
    editable: false
  };
}

export function makeWorktreeDiff(state: RepoState, scope: DiffScope): FileDiff {
  const filePath = 'path' in scope ? scope.path : '';
  const file = state.files.find((entry) => entry.path === filePath);
  const side = scope.kind === 'index' ? 'staged' : 'unstaged';
  let diff: FileDiff;
  if (filePath.endsWith('AOTGenericReferences.cs')) {
    diff = aotDiff();
  } else if (filePath.endsWith('MarketPlaceMenuPanel.prefab')) {
    diff = prefabDiff();
    diff.editable = false;
  } else if (filePath.endsWith('.cs')) {
    diff = codeDiff(filePath);
  } else {
    const status =
      side === 'staged' ? file?.indexStatus ?? 'M' : file?.worktreeStatus ?? 'M';
    diff = genericDiff(filePath, status);
  }
  diff.editable = true;
  diff.side = side;
  if (file?.conflicted) diff.status = 'U';
  return diff;
}

export function makeCommitDiff(sha: string, filePath: string): FileDiff {
  if (filePath.endsWith('MarketPlaceMenuPanel.prefab')) {
    const diff = prefabDiff();
    diff.meta = { ...diff.meta, sha };
    return diff;
  }
  if (filePath.endsWith('AOTGenericReferences.cs')) {
    const diff = aotDiff();
    diff.status = 'D';
    diff.editable = false;
    diff.meta = { sha, subject: 'Update - marketplace trading for mining pets', author: 'Sylar Cheng' };
    return diff;
  }
  if (/\.png$/i.test(filePath)) {
    const diff = genericDiff(filePath, 'A');
    diff.meta = { sha };
    return diff;
  }
  const diff = codeDiff(filePath);
  diff.meta = { sha, subject: 'Update - marketplace trading for mining pets', author: 'Sylar Cheng' };
  return diff;
}

export function makeCommitDetail(sha: string): CommitDetail {
  const commit = MOCK_COMMITS.find((entry) => entry.sha === sha) ?? MOCK_COMMITS[0];
  return {
    commit,
    fullBody: commit.subject + (commit.body ? `\n\n${commit.body}` : ''),
    files: commitFiles,
    branches: commit.refs.filter((ref) => ref.kind !== 'tag').map((ref) => ref.name),
    tags: commit.refs.filter((ref) => ref.kind === 'tag').map((ref) => ref.name),
    additions: commitFiles.reduce((sum, file) => sum + file.additions, 0),
    deletions: commitFiles.reduce((sum, file) => sum + file.deletions, 0)
  };
}

export function makeHistoryPage(offset: number, limit: number, ref?: string | null, search?: string | null): HistoryPage {
  let commits = MOCK_COMMITS;
  if (search) {
    const term = search.toLowerCase();
    commits = commits.filter(
      (commit) =>
        commit.subject.toLowerCase().includes(term) ||
        commit.author.name.toLowerCase().includes(term) ||
        commit.sha.startsWith(term)
    );
  }
  if (ref) {
    const branch = ref.replace(/^origin\//, '');
    if (branch !== 'feature/postgresql') {
      commits = commits.slice(0, 40);
    }
  }
  return {
    commits: commits.slice(offset, offset + limit),
    offset,
    limit,
    hasMore: offset + limit < commits.length,
    total: commits.length,
    headSha: shaFor(0),
    baseRef: ref ?? null,
    search: search ?? null
  };
}

export function makeFileTree(sha: string): { entries: FileTreeEntry[]; truncated: boolean } {
  const entries: FileTreeEntry[] = [];
  const folders = [
    'code/Assets/OutRes/Base/UIPrefabs/MarketPlaceMenuPanel',
    'code/Assets/Scripts/UI/MarketPlaceMenuPanelScripts/AttributeFilter',
    'code/Assets/Scripts/UI/MarketPlaceMenuPanelScripts/AttributeFilter/Datas',
    'code/Assets/OutRes/Base/UIAtlas',
    'code/Assets/Plugins/Android',
    'code/Packages/com.realgolab.core/Runtime'
  ];
  for (const folder of folders) {
    for (let i = 0; i < 8; i++) {
      const ext = i % 3 === 0 ? '.prefab' : i % 3 === 1 ? '.cs' : '.asset';
      entries.push({
        path: `${folder}/File${i}${ext}`,
        mode: '100644',
        type: 'blob',
        sha: sha.slice(0, 7) + i,
        size: 1200 + i * 930
      });
    }
  }
  entries.push(
    { path: 'README.md', mode: '100644', type: 'blob', sha: sha.slice(0, 8), size: 2431 },
    { path: 'code/ProjectSettings/ProjectVersion.txt', mode: '100644', type: 'blob', sha: sha.slice(0, 8), size: 82 },
    { path: 'RealGoConfigs', mode: '160000', type: 'commit', sha: sha.slice(0, 8) }
  );
  return { entries, truncated: false };
}

export function makeStashDiff(index: number): FileDiff[] {
  const aot = aotDiff();
  aot.editable = false;
  aot.meta = { stashIndex: index, stashMessage: 'WIP: UI refactor' };
  const prefab = prefabDiff();
  prefab.meta = { stashIndex: index, stashMessage: 'WIP: UI refactor' };
  return [aot, prefab, codeDiff('code/Assets/Scripts/UI/MarketPlaceMenuPanelScripts/AttributeFilter/HarvesterAttributeFilterButton.cs')];
}
