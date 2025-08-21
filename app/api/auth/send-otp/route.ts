import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const bodyIn = await req.json().catch(() => ({}));
  const identifier: string = bodyIn.identifier || '';
  let method: 'EMAIL' | 'PHONE' = bodyIn.method || (identifier.includes('@') ? 'EMAIL' : 'PHONE');

  if (!identifier) {
    return NextResponse.json({ error: 'identifier required' }, { status: 400 });
  }

  const base = process.env.SMV_API_BASE || 'https://api.live.stampmyvisa.com';
  const path = process.env.SMV_SEND_OTP_PATH || '/v1/auth/send-login-otp';
  const url = `${base}${path}`;

  const consumer = process.env.SMV_CONSUMER || 'nucleus';
  const retry = String(process.env.SMV_DEFAULT_RETRY || 'true').toLowerCase() === 'true';

  const payload =
    method === 'PHONE'
      ? { consumer, phone: identifier, email: '', method: 'PHONE', retry }
      : { consumer, phone: '', email: identifier, method: 'EMAIL', retry };

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // these mimic your internal app; harmless if not required
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://internal.stampmyvisa.com',
      'Referer': 'https://internal.stampmyvisa.com/',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const text = await r.text();
  if (r.ok || r.status === 204) {
    return NextResponse.json({ ok: true, upstreamStatus: r.status });
  }

  // Surface upstream error to UI/logs so we can see what's wrong
  return NextResponse.json(
    { error: 'send-otp failed', upstreamStatus: r.status, upstreamBody: text, usedPayload: payload },
    { status: 502 }
  );
}
