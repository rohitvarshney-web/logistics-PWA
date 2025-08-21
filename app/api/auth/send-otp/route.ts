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
    const retry = (process.env.SMV_DEFAULT_RETRY ?? 'true').toString().toLowerCase() === 'true';

    // only send Origin/Referer if we actually have one (prevents misleading origins)
    const originHeader = req.headers.get('origin') || process.env.SMV_ORIGIN || '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
    };
    if (originHeader) {
      headers['Origin'] = originHeader;
      headers['Referer'] = originHeader.replace(/\/$/, '') + '/';
    }

    const base = process.env.SMV_API_BASE || 'https://api.live.stampmyvisa.com';
    const path = process.env.SMV_SEND_OTP_PATH || '/v1/auth/send-login-otp';
    const url = `${base}${path}`;

    const payload = {
      consumer,
      method,
      email: method === 'EMAIL' ? identifier : '',
      phone: method === 'PHONE' ? identifier : '',
      retry,
    };

    let upstream: Response;
    try {
      upstream = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        cache: 'no-store',
      });
    } catch (networkErr: any) {
      // Network layer failed — return JSON with detail
      return NextResponse.json(
        {
          error: 'send-otp request failed (network)',
          detail: String(networkErr),
          url,
          sent: payload,
          usedHeaders: headers,
        },
        { status: 502 }
      );
    }

    const raw = await upstream.text();
    // Try to parse JSON; if not JSON, preserve raw text so UI can show it
    let body: any;
    try { body = JSON.parse(raw); } catch { body = { raw }; }

    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: 'send-otp failed',
          upstreamStatus: upstream.status,
          upstreamBody: body,
          url,
          sent: payload,
          usedHeaders: headers,
        },
        { status: upstream.status }
      );
    }

    const sessionId =
      body?.sessionId ||
      body?.session_id ||
      body?.data?.session_id ||
      null;

    return NextResponse.json({
      ok: true,
      message: body?.data?.status || body?.message || 'OTP sent',
      sessionId,
      upstream: body, // keep for debugging
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Unexpected error in send-otp', detail: String(err) },
      { status: 500 }
    );
  }
}
