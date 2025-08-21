'use client';

import { useEffect, useMemo, useState } from 'react';

type LoadingKind = 'passport' | 'order' | null;

// tiny debounce hook (used for optional auto-search)
function useDebounced<T>(value: T, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function fmtDate(x: any) {
  if (!x) return '';
  const d = new Date(x);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

export default function DashboardPage() {
  // Inputs
  const [passport, setPassport] = useState('');
  const [orderId, setOrderId] = useState('');

  // Pagination
  const [limit, setLimit] = useState(10);
  const [skip, setSkip] = useState(0);

  // Optional filters (comma-separated -> arrays)
  const [statusCsv, setStatusCsv] = useState('');     // e.g. UNASSIGNED,PENDING
  const [typeCsv, setTypeCsv] = useState('');         // e.g. PICKUP,DELIVERY
  const [currentTask, setCurrentTask] = useState(''); // leave empty to omit

  // Auto-search toggle
  const [autoSearch, setAutoSearch] = useState(false);

  // State
  const [loading, setLoading] = useState<LoadingKind>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

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
    const body: Record<string, any> = { limit: dLimit, skip: dSkip };
    // sort default (matches upstream expectation)
    body.sort = ['created_at#!#-1'];

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
        credentials: 'include', // send cookies (smv_token) to proxy
        body: JSON.stringify(body),
      });

      // Handle expired/missing token here
      if (r.status === 401) {
        try { localStorage.removeItem('smv_token'); } catch {}
        window.location.href = '/login?logged_out=1';
        return;
      }

      const txt = await r.text();
      let js: any; try { js = JSON.parse(txt); } catch { js = { raw: txt }; }

      if (!r.ok) {
        setError(js?.error || js?.upstreamBody?.message || 'Search failed');
      }
      setResult(js);
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

  // Auto-search behavior
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

  // Logout (clears client token + hits server to clear cookies & caches)
  async function logout() {
    try { localStorage.removeItem('smv_token'); } catch {}
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login?logged_out=1';
  }

  // Extract rows + count safely from the proxy response
  const rows: any[] = result?.result?.data?.data || [];
  const total: number = result?.result?.data?.count ?? (Array.isArray(rows) ? rows.length : 0);

  const showingFrom = rows.length ? skip + 1 : 0;
  const showingTo   = rows.length ? skip + rows.length : 0;

  return (
    <main className="container" style={{ maxWidth: 1100 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h1>SMV Logistics Console</h1>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <label className="label" style={{ display:'flex', alignItems:'center', gap:6 }}>
            <input
              type="checkbox"
              checked={autoSearch}
              onChange={e => setAutoSearch(e.target.checked)}
            />
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
            />
          </div>
          <button
            className="btn primary"
            onClick={searchByPassport}
            disabled={!passport.trim() || loading === 'passport'}
          >
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
            />
          </div>
          <button
            className="btn"
            onClick={searchByOrder}
            disabled={!orderId.trim() || loading === 'order'}
          >
            {loading === 'order' ? 'Searching…' : 'Search Order'}
          </button>
        </div>
      </section>

      {/* Optional filters + pagination */}
      <section className="card" style={{ marginTop: 16 }}>
        <h3 className="label">Filters (optional)</h3>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
          <div>
            <label className="label">Status (CSV)</label>
            <input
              className="input"
              placeholder="e.g. UNASSIGNED,PENDING"
              value={statusCsv}
              onChange={(e)=>setStatusCsv(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Type (CSV)</label>
            <input
              className="input"
              placeholder="e.g. SUBMISSION,PICKUP"
              value={typeCsv}
              onChange={(e)=>setTypeCsv(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Current Task</label>
            <input
              className="input"
              placeholder="leave empty to omit"
              value={currentTask}
              onChange={(e)=>setCurrentTask(e.target.value)}
            />
          </div>
        </div>

        <div style={{ height: 12 }} />

        <h3 className="label">Pagination</h3>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <label className="label">Limit</label>
          <input
            className="input"
            style={{ width: 90 }}
            type="number"
            min={1}
            value={limit}
            onChange={(e)=>setLimit(Math.max(1, Number(e.target.value) || 10))}
          />
          <label className="label">Skip</label>
          <input
            className="input"
            style={{ width: 120 }}
            type="number"
            min={0}
            value={skip}
            onChange={(e)=>setSkip(Math.max(0, Number(e.target.value) || 0))}
          />

          <button
            className="btn"
            onClick={() => setSkip((s) => Math.max(0, s - limit))}
            disabled={skip === 0}
          >
            ◀ Prev
          </button>
          <button
            className="btn"
            onClick={() => setSkip((s) => s + limit)}
            disabled={rows.length < limit}
          >
            Next ▶
          </button>

          <span className="label" style={{ marginLeft: 8 }}>
            {total ? `Showing ${showingFrom}-${showingTo} of ${total}` : rows.length ? `Showing ${rows.length}` : 'No results yet'}
          </span>
        </div>
      </section>

      {/* Results */}
      <section className="card" style={{ marginTop: 24 }}>
        <h3 className="label">Results</h3>
        {error && <p className="label" style={{ color:'#fca5a5', marginTop: 8 }}>{error}</p>}

        {rows && rows.length > 0 && (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>SMV Order</th>
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>Visa Order</th>
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>Passport</th>
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>Type</th>
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>Status</th>
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>Assigned For</th>
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>Appointment</th>
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>Travel End</th>
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>Assignees</th>
                  <th className="label" style={{ textAlign:'left', padding:'8px' }}>Experts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r._id} style={{ borderTop:'1px solid #2223', verticalAlign:'top' }}>
                    <td style={{ padding:'8px' }}>{r.smv_order_id || ''}</td>
                    <td style={{ padding:'8px' }}>{r.visa_order_id || ''}</td>
                    <td style={{ padding:'8px', fontWeight:600 }}>{r.passport_number || ''}</td>
                    <td style={{ padding:'8px' }}>{r.type || ''}</td>
                    <td style={{ padding:'8px' }}>{r.status || ''}</td>
                    <td style={{ padding:'8px' }}>{r.assigned_for || ''}</td>
                    <td style={{ padding:'8px' }}>{fmtDate(r.appointment_date)}</td>
                    <td style={{ padding:'8px' }}>{fmtDate(r.travel_end_date)}</td>
                    <td style={{ padding:'8px' }}>{Array.isArray(r.assignees) ? r.assignees.length : 0}</td>
                    <td style={{ padding:'8px' }}>{Array.isArray(r.visa_experts) ? r.visa_experts.length : 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Raw debug payload from the proxy */}
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
