import React from 'react';
import { Icon, IconName } from './Icon';

interface Toast {
  id: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

const ICONS: Record<Toast['level'], IconName> = {
  info: 'info',
  warn: 'alert',
  error: 'alert'
};

export function ToastHost({
  toasts,
  onDismiss
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}): React.ReactElement {
  return (
    <div className="toast-host">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.level}`}>
          <Icon name={ICONS[toast.level]} size={15} />
          <span className="toast-message">{toast.message}</span>
          <button type="button" className="toast-close" onClick={() => onDismiss(toast.id)} title="Dismiss">
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
