// app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';

export async function POST() {
  const res = NextResponse.redirect(new URL('/login', process.env.SMV_ORIGIN || 'http://localhost:3000'));
  res.cookies.set('smv_token', '', { path: '/', maxAge: 0 });
  res.cookies.set('smv_auth', '', { path: '/', maxAge: 0 });
  return res;
}
