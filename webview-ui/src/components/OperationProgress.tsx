import React from 'react';
import { OperationProgress } from '@shared/protocol/types';
import { Spinner } from './Menu';

export function OperationProgressBar({
  progress
}: {
  progress: OperationProgress | null;
}): React.ReactElement | null {
  if (!progress) return null;
  const percent = progress.percent;
  return (
    <div
      className="operation-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      aria-label={progress.label}
    >
      <Spinner size={13} />
      <span className="operation-progress-label">{progress.label}</span>
      <span className="operation-progress-detail">{progress.detail}</span>
      <div className="operation-progress-track">
        <div
          className={`operation-progress-fill${percent === null ? ' indeterminate' : ''}`}
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
      <span className="operation-progress-percent">{percent === null ? '…' : `${percent}%`}</span>
    </div>
  );
}
