import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  // redirect back to THIS host (works on Render, dev, etc.)
  const url = new URL('/login?logged_out=1', req.url);
  const res = NextResponse.redirect(url);

  // delete both cookies with matching attributes
  const del = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge: 0 };
  res.cookies.set('smv_token', '', del);
  res.cookies.set('smv_auth', '', del);

  // ask browser to clear site data (cookies+storage). Some browsers ignore, but safe.
  res.headers.set('Clear-Site-Data', '"cookies","storage"');

  return res;
}
