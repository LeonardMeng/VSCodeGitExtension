export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()} at ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatShortDate(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

export function formatRelative(timestamp: number): string {
  const delta = Date.now() - timestamp;
  if (!Number.isFinite(delta)) return '';
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function shortSha(sha: string | null | undefined, length = 7): string {
  if (!sha) return '';
  return sha.slice(0, length);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  '#4f8ef7',
  '#a371f7',
  '#3fb950',
  '#d29922',
  '#f85149',
  '#39c5cf',
  '#db6d28',
  '#8b949e'
];

export function authorColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function baseName(filePath: string): string {
  const parts = filePath.split('/');
  return parts[parts.length - 1] || filePath;
}

export function dirName(filePath: string): string {
  const index = filePath.lastIndexOf('/');
  return index === -1 ? '' : filePath.slice(0, index);
}

const CODE_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'cs',
  'cpp',
  'cc',
  'c',
  'h',
  'hpp',
  'java',
  'kt',
  'kts',
  'py',
  'rb',
  'go',
  'rs',
  'php',
  'lua',
  'swift',
  'm',
  'mm',
  'sh',
  'zsh',
  'bash',
  'ps1',
  'sql',
  'css',
  'scss',
  'less',
  'html',
  'vue',
  'svelte',
  'json',
  'jsonc',
  'yaml',
  'yml',
  'toml',
  'xml',
  'prefab',
  'unity',
  'mat',
  'asset',
  'meta',
  'shader',
  'cginc',
  'hlsl',
  'glsl'
]);

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif', 'psd']);
const ARCHIVE_EXTENSIONS = new Set(['zip', '7z', 'rar', 'tar', 'gz', 'bz2', 'xz']);
const DOC_EXTENSIONS = new Set(['md', 'txt', 'pdf', 'doc', 'docx', 'rtf', 'adoc']);

export type FileKind = 'code' | 'image' | 'archive' | 'doc' | 'generic' | 'unity';

export function fileKind(filePath: string): FileKind {
  const name = baseName(filePath).toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() ?? '' : '';
  if (ext === 'prefab' || ext === 'unity' || ext === 'asset' || ext === 'mat' || ext === 'meta') return 'unity';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (ARCHIVE_EXTENSIONS.has(ext)) return 'archive';
  if (DOC_EXTENSIONS.has(ext)) return 'doc';
  if (CODE_EXTENSIONS.has(ext) || name === 'dockerfile' || name === 'makefile') return 'code';
  return 'generic';
}

export function fileExtension(filePath: string): string {
  const name = baseName(filePath);
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index + 1).toLowerCase();
}

export function splitMultilineMessage(message: string): { subject: string; description: string } {
  const lines = message.replace(/\r\n/g, '\n').split('\n');
  return {
    subject: lines[0] ?? '',
    description: lines.slice(1).join('\n').replace(/^\n+/, '')
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function middleEllipsis(text: string, max = 60): string {
  if (text.length <= max) return text;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}
