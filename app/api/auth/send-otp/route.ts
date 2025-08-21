// app/api/auth/send-otp/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function guessMethod(identifier: string): 'EMAIL' | 'PHONE' {
  return identifier.includes('@') ? 'EMAIL' : 'PHONE';
}

export async function POST(req: Request) {
  try {
    const inBody = await req.json().catch(() => ({} as any));
    const identifier = String(inBody.identifier || '').trim();
    const method: 'EMAIL' | 'PHONE' = inBody.method || guessMethod(identifier);

    if (!identifier) {
      return NextResponse.json({ error: 'identifier required' }, { status: 400 });
    }

    const consumer = process.env.SMV_CONSUMER || 'nucleus';
    const defaultRetry = (process.env.SMV_DEFAULT_RETRY ?? 'true').toString().toLowerCase() === 'true';
    const origin = req.headers.get('origin') || process.env.SMV_ORIGIN || 'https://internal.stampmyvisa.com';

    const email = method === 'EMAIL' ? identifier : '';
    const phone = method === 'PHONE' ? identifier : '';

    const base = process.env.SMV_API_BASE || 'https://api.live.stampmyvisa.com';
    const path = process.env.SMV_SEND_OTP_PATH || '/v1/auth/send-login-otp';
    const url = `${base}${path}`;

    const payload = {
      consumer,
      method,
      email,
      phone,
      retry: defaultRetry,
    };

    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Origin': origin,
        'Referer': origin + '/',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const text = await upstream.text();
    let data: any = null; try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: 'send-otp failed',
          upstreamStatus: upstream.status,
          upstreamBody: data,
          url,
          sent: payload,
          usedHeaders: { Origin: origin, Referer: origin + '/' },
        },
        { status: upstream.status }
      );
    }

    // session id may be nested as data.session_id
    const sessionId = data?.sessionId || data?.session_id || data?.data?.session_id || null;

    return NextResponse.json({
      ok: true,
      message: data?.data?.status || data?.message || 'OTP sent',
      sessionId,
      upstream: data, // keep for now; remove once stable
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Unexpected error in send-otp', detail: String(err) },
      { status: 500 }
    );
  }
}
