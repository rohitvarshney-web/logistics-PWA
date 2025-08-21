import { NextResponse } from 'next/server';
export async function POST() {
  const res = NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'));
  res.cookies.set('smv_token', '', { httpOnly:true, secure:true, sameSite:'lax', path:'/', maxAge: 0 });
  return res;
}
