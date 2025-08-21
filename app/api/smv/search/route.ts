import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * This proxy:
 * - Derives searchText from { searchText | passport | orderId }
 * - Coerces limit/skip, sets defaults for sort/type/status/filters/currentTask
 * - Sends Authorization using a flexible scheme:
 *     - "Authorization: <SCHEME> <token>"  (default SCHEME="Bearer", set via SMV_LOGISTICS_AUTH_SCHEME)
 *     - Also includes "x-access-token" and "x-auth-token"
 *     - Also sends a Cookie header "access_token=<token>" (some backends accept it)
 *     - Optionally includes X-Consumer header if SMV_CONSUMER is set
 */
export async function POST(req: NextRequest) {
  const inBody = await req.json().catch(() => ({} as any));

  // --- Build payload (unchanged) ---
  const raw =
    inBody.searchText ??
    inBody.passport ??
    inBody.passportNumber ??
    inBody.orderId ??
    inBody.order_id;

  const searchText = raw == null ? "" : String(raw).trim();
  if (!searchText) {
    return NextResponse.json(
      { error: "Provide searchText or passport/orderId" },
      { status: 400 }
    );
  }

  const limit = Number.isFinite(Number(inBody.limit)) ? Number(inBody.limit) : 10;
  const skip  = Number.isFinite(Number(inBody.skip))  ? Number(inBody.skip)  : 0;

  let sort = inBody.sort ?? ["created_at#!#-1"];
  if (typeof sort === "string") sort = [sort];
  if (!Array.isArray(sort) || !sort.length) sort = ["created_at#!#-1"];

  const type        = Array.isArray(inBody.type)    ? inBody.type    : [];
  const status      = Array.isArray(inBody.status)  ? inBody.status  : ["UNASSIGNED"];
  const filters     = Array.isArray(inBody.filters) ? inBody.filters : ["unassigned"];
  const currentTask = inBody.currentTask === undefined ? null : inBody.currentTask;

  const payload = { searchText, limit, skip, sort, type, status, filters, currentTask };

  // --- Token sourcing + header variants ---
  const cookieToken  = cookies().get("smv_token")?.value || null;
  const incomingAuth = req.headers.get("authorization"); // e.g., "Bearer abc"
  // If client passed Authorization, prefer that; else build from cookie token
  const scheme = (process.env.SMV_LOGISTICS_AUTH_SCHEME || "Bearer").trim(); // e.g., "Bearer" | "JWT" | "Token"
  const builtAuth = cookieToken ? `${scheme} ${cookieToken}` : "";
  const authHeader = incomingAuth || builtAuth;

  if (!authHeader && !cookieToken) {
    return NextResponse.json(
      { error: "Not authenticated. Missing Authorization bearer token." },
      { status: 401 }
    );
  }

  const base   = process.env.SMV_API_BASE || "https://api.live.stampmyvisa.com";
  const url    = `${base}/v1/logistics/search`;
  const origin = req.headers.get("origin") || process.env.SMV_ORIGIN || "";

  const hdrs: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/plain, */*",
  };
  if (authHeader) {
    hdrs["Authorization"] = authHeader; // main path
  }
  if (cookieToken) {
    // add common alternates many APIs accept
    hdrs["x-access-token"] = cookieToken;
    hdrs["x-auth-token"]   = cookieToken;
    hdrs["Cookie"]         = `access_token=${cookieToken}`; // harmless if ignored
  }
  if (origin) {
    hdrs["Origin"]  = origin;
    hdrs["Referer"] = origin.replace(/\/$/, "") + "/";
  }
  if (process.env.SMV_CONSUMER) {
    hdrs["X-Consumer"] = process.env.SMV_CONSUMER;
  }

  const upstream = await fetch(url, {
    method: "POST",
    headers: hdrs,
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const txt = await upstream.text();
  let data: any;
  try { data = JSON.parse(txt); } catch { data = { raw: txt }; }

  if (!upstream.ok) {
    // mask token in debug
    const mask = (t: string) => (t ? `${t.slice(0,6)}…${t.slice(-6)}` : null);
    const dbg = {
      url,
      sent: payload,
      upstreamStatus: upstream.status,
      upstreamBody: data,
      authSchemeUsed: authHeader ? authHeader.split(" ")[0] : null,
      tokenSamples: {
        cookieToken: cookieToken ? mask(cookieToken) : null,
        authHeader: authHeader ? mask(authHeader.split(" ").slice(1).join(" ")) : null,
      },
      extraHeaders: {
        xAccessToken: !!cookieToken,
        xAuthToken: !!cookieToken,
        cookieHeaderAccessToken: !!cookieToken,
        xConsumer: !!process.env.SMV_CONSUMER,
      },
    };
    return NextResponse.json(
      { error: "logistics search failed", ...dbg },
      { status: upstream.status }
    );
  }

  return NextResponse.json({ ok: true, result: data, sent: payload, url });
}
