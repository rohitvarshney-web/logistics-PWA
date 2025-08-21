'use client';
import { useState } from 'react';

function guessMethod(identifier: string): 'EMAIL'|'PHONE' {
  return identifier.includes('@') ? 'EMAIL' : 'PHONE';
}

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null);
    const method = guessMethod(identifier);
    // 1) check-user
    const check = await fetch(`/api/auth/check-user?method=${method}&identifier=${encodeURIComponent(identifier)}`);
    if (!check.ok) {
      const js = await check.json().catch(()=>({}));
      setError(js.error || 'User not found or not allowed');
      return;
    }
    const ch = await check.json();
    setInfo(ch?.message || 'User verified. Sending OTP…');
    // 2) send-otp
    const r = await fetch('/api/auth/send-otp', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ identifier, method }) });
    if (!r.ok) {
      const js = await r.json().catch(()=>({}));
      setError(js.error || 'Failed to send OTP'); return;
    }
    setOtpSent(true);
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null);
    const r = await fetch('/api/auth/verify-otp', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ identifier, otp }) });
    if (!r.ok) {
      const js = await r.json().catch(()=>({}));
      setError(js.error || 'Invalid OTP'); return;
    }
    window.location.href = '/';
  }

  return (
    <main className="container" style={{maxWidth:520}}>
      <h1>Log in</h1>
      <p className="label">Enter your email or phone to receive an OTP.</p>

      {!otpSent ? (
        <form onSubmit={sendOtp} className="card">
          <label className="label">Email or Phone</label>
          <input className="input" placeholder="you@company.com or +91..." value={identifier} onChange={e=>setIdentifier(e.target.value)} required />
          <div style={{height:12}}></div>
          <button className="btn primary" type="submit">Send OTP</button>
          {info && <p className="label" style={{marginTop:12}}>{info}</p>}
          {error && <p className="label" style={{color:'#fca5a5', marginTop:12}}>{error}</p>}
        </form>
      ) : (
        <form onSubmit={verifyOtp} className="card">
          <p className="label">OTP sent to {identifier}. Enter code below.</p>
          <label className="label">OTP</label>
          <input className="input" value={otp} onChange={e=>setOtp(e.target.value)} required />
          <div style={{height:12}}></div>
          <button className="btn primary" type="submit">Verify & Continue</button>
          <button className="btn" type="button" onClick={()=>setOtpSent(false)} style={{marginLeft:8}}>Change identifier</button>
          {error && <p className="label" style={{color:'#fca5a5', marginTop:12}}>{error}</p>}
        </form>
      )}
    </main>
  );
}
