'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Shell, { StatusPill } from '../../components/ui/Shell';

type LoadingKind = 'passport' | 'order' | 'bulk' | null;

/* ---------- TS shims ---------- */
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
function csvEscape(s: string) {
  if (s == null) return '';
  const t = String(s);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/* address cell with clamp + expandable details */
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

/* bulk statuses */
const BULK_STATUS_OPTIONS = [
  { value: 'DOCUMENTS_RECEIVED', label: 'Documents Received' },
  { value: 'APPLICATIONS_SUBMITTED', label: 'Applications Submitted' },
  { value: 'PASSPORT_RECEIVED', label: 'Passport Received' },
  { value: 'PASSPORT_COURIERED', label: 'Passport Couriered' },
];

/* passport detection heuristic */
const PASSPORT_REGEX = /\b([A-Z0-9]{7,10})\b/i;

/* ----- column heuristics for bulk import ----- */
const PASSPORT_KEYS = ['passport', 'passport_number', 'passport no', 'passportno', 'pp_no', 'pp', 'ppnumber'];
const ORDER_KEYS    = ['order', 'order_id', 'order id', 'smv_order_id', 'smv order id', 'reference', 'ref', 'ref_no'];

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

  /* scan/upload UI (single image) */
  const [scanOpen, setScanOpen]       = useState(false);
  const [scanBusy, setScanBusy]       = useState(false);
  const [scanFile, setScanFile]       = useState<File | null>(null);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* BULK file UI (csv/xlsx) */
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkHeaders, setBulkHeaders] = useState<string[]>([]);
  const [bulkRows, setBulkRows] = useState<Record<string, any>[]>([]);
  const [bulkPassportCol, setBulkPassportCol] = useState<string>('');
  const [bulkOrderCol, setBulkOrderCol] = useState<string>('');
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; running: number; failed: number }>({ done: 0, total: 0, running: 0, failed: 0 });
  const [bulkFailures, setBulkFailures] = useState<Array<{ input: string; reason: string }>>([]);

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
    setLoading(kind); if (kind !== 'bulk') { setError(null); setResult(null); }
    try {
      const r = await fetch('/api/smv/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify(body),
      });
      if (r.status === 401) { await hardLogout(true); return { ok: false, reason: 'unauthorized' }; }
      const txt = await r.text();
      let js: any; try { js = JSON.parse(txt); } catch { js = { raw: txt }; }
      if (!r.ok) return { ok: false, reason: js?.error || js?.upstreamBody?.message || 'Search failed', raw: js };
      if (kind !== 'bulk') setResult(js);
      return { ok: true, data: js };
    } catch (e: any) {
      if (kind !== 'bulk') setError(`Network error: ${String(e)}`);
      return { ok: false, reason: String(e) };
    } finally {
      if (kind !== 'bulk') setLoading(null);
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

  /* data extraction (single/bulk combined) */
  const rows: any[] = result?.result?.data?.data || result?.rows || [];
  const total: number = result?.result?.data?.count ?? (Array.isArray(rows) ? rows.length : 0);

  /**
   * Upstream can return full set (ignoring limit/skip). Ensure correct paging in UI.
   */
  const pageRows = useMemo(() => {
    if (!Array.isArray(rows)) return [];
    if (rows.length > limit) return rows.slice(skip, skip + limit);
    return rows;
  }, [rows, limit, skip]);

  const showingFrom = pageRows.length ? skip + 1 : 0;
  const showingTo   = pageRows.length ? skip + pageRows.length : 0;

  /* quick lookup for page */
  const rowById = useMemo(() => {
    const m = new Map<string, any>();
    rows.forEach(r => m.set(String(r._id), r));
    return m;
  }, [rows]);

  /* selection helpers — use only current page rows */
  const visibleIds = pageRows.map(r => String(r._id));
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
  function logisticsKind(row: any): 'green'|'orange'|'blue'|'purple'|'gray' {
    const v = (localStatus.get(String(row._id)) ?? row.logistics_status ?? '').toString();
    if (v === 'PASSPORT_RECEIVED') return 'green';
    if (v === 'APPLICATIONS_SUBMITTED') return 'orange';
    if (v === 'DOCUMENTS_RECEIVED') return 'blue';
    if (v === 'PASSPORT_COURIERED') return 'purple';
    return 'gray';
  }
  function apiStatusKind(v: string): 'green'|'orange'|'blue'|'purple'|'gray' {
    if (!v) return 'gray';
    const s = v.toUpperCase();
    if (s.includes('UNASSIGNED')) return 'gray';
    if (s.includes('SUBMISSION') || s.includes('SUBMITTED')) return 'orange';
    if (s.includes('COLLECTION') || s.includes('RECEIVED')) return 'green';
    if (s.includes('OVERDUE')) return 'purple';
    return 'blue';
  }

  // ONE-STEP FLOW: apply local + persist
  async function persistSelectedStatus() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setLoading('bulk');
    try {
      const tasks = ids
        .map(id => ({ id, status: localStatus.get(id) }))
        .filter(x => x.status && x.id);

      if (tasks.length === 0) { setLoading(null); return; }

      const results = await Promise.allSettled(tasks.map(t =>
        fetch('/api/smv/status-update', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({ orderId: t.id, status: t.status })
        })
      ));

      const failures = results.filter(r => r.status === 'rejected' || (r.status==='fulfilled' && !r.value.ok));
      if (failures.length > 0) {
        setError(`${failures.length} update(s) failed. Try again or check auth.`);
      } else {
        setError(null);
      }

      // Refetch current page
      const res = await callSearch(optionalBody, null);
      if (res.ok) setResult(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(null);
    }
  }

  async function applyBulkStatus() {
    if (!bulkStatus || selectedIds.size === 0) return;
    const prev = new Map<string, string | undefined>();
    selectedIds.forEach(id => {
      const curLocal = localStatus.get(id);
      const backend  = rowById.get(id)?.logistics_status;
      prev.set(id, curLocal !== undefined ? curLocal : backend);
    });
    lastChangeRef.current = { prev, ids: new Set(selectedIds) };

    // optimistic local update
    setLocalStatus(prevMap => {
      const next = new Map(prevMap);
      selectedIds.forEach(id => next.set(id, bulkStatus));
      return next;
    });

    // immediately persist (one-step)
    await persistSelectedStatus();
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

  /* -------- Scan / Upload (single image) ---------- */
  function openScan() { setScanOpen(true); setScanBusy(false); setScanFile(null); setScanPreview(null); }
  function closeScan() { setScanOpen(false); setScanBusy(false); setScanFile(null); setScanPreview(null); }
  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setScanFile(f);
    setScanPreview(f ? URL.createObjectURL(f) : null);
  }
  async function tryExtractClient(file: File): Promise<string | null> {
    const nameHit = file.name.match(PASSPORT_REGEX)?.[1] || null;
    if (nameHit) return nameHit.toUpperCase();
    if (!file.type || !file.type.startsWith('image/')) return null;
    try {
      const BD = window.BarcodeDetector;
      if (BD) {
        const bd = new BD({ formats: ['qr_code', 'pdf417', 'code_39', 'code_128'] });
        const bitmap = await createImageBitmap(file);
        const codes = await bd.detect(bitmap);
        for (const c of codes || []) {
          const raw = String(c?.rawValue ?? '');
          const m = raw.match(PASSPORT_REGEX);
          if (m) return m[1].toUpperCase();
        }
      }
    } catch {}
    return null;
  }
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
    } catch { return null; }
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
    } finally { setScanBusy(false); }
  }

  /* -------- BULK SEARCH (CSV / XLSX) ---------- */
  function openBulk() {
    setBulkOpen(true); setBulkFile(null); setBulkHeaders([]); setBulkRows([]);
    setBulkPassportCol(''); setBulkOrderCol('');
    setBulkProgress({ done: 0, total: 0, running: 0, failed: 0 }); setBulkFailures([]);
  }
  function closeBulk() {
    setBulkOpen(false);
  }
  function onBulkFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    if (!f) return;
    setBulkFile(f);
    parseBulkFile(f);
  }

  function simpleParseCsv(text: string): { headers: string[]; rows: Record<string, any>[] } {
    const lines = text.replace(/\r/g, '').split('\n').filter(Boolean);
    if (lines.length === 0) return { headers: [], rows: [] };
    const parseLine = (ln: string) => {
      const out: string[] = [];
      let cur = '', inQ = false;
      for (let i = 0; i < ln.length; i++) {
        const ch = ln[i];
        if (inQ) {
          if (ch === '"' && ln[i+1] === '"') { cur += '"'; i++; }
          else if (ch === '"') { inQ = false; }
          else cur += ch;
        } else {
          if (ch === ',') { out.push(cur); cur = ''; }
          else if (ch === '"') { inQ = true; }
          else cur += ch;
        }
      }
      out.push(cur);
      return out;
    };
    const headers = parseLine(lines[0]).map(h => h.trim());
    const rows = lines.slice(1).map(l => {
      const cells = parseLine(l);
      const r: Record<string, any> = {};
      headers.forEach((h, i) => r[h] = (cells[i] ?? '').trim());
      return r;
    });
    return { headers, rows };
  }

  async function parseBulkFile(file: File) {
    try {
      if (file.name.toLowerCase().endsWith('.csv')) {
        const txt = await file.text();
        const { headers, rows } = simpleParseCsv(txt);
        applyBulkParsed(headers, rows);
        return;
      }
      const okXlsx = await importXlsxIfAvailable();
      if (!okXlsx) {
        setError('XLSX parsing requires the "xlsx" package. Run: npm i xlsx');
        return;
      }
      const XLSX = okXlsx as any;
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, any>[];
      const headers = rows.length ? Object.keys(rows[0]) : [];
      applyBulkParsed(headers, rows);
    } catch (e: any) {
      setError(`Failed to parse file: ${String(e)}`);
    }
  }

  async function importXlsxIfAvailable(): Promise<unknown | null> {
    try {
      // @ts-ignore
      const mod = await import('xlsx');
      return mod;
    } catch {
      return null;
    }
  }

  function applyBulkParsed(headers: string[], rows: Record<string, any>[]) {
    setBulkHeaders(headers);
    setBulkRows(rows);
    const lower = headers.map(h => h.toLowerCase());
    const findIn = (keys: string[]) => {
      for (const k of keys) {
        const idx = lower.indexOf(k);
        if (idx >= 0) return headers[idx];
      }
      return '';
    };
    const pcol = findIn(PASSPORT_KEYS);
    const ocol = findIn(ORDER_KEYS);
    setBulkPassportCol(pcol);
    setBulkOrderCol(ocol);
  }

  function deriveBulkJobs(): Array<{ passport?: string; orderId?: string; raw: any }> {
    const jobs: Array<{ passport?: string; orderId?: string; raw: any }> = [];
    const seen = new Set<string>();

    for (const r of bulkRows) {
      const p = String((bulkPassportCol ? r[bulkPassportCol] : '') || '').trim();
      const o = String((bulkOrderCol ? r[bulkOrderCol] : '') || '').trim();

      if (!p && !o) continue;

      let key = '';
      if (p) key = `P:${p.toUpperCase()}`;
      else key = `O:${o.toUpperCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const job: any = { raw: r };
      if (p) job.passport = p.toUpperCase();
      if (o) job.orderId  = o.toUpperCase();
      jobs.push(job);
    }
    return jobs;
  }

  async function runBulkSearch() {
    const jobs = deriveBulkJobs();
    if (jobs.length === 0) { setError('No valid rows found. Choose the correct columns or check your file.'); return; }

    setLoading('bulk');
    setError(null);
    setBulkFailures([]);
    setBulkProgress({ done: 0, total: jobs.length, running: 0, failed: 0 });

    const concurrency = 4;
    let index = 0;
    const outRows: any[] = [];

    async function worker() {
      while (true) {
        const i = index++;
        if (i >= jobs.length) return;
        const job = jobs[i];

        setBulkProgress(p => ({ ...p, running: p.running + 1 }));
        const body = job.passport ? { passport: job.passport, ...optionalBody } : { orderId: job.orderId, ...optionalBody };
        const res = await callSearch(body, 'bulk');

        if (res?.ok) {
          const rows: any[] = res.data?.result?.data?.data || [];
          if (Array.isArray(rows) && rows.length > 0) outRows.push(...rows);
          else setBulkFailures(f => [...f, { input: job.passport || job.orderId || 'UNKNOWN', reason: 'No matching rows' }]);
        } else {
          setBulkFailures(f => [...f, { input: job.passport || job.orderId || 'UNKNOWN', reason: res?.reason || 'Failed' }]);
        }
        setBulkProgress(p => ({ ...p, running: p.running - 1, done: p.done + 1, failed: res?.ok ? p.failed : p.failed + 1 }));
      }
    }

    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);

    setLoading(null);
    setResult({ rows: outRows });
    setSelectedIds(new Set());
  }

  function downloadFailuresCsv() {
    if (bulkFailures.length === 0) return;
    const header = 'input,reason\n';
    const body = bulkFailures.map(r => `${csvEscape(r.input)},${csvEscape(r.reason)}`).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'bulk-failures.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  /* ------------- UI ------------- */
  return (
    <Shell
      title="Logistics Console"
      active="dashboard"
      rightActions={
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button className="btn" onClick={openBulk}>
            <span className="material-symbols-outlined">table_view</span> Bulk Search
          </button>
          <button className="btn" onClick={openScan}>
            <span className="material-symbols-outlined">photo_camera</span> Scan / Upload
          </button>
          <label className="label" style={{ display:'flex', alignItems:'center', gap:6 }}>
            <input type="checkbox" checked={autoSearch} onChange={(e) => setAutoSearch(e.target.checked)} />
            Auto-search
          </label>
          <button className="btn" onClick={logout}>
            <span className="material-symbols-outlined">logout</span> Logout
          </button>
        </div>
      }
    >
      {/* Bulk search panel */}
      {bulkOpen && (
        <section className="card" style={{ marginTop: 12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <h3 className="label">Bulk Search (CSV / XLSX)</h3>
            <button className="btn" onClick={closeBulk}>Close</button>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap: 12, alignItems:'end', marginTop: 8 }}>
            <div>
              <label className="label">Upload file</label>
              <input type="file" accept=".csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx" onChange={onBulkFile} />
              <p className="label" style={{ marginTop: 6, opacity: .8 }}>
                Auto-detects a <em>Passport</em> or <em>Order ID</em> column. You can override below.
              </p>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn primary" onClick={runBulkSearch} disabled={!bulkRows.length || loading === 'bulk'}>
                {loading === 'bulk' ? 'Searching…' : 'Run Bulk Search'}
              </button>
              {bulkFailures.length > 0 && (
                <button className="btn" onClick={downloadFailuresCsv}>Download failures</button>
              )}
            </div>
          </div>

          {bulkHeaders.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop: 12 }}>
              <div>
                <label className="label">Passport column</label>
                <select className="input" value={bulkPassportCol} onChange={e=>setBulkPassportCol(e.target.value)}>
                  <option value="">— none —</option>
                  {bulkHeaders.map(h => <option key={`p-${h}`} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Order ID column</label>
                <select className="input" value={bulkOrderCol} onChange={e=>setBulkOrderCol(e.target.value)}>
                  <option value="">— none —</option>
                  {bulkHeaders.map(h => <option key={`o-${h}`} value={h}>{h}</option>)}
                </select>
              </div>
            </div>
          )}

          {(loading === 'bulk' || bulkProgress.total > 0) && (
            <div style={{ marginTop: 12 }}>
              <div className="label" style={{ marginBottom: 6 }}>
                Progress: {bulkProgress.done}/{bulkProgress.total}
                {bulkProgress.running ? ` (running ${bulkProgress.running})` : ''} •
                {bulkFailures.length ? ` failures ${bulkFailures.length}` : ' no failures'}
              </div>
              <div style={{ height: 10, background:'#eee', borderRadius: 6, overflow:'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${bulkProgress.total ? (bulkProgress.done / bulkProgress.total) * 100 : 0}%`,
                  background: '#60a5fa'
                }} />
              </div>
            </div>
          )}

          {bulkFailures.length > 0 && (
            <details style={{ marginTop: 12 }}>
              <summary className="label">Show failures</summary>
              <ul className="label" style={{ marginTop: 8 }}>
                {bulkFailures.slice(0, 50).map((f, i) => (
                  <li key={i}>{f.input}: {f.reason}</li>
                ))}
                {bulkFailures.length > 50 && <li>…and {bulkFailures.length - 50} more</li>}
              </ul>
            </details>
          )}
        </section>
      )}

      {/* Scan / Upload drawer (single image) */}
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

      {/* === Two-column grid: Search (left) + Filters/Pagination (right) === */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: 16,
          marginTop: 16,
        }}
      >
        {/* search (single) */}
        <section className="card">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
            <div>
              <label className="label">Passport Number Or Order ID</label>
              <input
                className="input"
                placeholder="e.g. A0000000 or SMV-ABC-00000"
                value={passport}
                onChange={(e) => setPassport(e.target.value)}
                onKeyDown={onPassportKey}
              />
            </div>
            <button className="btn primary" onClick={searchByPassport} disabled={!passport.trim() || loading === 'passport'}>
              {loading === 'passport' ? 'Searching…' : 'Search'}
            </button>
          </div>

          <div style={{ height: 12 }} />

{/*           <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
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
          </div> */}
        </section>

        {/* filters + pagination */}
        <section className="card">
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
            <button
              className="btn"
              onClick={() => setSkip((s) => s + limit)}
              disabled={(total && (skip + limit) >= total) || (!total && rows.length < limit)}
            >
              Next ▶
            </button>

            <span className="label" style={{ marginLeft: 8 }}>
              {total ? `Showing ${showingFrom}-${showingTo} of ${total}` : rows.length ? `Showing ${rows.length}` : 'No results yet'}
            </span>
          </div>
        </section>
      </div>
      {/* === /Two-column grid === */}

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
            <button className="btn primary" onClick={applyBulkStatus} disabled={!bulkStatus || selectedIds.size === 0}>
              Apply to selected
            </button>
            <button className="btn" onClick={resetToPrevious} disabled={!lastChangeRef.current}>Reset to previous</button>
            {selectedIds.size > 0 && <button className="btn" onClick={clearSelection}>Clear selection</button>}
          </div>
        </div>

        {error && <p className="label" style={{ color:'#fca5a5', marginTop: 8 }}>{error}</p>}

        {pageRows && pageRows.length > 0 && (
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
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>Status</th>
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>Logistics Status</th>
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>Assigned For</th>
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>Appointment</th>
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>Travel End</th>
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>Pickup Address</th>
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>Drop Address</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r: any) => {
                  const id = String(r._id);
                  const isSelected = selectedIds.has(id);
                  const apiStatus = (r.status ?? '').toString();

                  return (
                    <tr key={id} style={{ borderTop:'1px solid #2223', verticalAlign:'top', background: isSelected ? 'rgba(109,94,252,0.06)' : 'transparent' }}>
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

                      {/* API status pill */}
                      <td style={{ padding:'8px' }}>
                        <StatusPill kind={apiStatusKind(apiStatus)}>{apiStatus || '—'}</StatusPill>
                      </td>

                      {/* Logistics status pill */}
                      <td style={{ padding:'8px' }}>
                        <StatusPill kind={logisticsKind(r)}>{displayLogisticsStatus(r)}</StatusPill>
                      </td>

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
      </section>

      {/* Developer Tools (keep raw JSON here) */}
      <section className="card" style={{ marginTop: 16 }}>
        <h3 className="label">Developer Tools</h3>
        {result && (
          <details style={{ marginTop: 8 }}>
            <summary className="label">Debug / Raw JSON (proxy response)</summary>
            <pre style={{ whiteSpace:'pre-wrap', fontSize:12, marginTop: 8 }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        )}
      </section>
    </Shell>
  );
}
