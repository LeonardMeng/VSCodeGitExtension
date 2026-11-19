import React from 'react';
import { Icon } from './Icon';

export function SelectionCheckbox({
  checked,
  indeterminate = false,
  title,
  onChange
}: {
  checked: boolean;
  indeterminate?: boolean;
  title: string;
  onChange: (checked: boolean) => void;
}): React.ReactElement {
  const state = indeterminate ? 'mixed' : checked ? 'true' : 'false';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state}
      aria-label={title}
      title={title}
      className={`file-checkbox${checked ? ' checked' : ''}${indeterminate ? ' indeterminate' : ''}`}
      onClick={(event) => {
        event.stopPropagation();
        onChange(!checked);
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
      }}
    >
      {checked ? <Icon name="check" size={10} /> : indeterminate ? <span className="checkbox-dash" /> : null}
    </button>
  );
}
