'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type LoadingKind = 'passport' | 'order' | null;

// ----- Utils -----
function useDebounced<T>(value: T, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

function fmtDateTime(x: any) {
  if (!x) return '';
  const d = new Date(x);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

function fmtDateOnly(x: any) {
  if (!x) return '';
  const d = new Date(x);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString();
}

function AddressCell({ label, text, maxWidth = 280 }: { label: string; text?: string; maxWidth?: number }) {
  const val = text?.trim() || '';
  return (
    <td style={{ padding: '8px', verticalAlign: 'top' }}>
      <div style={{ maxWidth }}>
        {/* 2-line clamp preview with tooltip */}
        <div
          title={val || label}
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as any,
            overflow: 'hidden',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            lineHeight: '1.3',
            opacity: val ? 1 : 0.6,
          }}
        >
          {val || '—'}
        </div>
        {/* Expandable full text */}
        {val && (
          <details style={{ marginTop: 6 }}>
            <summary className="label" style={{ fontSize: 12, cursor: 'pointer' }}>Expand</summary>
            <div
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                marginTop: 6,
                padding: 8,
                border: '1px solid #0001',
                borderRadius: 8,
                maxHeight: 240,
                overflow: 'auto',
                background: 'var(--card, #f8fafc)',
              }}
            >
              {val}
            </div>
          </details>
        )}
      </div>
    </td>
  );
}

// Bulk status options (client-side for now)
const BULK_STATUS_OPTIONS = [
  { value: 'DOCUMENTS_RECEIVED', label: 'Documents Received' },
  { value: 'APPLICATIONS_SUBMITTED', label: 'Applications Submitted' },
  { value: 'PASSPORT_RECEIVED', label: 'Passport Received' },
  { value: 'PASSPORT_COURIERED', label: 'Passport Couriered' },
];

export default function DashboardPage() {
  // Inputs
  const [passport, setPassport] = useState('');
  const [orderId, setOrderId] = useState('');

  // Pagination
  const [limit, setLimit] = useState(10);
  const [skip, setSkip] = useState(0);

  // Optional filters (comma-separated -> arrays)
  const [statusCsv, setStatusCsv] = useState('');     // UNASSIGNED,PENDING
  const [typeCsv, setTypeCsv] = useState('');         // SUBMISSION,PICKUP
  const [currentTask, setCurrentTask] = useState(''); // leave empty to omit

  // Auto-search toggle
  const [autoSearch, setAutoSearch] = useState(false);

  // State
  const [loading, setLoading] = useState<LoadingKind>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  // Local status overlay map (client-only until backend wired)
  const [localStatus, setLocalStatus] = useState<Map<string, string>>(new Map());
  const [bulkStatus, setBulkStatus] = useState<string>('');

  // Debounced values for auto-search
  const dPassport = useDebounced(passport, 500);
  const dOrderId  = useDebounced(orderId, 500);
  const dLimit    = useDebounced(limit, 300);
  const dSkip     = useDebounced(skip, 300);
  const dStatusCsv = useDebounced(statusCsv, 500);
  const dTypeCsv   = useDebounced(typeCsv, 500);
  const dCurrentTask = useDebounced(currentTask, 500);

  // Build optional fields only if provided
  const optionalBody = useMemo(() => {
    const body: Record<string, any> = { limit: dLimit, skip: dSkip, sort: ['created_at#!#-1'] };
    const status = dStatusCsv.split(',').map(s => s.trim()).filter(Boolean);
    const types  = dTypeCsv.split(',').map(s => s.trim()).filter(Boolean);
    if (status.length) body.status = status;
    if (types.length)  body.type   = types;
    if (dCurrentTask !== '') body.currentTask = dCurrentTask || null;
    return body;
  }, [dLimit, dSkip, dStatusCsv, dTypeCsv, dCurrentTask]);

  async function callSearch(body: Record<string, any>, kind: LoadingKind) {
    setLoading(kind);
    setError(null);
    setResult(null);

    try {
      const r = await fetch('/api/smv/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (r.status === 401) {
        try { localStorage.removeItem('smv_token'); } catch {}
        window.location.href = '/login?logged_out=1';
        return;
      }

      const txt = await r.text();
      let js: any; try { js = JSON.parse(txt); } catch { js = { raw: txt }; }

      if (!r.ok) setError(js?.error || js?.upstreamBody?.message || 'Search failed');
      setResult(js);

      // keep selection; you can clear it on new page if you prefer
    } catch (e: any) {
      setError(`Network error: ${String(e)}`);
    } finally {
      setLoading(null);
    }
  }

  // Manual actions
  function searchByPassport() {
    const s = passport.trim();
    if (!s) return;
    return callSearch({ passport: s, ...optionalBody }, 'passport');
  }
  function searchByOrder() {
    const s = orderId.trim();
    if (!s) return;
    return callSearch({ orderId: s, ...optionalBody }, 'order');
  }

  // Enter to search
  function onPassportKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') searchByPassport();
  }
  function onOrderKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') searchByOrder();
  }

  // Auto-search
  useEffect(() => {
    if (!autoSearch) return;
    const s = dPassport.trim();
    if (s) callSearch({ passport: s, ...optionalBody }, 'passport');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSearch, dPassport, optionalBody]);

  useEffect(() => {
    if (!autoSearch) return;
    const s = dOrderId.trim();
    if (s) callSearch({ orderId: s, ...optionalBody }, 'order');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSearch, dOrderId, optionalBody]);

  // Logout
  async function logout() {
    try { localStorage.removeItem('smv_token'); } catch {}
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login?logged_out=1';
  }

  // Data extraction
  const rows: any[] = result?.result?.data?.data || [];
  const total: number = result?.result?.data?.count ?? (Array.isArray(rows) ? rows.length : 0);

  const showingFrom = rows.length ? skip + 1 : 0;
  const showingTo   = rows.length ? skip + rows.length : 0;

  // Selection helpers
  const visibleIds = rows.map(r => String(r._id));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some(id => selectedIds.has(id)) && !allVisibleSelected;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  function toggleSelectAllVisible(checked: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) visibleIds.forEach(id => next.add(id));
      else visibleIds.forEach(id => next.delete(id));
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  // Bulk status apply (client-side)
  function applyBulkStatus() {
    if (!bulkStatus || selectedIds.size === 0) return;
    setLocalStatus(prev => {
      const next = new Map(prev);
      selectedIds.forEach(id => next.set(id, bulkStatus));
      return next;
    });
  }

  // Resolve logistics status display
  function displayLogisticsStatus(row: any): string {
    const id = String(row._id);
    const local = localStatus.get(id);
    if (local) return humanizeStatus(local);
    // fallbacks from backend fields if any
    return humanizeStatus(row.logistics_status || row.status || '');
  }

  function humanizeStatus(s: string): string {
    if (!s) return '—';
    const map: Record<string,string> = {
      DOCUMENTS_RECEIVED: 'Documents Received',
      APPLICATIONS_SUBMITTED: 'Applications Submitted',
      PASSPORT_RECEIVED: 'Passport Received',
      PASSPORT_COURIERED: 'Passport Couriered',
      UNASSIGNED: 'Unassigned',
    };
    return map[s] || s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  return (
    <main className="container" style={{ maxWidth: 1200 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h1>SMV Logistics Console</h1>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <label className="label" style={{ display:'flex', alignItems:'center', gap:6 }}>
            <input type="checkbox" checked={autoSearch} onChange={e => setAutoSearch(e.target.checked)} />
            Auto-search
          </label>
          <button className="btn" onClick={logout}>Logout</button>
        </div>
      </header>

      {/* Search inputs */}
      <section className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
          <div>
            <label className="label">Passport Number</label>
            <input
              className="input"
              placeholder="e.g. W1184034"
              value={passport}
              onChange={(e) => setPassport(e.target.value)}
              onKeyDown={onPassportKey}
            />
          </div>
          <button className="btn primary" onClick={searchByPassport} disabled={!passport.trim() || loading === 'passport'}>
            {loading === 'passport' ? 'Searching…' : 'Search Passport'}
          </button>
        </div>

        <div style={{ height: 12 }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
          <div>
            <label className="label">Order ID</label>
          <input
              className="input"
              placeholder="e.g. SMV-SGP-07907"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              onKeyDown={onOrderKey}
            />
          </div>
          <button className="btn" onClick={searchByOrder} disabled={!orderId.trim() || loading === 'order'}>
            {loading === 'order' ? 'Searching…' : 'Search Order'}
          </button>
        </div>
      </section>

      {/* Filters + pagination */}
      <section className="card" style={{ marginTop: 16 }}>
        <h3 className="label">Filters (optional)</h3>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
          <div>
            <label className="label">Status (CSV)</label>
            <input className="input" placeholder="e.g. UNASSIGNED,PENDING" value={statusCsv} onChange={(e)=>setStatusCsv(e.target.value)} />
          </div>
          <div>
            <label className="label">Type (CSV)</label>
            <input className="input" placeholder="e.g. SUBMISSION,PICKUP" value={typeCsv} onChange={(e)=>setTypeCsv(e.target.value)} />
          </div>
          <div>
            <label className="label">Current Task</label>
            <input className="input" placeholder="leave empty to omit" value={currentTask} onChange={(e)=>setCurrentTask(e.target.value)} />
          </div>
        </div>

        <div style={{ height: 12 }} />

        <h3 className="label">Pagination</h3>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <label className="label">Limit</label>
          <input className="input" style={{ width: 90 }} type="number" min={1} value={limit}
                 onChange={(e)=>setLimit(Math.max(1, Number(e.target.value) || 10))} />
          <label className="label">Skip</label>
          <input className="input" style={{ width: 120 }} type="number" min={0} value={skip}
                 onChange={(e)=>setSkip(Math.max(0, Number(e.target.value) || 0))} />

          <button className="btn" onClick={() => setSkip((s) => Math.max(0, s - limit))} disabled={skip === 0}>◀ Prev</button>
          <button className="btn" onClick={() => setSkip((s) => s + limit)} disabled={rows.length < limit}>Next ▶</button>

          <span className="label" style={{ marginLeft: 8 }}>
            {total ? `Showing ${showingFrom}-${showingTo} of ${total}` : rows.length ? `Showing ${rows.length}` : 'No results yet'}
          </span>
        </div>
      </section>

      {/* Results + bulk toolbar */}
      <section className="card" style={{ marginTop: 24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <h3 className="label">Results</h3>

          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span className="label">{selectedIds.size} selected</span>
            <select className="input" style={{ width: 260 }} value={bulkStatus} onChange={e=>setBulkStatus(e.target.value)}>
              <option value="">Update status…</option>
              {BULK_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button className="btn" onClick={applyBulkStatus} disabled={!bulkStatus || selectedIds.size === 0}>Apply to selected</button>
            {selectedIds.size > 0 && <button className="btn" onClick={clearSelection}>Clear selection</button>}
          </div>
        </div>

        {error && <p className="label" style={{ color:'#fca5a5', marginTop: 8 }}>{error}</p>}

        {rows && rows.length > 0 && (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {/* master select — centered and aligned */}
                  <th style={{ width: 44, padding:'8px' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <input
                        ref={headerCheckboxRef}
                        type="checkbox"
                        aria-label="Select all visible"
                        checked={allVisibleSelected}
                        onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                      />
                    </div>
                  </th>
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>SMV Order</th>
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>Passport</th>
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>Type</th>
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>Logistics Status</th>
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>Assigned For</th>
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>Appointment</th>
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>Travel End</th>
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>Pickup Address</th>
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>Drop Address</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => {
                  const id = String(r._id);
                  const isSelected = selectedIds.has(id);
                  return (
                    <tr key={id} style={{ borderTop:'1px solid #2223', verticalAlign:'top', background: isSelected ? 'rgba(59,130,246,0.08)' : 'transparent' }}>
                      <td style={{ padding:'8px' }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <input
                            type="checkbox"
                            aria-label={`Select row ${id}`}
                            checked={isSelected}
                            onChange={(e) => toggleRow(id, e.target.checked)}
                          />
                        </div>
                      </td>

                      <td style={{ padding:'8px' }}>{r.smv_order_id || ''}</td>
                      <td style={{ padding:'8px', fontWeight:600 }}>{r.passport_number || ''}</td>
                      <td style={{ padding:'8px' }}>{r.type || ''}</td>
                      <td style={{ padding:'8px' }}>{displayLogisticsStatus(r)}</td>
                      <td style={{ padding:'8px' }}>{r.assigned_for || ''}</td>
                      <td style={{ padding:'8px' }}>{fmtDateTime(r.appointment_date)}</td>
                      <td style={{ padding:'8px' }}>{fmtDateOnly(r.travel_end_date)}</td>

                      <AddressCell label="Pickup Address" text={r.pickup_address} />
                      <AddressCell label="Drop Address"   text={r.drop_address} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Debug raw payload (optional) */}
        {result && (
          <details style={{ marginTop: 12 }}>
            <summary className="label">Debug / Raw JSON (proxy response)</summary>
            <pre style={{ whiteSpace:'pre-wrap', fontSize:12, marginTop: 8 }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        )}
      </section>
    </main>
  );
}
