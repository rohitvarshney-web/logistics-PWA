'use client';

import { useState } from 'react';

type LoadingKind = 'passport' | 'order' | null;

export default function DashboardPage() {
  const [passport, setPassport] = useState('');
  const [orderId, setOrderId]   = useState('');
  const [loading, setLoading]   = useState<LoadingKind>(null);
  const [error, setError]       = useState<string | null>(null);
  const [result, setResult]     = useState<any>(null);

  async function callSearch(body: Record<string, any>, kind: LoadingKind) {
    setLoading(kind);
    setError(null);
    setResult(null);

    try {
      const r = await fetch('/api/smv/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // 👈 send cookies (smv_token) to the proxy
        body: JSON.stringify(body),
      });

      const txt = await r.text();
      let js: any;
      try { js = JSON.parse(txt); } catch { js = { raw: txt }; }

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

  function searchByPassport() {
    if (!passport.trim()) return;
    return callSearch({ passport: passport.trim() }, 'passport');
  }

  function searchByOrder() {
    if (!orderId.trim()) return;
    return callSearch({ orderId: orderId.trim() }, 'order');
  }

  async function logout() {
    try { localStorage.removeItem('smv_token'); } catch {}
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login?logged_out=1';
  }

  return (
    <main className="container" style={{ maxWidth: 900 }}>
      <header style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap: 12 }}>
        <h1>SMV Logistics Console</h1>
        <button className="btn" onClick={logout}>Logout</button>
      </header>

      {/* Passport Search */}
      <section className="card" style={{ marginTop: 16 }}>
        <label className="label">Passport Number</label>
        <div style={{ display:'flex', gap: 8 }}>
          <input
            className="input"
            placeholder="e.g. W1184034"
            value={passport}
            onChange={(e)=>setPassport(e.target.value)}
          />
          <button
            className="btn primary"
            onClick={searchByPassport}
            disabled={!passport.trim() || loading==='passport'}
          >
            {loading==='passport' ? 'Searching…' : 'Search'}
          </button>
        </div>
      </section>

      {/* Order ID Search */}
      <section className="card" style={{ marginTop: 16 }}>
        <label className="label">Order ID</label>
        <div style={{ display:'flex', gap: 8 }}>
          <input
            className="input"
            placeholder="e.g. SMV-ARE-00023"
            value={orderId}
            onChange={(e)=>setOrderId(e.target.value)}
          />
        </div>
        <div style={{ height: 8 }} />
        <button
          className="btn"
          onClick={searchByOrder}
          disabled={!orderId.trim() || loading==='order'}
        >
          {loading==='order' ? 'Searching…' : 'Search'}
        </button>
      </section>

      {/* Results / Errors */}
      <section className="card" style={{ marginTop: 24 }}>
        <h3 className="label">Results</h3>
        {error && <p className="label" style={{ color:'#fca5a5', marginTop: 8 }}>{error}</p>}

        {result && (
          <>
            {/* High-level success indicator */}
            {'ok' in result && (
              <p className="label" style={{ marginTop: 8 }}>
                {result.ok ? '✅ OK' : '❌ Error'}
              </p>
            )}

            {/* Raw debug payload from the proxy */}
            <details open style={{ marginTop: 12 }}>
              <summary className="label">Debug / Raw JSON (proxy response)</summary>
              <pre style={{ whiteSpace:'pre-wrap', fontSize:12, marginTop: 8 }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </>
        )}
      </section>
    </main>
  );
}
