// app/api/auth/verify-otp/route.ts
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

type Variant = { headers: Record<string,string>, body: string, label: string };

function buildVariants(identifier: string, code: string): Variant[] {
  const isEmail = identifier.includes('@');
  const consumer = process.env.SMV_CONSUMER || 'nucleus';
  const email = isEmail ? identifier : '';
  const phone = isEmail ? '' : identifier;

  const baseObj = isEmail
    ? { consumer, method: 'EMAIL', email, phone: '', retry: true }
    : { consumer, method: 'PHONE', email: '', phone, retry: true };

  const json = (obj: any, label: string): Variant => ({
    label,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Origin': process.env.SMV_ORIGIN || 'https://internal.stampmyvisa.com',
      'Referer': (process.env.SMV_ORIGIN || 'https://internal.stampmyvisa.com') + '/',
      'Accept-Language': 'en-IN,en;q=0.9',
    },
    body: JSON.stringify(obj),
  });

  const form = (obj: Record<string,string>, label: string): Variant => ({
    label,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json, text/plain, */*',
      'Origin': process.env.SMV_ORIGIN || 'https://internal.stampmyvisa.com',
      'Referer': (process.env.SMV_ORIGIN || 'https://internal.stampmyvisa.com') + '/',
      'Accept-Language': 'en-IN,en;q=0.9',
    },
    body: new URLSearchParams(obj).toString(),
  });

  // Try multiple code key names and both JSON + form
  const codeKeys = ['otp', 'code', 'otp_code', 'token', 'otpCode'] as const;

  const variants: Variant[] = [];
  for (const k of codeKeys) {
    variants.push(json({ ...baseObj, [k]: code }, `json:${k}`));
  }
  for (const k of codeKeys) {
    variants.push(form(
      Object.fromEntries(Object.entries({ ...baseObj, [k]: code }).map(([kk, vv]) => [kk, String(vv)])),
      `form:${k}`
    ));
  }
  return variants;
}

export async function POST(req: Request) {
  // Allow either {identifier, otp} or {identifier, code}
  const inBody = await req.json().catch(() => ({} as any));
  const identifier: string = String(inBody.identifier || '').trim();
  const code: string = String(inBody.otp ?? inBody.code ?? inBody.otp_code ?? inBody.token ?? inBody.otpCode ?? '').trim();

  if (!identifier || !code) {
    return NextResponse.json({ error: 'identifier and otp/code required' }, { status: 400 });
  }

  // Configurable API base/path
  const base = process.env.SMV_API_BASE || 'https://api.live.stampmyvisa.com';
  const path = process.env.SMV_VERIFY_OTP_PATH || '/v1/auth/verify-login-otp';
  const url = `${base}${path}`;

  // Optional session passthrough (if backend ties OTP to a prior session)
  const jar = cookies();
  const sessionId = jar.get('smv_session')?.value;
  const extraHeaders: Record<string, string> = {};
  if (sessionId) extraHeaders['X-Session-Id'] = sessionId;

  let last = { status: 0, body: '', label: '' };

  for (const v of buildVariants(identifier, code)) {
    const headers = { ...v.headers, ...extraHeaders };
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: v.body,
      cache: 'no-store',
    });

    const text = await resp.text();
    last = { status: resp.status, body: text, label: v.label };

    if (resp.ok) {
      let data: any = null;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }

      const token = data?.access_token || data?.token || 'session_ok';
      const out = NextResponse.json({
        ok: true,
        user: data?.user || null,
        usedVariant: v.label,
      });
      out.cookies.set('smv_token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 8, // 8h
      });
      return out;
    }
  }

  return NextResponse.json(
    {
      error: 'verify-otp failed',
      upstreamStatus: last.status,
      upstreamBody: last.body,
      triedVariant: last.label,
    },
    { status: 502 },
  );
}
