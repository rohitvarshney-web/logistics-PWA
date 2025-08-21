import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public paths only
  const publicPrefixes = ["/login", "/_next", "/favicon", "/icons", "/sw.js", "/manifest.webmanifest"];
  const isPublic = publicPrefixes.some((p) => pathname === p || pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  // Require auth for everything else (including "/")
  const hasAuth = req.cookies.get("smv_token") || req.cookies.get("smv_auth");
  if (!hasAuth) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Don't let SW/browser cache authed responses
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export const config = {
  matcher: ["/:path*"], // protect all routes except the ones above
};
