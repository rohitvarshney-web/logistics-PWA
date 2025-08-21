import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const bodyIn = await req.json().catch(() => ({}));
  const identifier: string = bodyIn.identifier || '';
  const otp: string = bodyIn.otp || '';
  if (!identifier || !otp) {
    return NextResponse.json({ error: 'identifier and otp required' }, { status: 400 });
  }

  const base = process.env.SMV_API_BASE || 'https://api.live.stampmyvisa.com';
  const path = process.env.SMV_VERIFY_OTP_PATH || '/v1/auth/verify-login-otp';
  const url = `${base}${path}`;

  const consumer = process.env.SMV_CONSUMER || 'nucleus';
  const method: 'EMAIL' | 'PHONE' = identifier.includes('@') ? 'EMAIL' : 'PHONE';

  const payload =
    method === 'PHONE'
      ? { consumer, method: 'PHONE', phone: identifier, email: '', otp }
      : { consumer, method: 'EMAIL', phone: '', email: identifier, otp };

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://internal.stampmyvisa.com',
      'Referer': 'https://internal.stampmyvisa.com/',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const text = await r.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!r.ok) {
    return NextResponse.json({ error: 'verify-otp failed', upstreamStatus: r.status, upstreamBody: text }, { status: 502 });
  }

  const token = data?.access_token || data?.token || 'session_ok';
  const out = NextResponse.json({ ok: true, user: data?.user || null });
  out.cookies.set('smv_token', token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 });
  return out;
}
