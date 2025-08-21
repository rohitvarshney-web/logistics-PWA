import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const isMongoId = (s: string) => /^[a-fA-F0-9]{24}$/.test(s);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const sessionId = String(body.sessionId ?? body.session_id ?? '').trim();
    const otp = String(body.otp ?? '').trim();

    if (!sessionId || !otp) {
      return NextResponse.json({ error: 'sessionId and otp are required' }, { status: 400 });
    }
    if (!isMongoId(sessionId)) {
      return NextResponse.json({ error: 'sessionId must be a 24-char MongoDB ObjectId' }, { status: 400 });
    }

    const base = process.env.SMV_API_BASE || 'https://api.live.stampmyvisa.com';
    const path = process.env.SMV_VERIFY_OTP_PATH || '/v1/auth/verify-login-otp';
    const url = `${base}${path}`;

    const originHeader = req.headers.get('origin') || process.env.SMV_ORIGIN || '';
    const headers: Record<string,string> = {
      'Content-Type':'application/json',
      'Accept':'application/json, text/plain, */*',
    };
    if (originHeader) {
      headers['Origin'] = originHeader;
      headers['Referer'] = originHeader.replace(/\/$/, '') + '/';
    }

    const payload = { sessionId, otp };

    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const raw = await upstream.text();
    let data: any; try { data = JSON.parse(raw); } catch { data = { raw }; }

    if (!upstream.ok) {
      return NextResponse.json(
        { error: 'verify-otp failed', upstreamStatus: upstream.status, upstreamBody: data, url, sent: payload },
        { status: upstream.status }
      );
    }

    // Extract token from common shapes
    const token =
      data?.access_token ||
      data?.token ||
      data?.data?.access_token ||
      data?.data?.token ||
      null;

    if (!token) {
      return NextResponse.json(
        { error: 'OTP verified upstream but no access token returned; cannot create session.' },
        { status: 502 }
      );
    }

    const res = NextResponse.json({
      ok: true,
      user: data?.user ?? null,
      token,  // client will store in localStorage
      message: data?.message || data?.data?.status || 'OTP verified',
    });

    // Set cookies for server-side auth
    res.cookies.set('smv_token', token, {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8,
    });
    res.cookies.set('smv_auth', 'ok', {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8,
    });

    return res;
  } catch (err: any) {
    return NextResponse.json({ error: 'Unexpected error in verify-otp', detail: String(err) }, { status: 500 });
  }
}
