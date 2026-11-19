import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DiffAction, DiffHunk, DiffLine, FileDiff } from '@shared/protocol/types';
import { Icon } from './Icon';
import { EmptyState, IconButton, MenuItem, Spinner, useContextMenu } from './Menu';
import { middleEllipsis } from '../utils/format';
import { WordSegment, wordDiff } from '../utils/wordDiff';

interface DiffViewerProps {
  diff: FileDiff | null;
  loading: boolean;
  error: string | null;
  editable: boolean;
  primaryAction?: 'stage' | 'unstage';
  discardable?: boolean;
  sideLabel?: string;
  contextLines: number;
  fullFile: boolean;
  defaultMode: 'unified' | 'split';
  defaultShowWhitespace?: boolean;
  defaultWordWrap?: boolean;
  onContextLinesChange: (value: number) => void;
  onFullFileChange: (value: boolean) => void;
  onApply?: (action: DiffAction, hunkIndex: number, lineIndexes?: number[], hunkHeader?: string) => void;
  onOpenFile?: () => void;
  onFileHistory?: () => void;
  onBlame?: () => void;
  onCopy?: (text: string) => void;
  onShowInFolder?: () => void;
  onToast?: (level: 'info' | 'warn' | 'error', message: string) => void;
  readOnlyOptions?: boolean;
  headerActions?: React.ReactNode;
  emptyMessage?: string;
  emptyDescription?: string;
  emptyIcon?: import('./Icon').IconName;
}

type SelectionMap = Map<number, Set<number>>;

interface HunkPairRow {
  left: DiffLine | null;
  right: DiffLine | null;
  leftIndex: number | null;
  rightIndex: number | null;
}

export function DiffViewer(props: DiffViewerProps): React.ReactElement {
  const {
    diff,
    loading,
    error,
    editable,
    primaryAction,
    discardable,
    sideLabel,
    contextLines,
    fullFile,
    defaultMode,
    onApply
  } = props;

  const [mode, setMode] = useState<'unified' | 'split'>(defaultMode);
  const [showWhitespace, setShowWhitespace] = useState(!!props.defaultShowWhitespace);
  const [showNewline, setShowNewline] = useState(false);
  const [wordWrap, setWordWrap] = useState(!!props.defaultWordWrap);
  const [selection, setSelection] = useState<SelectionMap>(new Map());
  const [currentHunk, setCurrentHunk] = useState(0);
  const hunkRefs = useRef<Array<HTMLDivElement | null>>([]);
  const lastClicked = useRef<{ hunk: number; index: number } | null>(null);
  const { openMenu, menuNode } = useContextMenu();

  useEffect(() => {
    setSelection(new Map());
    lastClicked.current = null;
    setCurrentHunk(0);
  }, [diff?.path, diff?.side, diff?.hunks.length, contextLines, fullFile]);

  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode]);

  const wordSegments = useMemo(() => {
    const map = new Map<string, WordSegment[]>();
    if (!diff) return { oldMap: map, newMap: map };
    const oldMap = new Map<string, WordSegment[]>();
    const newMap = new Map<string, WordSegment[]>();
    for (const hunk of diff.hunks) {
      let i = 0;
      while (i < hunk.lines.length) {
        const line = hunk.lines[i];
        if (line.kind === 'del') {
          const dels: DiffLine[] = [];
          while (i < hunk.lines.length && hunk.lines[i].kind === 'del') dels.push(hunk.lines[i++]);
          const adds: DiffLine[] = [];
          while (i < hunk.lines.length && hunk.lines[i].kind === 'add') adds.push(hunk.lines[i++]);
          const pairs = Math.min(dels.length, adds.length);
          for (let p = 0; p < pairs; p++) {
            const result = wordDiff(dels[p].text, adds[p].text);
            oldMap.set(`${dels[p].oldLine}:${dels[p].text}`, result.old);
            newMap.set(`${adds[p].newLine}:${adds[p].text}`, result.new);
          }
        } else {
          i++;
        }
      }
    }
    return { oldMap, newMap };
  }, [diff]);

  if (!diff && loading) {
    return (
      <div className="diff-viewer">
        <div className="diff-loading">
          <Spinner size={20} />
          <span>Loading diff…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="diff-viewer">
        <EmptyState icon="alert" title="Unable to load the diff" description={error} />
      </div>
    );
  }

  if (!diff) {
    return (
      <div className="diff-viewer">
        <EmptyState
          icon={props.emptyIcon ?? 'file'}
          title={props.emptyMessage ?? 'Select a file to view changes'}
          description={
            props.emptyDescription ?? 'Choose a modified file in the list to see its diff.'
          }
        />
      </div>
    );
  }

  const hasHunks = diff.hunks.length > 0;
  const totalLines = Math.max(
    1,
    ...diff.hunks.map((hunk) => Math.max(hunk.oldStart + hunk.oldLines, hunk.newStart + hunk.newLines))
  );

  const scrollToHunk = (index: number) => {
    const clamped = Math.max(0, Math.min(index, diff.hunks.length - 1));
    setCurrentHunk(clamped);
    hunkRefs.current[clamped]?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const makeSelection = (hunk: DiffHunk, index: number, event: React.MouseEvent): void => {
    const line = hunk.lines[index];
    if (!line || line.kind === 'context') return;
    setSelection((current) => {
      const next = new Map<number, Set<number>>(Array.from(current.entries()).map(([key, value]) => [key, new Set(value)]));
      const hunkSet = next.get(hunk.index) ?? new Set<number>();
      if (event.shiftKey && lastClicked.current?.hunk === hunk.index) {
        const from = Math.min(lastClicked.current.index, index);
        const to = Math.max(lastClicked.current.index, index);
        for (let i = from; i <= to; i++) {
          if (hunk.lines[i].kind !== 'context') hunkSet.add(i);
        }
      } else if (event.metaKey || event.ctrlKey) {
        if (hunkSet.has(index)) hunkSet.delete(index);
        else hunkSet.add(index);
      } else {
        const onlyThis = hunkSet.size === 1 && hunkSet.has(index);
        if (onlyThis) hunkSet.clear();
        else {
          hunkSet.clear();
          hunkSet.add(index);
        }
      }
      if (hunkSet.size) next.set(hunk.index, hunkSet);
      else next.delete(hunk.index);
      return next;
    });
    lastClicked.current = { hunk: hunk.index, index };
  };

  const selectedCount = [...selection.values()].reduce((sum, set) => sum + set.size, 0);

  const runAction = (action: DiffAction, hunkIndex: number, indexes?: number[], hunkHeader?: string) => {
    onApply?.(action, hunkIndex, indexes, hunkHeader);
    setSelection(new Map());
  };

  const menuItems: MenuItem[] = [
    { label: 'Copy File Path', icon: 'copy', onSelect: () => props.onCopy?.(diff.path) },
    ...(props.onOpenFile ? [{ label: 'Open File', icon: 'external' as const, onSelect: props.onOpenFile }] : []),
    ...(props.onShowInFolder
      ? [{ label: 'Show in Finder / Explorer', icon: 'folderOpen' as const, onSelect: props.onShowInFolder }]
      : []),
    ...(props.onFileHistory ? [{ label: 'File History', icon: 'history' as const, onSelect: props.onFileHistory }] : []),
    ...(props.onBlame ? [{ label: 'Blame', icon: 'info' as const, onSelect: props.onBlame }] : [])
  ];

  return (
    <div className="diff-viewer">
      <div className="diff-toolbar">
        <div className="diff-toolbar-group">
          <IconButton
            icon="chevronUp"
            title="Previous change"
            disabled={!hasHunks}
            onClick={() => scrollToHunk(currentHunk - 1)}
          />
          <IconButton
            icon="chevronDown"
            title="Next change"
            disabled={!hasHunks}
            onClick={() => scrollToHunk(currentHunk + 1)}
          />
          <span className="hunk-counter" title="Current change">
            {hasHunks ? `${currentHunk + 1}/${diff.hunks.length}` : '—'}
          </span>
        </div>
        <div className="diff-path" title={diff.path}>
          <span className="diff-path-text">{middleEllipsis(diff.path, 74)}</span>
          {sideLabel ? <span className={`diff-side diff-side-${sideLabel.toLowerCase()}`}>{sideLabel}</span> : null}
        </div>
        <div className="diff-toolbar-group diff-toolbar-right">
          <IconButton
            icon="whitespace"
            title="Show whitespace"
            active={showWhitespace}
            onClick={() => setShowWhitespace((value) => !value)}
          />
          <IconButton
            icon="newline"
            title="Show line endings"
            active={showNewline}
            onClick={() => setShowNewline((value) => !value)}
          />
          <IconButton
            icon="wrap"
            title="Word wrap"
            active={wordWrap}
            onClick={() => setWordWrap((value) => !value)}
          />
          {props.readOnlyOptions ? null : (
            <>
              <div className="context-control" title="Context lines">
                <button
                  type="button"
                  className="context-button"
                  onClick={() => props.onContextLinesChange(Math.max(0, contextLines - 1))}
                >
                  −
                </button>
                <span className="context-value">{contextLines}</span>
                <button
                  type="button"
                  className="context-button"
                  onClick={() => props.onContextLinesChange(Math.min(100, contextLines + 1))}
                >
                  +
                </button>
              </div>
              <IconButton
                icon="expand"
                title={fullFile ? 'Show changed lines only' : 'Show full file'}
                active={fullFile}
                onClick={() => props.onFullFileChange(!fullFile)}
              />
            </>
          )}
          <IconButton
            icon={mode === 'unified' ? 'split' : 'list'}
            title={mode === 'unified' ? 'Side-by-side view' : 'Unified view'}
            onClick={() => setMode((value) => (value === 'unified' ? 'split' : 'unified'))}
          />
          <IconButton
            icon="dots"
            title="Diff actions"
            onClick={(event) => openMenu(event, menuItems)}
          />
        </div>
      </div>

      {props.headerActions ? <div className="diff-header-actions">{props.headerActions}</div> : null}

      {diff.binary ? (
        <div className="diff-binary">
          {diff.image ? (
            <ImageDiff diff={diff} />
          ) : (
            <EmptyState icon="image" title="Binary file" description="The contents of this binary file cannot be shown as text." />
          )}
        </div>
      ) : !hasHunks ? (
        <EmptyState
          icon={diff.tooLarge ? 'alert' : 'check'}
          title={diff.tooLarge ? 'File is too large' : 'No textual changes'}
          description={
            diff.tooLarge
              ? 'The file exceeds the size limit for the text diff viewer.'
              : diff.modeChange
                ? diff.modeChange
                : 'This file has no textual differences in the selected revision.'
          }
        />
      ) : (
        <div className={`diff-scroll${wordWrap ? ' wrap' : ''}`} onScroll={() => undefined}>
          <div className="diff-body">
            <div className="diff-content">
              {diff.hunks.map((hunk) => {
                const selected = selection.get(hunk.index);
                const selectedChanges = selected?.size ?? 0;
                const selectedAdds = selected
                  ? [...selected].filter((index) => hunk.lines[index]?.kind === 'add').length
                  : 0;
                const selectedDels = selected ? selectedChanges - selectedAdds : 0;
                return (
                  <div
                    key={hunk.index}
                    className={`diff-hunk${currentHunk === hunk.index ? ' current' : ''}`}
                    ref={(element) => {
                      hunkRefs.current[hunk.index] = element;
                    }}
                  >
                    <div className="diff-hunk-header">
                      <div className="hunk-header-text">
                        <span className="hunk-header-range">{hunk.header}</span>
                        {hunk.section ? <span className="hunk-section">{hunk.section}</span> : null}
                      </div>
                      {editable && onApply ? (
                        <div className="hunk-actions">
                          {selectedChanges ? (
                            <>
                              <span className="line-selection-info">
                                {selectedChanges} line{selectedChanges === 1 ? '' : 's'} selected
                                {selectedAdds ? ` · +${selectedAdds}` : ''}
                                {selectedDels ? ` · −${selectedDels}` : ''}
                              </span>
                              <button
                                type="button"
                                className="hunk-button primary"
                                onClick={() =>
                                  runAction(
                                    primaryAction ?? 'stage',
                                    hunk.index,
                                    selected ? [...selected] : undefined,
                                    hunk.header
                                  )
                                }
                              >
                                <Icon name="stage" size={12} />
                                {primaryAction === 'unstage' ? 'Unstage' : 'Stage'} {selectedChanges} line
                                {selectedChanges === 1 ? '' : 's'}
                              </button>
                              <button
                                type="button"
                                className="hunk-button"
                                onClick={() => setSelection(new Map())}
                              >
                                Clear
                              </button>
                            </>
                          ) : (
                            <>
                              {primaryAction === 'unstage' ? (
                                <button
                                  type="button"
                                  className="hunk-button primary"
                                  onClick={() => runAction('unstage', hunk.index, undefined, hunk.header)}
                                >
                                  <Icon name="unstage" size={12} /> Unstage Hunk
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="hunk-button primary"
                                  onClick={() => runAction('stage', hunk.index, undefined, hunk.header)}
                                >
                                  <Icon name="stage" size={12} /> Stage Hunk
                                </button>
                              )}
                              {discardable ? (
                                <button
                                  type="button"
                                  className="hunk-button danger"
                                  onClick={() => runAction('discard', hunk.index, undefined, hunk.header)}
                                  title="Discard this hunk"
                                >
                                  <Icon name="discard" size={12} /> Discard
                                </button>
                              ) : null}
                            </>
                          )}
                        </div>
                      ) : null}
                    </div>

                    {mode === 'unified' ? (
                      <div className="hunk-lines">
                        {hunk.lines.map((line, index) => (
                          <UnifiedLine
                            key={`${line.oldLine}-${line.newLine}-${index}`}
                            line={line}
                            index={index}
                            hunk={hunk}
                            selected={!!selected?.has(index)}
                            selectable={editable && !!onApply}
                            showWhitespace={showWhitespace}
                            showNewline={showNewline}
                            segments={
                              line.kind === 'del'
                                ? wordSegments.oldMap.get(`${line.oldLine}:${line.text}`)
                                : line.kind === 'add'
                                  ? wordSegments.newMap.get(`${line.newLine}:${line.text}`)
                                  : undefined
                            }
                            onSelect={makeSelection}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="hunk-lines split-lines">
                        {buildSplitRows(hunk).map((row, index) => (
                          <SplitRow
                            key={index}
                            row={row}
                            hunk={hunk}
                            selectedLines={selected ?? new Set<number>()}
                            selectable={editable && !!onApply}
                            showWhitespace={showWhitespace}
                            showNewline={showNewline}
                            wordSegments={wordSegments}
                            onSelect={makeSelection}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      )}
      {hasHunks && !diff.binary ? (
        <div className="diff-minimap" aria-hidden>
          {diff.hunks.map((hunk) => {
            const top = Math.min(98, ((hunk.newStart || hunk.oldStart) / totalLines) * 100);
            const height = Math.min(24, Math.max(2.5, ((hunk.newLines || hunk.oldLines) / totalLines) * 100));
            return (
              <button
                key={hunk.index}
                type="button"
                className="minimap-mark"
                style={{ top: `${top}%`, height: `${height}%` }}
                title={hunk.section || hunk.header}
                onClick={() => scrollToHunk(hunk.index)}
              />
            );
          })}
        </div>
      ) : null}

      {loading ? (
        <div className="diff-refresh-overlay">
          <Spinner size={16} />
        </div>
      ) : null}
      {menuNode}
    </div>
  );
}

function UnifiedLine({
  line,
  index,
  hunk,
  selected,
  selectable,
  showWhitespace,
  showNewline,
  segments,
  onSelect
}: {
  line: DiffLine;
  index: number;
  hunk: DiffHunk;
  selected: boolean;
  selectable: boolean;
  showWhitespace: boolean;
  showNewline: boolean;
  segments?: WordSegment[];
  onSelect: (hunk: DiffHunk, index: number, event: React.MouseEvent) => void;
}): React.ReactElement {
  const content = renderContent(line.text, showWhitespace, showNewline);
  return (
    <div
      className={`diff-line diff-line-${line.kind}${selected ? ' selected' : ''}${selectable && line.kind !== 'context' ? ' selectable' : ''}`}
      onClick={
        selectable
          ? (event) => {
              if (line.kind === 'context') return;
              event.preventDefault();
              onSelect(hunk, index, event);
            }
          : undefined
      }
    >
      <span className="line-number old">{line.oldLine ?? ''}</span>
      <span className="line-number new">{line.newLine ?? ''}</span>
      <span className="line-prefix">{line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' '}</span>
      <span className="line-content">
        {segments ? <Segments segments={segments} kind={line.kind} /> : content}
        {line.noNewline ? <span className="no-newline">⏎ no newline at end of file</span> : null}
      </span>
    </div>
  );
}

function SplitRow({
  row,
  hunk,
  selectedLines,
  selectable,
  showWhitespace,
  showNewline,
  wordSegments,
  onSelect
}: {
  row: HunkPairRow;
  hunk: DiffHunk;
  selectedLines: Set<number>;
  selectable: boolean;
  showWhitespace: boolean;
  showNewline: boolean;
  wordSegments: { oldMap: Map<string, WordSegment[]>; newMap: Map<string, WordSegment[]> };
  onSelect: (hunk: DiffHunk, index: number, event: React.MouseEvent) => void;
}): React.ReactElement {
  const left = row.left;
  const right = row.right;
  const leftSegments = left
    ? wordSegments.oldMap.get(`${left.oldLine}:${left.text}`)
    : undefined;
  const rightSegments = right
    ? wordSegments.newMap.get(`${right.newLine}:${right.text}`)
    : undefined;
  return (
    <div className="split-row">
      <div
        className={`split-cell split-left ${left ? `diff-line-${left.kind}` : 'empty'}${row.leftIndex !== null && selectedLines.has(row.leftIndex) ? ' selected' : ''}${selectable && left && left.kind !== 'context' ? ' selectable' : ''}`}
        onClick={
          selectable && left && left.kind !== 'context' && row.leftIndex !== null
            ? (event) => onSelect(hunk, row.leftIndex!, event)
            : undefined
        }
      >
        <span className="line-number old">{left?.oldLine ?? ''}</span>
        <span className="line-prefix">{left ? (left.kind === 'add' ? '+' : left.kind === 'del' ? '−' : ' ') : ''}</span>
        <span className="line-content">
          {left ? (
            leftSegments ? (
              <Segments segments={leftSegments} kind={left.kind} />
            ) : (
              renderContent(left.text, showWhitespace, showNewline)
            )
          ) : null}
          {left?.noNewline ? <span className="no-newline">⏎</span> : null}
        </span>
      </div>
      <div
        className={`split-cell split-right ${right ? `diff-line-${right.kind}` : 'empty'}${row.rightIndex !== null && selectedLines.has(row.rightIndex) ? ' selected' : ''}${selectable && right && right.kind !== 'context' ? ' selectable' : ''}`}
        onClick={
          selectable && right && right.kind !== 'context' && row.rightIndex !== null
            ? (event) => onSelect(hunk, row.rightIndex!, event)
            : undefined
        }
      >
        <span className="line-number new">{right?.newLine ?? ''}</span>
        <span className="line-prefix">{right ? (right.kind === 'add' ? '+' : right.kind === 'del' ? '−' : ' ') : ''}</span>
        <span className="line-content">
          {right ? (
            rightSegments ? (
              <Segments segments={rightSegments} kind={right.kind} />
            ) : (
              renderContent(right.text, showWhitespace, showNewline)
            )
          ) : null}
          {right?.noNewline ? <span className="no-newline">⏎</span> : null}
        </span>
      </div>
    </div>
  );
}

/** The line click handler receives the real hunk; this adapter keeps props small. */
function buildSplitRows(hunk: DiffHunk): HunkPairRow[] {
  const rows: HunkPairRow[] = [];
  let i = 0;
  while (i < hunk.lines.length) {
    const line = hunk.lines[i];
    if (line.kind === 'context') {
      rows.push({ left: line, right: line, leftIndex: i, rightIndex: i });
      i++;
      continue;
    }
    const dels: Array<{ line: DiffLine; index: number }> = [];
    const adds: Array<{ line: DiffLine; index: number }> = [];
    while (i < hunk.lines.length && hunk.lines[i].kind === 'del') {
      dels.push({ line: hunk.lines[i], index: i });
      i++;
    }
    while (i < hunk.lines.length && hunk.lines[i].kind === 'add') {
      adds.push({ line: hunk.lines[i], index: i });
      i++;
    }
    const count = Math.max(dels.length, adds.length);
    for (let p = 0; p < count; p++) {
      rows.push({
        left: dels[p]?.line ?? null,
        right: adds[p]?.line ?? null,
        leftIndex: dels[p]?.index ?? null,
        rightIndex: adds[p]?.index ?? null
      });
    }
  }
  return rows;
}

function renderContent(text: string, showWhitespace: boolean, showNewline: boolean): React.ReactNode {
  if (!showWhitespace && !showNewline) {
    return text || '\u00a0';
  }
  const nodes: React.ReactNode[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer) {
      nodes.push(buffer);
      buffer = '';
    }
  };
  for (const char of text) {
    if (showWhitespace && char === ' ') {
      flush();
      nodes.push(
        <span className="ws-char" key={nodes.length}>
          ·
        </span>
      );
    } else if (showWhitespace && char === '\t') {
      flush();
      nodes.push(
        <span className="ws-char ws-tab" key={nodes.length}>
          →
        </span>
      );
    } else {
      buffer += char;
    }
  }
  flush();
  if (showNewline) {
    nodes.push(
      <span className="ws-char ws-newline" key={nodes.length}>
        ↵
      </span>
    );
  }
  return nodes.length ? nodes : '\u00a0';
}

function Segments({ segments, kind }: { segments: WordSegment[]; kind: DiffLine['kind'] }): React.ReactElement {
  return (
    <>
      {segments.map((segment, index) =>
        segment.changed ? (
          <span className={`word-diff word-diff-${kind === 'add' ? 'add' : 'del'}`} key={index}>
            {segment.text}
          </span>
        ) : (
          <React.Fragment key={index}>{segment.text}</React.Fragment>
        )
      )}
    </>
  );
}

function ImageDiff({ diff }: { diff: FileDiff }): React.ReactElement {
  const image = diff.image;
  if (!image) return <EmptyState icon="image" title="Binary file" />;
  return (
    <div className="image-diff">
      <div className="image-diff-pane">
        <div className="image-diff-label">{image.oldLabel ?? 'Before'}</div>
        {image.oldDataUri ? (
          <img src={image.oldDataUri} alt={`Before ${diff.path}`} />
        ) : (
          <div className="image-diff-empty">No previous version</div>
        )}
      </div>
      <div className="image-diff-pane">
        <div className="image-diff-label">{image.newLabel ?? 'After'}</div>
        {image.newDataUri ? (
          <img src={image.newDataUri} alt={`After ${diff.path}`} />
        ) : (
          <div className="image-diff-empty">File deleted</div>
        )}
      </div>
    </div>
  );
}
