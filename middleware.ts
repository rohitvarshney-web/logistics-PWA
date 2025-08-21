import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) Never touch API or static assets
  const isApi = pathname.startsWith('/api/');
  const isStatic =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icons') ||
    pathname === '/sw.js' ||
    pathname === '/manifest.webmanifest';

  if (isApi || isStatic) return NextResponse.next();

  // 2) Public routes
  if (pathname === '/login' || pathname.startsWith('/hello') || pathname === '/') {
    // If you also want to protect "/" then remove "|| pathname === '/'"
    return NextResponse.next();
  }

  // 3) Require auth for everything else
  const hasAuth = req.cookies.get('smv_token') || req.cookies.get('smv_auth');

  if (!hasAuth) {
    // If it's a fetch expecting JSON, return 401 instead of redirect
    const accept = req.headers.get('accept') || '';
    const wantsJson = accept.includes('application/json');

    if (wantsJson) {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }

    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // 4) Don’t cache authed pages
  const res = NextResponse.next();
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

// 5) Exclude API & static from ever invoking this middleware
export const config = {
  matcher: [
    // everything except these prefixes
    '/((?!api|_next/static|_next/image|favicon.ico|icons|sw\\.js|manifest\\.webmanifest).*)',
  ],
};
