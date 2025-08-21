'use client';
import { useState } from 'react';

export default function DashboardPage() {
  const [passport, setPassport] = useState('');
  const [orderId, setOrderId] = useState('');
  const [loading, setLoading] = useState<'passport' | 'order' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  async function searchByPassport() {
    setLoading('passport'); setError(null); setResult(null);
    const r = await fetch('/api/smv/search-passport', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passport }),
    });
    const js = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(js.error || js?.upstreamBody?.message || 'Search failed');
      setResult(js); // keep for debugging
    } else {
      setResult(js);
    }
    setLoading(null);
  }

  async function searchByOrder() {
    setLoading('order'); setError(null); setResult(null);
    const r = await fetch('/api/smv/search-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });
    const js = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(js.error || js?.upstreamBody?.message || 'Search failed');
      setResult(js);
    } else {
      setResult(js);
    }
    setLoading(null);
  }

  return (
    <main className="container" style={{ maxWidth: 900 }}>
      <h1>SMV Logistics Console</h1>

      {/* Passport search */}
      <div className="card" style={{ marginTop: 16 }}>
        <label className="label">Passport Number</label>
        <div style={{ display:'flex', gap: 8 }}>
          <input
            className="input"
            value={passport}
            onChange={(e) => setPassport(e.target.value)}
            placeholder="T8554064"
          />
          <button className="btn primary" onClick={searchByPassport} disabled={!passport || loading==='passport'}>
            {loading === 'passport' ? 'Searching…' : 'Search'}
          </button>
        </div>
      </div>

      {/* Order ID search */}
      <div className="card" style={{ marginTop: 16 }}>
        <label className="label">Order ID</label>
        <div style={{ display:'flex', gap: 8 }}>
          <input
            className="input"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="ORD-12345"
          />
          <button className="btn" onClick={searchByOrder} disabled={!orderId || loading==='order'}>
            {loading === 'order' ? 'Searching…' : 'Search'}
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="card" style={{ marginTop: 24 }}>
        <h3 className="label">Results</h3>
        {error && <p className="label" style={{ color:'#fca5a5' }}>{error}</p>}
        {result && (
          <details open style={{ marginTop: 12 }}>
            <summary className="label">Raw</summary>
            <pre style={{ whiteSpace:'pre-wrap', fontSize:12 }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </main>
  );
}
