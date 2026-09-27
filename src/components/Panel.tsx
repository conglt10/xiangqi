import { useState, type CSSProperties, type ReactNode } from 'react';
import { useT } from '../i18n';
import styles from '../pages/pages.module.css';

const KEY = 'xq_panels_v1';

function readCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

function writeCollapsed(id: string, collapsed: boolean) {
  try {
    const all = readCollapsed();
    if (collapsed) all[id] = true;
    else delete all[id];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable: state just won't persist */
  }
}

interface PanelProps {
  /** Stable id; the collapsed state is remembered per id. */
  id: string;
  title: ReactNode;
  /** Extra header content shown on the right (stays visible when collapsed). */
  extra?: ReactNode;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/** A side panel whose body can be collapsed by clicking its header. */
export function Panel({ id, title, extra, className, style, children }: PanelProps) {
  const t = useT();
  const [collapsed, setCollapsed] = useState(() => !!readCollapsed()[id]);
  const toggle = () => {
    setCollapsed(!collapsed);
    writeCollapsed(id, !collapsed);
  };
  return (
    <div className={`${styles.panel} ${collapsed ? styles.panelCollapsed : ''} ${className ?? ''}`} style={style}>
      <div className={styles.panelTitle}>
        <button
          className={styles.panelToggle}
          onClick={toggle}
          aria-expanded={!collapsed}
          title={t(collapsed ? 'panel.expand' : 'panel.collapse')}
        >
          <span className={styles.chevron} aria-hidden>
            ▾
          </span>
          <span>{title}</span>
        </button>
        {extra}
      </div>
      {!collapsed && children}
    </div>
  );
}
