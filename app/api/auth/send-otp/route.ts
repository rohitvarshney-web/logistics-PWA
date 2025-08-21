import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const body = await req.json().catch(()=>({}));
  const { identifier, method } = body || {};
  if (!identifier) return NextResponse.json({ error: 'identifier required' }, { status: 400 });
  const base = process.env.SMV_API_BASE || 'https://api.live.stampmyvisa.com';
  const path = process.env.SMV_SEND_OTP_PATH || '/v1/auth/send-login-otp';
  const payload = (method === 'PHONE')
    ? { method: 'PHONE', phone: identifier, email: '' }
    : { method: 'EMAIL', phone: '', email: identifier };
  const r = await fetch(`${base}${path}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload), cache:'no-store' });
  if (!r.ok) { const text = await r.text(); return NextResponse.json({ error: 'send-otp failed', raw: text }, { status: r.status }); }
  return NextResponse.json({ ok: true });
}
