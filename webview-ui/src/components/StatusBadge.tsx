import React from 'react';
import { StatusCode } from '@shared/protocol/types';
import { Icon, IconName } from './Icon';
import { authorColor, fileKind, initials } from '../utils/format';

export function StatusBadge({ status, size }: { status?: StatusCode; size?: 'sm' | 'lg' }): React.ReactElement | null {
  if (!status) return null;
  let label: string = status;
  let kind = 'modified';
  switch (status) {
    case 'A':
    case '?':
      label = '+';
      kind = 'added';
      break;
    case 'D':
      label = '−';
      kind = 'deleted';
      break;
    case 'R':
      kind = 'renamed';
      break;
    case 'C':
      kind = 'conflicted';
      break;
    case 'U':
      kind = 'conflicted';
      break;
    case 'T':
      label = 'T';
      kind = 'typechange';
      break;
    default:
      label = 'M';
      kind = 'modified';
  }
  return (
    <span className={`status-badge status-${kind}${size === 'lg' ? ' status-lg' : ''}`} title={statusTitle(status)}>
      {label}
    </span>
  );
}

function statusTitle(status: StatusCode): string {
  switch (status) {
    case 'A':
      return 'Added';
    case '?':
      return 'Untracked';
    case 'D':
      return 'Deleted';
    case 'R':
      return 'Renamed';
    case 'C':
      return 'Copied';
    case 'U':
      return 'Conflicted';
    case 'T':
      return 'Type changed';
    default:
      return 'Modified';
  }
}

export function Avatar({ name, size = 20 }: { name: string; size?: number }): React.ReactElement {
  return (
    <span
      className="avatar"
      style={{ background: authorColor(name), width: size, height: size, fontSize: size * 0.4 }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

const KIND_ICON: Record<string, { icon: IconName; className: string }> = {
  code: { icon: 'code', className: 'file-icon-code' },
  image: { icon: 'image', className: 'file-icon-image' },
  unity: { icon: 'file', className: 'file-icon-unity' },
  doc: { icon: 'doc', className: 'file-icon-doc' },
  archive: { icon: 'archive', className: 'file-icon-archive' },
  generic: { icon: 'file', className: 'file-icon-generic' }
};

export function FileTypeIcon({ path }: { path: string }): React.ReactElement {
  const kind = fileKind(path);
  const info = KIND_ICON[kind] ?? KIND_ICON.generic;
  return <Icon name={info.icon} size={15} className={`file-type-icon ${info.className}`} />;
}

export function Chip({
  children,
  tone = 'neutral',
  icon,
  title
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'green' | 'yellow' | 'red' | 'purple' | 'outline' | 'orange' | 'accent-outline';
  icon?: IconName;
  title?: string;
}): React.ReactElement {
  return (
    <span className={`chip chip-${tone}`} title={title}>
      {icon ? <Icon name={icon} size={11} /> : null}
      <span className="chip-label">{children}</span>
    </span>
  );
}
