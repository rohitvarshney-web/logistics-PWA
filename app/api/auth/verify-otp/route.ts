// app/api/auth/verify-otp/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = String(body.sessionId || body.session_id || '').trim();
    const otp = String(body.otp || '').trim();

    if (!sessionId || !otp) {
      return NextResponse.json(
        { error: 'sessionId/session_id and otp are required' },
        { status: 400 }
      );
    }

    const base = process.env.SMV_API_BASE || 'https://api.live.stampmyvisa.com';
    const path = process.env.SMV_VERIFY_OTP_PATH || '/v1/auth/verify-login-otp';
    const url = `${base}${path}`;

    const origin = req.headers.get('origin') || process.env.SMV_ORIGIN || 'https://internal.stampmyvisa.com';

    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Origin': origin,
        'Referer': origin + '/',
      },
      body: JSON.stringify({ session_id: sessionId, otp }), // <-- snake_case to backend
      cache: 'no-store',
    });

    const text = await r.text();
    if (!r.ok) {
      let err: any = null; try { err = JSON.parse(text); } catch { err = { raw: text }; }
      return NextResponse.json(
        { error: 'verify-otp failed', upstreamStatus: r.status, upstreamBody: err },
        { status: r.status }
      );
    }

    let data: any = null; try { data = JSON.parse(text); } catch { data = { raw: text }; }
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

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Unexpected error in verify-otp', detail: String(err) },
      { status: 500 }
    );
  }
}
