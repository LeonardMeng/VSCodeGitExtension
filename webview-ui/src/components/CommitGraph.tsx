import React from 'react';
import { GraphRow } from '@shared/protocol/types';

export const GRAPH_COLORS = [
  '#d8a33a',
  '#4f8ef7',
  '#a371f7',
  '#3fb950',
  '#f85149',
  '#39c5cf',
  '#db6d28',
  '#c678dd',
  '#7ee787',
  '#e5c07b'
];

export const LANE_WIDTH = 13;
export const GRAPH_ROW_HEIGHT = 28;
export const MAX_VISIBLE_LANES = 18;

export function graphColumnWidth(maxLanes: number): number {
  return Math.max(26, Math.min(MAX_VISIBLE_LANES, maxLanes) * LANE_WIDTH + 12);
}

export function CommitGraph({
  row,
  isHead,
  width
}: {
  row: GraphRow;
  isHead: boolean;
  width: number;
}): React.ReactElement {
  const laneX = (lane: number) => 8 + lane * LANE_WIDTH;
  const color = (lane: number) => GRAPH_COLORS[(row.colors[lane] ?? lane) % GRAPH_COLORS.length];
  const maxVisible = Math.floor((width - 8) / LANE_WIDTH);
  const visible = (lane: number) => lane <= maxVisible;
  const nodeX = laneX(row.lane);
  const nodeColor = color(row.lane);

  return (
    <svg
      className="commit-graph-svg"
      width={width}
      height={GRAPH_ROW_HEIGHT}
      viewBox={`0 0 ${width} ${GRAPH_ROW_HEIGHT}`}
      aria-hidden
    >
      {row.through.map((lane) =>
        visible(lane) ? (
          <line
            key={`t-${lane}`}
            x1={laneX(lane)}
            x2={laneX(lane)}
            y1={0}
            y2={GRAPH_ROW_HEIGHT}
            stroke={color(lane)}
            strokeWidth={1.6}
          />
        ) : null
      )}
      {!row.startsAtTop && visible(row.lane) ? (
        <line
          x1={nodeX}
          x2={nodeX}
          y1={0}
          y2={14}
          stroke={nodeColor}
          strokeWidth={1.6}
        />
      ) : null}
      {row.incoming.map((lane) =>
        visible(lane) ? (
          <path
            key={`i-${lane}`}
            d={`M ${laneX(lane)} 0 C ${laneX(lane)} 9, ${nodeX} 5, ${nodeX} 14`}
            fill="none"
            stroke={color(lane)}
            strokeWidth={1.6}
          />
        ) : null
      )}
      {row.outgoing.map((edge, index) =>
        visible(edge.lane) ? (
          edge.lane === row.lane ? (
            <line
              key={`o-${index}`}
              x1={nodeX}
              x2={nodeX}
              y1={14}
              y2={GRAPH_ROW_HEIGHT}
              stroke={nodeColor}
              strokeWidth={1.6}
            />
          ) : (
            <path
              key={`o-${index}`}
              d={`M ${nodeX} 14 C ${nodeX} 19, ${laneX(edge.lane)} 23, ${laneX(edge.lane)} ${GRAPH_ROW_HEIGHT}`}
              fill="none"
              stroke={color(edge.lane)}
              strokeWidth={1.6}
            />
          )
        ) : null
      )}
      {visible(row.lane) ? (
        <>
          {isHead ? (
            <circle cx={nodeX} cy={14} r={6.4} fill="none" stroke={nodeColor} strokeWidth={1.1} opacity={0.55} />
          ) : null}
          {row.node === 'merge' ? (
            <circle cx={nodeX} cy={14} r={4.3} fill="var(--graph-node-bg)" stroke={nodeColor} strokeWidth={1.9} />
          ) : row.node === 'root' ? (
            <circle cx={nodeX} cy={14} r={4} fill="var(--graph-node-bg)" stroke={nodeColor} strokeWidth={1.6} />
          ) : (
            <circle cx={nodeX} cy={14} r={4.1} fill={nodeColor} stroke="var(--graph-node-bg)" strokeWidth={1.2} />
          )}
        </>
      ) : null}
    </svg>
  );
}
