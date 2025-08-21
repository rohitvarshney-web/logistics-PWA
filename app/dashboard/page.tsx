'use client';
import { useState } from 'react';

export default function DashboardPage() {
  const [passport, setPassport] = useState('');
  const [orderId, setOrderId]   = useState('');
  const [loading, setLoading]   = useState<'passport'|'order'|null>(null);
  const [error, setError]       = useState<string|null>(null);
  const [result, setResult]     = useState<any>(null);

  async function callSearch(body: Record<string, any>) {
    const r = await fetch('/api/smv/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const js = await r.json().catch(()=>({}));
    if (!r.ok) {
      setError(js.error || js?.upstreamBody?.message || 'Search failed');
    }
    setResult(js);
  }

  async function searchByPassport() {
    setLoading('passport'); setError(null); setResult(null);
    await callSearch({ passport }); // unified route maps -> searchText
    setLoading(null);
  }

  async function searchByOrder() {
    setLoading('order'); setError(null); setResult(null);
    await callSearch({ orderId }); // unified route maps -> searchText
    setLoading(null);
  }

  return (
    <main className="container" style={{ maxWidth: 900 }}>
      <h1>SMV Logistics Console</h1>

      {/* Passport Search */}
      <div className="card" style={{ marginTop: 16 }}>
        <label className="label">Passport Number</label>
        <div style={{ display:'flex', gap: 8 }}>
          <input
            className="input"
            placeholder="T8554064"
            value={passport}
            onChange={(e)=>setPassport(e.target.value)}
          />
          <button
            className="btn primary"
            onClick={searchByPassport}
            disabled={!passport || loading==='passport'}
          >
            {loading==='passport' ? 'Searching…' : 'Search'}
          </button>
        </div>
      </div>

      {/* Order ID Search */}
      <div className="card" style={{ marginTop: 16 }}>
        <label className="label">Order ID</label>
        <div style={{ display:'flex', gap: 8 }}>
          <input
            className="input"
            placeholder="ORD12345"
            value={orderId}
            onChange={(e)=>setOrderId(e.target.value)}
          />
          <button
            className="btn"
            onClick={searchByOrder}
            disabled={!orderId || loading==='order'}
          >
            {loading==='order' ? 'Searching…' : 'Search'}
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="card" style={{ marginTop: 24 }}>
        <h3 className="label">Results</h3>
        {error && (
          <p className="label" style={{ color:'#fca5a5' }}>
            {error}
          </p>
        )}
        {result && (
          <details open style={{ marginTop: 12 }}>
            <summary className="label">Raw JSON (includes url & sent payload)</summary>
            <pre style={{ whiteSpace:'pre-wrap', fontSize:12 }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </main>
  );
}
