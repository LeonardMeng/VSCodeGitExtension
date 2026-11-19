import React, { useEffect, useMemo, useState } from 'react';
import { AppConfig, FileDiff } from '@shared/protocol/types';
import { Icon } from './Icon';
import { EmptyState, Spinner } from './Menu';
import { DiffViewer } from './DiffViewer';
import { FileTypeIcon, StatusBadge } from './StatusBadge';
import { middleEllipsis } from '../utils/format';

interface StashPreviewState {
  index: number;
  loading: boolean;
  files: FileDiff[] | null;
  error?: string;
}

export function StashPreviewPanel({
  preview,
  config,
  onClose,
  onApply,
  onPop,
  onDrop,
  onCopy
}: {
  preview: StashPreviewState;
  config: AppConfig;
  onClose: () => void;
  onApply: () => void;
  onPop: () => void;
  onDrop: () => void;
  onCopy: (text: string) => void;
}): React.ReactElement {
  const files = preview.files ?? [];
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [contextLines, setContextLines] = useState(config.contextLines);
  const [fullFile, setFullFile] = useState(false);

  useEffect(() => {
    setSelectedPath(files[0]?.path ?? null);
  }, [preview.index, preview.files]);

  const selected = useMemo(
    () => files.find((file) => file.path === selectedPath) ?? files[0] ?? null,
    [files, selectedPath]
  );
  const message = selected?.meta?.stashMessage ?? files[0]?.meta?.stashMessage ?? '';

  return (
    <div className="stash-preview">
      <div className="stash-preview-header">
        <div className="stash-preview-title">
          <span className="stash-icon">
            <Icon name="archive" size={16} />
          </span>
          <div className="stash-title-text">
            <div className="stash-title-line">
              <strong>stash@{`{${preview.index}}`}</strong>
              <span className="stash-file-count">
                {files.length} file{files.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="stash-message" title={message}>
              {message || 'Stash preview'}
            </div>
          </div>
        </div>
        <div className="stash-preview-actions">
          <button type="button" className="secondary-button" onClick={onApply} disabled={preview.loading}>
            <Icon name="save" size={13} /> Apply
          </button>
          <button type="button" className="secondary-button" onClick={onPop} disabled={preview.loading}>
            <Icon name="archive" size={13} /> Pop
          </button>
          <button type="button" className="danger-button" onClick={onDrop} disabled={preview.loading}>
            <Icon name="trash" size={13} /> Drop
          </button>
          <button type="button" className="icon-button" onClick={onClose} title="Close stash preview">
            <Icon name="close" size={15} />
          </button>
        </div>
      </div>
      {preview.loading ? (
        <div className="stash-loading">
          <Spinner size={18} />
          <span>Loading stash…</span>
        </div>
      ) : preview.error ? (
        <EmptyState icon="alert" title="Unable to read this stash" description={preview.error} />
      ) : !files.length ? (
        <EmptyState icon="archive" title="Empty stash" description="This stash does not contain any changes." />
      ) : (
        <div className="stash-preview-body">
          <div className="stash-files">
            <div className="stash-files-header">
              <Icon name="fileTree" size={13} />
              <span>Changed files</span>
            </div>
            <div className="stash-file-list">
              {files.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  className={`stash-file-row${selected?.path === file.path ? ' active' : ''}`}
                  title={file.path}
                  onClick={() => setSelectedPath(file.path)}
                >
                  <FileTypeIcon path={file.path} />
                  <span className="stash-file-name">{middleEllipsis(file.path, 42)}</span>
                  <StatusBadge status={file.status} />
                </button>
              ))}
            </div>
          </div>
          <div className="stash-diff">
            <DiffViewer
              diff={selected}
              loading={false}
              error={null}
              editable={false}
              contextLines={contextLines}
              fullFile={fullFile}
              defaultMode={config.diffMode}
              defaultShowWhitespace={config.showWhitespace}
              defaultWordWrap={config.wordWrap}
              readOnlyOptions
              onContextLinesChange={setContextLines}
              onFullFileChange={setFullFile}
              onCopy={onCopy}
              emptyMessage="Select a file in the stash"
            />
          </div>
        </div>
      )}
    </div>
  );
}
