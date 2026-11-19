import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, IconName } from './Icon';

export interface MenuItem {
  label?: string;
  icon?: IconName;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
  onSelect?: () => void;
}

interface MenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
  width?: number;
}

export function Menu({ x, y, items, onClose, width = 220 }: MenuProps): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const margin = 8;
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - rect.width - margin);
    if (top + rect.height > window.innerHeight - margin) top = Math.max(margin, y - rect.height);
    setPosition({ left, top });
  }, [x, y, items]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="menu-backdrop" onMouseDown={onClose} onContextMenu={(event) => event.preventDefault()}>
      <div
        ref={ref}
        className="menu"
        style={{ left: position.left, top: position.top, width }}
        onMouseDown={(event) => event.stopPropagation()}
        role="menu"
      >
        {items.map((item, index) =>
          item.separator ? (
            <div className="menu-separator" key={`sep-${index}`} />
          ) : (
            <button
              key={`${item.label}-${index}`}
              type="button"
              className={`menu-item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}`}
              disabled={item.disabled}
              role="menuitem"
              onClick={() => {
                onClose();
                item.onSelect?.();
              }}
            >
              <span className="menu-icon">
                {item.checked ? <Icon name="check" size={13} /> : item.icon ? <Icon name={item.icon} size={14} /> : null}
              </span>
              <span className="menu-label">{item.label}</span>
              {item.shortcut ? <span className="menu-shortcut">{item.shortcut}</span> : null}
            </button>
          )
        )}
      </div>
    </div>,
    document.body
  );
}

export function useContextMenu(): {
  openMenu: (event: React.MouseEvent, items: MenuItem[]) => void;
  menuNode: React.ReactElement | null;
  closeMenu: () => void;
} {
  const [state, setState] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const closeMenu = React.useCallback(() => setState(null), []);
  const openMenu = React.useCallback((event: React.MouseEvent, items: MenuItem[]) => {
    event.preventDefault();
    event.stopPropagation();
    setState({ x: event.clientX, y: event.clientY, items });
  }, []);
  return {
    openMenu,
    closeMenu,
    menuNode: state ? <Menu x={state.x} y={state.y} items={state.items} onClose={closeMenu} /> : null
  };
}

interface DropdownProps {
  label?: string;
  icon?: IconName;
  items: MenuItem[];
  title?: string;
  className?: string;
  align?: 'left' | 'right';
  chevron?: boolean;
  children?: React.ReactNode;
  width?: number;
}

/** A toolbar button that opens a menu anchored to the button. */
export function Dropdown({
  label,
  icon,
  items,
  title,
  className,
  align = 'left',
  chevron = true,
  width
}: DropdownProps): React.ReactElement {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`toolbar-button ${className ?? ''}${anchor ? ' open' : ''}`}
        title={title ?? label}
        onClick={() => {
          if (anchor) {
            setAnchor(null);
            return;
          }
          const rect = buttonRef.current?.getBoundingClientRect();
          if (!rect) return;
          setAnchor({
            x: align === 'right' ? rect.right : rect.left,
            y: rect.bottom + 5
          });
        }}
      >
        {icon ? <Icon name={icon} size={16} /> : null}
        {label ? <span className="toolbar-label">{label}</span> : null}
        {chevron ? <Icon name="chevronDown" size={11} className="dropdown-chevron" /> : null}
      </button>
      {anchor ? (
        <Menu
          x={align === 'right' ? anchor.x - (width ?? 230) : anchor.x}
          y={anchor.y}
          items={items}
          width={width}
          onClose={() => setAnchor(null)}
        />
      ) : null}
    </>
  );
}

export function IconButton({
  icon,
  title,
  onClick,
  active,
  disabled,
  size = 16,
  className
}: {
  icon: IconName;
  title: string;
  onClick?: (event: React.MouseEvent) => void;
  active?: boolean;
  disabled?: boolean;
  size?: number;
  className?: string;
}): React.ReactElement {
  return (
    <button
      type="button"
      className={`icon-button${active ? ' active' : ''}${className ? ` ${className}` : ''}`}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

export function Spinner({ size = 14 }: { size?: number }): React.ReactElement {
  return <Icon name="spinner" size={size} className="spin" />;
}

export function EmptyState({
  icon,
  title,
  description,
  children
}: {
  icon: IconName;
  title: string;
  description?: string;
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Icon name={icon} size={28} />
      </div>
      <div className="empty-state-title">{title}</div>
      {description ? <div className="empty-state-description">{description}</div> : null}
      {children ? <div className="empty-state-actions">{children}</div> : null}
    </div>
  );
}
