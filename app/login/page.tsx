'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

function guessMethod(identifier: string): 'EMAIL' | 'PHONE' {
  return identifier.includes('@') ? 'EMAIL' : 'PHONE';
}

export default function LoginPage() {
  const router = useRouter();

  const [identifier, setIdentifier] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [debug, setDebug] = useState<any>(null); // ⬅️ show upstream details

  // cleanup after logout (optional, as we added earlier)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('logged_out') === '1') {
      try { localStorage.clear(); } catch {}
      try { sessionStorage.clear(); } catch {}
      if ('caches' in window) { caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))); }
      if ('serviceWorker' in navigator) { navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister())); }
      const clean = new URL(window.location.href);
      clean.searchParams.delete('logged_out');
      window.history.replaceState({}, '', clean.toString());
    }
  }, []);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null); setDebug(null);

    const method = guessMethod(identifier);

    // (optional) check-user
    const check = await fetch(`/api/auth/check-user?method=${method}&identifier=${encodeURIComponent(identifier)}`);
    if (!check.ok) {
      const js = await check.json().catch(() => ({}));
      setError(js.error || 'User not found or not allowed');
      return;
    }

    const r = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, method }),
    });
    const js = await r.json().catch(() => ({}));

    if (!r.ok) {
      const msg =
        js?.upstreamBody?.message ||
        js?.message ||
        (typeof js?.upstreamBody === 'string' ? js.upstreamBody : '') ||
        js?.error ||
        'Failed to send OTP';
      setError(msg);
      setDebug(js); // ⬅️ show exact upstream + what we sent
      console.log('send-otp upstream error:', js);
      return;
    }

    const sid = js.sessionId || js.session_id || js?.upstream?.data?.session_id || null;
    if (!sid) {
      setError('OTP sent but session_id missing from server.');
      setDebug(js);
      return;
    }

    setSessionId(sid);
    setOtpSent(true);
    setInfo(js.message || 'OTP sent. Check your inbox/phone.');
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null);

    if (!sessionId) { setError('Missing session_id. Please request OTP again.'); return; }

    const r = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, otp: String(otp).trim() }),
    });

    const js = await r.json().catch(() => ({}));

    if (!r.ok) {
      const msg =
        js?.upstreamBody?.message ||
        js?.message ||
        (typeof js?.upstreamBody === 'string' ? js.upstreamBody : '') ||
        js?.error ||
        'Invalid OTP';
      setError(`verify-otp failed${js.upstreamStatus ? ` (${js.upstreamStatus})` : ''}: ${msg}`);
      setDebug(js);
      return;
    }

    setInfo(js.message || 'OTP verified');
    router.replace('/dashboard');
  }

  return (
    <main className="container" style={{ maxWidth: 520 }}>
      <h1>Log in</h1>
      <p className="label">Enter your email or phone to receive an OTP.</p>

      {!otpSent ? (
        <form onSubmit={sendOtp} className="card">
          <label className="label">Email or Phone</label>
          <input
            className="input"
            placeholder="you@company.com or +91..."
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
          <div style={{ height: 12 }} />
          <button className="btn primary" type="submit">Send OTP</button>
          {info && <p className="label" style={{ marginTop: 12 }}>{info}</p>}
          {error && <p className="label" style={{ color:'#fca5a5', marginTop: 12 }}>{error}</p>}
          {debug && (
            <details style={{ marginTop: 12 }}>
              <summary className="label">Debug (send-otp)</summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
                {JSON.stringify(debug, null, 2)}
              </pre>
            </details>
          )}
        </form>
      ) : (
        <form onSubmit={verifyOtp} className="card">
          <p className="label">OTP sent to {identifier}. Enter code below.</p>
          <label className="label">OTP</label>
          <input className="input" value={otp} onChange={(e) => setOtp(e.target.value)} required />
          <div style={{ height: 12 }} />
          <button className="btn primary" type="submit">Verify &amp; Continue</button>
          <button
            className="btn"
            type="button"
            onClick={() => { setOtpSent(false); setOtp(''); setSessionId(null); setInfo(null); setError(null); setDebug(null); }}
            style={{ marginLeft: 8 }}
          >
            Change identifier
          </button>
          {info && <p className="label" style={{ marginTop: 12 }}>{info}</p>}
          {error && <p className="label" style={{ color:'#fca5a5', marginTop: 12 }}>{error}</p>}
          {debug && (
            <details style={{ marginTop: 12 }}>
              <summary className="label">Debug (verify-otp)</summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
                {JSON.stringify(debug, null, 2)}
              </pre>
            </details>
          )}
        </form>
      )}
    </main>
  );
}
