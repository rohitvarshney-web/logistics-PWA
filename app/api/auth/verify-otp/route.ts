import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

type Variant = { headers: Record<string,string>, body: string, label: string };

function buildVariants(identifier: string, code: string): Variant[] {
  const isEmail = identifier.includes('@');
  const consumer = process.env.SMV_CONSUMER || 'nucleus';
  const email = isEmail ? identifier : '';
  const phone = isEmail ? '' : identifier;

  const json = (obj: any, label: string): Variant => ({
    label,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://internal.stampmyvisa.com',
      'Referer': 'https://internal.stampmyvisa.com/',
    },
    body: JSON.stringify(obj),
  });

  const form = (obj: any, label: string): Variant => ({
    label,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://internal.stampmyvisa.com',
      'Referer': 'https://internal.stampmyvisa.com/',
    },
    body: new URLSearchParams(obj as Record<string,string>).toString(),
  });

  const baseObj = isEmail
    ? { consumer, method: 'EMAIL', email, phone: '' }
    : { consumer, method: 'PHONE', email: '', phone };

  // Try multiple key names for the OTP/code, and both JSON + form
  const codes = [
    { k: 'otp', v: code },
    { k: 'code', v: code },
    { k: 'otp_code', v: code },
    { k: 'token', v: code },
  ];

  const out: Variant[] = [];
  for (const c of codes) {
    out.push(json({ ...baseObj, [c.k]: c.v }, `json:${c.k}`));
  }
  for (const c of codes) {
    out.push(form({ ...baseObj, [c.k]: c.v }, `form:${c.k}`));
  }
  return out;
}

export async function POST(req: Request) {
  const bodyIn = await req.json().catch(() => ({}));
  const identifier: string = bodyIn.identifier || '';
  const code: string = String(bodyIn.otp ?? bodyIn.code ?? '').trim();

  if (!identifier || !code) {
    return NextResponse.json({ error: 'identifier and otp/code required' }, { status: 400 });
  }

  const base = process.env.SMV_API_BASE || 'https://api.live.stampmyvisa.com';
  const path = process.env.SMV_VERIFY_OTP_PATH || '/v1/auth/verify-login-otp';
  const url = `${base}${path}`;

  let last = { status: 500, body: '', label: '' };

  for (const v of buildVariants(identifier, code)) {
    const r = await fetch(url, { method: 'POST', headers: v.headers, body: v.body, cache: 'no-store' });
    const txt = await r.text();
    last = { status: r.status, body: txt, label: v.label };
    if (r.ok) {
      let data: any = null; try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
      const token = data?.access_token || data?.token || 'session_ok';
      const out = NextResponse.json({ ok: true, user: data?.user || null, usedVariant: v.label });
      out.cookies.set('smv_token', token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 });
      return out;
    }
  }

  return NextResponse.json(
    { error: 'verify-otp failed', upstreamStatus: last.status, upstreamBody: last.body, triedVariant: last.label },
    { status: 502 }
  );
}
