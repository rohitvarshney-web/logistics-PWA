'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type LoadingKind = 'passport' | 'order' | null;

/* ---------- TS shims ---------- */
// Some TS lib targets don’t declare this; keep it lightweight.
declare global {
  interface Window { BarcodeDetector?: any }
}

/* ---------- utils ---------- */
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
  const val = (text ?? '').trim();
  return (
    <td style={{ padding: '8px', verticalAlign: 'top' }}>
      <div style={{ maxWidth }}>
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

/* bulk statuses (client-only overlay for now) */
const BULK_STATUS_OPTIONS = [
  { value: 'DOCUMENTS_RECEIVED', label: 'Documents Received' },
  { value: 'APPLICATIONS_SUBMITTED', label: 'Applications Submitted' },
  { value: 'PASSPORT_RECEIVED', label: 'Passport Received' },
  { value: 'PASSPORT_COURIERED', label: 'Passport Couriered' },
];

/* quick/passive passport heuristic */
const PASSPORT_REGEX = /\b([A-Z0-9]{7,10})\b/i;

/* ---------- component ---------- */
export default function DashboardPage() {
  /* inputs */
  const [passport, setPassport] = useState('');
  const [orderId, setOrderId]   = useState('');

  /* pagination */
  const [limit, setLimit] = useState(10);
  const [skip, setSkip]   = useState(0);

  /* optional filters */
  const [statusCsv, setStatusCsv]       = useState('');
  const [typeCsv, setTypeCsv]           = useState('');
  const [currentTask, setCurrentTask]   = useState('');

  /* toggles/state */
  const [autoSearch, setAutoSearch] = useState(false);
  const [loading, setLoading]       = useState<LoadingKind>(null);
  const [error, setError]           = useState<string | null>(null);
  const [result, setResult]         = useState<any>(null);

  /* selection */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  /* logistics status overlay (client) + undo buffer */
  const [localStatus, setLocalStatus] = useState<Map<string, string>>(new Map());
  const lastChangeRef = useRef<{ prev: Map<string, string | undefined>, ids: Set<string> } | null>(null);
  const [bulkStatus, setBulkStatus]   = useState<string>('');

  /* scan/upload UI */
  const [scanOpen, setScanOpen]       = useState(false);
  const [scanBusy, setScanBusy]       = useState(false);
  const [scanFile, setScanFile]       = useState<File | null>(null);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* debounced */
  const dPassport    = useDebounced(passport, 500);
  const dOrderId     = useDebounced(orderId, 500);
  const dLimit       = useDebounced(limit, 300);
  const dSkip        = useDebounced(skip, 300);
  const dStatusCsv   = useDebounced(statusCsv, 500);
  const dTypeCsv     = useDebounced(typeCsv, 500);
  const dCurrentTask = useDebounced(currentTask, 500);

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
    setLoading(kind); setError(null); setResult(null);
    try {
      const r = await fetch('/api/smv/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (r.status === 401) { await hardLogout(true); return; }
      const txt = await r.text();
      let js: any; try { js = JSON.parse(txt); } catch { js = { raw: txt }; }
      if (!r.ok) setError(js?.error || js?.upstreamBody?.message || 'Search failed');
      setResult(js);
    } catch (e: any) {
      setError(`Network error: ${String(e)}`);
    } finally {
      setLoading(null);
    }
  }

  /* manual search */
  function searchByPassport() { const s = passport.trim(); if (!s) return; return callSearch({ passport: s, ...optionalBody }, 'passport'); }
  function searchByOrder()    { const s = orderId.trim();  if (!s) return; return callSearch({ orderId: s,  ...optionalBody }, 'order'); }

  /* enter to search */
  function onPassportKey(e: React.KeyboardEvent<HTMLInputElement>) { if (e.key === 'Enter') searchByPassport(); }
  function onOrderKey(e: React.KeyboardEvent<HTMLInputElement>)    { if (e.key === 'Enter') searchByOrder(); }

  /* auto-search */
  useEffect(() => { if (!autoSearch) return; const s = dPassport.trim(); if (s) callSearch({ passport: s, ...optionalBody }, 'passport'); /* eslint-disable-next-line */ }, [autoSearch, dPassport, optionalBody]);
  useEffect(() => { if (!autoSearch) return; const s = dOrderId.trim();  if (s) callSearch({ orderId: s,  ...optionalBody }, 'order');    /* eslint-disable-next-line */ }, [autoSearch, dOrderId, optionalBody]);

  /* robust logout */
  async function hardLogout(fromAuthFail = false) {
    try {
      try { localStorage.removeItem('smv_token'); } catch {}
      try { sessionStorage.clear(); } catch {}
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister().catch(() => {})));
      }
      if (typeof caches !== 'undefined' && caches.keys) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k).catch(() => {})));
      }
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', cache: 'no-store' }).catch(() => {});
    } finally {
      const url = '/login?logged_out=1' + (fromAuthFail ? '&auth=fail' : '');
      window.location.replace(url);
    }
  }
  async function logout() { await hardLogout(false); }

  /* data extraction */
  const rows: any[] = result?.result?.data?.data || [];
  const total: number = result?.result?.data?.count ?? (Array.isArray(rows) ? rows.length : 0);
  const showingFrom = rows.length ? skip + 1 : 0;
  const showingTo   = rows.length ? skip + rows.length : 0;

  /* quick lookup for page */
  const rowById = useMemo(() => {
    const m = new Map<string, any>();
    rows.forEach(r => m.set(String(r._id), r));
    return m;
  }, [rows]);

  /* selection helpers */
  const visibleIds = rows.map(r => String(r._id));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some(id => selectedIds.has(id)) && !allVisibleSelected;
  useEffect(() => { if (headerCheckboxRef.current) headerCheckboxRef.current.indeterminate = someVisibleSelected; }, [someVisibleSelected]);

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
      if (checked) visibleIds.forEach(id => next.add(id)); else visibleIds.forEach(id => next.delete(id));
      return next;
    });
  }
  function clearSelection() { setSelectedIds(new Set()); }

  /* logistics status overlay + undo */
  function humanize(s: string): string {
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
  function displayLogisticsStatus(row: any): string {
    const id = String(row._id);
    const local = localStatus.get(id);
    if (local !== undefined) return humanize(local);
    return humanize(row.logistics_status || '');
  }

  function applyBulkStatus() {
    if (!bulkStatus || selectedIds.size === 0) return;
    const prev = new Map<string, string | undefined>();
    selectedIds.forEach(id => {
      const curLocal = localStatus.get(id);
      const backend  = rowById.get(id)?.logistics_status;
      prev.set(id, curLocal !== undefined ? curLocal : backend);
    });
    lastChangeRef.current = { prev, ids: new Set(selectedIds) };
    setLocalStatus(prevMap => {
      const next = new Map(prevMap);
      selectedIds.forEach(id => next.set(id, bulkStatus));
      return next;
    });
  }

  function resetToPrevious() {
    const last = lastChangeRef.current;
    if (!last) return;
    setLocalStatus(prevMap => {
      const next = new Map(prevMap);
      const targetIds = selectedIds.size > 0 ? selectedIds : last.ids;
      targetIds.forEach(id => {
        const prevVal = last.prev.get(id);
        if (prevVal === undefined || prevVal === null || prevVal === '') next.delete(id);
        else next.set(id, prevVal);
      });
      return next;
    });
  }

  /* -------- Scan / Upload Passport ---------- */
  function openScan() { setScanOpen(true); setScanBusy(false); setScanFile(null); setScanPreview(null); }
  function closeScan() { setScanOpen(false); setScanBusy(false); setScanFile(null); setScanPreview(null); }
  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setScanFile(f);
    setScanPreview(f ? URL.createObjectURL(f) : null);
  }

  // Client-side extraction (no canvas.convertToBlob; images only)
  async function tryExtractClient(file: File): Promise<string | null> {
    // 1) filename heuristic
    const nameHit = file.name.match(PASSPORT_REGEX)?.[1] || null;
    if (nameHit) return nameHit.toUpperCase();

    // images only for client detector; PDFs go to server OCR
    if (!file.type || !file.type.startsWith('image/')) return null;

    // 2) BarcodeDetector if supported
    try {
      const BD = window.BarcodeDetector;
      if (BD) {
        const bd = new BD({ formats: ['qr_code', 'pdf417', 'code_39', 'code_128'] });
        const bitmap = await createImageBitmap(file);           // pass ImageBitmap directly
        const codes = await bd.detect(bitmap);
        for (const c of codes || []) {
          const raw = String(c?.rawValue ?? '');
          const m = raw.match(PASSPORT_REGEX);
          if (m) return m[1].toUpperCase();
        }
      }
    } catch {/* swallow and fallback to server */}

    return null;
  }

  // Server OCR fallback stub (wire your OCR later)
  async function tryExtractServer(file: File): Promise<string | null> {
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/smv/scan-passport', { method: 'POST', body: fd, credentials: 'include' });
      if (!r.ok) return null;
      const js = await r.json().catch(() => ({}));
      const val: string | undefined = js?.passport || js?.data?.passport;
      if (val && PASSPORT_REGEX.test(val)) return val.toUpperCase();
      return null;
    } catch {
      return null;
    }
  }

  async function extractAndSearch() {
    if (!scanFile) return;
    setScanBusy(true);
    try {
      let code = await tryExtractClient(scanFile);
      if (!code) code = await tryExtractServer(scanFile);
      if (!code) { setError('Could not read passport from the image. Please try another photo or type it manually.'); return; }
      setPassport(code);
      setScanOpen(false);
      await callSearch({ passport: code, ...optionalBody }, 'passport');
    } finally {
      setScanBusy(false);
    }
  }

  /* ---------- UI ---------- */
  return (
    <main className="container" style={{ maxWidth: 1200 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h1>SMV Logistics Console</h1>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button className="btn" onClick={openScan}>📷 Scan / Upload</button>
          <label className="label" style={{ display:'flex', alignItems:'center', gap:6 }}>
            <input type="checkbox" checked={autoSearch} onChange={(e) => setAutoSearch(e.target.checked)} />
            Auto-search
          </label>
          <button className="btn" onClick={logout}>Logout</button>
        </div>
      </header>

      {/* Scan / Upload drawer */}
      {scanOpen && (
        <section className="card" style={{ marginTop: 12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <h3 className="label">Scan / Upload Passport</h3>
            <button className="btn" onClick={closeScan}>Close</button>
          </div>

          <p className="label" style={{ marginTop: 8 }}>
            Take a clear photo of the passport page with the MRZ lines, or upload an existing image/PDF.
          </p>

          <div style={{ display:'flex', gap:16, alignItems:'flex-start', flexWrap:'wrap', marginTop: 8 }}>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                onChange={onPickFile}
              />
              <div className="label" style={{ marginTop: 8, opacity: 0.8 }}>
                Tip: On mobile, this opens the camera for a fresh capture.
              </div>
              <div style={{ marginTop: 12, display:'flex', gap:8 }}>
                <button className="btn primary" onClick={extractAndSearch} disabled={!scanFile || scanBusy}>
                  {scanBusy ? 'Reading…' : 'Extract & Search'}
                </button>
                <button className="btn" onClick={() => { setScanFile(null); setScanPreview(null); if (fileInputRef.current) fileInputRef.current.value=''; }}>
                  Clear
                </button>
              </div>
            </div>

            {scanPreview && (
              <div style={{ border:'1px solid #0001', borderRadius: 8, padding: 8, maxWidth: 280 }}>
                <div className="label" style={{ marginBottom: 6 }}>Preview</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={scanPreview} alt="preview" style={{ maxWidth: '100%', height: 'auto', borderRadius: 6 }} />
              </div>
            )}
          </div>
        </section>
      )}

      {/* search */}
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

      {/* filters + pagination */}
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

      {/* results + bulk toolbar */}
      <section className="card" style={{ marginTop: 24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <h3 className="label">Results</h3>

          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span className="label">{selectedIds.size} selected</span>
            <select className="input" style={{ width: 260 }} value={bulkStatus} onChange={e=>setBulkStatus(e.target.value)}>
              <option value="">Update logistics status…</option>
              {BULK_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button className="btn" onClick={applyBulkStatus} disabled={!bulkStatus || selectedIds.size === 0}>Apply to selected</button>
            <button className="btn" onClick={resetToPrevious} disabled={!lastChangeRef.current}>Reset to previous</button>
            {selectedIds.size > 0 && <button className="btn" onClick={clearSelection}>Clear selection</button>}
          </div>
        </div>

        {error && <p className="label" style={{ color:'#fca5a5', marginTop: 8 }}>{error}</p>}

        {rows && rows.length > 0 && (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
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
                  {/* API status preserved as-is */}
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>Status</th>
                  {/* Separate logistics status */}
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
                      <td style={{ padding:'8px' }}>{r.status ?? '—'}</td> {/* API status */}
                      <td style={{ padding:'8px' }}>{displayLogisticsStatus(r)}</td> {/* logistics overlay */}
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
