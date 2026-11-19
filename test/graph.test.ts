import { describe, expect, it } from 'vitest';
import { layoutGraph } from '../src/git/graph';

const sha = (n: number) => `sha${n}`;

describe('graph layout', () => {
  it('keeps a linear history in lane 0', () => {
    const rows = layoutGraph([
      { sha: sha(1), parents: [sha(2)] },
      { sha: sha(2), parents: [sha(3)] },
      { sha: sha(3), parents: [] }
    ]);
    expect(rows.map((row) => row.lane)).toEqual([0, 0, 0]);
    expect(rows[0].outgoing).toEqual([{ lane: 0, kind: 'first' }]);
    expect(rows[2].node).toBe('root');
  });

  it('opens a lane for a merge parent and closes it when reached', () => {
    const rows = layoutGraph([
      { sha: sha(1), parents: [sha(2), sha(5)] },
      { sha: sha(2), parents: [sha(3)] },
      { sha: sha(3), parents: [sha(4)] },
      { sha: sha(4), parents: [sha(5)] },
      { sha: sha(5), parents: [] }
    ]);
    expect(rows[0].lane).toBe(0);
    expect(rows[0].outgoing).toEqual([
      { lane: 0, kind: 'first' },
      { lane: 1, kind: 'merge' }
    ]);
    expect(rows[1].through).toContain(1);
    expect(rows[3].through).toContain(1);
    expect(rows[4].node).toBe('root');
    // lane 1 is reused by the first parent of the merge node at row 4
    expect(rows[4].lane).toBe(1);
  });

  it('handles commits on parallel lanes', () => {
    const rows = layoutGraph([
      { sha: sha(1), parents: [sha(2), sha(4)] },
      { sha: sha(2), parents: [sha(3)] },
      { sha: sha(4), parents: [sha(5)] },
      { sha: sha(3), parents: [sha(5)] },
      { sha: sha(5), parents: [] }
    ]);
    expect(rows.some((row) => row.laneCount > 1)).toBe(true);
    expect(rows.every((row) => row.lane >= 0)).toBe(true);
    expect(rows[4].node).toBe('root');
  });
});
