import { NextResponse } from 'next/server';

type Variant = { body: any };

function buildVariants(identifier: string, method?: 'EMAIL'|'PHONE'): Variant[] {
  const isPhone = method ? method === 'PHONE' : !identifier.includes('@');
  const email = isPhone ? '' : identifier;
  const phone = isPhone ? identifier : '';
  // Try a few common shapes:
  return [
    { body: { method: isPhone ? 'PHONE' : 'EMAIL', email, phone } },       // our original
    { body: { email, phone, method: isPhone ? 'PHONE' : 'EMAIL' } },       // reordered
    { body: isPhone ? { phone } : { email } },                             // without method
    { body: isPhone ? { method: 'phone', phone } : { method: 'email', email } }, // lowercase method
  ];
}

export async function POST(req: Request) {
  const bodyIn = await req.json().catch(() => ({}));
  const { identifier, method } = bodyIn || {};
  if (!identifier) return NextResponse.json({ error: 'identifier required' }, { status: 400 });

  const base = process.env.SMV_API_BASE || 'https://api.live.stampmyvisa.com';
  const path = process.env.SMV_SEND_OTP_PATH || '/v1/auth/send-login-otp';
  const url = `${base}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    // mimic your internal app to satisfy any origin checks
    'Origin': 'https://internal.stampmyvisa.com',
    'Referer': 'https://internal.stampmyvisa.com/',
  };

  const variants = buildVariants(identifier, method);

  let lastText = '';
  let lastStatus = 500;

  for (const v of variants) {
    const r = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(v.body),
      cache: 'no-store',
    });
    lastStatus = r.status;
    lastText = await r.text();

    if (r.ok || r.status === 204) {
      return NextResponse.json({ ok: true, usedPayload: v.body, upstreamStatus: r.status });
    }
  }

  // surface upstream error for debugging in UI
  return NextResponse.json(
    { error: 'send-otp failed', upstreamStatus: lastStatus, upstreamBody: lastText },
    { status: 502 }
  );
}
