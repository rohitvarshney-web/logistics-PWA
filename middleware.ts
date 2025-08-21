import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get('smv_token')?.value;
  const publicPrefixes = ['/login', '/manifest.json', '/icons', '/api/auth', '/api/health', '/api/hello', '/_next', '/favicon.ico'];
  const isPublic = publicPrefixes.some(p => pathname.startsWith(p));
  if (!isPublic && !token) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
