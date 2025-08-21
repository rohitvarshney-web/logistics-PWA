import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const body = await req.json().catch(()=>({}));
  const { identifier, otp } = body || {};
  if (!identifier || !otp) return NextResponse.json({ error: 'identifier and otp required' }, { status: 400 });
  const base = process.env.SMV_API_BASE || 'https://api.live.stampmyvisa.com';
  const path = process.env.SMV_VERIFY_OTP_PATH || '/v1/auth/verify-login-otp';
  // Choose payload shape typical for OTP verify
  const method = identifier.includes('@') ? 'EMAIL' : 'PHONE';
  const payload = method === 'PHONE' ? { method:'PHONE', phone: identifier, email:'', otp }
                                     : { method:'EMAIL', phone:'', email: identifier, otp };
  const r = await fetch(`${base}${path}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload), cache:'no-store' });
  const text = await r.text(); let data:any=null; try { data=JSON.parse(text); } catch { data={ raw:text }; }
  if (!r.ok) return NextResponse.json({ error: 'verify-otp failed', data }, { status: r.status });
  const token = data?.access_token || data?.token || 'session_ok';
  const out = NextResponse.json({ ok: true, user: data?.user || null });
  out.cookies.set('smv_token', token, { httpOnly:true, secure:true, sameSite:'lax', path:'/', maxAge: 60*60*8 });
  return out;
}
