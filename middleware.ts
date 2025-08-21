import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Never touch API or static assets
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icons') ||
    pathname === '/sw.js' ||
    pathname === '/manifest.webmanifest'
  ) {
    return NextResponse.next();
  }

  // Public: only the login page
  if (pathname === '/login') return NextResponse.next();

  // Everything else requires auth (including "/")
  const hasAuth = req.cookies.get('smv_token') || req.cookies.get('smv_auth');
  if (!hasAuth) {
    // If a fetch expects JSON, return 401 instead of redirect
    const accept = req.headers.get('accept') || '';
    if (accept.includes('application/json')) {
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

  // Do not let SW/browser cache authed pages
  const res = NextResponse.next();
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

// Protect everything except API & static
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|icons|sw\\.js|manifest\\.webmanifest).*)',
  ],
};
