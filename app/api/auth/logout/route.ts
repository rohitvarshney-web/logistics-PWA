import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // redirect back to THIS host, not SMV_ORIGIN, and add a flag so we can clear SW caches
  const url = new URL("/login?logged_out=1", req.url);

  const res = NextResponse.redirect(url);

  // delete cookies with identical attributes
  const del = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 0 };
  res.cookies.set("smv_token", "", del);
  res.cookies.set("smv_auth", "", del);

  // also ask browser to clear site data (works in modern browsers)
  res.headers.set("Clear-Site-Data", `"cookies","storage"`);

  return res;
}
