export type ProgressOperation = 'fetch' | 'pull' | 'push';

export interface GitProgressUpdate {
  phase: string;
  phasePercent: number;
  percent: number;
  detail: string;
}

const PUSH_WEIGHTS: Record<string, [number, number]> = {
  'enumerating objects': [0, 10],
  'counting objects': [0, 10],
  'compressing objects': [10, 40],
  'writing objects': [40, 100]
};

const FETCH_WEIGHTS: Record<string, [number, number]> = {
  'enumerating objects': [0, 5],
  'counting objects': [0, 5],
  'compressing objects': [0, 20],
  'receiving objects': [20, 75],
  'resolving deltas': [75, 95],
  'updating files': [95, 100],
  'checking out files': [95, 100],
  'filtering content': [95, 100]
};

function overallPercent(
  operation: ProgressOperation,
  phase: string,
  phasePercent: number
): number {
  const weights = operation === 'push' ? PUSH_WEIGHTS : FETCH_WEIGHTS;
  const key = phase.toLowerCase();
  const range = weights[key];
  if (!range) return phasePercent;
  const [start, end] = range;
  return Math.round(start + ((end - start) * phasePercent) / 100);
}

const PROGRESS_PATTERN =
  /^(?:remote:\s*)?((?:Enumerating|Counting|Compressing|Writing|Receiving|Resolving|Updating|Checking|Filtering)\s+[A-Za-z ]+?):\s+(\d+)%(?:\s+\((\d+)\/(\d+)\))?/i;

/** Parses one Git stderr progress line. Returns null for unrelated output. */
export function parseGitProgressLine(
  line: string,
  operation: ProgressOperation
): GitProgressUpdate | null {
  const cleaned = line.replace(/^remote:\s*/i, '').trim();
  const match = PROGRESS_PATTERN.exec(cleaned);
  if (!match) return null;
  const phase = match[1].replace(/\s+/g, ' ').trim();
  const phasePercent = Math.max(0, Math.min(100, Number(match[2])));
  const percent = Math.max(0, Math.min(100, overallPercent(operation, phase, phasePercent)));
  return {
    phase,
    phasePercent,
    percent,
    detail: `${phase} ${phasePercent}%`
  };
}

/**
 * Incremental parser for Git's carriage-return based progress output. Chunks
 * from stderr can split a line, so incomplete data is buffered.
 */
export class GitProgressParser {
  private buffer = '';

  constructor(
    private readonly operation: ProgressOperation,
    private readonly onUpdate: (update: GitProgressUpdate) => void
  ) {}

  push(chunk: string): void {
    this.buffer += chunk;
    const parts = this.buffer.split(/\r\n|\r|\n/);
    this.buffer = parts.pop() ?? '';
    for (const line of parts) this.handle(line);
  }

  end(): void {
    if (this.buffer.trim()) this.handle(this.buffer);
    this.buffer = '';
  }

  private handle(line: string): void {
    const update = parseGitProgressLine(line, this.operation);
    if (update) this.onUpdate(update);
  }
}
