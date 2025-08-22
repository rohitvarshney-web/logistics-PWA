// components/ui/Shell.tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function Shell({
  title,
  active,
  children,
  rightActions,
}: {
  title: string;
  active?: 'dashboard' | 'orders' | 'tasks' | 'reports';
  rightActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [now, setNow] = useState<string>('');

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const fmt = new Intl.DateTimeFormat(undefined, {
        weekday: 'short', month: 'short', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      }).format(d);
      setNow(fmt);
    };
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="app-shell">
      {/* left rail */}
      <aside className="app-sidebar">
        <div className="brand">
          <span className="material-symbols-outlined">widgets</span>
          <span>NUCLEUS</span>
        </div>
        <nav className="nav">
          <Link className={active === 'dashboard' ? 'active' : ''} href="#">
            <span className="material-symbols-outlined">dashboard</span>
            <span className="label">Logistics Console</span>
          </Link>
          <Link className={active === 'orders' ? 'active' : ''} href="#">
            <span className="material-symbols-outlined">local_shipping</span>
            <span className="label">Logistic Orders</span>
          </Link>
          <Link className={active === 'tasks' ? 'active' : ''} href="#">
            <span className="material-symbols-outlined">checklist</span>
            <span className="label">Logistic Tasks</span>
          </Link>
          <Link className={active === 'reports' ? 'active' : ''} href="#">
            <span className="material-symbols-outlined">bar_chart</span>
            <span className="label">Reports</span>
          </Link>
        </nav>
      </aside>

      {/* content */}
      <section className="app-main">
        <div className="topbar">
          <div className="title">
            <button className="btn ghost" aria-label="Back">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <span>{title}</span>
          </div>
          <div className="actions">
            <span className="label">{now}</span>
            {rightActions}
          </div>
        </div>

        <div className="container">{children}</div>
      </section>
    </div>
  );
}

/* small helpers to render status chips if you want to reuse them */
export function StatusPill({ kind, children }: { kind: 'green'|'orange'|'blue'|'purple'|'gray'; children: React.ReactNode }) {
  return <span className={`pill pill--${kind}`}>{children}</span>;
}
