import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const isMongoId = (s: string) => /^[a-fA-F0-9]{24}$/.test(s);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    // Accept either camel or snake from the UI, but SEND camel to upstream
    const sessionId = String(body.sessionId ?? body.session_id ?? '').trim();
    const otp = String(body.otp ?? '').trim();

    if (!sessionId || !otp) {
      return NextResponse.json(
        { error: 'sessionId and otp are required' },
        { status: 400 }
      );
    }

    // Catch bad ids early so users re-request an OTP
    if (!isMongoId(sessionId)) {
      return NextResponse.json(
        { error: 'sessionId must be a 24-char MongoDB ObjectId' },
        { status: 400 }
      );
    }

    const base = process.env.SMV_API_BASE || 'https://api.live.stampmyvisa.com';
    const path = process.env.SMV_VERIFY_OTP_PATH || '/v1/auth/verify-login-otp';
    const url = `${base}${path}`;

    // Only send Origin/Referer if we actually have one configured or from browser
    const originHeader = req.headers.get('origin') || process.env.SMV_ORIGIN || '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
    };
    if (originHeader) {
      headers['Origin'] = originHeader;
      headers['Referer'] = originHeader.replace(/\/$/, '') + '/';
    }

    const payload = { sessionId, otp };

    let upstream: Response;
    try {
      upstream = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        cache: 'no-store',
      });
    } catch (networkErr: any) {
      return NextResponse.json(
        {
          error: 'verify-otp request failed (network)',
          detail: String(networkErr),
          url,
          sent: payload,
          usedHeaders: headers,
        },
        { status: 502 }
      );
    }

    const raw = await upstream.text();
    let data: any; try { data = JSON.parse(raw); } catch { data = { raw }; }

    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: 'verify-otp failed',
          upstreamStatus: upstream.status,
          upstreamBody: data,
          url,
          sent: payload,
          usedHeaders: headers,
        },
        { status: upstream.status }
      );
    }

    const token = data?.access_token || data?.token || null;

    const res = NextResponse.json({
      ok: true,
      user: data?.user ?? null,
      token,
      message: data?.message || data?.data?.status || 'OTP verified',
    });

    if (token) {
      res.cookies.set('smv_token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 8,
      });
    }

    // lightweight flag so middleware allows navigation even if token absent
    res.cookies.set('smv_auth', 'ok', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8,
    });

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Unexpected error in verify-otp', detail: String(err) },
      { status: 500 }
    );
  }
}
