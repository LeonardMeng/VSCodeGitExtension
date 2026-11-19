import { describe, expect, it } from 'vitest';
import { GitProgressParser, parseGitProgressLine } from '../src/git/progress';

describe('Git progress parser', () => {
  it('maps push phases to an overall percentage', () => {
    expect(parseGitProgressLine('Writing objects:  50% (5/10), 1.00 MiB | 2.00 MiB/s', 'push')).toMatchObject({
      phase: 'Writing objects',
      phasePercent: 50,
      percent: 70,
      detail: 'Writing objects 50%'
    });
  });

  it('maps pull phases and strips the remote prefix', () => {
    expect(parseGitProgressLine('remote: Compressing objects: 100% (3/3), done.', 'pull')).toMatchObject({
      phase: 'Compressing objects',
      phasePercent: 100,
      percent: 20
    });
    expect(parseGitProgressLine('Receiving objects:  40% (40/100)', 'pull')?.percent).toBe(42);
    expect(parseGitProgressLine('Resolving deltas: 100% (20/20), done.', 'pull')?.percent).toBe(95);
  });

  it('ignores unrelated stderr lines', () => {
    expect(parseGitProgressLine('From github.com:org/repo', 'fetch')).toBeNull();
    expect(parseGitProgressLine('Already up to date.', 'pull')).toBeNull();
  });

  it('buffers chunks split across stderr writes', () => {
    const updates: number[] = [];
    const parser = new GitProgressParser('push', (update) => updates.push(update.percent));
    parser.push('Writing obj');
    parser.push('ects: 25% (1/4)\rWriting objects: 100% (4/4)\r');
    parser.push('Enumerating objects: 4, done.\n');
    parser.end();
    expect(updates).toEqual([55, 100]);
  });
});
