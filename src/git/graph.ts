import { GraphRow, GraphEdge } from '../protocol/types';

export interface RawCommit {
  sha: string;
  parents: string[];
}

const MAX_LANES = 80;

/**
 * Assigns stable lanes to a list of commits (in git log order) and computes the
 * segments needed to render the commit graph. Lanes are never shifted, so a lane
 * passing through a row can always be drawn as a straight vertical line.
 */
export function layoutGraph(commits: RawCommit[]): GraphRow[] {
  const lanes: (string | null)[] = [];
  const colors: number[] = [];
  let nextColor = 0;
  const rows: GraphRow[] = [];

  const ensureColor = (lane: number) => {
    if (colors[lane] === undefined) {
      colors[lane] = nextColor % 10;
      nextColor++;
    }
    return colors[lane];
  };

  for (const commit of commits) {
    const prev = lanes.slice();
    const prevColors = colors.slice();

    const matches: number[] = [];
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === commit.sha) matches.push(i);
    }

    let nodeLane: number;
    if (matches.length > 0) {
      nodeLane = matches[0];
    } else {
      const free = lanes.indexOf(null);
      if (free !== -1) nodeLane = free;
      else {
        nodeLane = lanes.length;
        lanes[nodeLane] = null;
      }
      ensureColor(nodeLane);
    }

    const extraMatches = matches.filter((lane) => lane !== nodeLane);
    for (const lane of extraMatches) lanes[lane] = null;
    lanes[nodeLane] = null;

    const outgoing: GraphEdge[] = [];
    for (let p = 0; p < commit.parents.length; p++) {
      const parent = commit.parents[p];
      let lane = lanes.indexOf(parent);
      if (lane === -1) {
        if (p === 0) {
          lane = nodeLane;
        } else {
          const free = lanes.indexOf(null);
          lane = free !== -1 ? free : lanes.length;
        }
      }
      lanes[lane] = parent;
      ensureColor(lane);
      outgoing.push({ lane, kind: p === 0 ? 'first' : 'merge' });
    }

    const through: number[] = [];
    for (let i = 0; i < Math.max(prev.length, lanes.length); i++) {
      const before = prev[i] ?? null;
      const after = lanes[i] ?? null;
      if (i === nodeLane) continue;
      if (extraMatches.includes(i)) continue;
      if (before && before === after) through.push(i);
    }

    let laneCount = 1;
    for (let i = 0; i < Math.max(prev.length, lanes.length); i++) {
      if (prev[i] || lanes[i]) laneCount = Math.max(laneCount, i + 1);
    }
    laneCount = Math.min(laneCount, MAX_LANES);

    const colorRow: number[] = [];
    for (let i = 0; i < laneCount; i++) {
      colorRow[i] = prevColors[i] ?? colors[i] ?? i % 10;
    }

    const nodeType: GraphRow['node'] =
      commit.parents.length === 0 ? 'root' : commit.parents.length > 1 ? 'merge' : 'commit';

    rows.push({
      lane: nodeLane,
      laneCount,
      incoming: extraMatches.filter((lane) => lane < laneCount),
      outgoing: outgoing.filter((edge) => edge.lane < laneCount),
      through,
      colors: colorRow,
      node: nodeType,
      startsAtTop: prev.length === 0
    });

    // Trim trailing empty lanes so the graph does not grow forever.
    let last = lanes.length - 1;
    while (last >= 0 && lanes[last] === null) last--;
    lanes.length = last + 1;
    colors.length = Math.max(colors.length, lanes.length);
  }

  return rows;
}

/** Number of lanes the whole graph needs (capped by the renderer). */
export function graphWidth(rows: GraphRow[]): number {
  return rows.reduce((max, row) => Math.max(max, row.laneCount), 1);
}
