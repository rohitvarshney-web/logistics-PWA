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

  // Debug state for surfacing upstream/server details
  const [sendDebug, setSendDebug] = useState<any>(null);
  const [verifyDebug, setVerifyDebug] = useState<any>(null);

  // After-logout cleanup: /login?logged_out=1
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('logged_out') === '1') {
      try { localStorage.clear(); } catch {}
      try { sessionStorage.clear(); } catch {}

      if ('caches' in window) {
        caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).catch(() => {});
      }
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations()
          .then(regs => Promise.all(regs.map(r => r.unregister())))
          .catch(() => {});
      }

      const clean = new URL(window.location.href);
      clean.searchParams.delete('logged_out');
      window.history.replaceState({}, '', clean.toString());

      setInfo('You have been logged out. Caches cleared.');
    }
  }, []);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null); setSendDebug(null); setVerifyDebug(null);

    const method = guessMethod(identifier);

    // optional: check-user first
    try {
      const check = await fetch(
        `/api/auth/check-user?method=${method}&identifier=${encodeURIComponent(identifier)}`
      );
      if (!check.ok) {
        const j = await check.json().catch(() => ({}));
        setError(j.error || 'User not found or not allowed');
        return;
      }
    } catch (err) {
      setError('Network error while checking user.');
      return;
    }

    // Send OTP
    try {
      const r = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, method }),
      });

      // parse as text first so we can show raw errors too
      const txt = await r.text();
      let js: any; try { js = JSON.parse(txt); } catch { js = { raw: txt }; }

      if (!r.ok) {
        const msg =
          js?.upstreamBody?.message ||
          js?.message ||
          js?.raw ||
          js?.error ||
          'Failed to send OTP';
        setError(msg);
        setSendDebug(js); // show: upstreamStatus, upstreamBody, url, sent, usedHeaders, raw
        return;
      }

      const sid =
        js.sessionId ||
        js.session_id ||
        js?.upstream?.data?.session_id ||
        null;

      if (!sid) {
        setError('OTP sent but session_id missing from server.');
        setSendDebug(js);
        return;
      }

      setSessionId(sid);
      setOtpSent(true);
      setInfo(js.message || 'OTP sent. Check your inbox/phone.');
      setSendDebug(js.upstream ? js : null); // keep upstream only if present
    } catch (err: any) {
      setError('Network error while sending OTP.');
      setSendDebug({ error: String(err) });
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null); setVerifyDebug(null);

    if (!sessionId) {
      setError('Missing session_id. Please request OTP again.');
      return;
    }

    try {
      const r = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, otp: String(otp).trim() }),
      });

      const txt = await r.text();
      let js: any; try { js = JSON.parse(txt); } catch { js = { raw: txt }; }

      if (!r.ok) {
        const msg =
          js?.upstreamBody?.message ||
          js?.message ||
          js?.raw ||
          js?.error ||
          'Invalid OTP';
        setError(`verify-otp failed${js.upstreamStatus ? ` (${js.upstreamStatus})` : ''}: ${msg}`);
        setVerifyDebug(js);
        return;
      }

      setInfo(js.message || 'OTP verified');
      // move ahead
      router.replace('/dashboard');
    } catch (err: any) {
      setError('Network error while verifying OTP.');
      setVerifyDebug({ error: String(err) });
    }
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
          {sendDebug && (
            <details style={{ marginTop: 12 }}>
              <summary className="label">Debug (send-otp)</summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
                {JSON.stringify(sendDebug, null, 2)}
              </pre>
            </details>
          )}
        </form>
      ) : (
        <form onSubmit={verifyOtp} className="card">
          <p className="label">OTP sent to {identifier}. Enter code below.</p>
          <label className="label">OTP</label>
          <input
            className="input"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            required
          />
          <div style={{ height: 12 }} />
          <button className="btn primary" type="submit">Verify &amp; Continue</button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              setOtpSent(false);
              setOtp('');
              setSessionId(null);
              setInfo(null);
              setError(null);
              setSendDebug(null);
              setVerifyDebug(null);
            }}
            style={{ marginLeft: 8 }}
          >
            Change identifier
          </button>
          {info && <p className="label" style={{ marginTop: 12 }}>{info}</p>}
          {error && <p className="label" style={{ color:'#fca5a5', marginTop: 12 }}>{error}</p>}
          {verifyDebug && (
            <details style={{ marginTop: 12 }}>
              <summary className="label">Debug (verify-otp)</summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
                {JSON.stringify(verifyDebug, null, 2)}
              </pre>
            </details>
          )}
        </form>
      )}
    </main>
  );
}
