import React from 'react';

export type IconName =
  | 'search'
  | 'close'
  | 'chevronRight'
  | 'chevronDown'
  | 'chevronUp'
  | 'chevronLeft'
  | 'refresh'
  | 'fetch'
  | 'pull'
  | 'push'
  | 'branch'
  | 'commit'
  | 'tag'
  | 'archive'
  | 'folder'
  | 'folderOpen'
  | 'file'
  | 'image'
  | 'code'
  | 'doc'
  | 'eye'
  | 'list'
  | 'tree'
  | 'wrap'
  | 'whitespace'
  | 'newline'
  | 'split'
  | 'expand'
  | 'collapse'
  | 'plus'
  | 'minus'
  | 'check'
  | 'dots'
  | 'terminal'
  | 'external'
  | 'copy'
  | 'trash'
  | 'undo'
  | 'merge'
  | 'rebase'
  | 'settings'
  | 'info'
  | 'alert'
  | 'spinner'
  | 'arrowUp'
  | 'arrowDown'
  | 'cloud'
  | 'link'
  | 'filter'
  | 'history'
  | 'save'
  | 'laptop'
  | 'feedback'
  | 'repo'
  | 'fileTree'
  | 'sidebar'
  | 'compare'
  | 'stage'
  | 'unstage'
  | 'discard'
  | 'lock';

const paths: Partial<Record<IconName, React.ReactNode>> = {
  search: (
    <>
      <circle cx="6.6" cy="6.6" r="4.3" />
      <path d="m9.9 9.9 3.5 3.5" />
    </>
  ),
  close: <path d="m4 4 8 8M12 4l-8 8" />,
  chevronRight: <path d="m6 3.5 4.5 4.5L6 12.5" />,
  chevronDown: <path d="m3.5 6 4.5 4.5L12.5 6" />,
  chevronUp: <path d="m3.5 10 4.5-4.5L12.5 10" />,
  chevronLeft: <path d="M10 3.5 5.5 8l4.5 4.5" />,
  refresh: (
    <>
      <path d="M13 7.2A5.2 5.2 0 1 0 12 11" />
      <path d="M13 3.5v3.8h-3.8" />
    </>
  ),
  fetch: (
    <>
      <path d="M4.3 11.5a3 3 0 0 1-.5-5.9 4.3 4.3 0 0 1 8.3-1 2.7 2.7 0 0 1 .6 5.4" />
      <path d="M8 8v5.5M5.8 11.3 8 13.5l2.2-2.2" />
    </>
  ),
  pull: (
    <>
      <path d="M8 2.5v7M5.2 7l2.8 2.8L10.8 7" />
      <path d="M3 11.5v1.5h10v-1.5" />
    </>
  ),
  push: (
    <>
      <path d="M8 9.5v-7M5.2 5 8 2.2 10.8 5" />
      <path d="M3 11.5v1.5h10v-1.5" />
    </>
  ),
  branch: (
    <>
      <circle cx="4.2" cy="3.8" r="1.7" />
      <circle cx="4.2" cy="12.2" r="1.7" />
      <circle cx="11.8" cy="5.6" r="1.7" />
      <path d="M4.2 5.5v5M11.8 7.3v.9a2.6 2.6 0 0 1-2.6 2.6H6" />
    </>
  ),
  commit: (
    <>
      <circle cx="8" cy="8" r="2.6" />
      <path d="M1.5 8h3.9M10.6 8h3.9" />
    </>
  ),
  tag: (
    <>
      <path d="M2.5 7.2V2.5h4.7l6 6-4.7 4.7-6-6Z" />
      <circle cx="5" cy="5" r="1" />
    </>
  ),
  archive: (
    <>
      <rect x="2" y="3" width="12" height="3" rx="1" />
      <path d="M3.3 6v6.5h9.4V6M6.3 8.5h3.4" />
    </>
  ),
  folder: <path d="M2 4.3V12h12V5.5H8L6.7 4H2Z" />,
  folderOpen: <path d="M2 12V4.3h4.7L8 5.7h4.8v1.6M2 12h9.7l2.1-4.7H4.1L2 12Z" />,
  file: (
    <>
      <path d="M4 2.2h5l3 3v8.6H4V2.2Z" />
      <path d="M9 2.2v3h3" />
    </>
  ),
  image: (
    <>
      <rect x="2.2" y="3" width="11.6" height="10" rx="1" />
      <circle cx="5.5" cy="6" r="1.1" />
      <path d="m3 11.5 3.2-3 2.3 2.2 1.9-1.8 2.4 2.4" />
    </>
  ),
  code: (
    <>
      <path d="m5.5 4.5-3 3.5 3 3.5M10.5 4.5l3 3.5-3 3.5" />
    </>
  ),
  doc: (
    <>
      <path d="M4 2.2h5l3 3v8.6H4V2.2Z" />
      <path d="M6 7h4M6 9.2h4M6 11.4h2.6" />
    </>
  ),
  eye: (
    <>
      <path d="M1.8 8s2.3-4 6.2-4 6.2 4 6.2 4-2.3 4-6.2 4-6.2-4-6.2-4Z" />
      <circle cx="8" cy="8" r="1.9" />
    </>
  ),
  list: (
    <>
      <path d="M5.5 4h8M5.5 8h8M5.5 12h8" />
      <circle cx="2.7" cy="4" r=".7" />
      <circle cx="2.7" cy="8" r=".7" />
      <circle cx="2.7" cy="12" r=".7" />
    </>
  ),
  tree: (
    <>
      <path d="M3 3v8.5h5M3 7h4" />
      <rect x="8.3" y="2" width="5" height="2.6" rx=".6" />
      <rect x="8.3" y="6" width="5" height="2.6" rx=".6" />
      <rect x="8.3" y="10.3" width="5" height="2.6" rx=".6" />
    </>
  ),
  wrap: (
    <>
      <path d="M2.5 4h11M2.5 8h8.3a2.2 2.2 0 0 1 0 4.4H8.5" />
      <path d="m10 10.6-1.7 1.8 1.7 1.6" />
      <path d="M2.5 12.4h3" />
    </>
  ),
  whitespace: (
    <>
      <path d="M2.5 4.5h11M2.5 8h5M2.5 11.5h8" />
      <circle cx="11" cy="8" r=".8" />
      <circle cx="12.8" cy="11.5" r=".8" />
    </>
  ),
  newline: (
    <>
      <path d="M2.5 3.5h11M2.5 7.5h11" />
      <path d="M12 10v3H5M6.8 11.2 5 13l1.8 1.8" />
    </>
  ),
  split: (
    <>
      <rect x="2.2" y="3" width="5.2" height="10" rx=".7" />
      <rect x="8.6" y="3" width="5.2" height="10" rx=".7" />
    </>
  ),
  expand: <path d="M6 2.5h-3.5V6M10 13.5h3.5V10M2.5 2.5l4 4M13.5 13.5l-4-4" />,
  collapse: <path d="M2.5 6H6V2.5M13.5 10H10v3.5M6 6 2.5 2.5M10 10l3.5 3.5" />,
  plus: <path d="M8 3v10M3 8h10" />,
  minus: <path d="M3 8h10" />,
  check: <path d="m3 8.6 3.2 3.2L13 4.8" />,
  dots: (
    <>
      <circle cx="3.5" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="8" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  terminal: (
    <>
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <path d="m4.7 6.3 2 1.7-2 1.7M8.5 10.3h3" />
    </>
  ),
  external: (
    <>
      <path d="M9 2.5h4.5V7M13.5 2.5 7.7 8.3" />
      <path d="M12 9.5v3.2H3.3V4h3.2" />
    </>
  ),
  copy: (
    <>
      <rect x="5" y="5" width="8.5" height="8.5" rx="1" />
      <path d="M10.5 5V3.5a1 1 0 0 0-1-1H3.5a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1H5" />
    </>
  ),
  trash: (
    <>
      <path d="M2.8 4.2h10.4M6 4.2V2.8h4v1.4M4 4.2l.8 9h6.4l.8-9M6.5 6.5v4M9.5 6.5v4" />
    </>
  ),
  undo: <path d="M5.5 5.5H10a3.3 3.3 0 0 1 0 6.5H6M5.5 5.5l2.3-2.3M5.5 5.5 7.8 7.8" />,
  merge: (
    <>
      <circle cx="4" cy="4" r="1.7" />
      <circle cx="4" cy="12" r="1.7" />
      <circle cx="12" cy="8" r="1.7" />
      <path d="M4 5.7v4.6M9.8 8H5.7" />
    </>
  ),
  rebase: (
    <>
      <path d="M3 12V4M3 8h5a3 3 0 0 0 3-3V3" />
      <circle cx="3" cy="12.5" r="1.2" />
      <circle cx="11" cy="2.8" r="1.2" />
      <path d="m9.2 5.6 1.8-1.8 1.8 1.8" />
    </>
  ),
  settings: (
    <>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6 11 5M5 11l-1.4 1.4" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7.2v4M8 4.8v.4" />
    </>
  ),
  alert: (
    <>
      <path d="M8 2.2 14 13H2L8 2.2Z" />
      <path d="M8 6v3.2M8 11.3v.2" />
    </>
  ),
  spinner: <path d="M8 2.3a5.7 5.7 0 1 1-4 1.7" />,
  arrowUp: <path d="M8 13V3M4.5 6.5 8 3l3.5 3.5" />,
  arrowDown: <path d="M8 3v10M4.5 9.5 8 13l3.5-3.5" />,
  cloud: <path d="M4.5 12.3a3 3 0 0 1-.4-6 4.3 4.3 0 0 1 8.2-.9 2.6 2.6 0 0 1 .4 5.2" />,
  link: (
    <>
      <path d="M6.8 9.2a2.8 2.8 0 0 0 4 0l1.7-1.7a2.8 2.8 0 1 0-4-4l-.9.9" />
      <path d="M9.2 6.8a2.8 2.8 0 0 0-4 0L3.5 8.5a2.8 2.8 0 1 0 4 4l.9-.9" />
    </>
  ),
  filter: <path d="M2.2 3h11.6L9.4 8.5v4.7l-2.8 1V8.5L2.2 3Z" />,
  history: (
    <>
      <path d="M2.3 8a5.7 5.7 0 1 0 1.7-4" />
      <path d="M2.3 2.6V6h3.4M8 5v3.2l2.2 1.3" />
    </>
  ),
  save: (
    <>
      <path d="M3 2.5h7.5L13 5v8.5H3V2.5Z" />
      <path d="M5 2.5v3.8h5.5V2.5M5 13.5V9h6v4.5" />
    </>
  ),
  laptop: (
    <>
      <rect x="3" y="3" width="10" height="7" rx=".8" />
      <path d="M1.8 12.5h12.4" />
    </>
  ),
  feedback: <path d="M2.5 3h11v7.5H7l-3.5 3V10.5h-1V3Z" />,
  repo: (
    <>
      <path d="M3.5 2.5h8v11h-8v-11Z" />
      <path d="M5.5 2.5v11" />
      <path d="M7 5h3M7 7.2h3" />
    </>
  ),
  fileTree: (
    <>
      <path d="M2.5 3v9h4M2.5 7h3" />
      <path d="M8.5 3h5M8.5 6.5h5M8.5 10h5" />
    </>
  ),
  sidebar: (
    <>
      <rect x="2" y="2.5" width="12" height="11" rx="1.2" />
      <path d="M6.5 2.5v11" />
    </>
  ),
  compare: (
    <>
      <path d="M4 2.5v11M12 2.5v11M4 8h8" />
      <path d="m6.5 5.5-2.2 2.5 2.2 2.5M9.5 5.5 11.7 8l-2.2 2.5" />
    </>
  ),
  stage: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.2" />
      <path d="M8 5v6M5 8h6" />
    </>
  ),
  unstage: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.2" />
      <path d="M5 8h6" />
    </>
  ),
  discard: (
    <>
      <path d="M3 11.5h4.5l5.8-5.8a1.6 1.6 0 0 0-2.3-2.3L5.2 9.2v2.3Z" />
      <path d="M2.5 14h11" />
    </>
  ),
  lock: (
    <>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </>
  )
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  title?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 16, className, title, strokeWidth = 1.35 }: IconProps): React.ReactElement {
  const content = paths[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ? `icon ${className}` : 'icon'}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {content}
    </svg>
  );
}
