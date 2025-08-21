'use client';
import { useState } from 'react';

async function authHeader() {
  try {
    const t = localStorage.getItem('smv_token');
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch { return {}; }
}

export default function DashboardPage() {
  const [passport, setPassport] = useState('');
  const [orderId, setOrderId]   = useState('');
  const [loading, setLoading]   = useState<'passport'|'order'|null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [result, setResult]     = useState<any>(null);

  async function callSearch(body: Record<string, any>, kind: 'passport' | 'order') {
    setLoading(kind); setError(null); setResult(null);
    const js = await r.json().catch(()=>({}));
    if (!r.ok) setError(js.error || js?.upstreamBody?.message || 'Search failed');
    setResult(js);
    setLoading(null);
  }

  function searchByPassport() { return callSearch({ passport }, 'passport'); }
  function searchByOrder()    { return callSearch({ orderId }, 'order'); }

  async function logout() {
    try { localStorage.removeItem('smv_token'); } catch {}
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login?logged_out=1';
  }

  return (
    <main className="container" style={{ maxWidth: 900 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h1>SMV Logistics Console</h1>
        <button className="btn" onClick={logout}>Logout</button>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <label className="label">Passport Number</label>
        <div style={{ display:'flex', gap: 8 }}>
          <input className="input" placeholder="T8554064" value={passport} onChange={(e)=>setPassport(e.target.value)} />
          <button className="btn primary" onClick={searchByPassport} disabled={!passport || loading==='passport'}>
            {loading==='passport' ? 'Searching…' : 'Search'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <label className="label">Order ID</label>
        <div style={{ display:'flex', gap: 8 }}>
          <input className="input" placeholder="ORD12345" value={orderId} onChange={(e)=>setOrderId(e.target.value)} />
          <button className="btn" onClick={searchByOrder} disabled={!orderId || loading==='order'}>
            {loading==='order' ? 'Searching…' : 'Search'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h3 className="label">Results</h3>
        {error && <p className="label" style={{ color:'#fca5a5' }}>{error}</p>}
        {result && (
          <details open style={{ marginTop: 12 }}>
            <summary className="label">Raw JSON (includes url &amp; sent payload)</summary>
            <pre style={{ whiteSpace:'pre-wrap', fontSize:12 }}>{JSON.stringify(result, null, 2)}</pre>
          </details>
        )}
      </div>
    </main>
  );
}
