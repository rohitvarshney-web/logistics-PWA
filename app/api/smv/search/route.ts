import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * Accepts body:
 * {
 *   // required (any one of these becomes searchText)
 *   searchText?: string; passport?: string; orderId?: string; order_id?: string; passportNumber?: string;
 *
 *   // optional (forwarded as-is if provided)
 *   limit?: number; skip?: number; sort?: string[] | string;
 *   type?: string[]; status?: string[]; filters?: string[]; currentTask?: string | null;
 * }
 *
 * We:
 *  - derive searchText
 *  - coerce limit/skip (defaults: 10/0)
 *  - ensure sort is an array (default: ["created_at#!#-1"])
 *  - include type/status/filters/currentTask ONLY if provided (no empty defaults)
 *  - forward Authorization (Bearer/JWT/etc), plus x-access-token variants
 */
export async function POST(req: NextRequest) {
  const inBody = await req.json().catch(() => ({} as any));

  // --- derive searchText ---
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

  // --- coerce base paging + sort ---
  const limit = Number.isFinite(Number(inBody.limit)) ? Number(inBody.limit) : 10;
  const skip  = Number.isFinite(Number(inBody.skip))  ? Number(inBody.skip)  : 0;

  let sort = inBody.sort ?? ["created_at#!#-1"];
  if (typeof sort === "string") sort = [sort];
  if (!Array.isArray(sort) || !sort.length) sort = ["created_at#!#-1"];

  // --- build payload with optional keys only if provided ---
  const payload: Record<string, any> = { searchText, limit, skip, sort };

  if (Array.isArray(inBody.type) && inBody.type.length) {
    payload.type = inBody.type;
  }
  if (Array.isArray(inBody.status) && inBody.status.length) {
    payload.status = inBody.status;
  }
  if (Array.isArray(inBody.filters) && inBody.filters.length) {
    payload.filters = inBody.filters;
  }
  if (inBody.currentTask !== undefined) {
    payload.currentTask = inBody.currentTask; // allow null or string if you pass it
  }

  // --- auth header(s) ---
  const cookieToken  = cookies().get("smv_token")?.value || null;
  const incomingAuth = req.headers.get("authorization"); // e.g. "Bearer abc"
  const scheme = (process.env.SMV_LOGISTICS_AUTH_SCHEME || "Bearer").trim(); // optional override
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

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/plain, */*",
  };
  if (authHeader) headers["Authorization"] = authHeader;
  if (cookieToken) {
    headers["x-access-token"] = cookieToken;
    headers["x-auth-token"]   = cookieToken;
    headers["Cookie"]         = `access_token=${cookieToken}`;
  }
  if (origin) {
    headers["Origin"]  = origin;
    headers["Referer"] = origin.replace(/\/$/, "") + "/";
  }
  if (process.env.SMV_CONSUMER) {
    headers["X-Consumer"] = process.env.SMV_CONSUMER;
  }

  const upstream = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const txt = await upstream.text();
  let data: any; try { data = JSON.parse(txt); } catch { data = { raw: txt }; }

  if (!upstream.ok) {
    // mask token in diagnostics
    const mask = (t?: string | null) => (t ? `${t.slice(0,6)}…${t.slice(-6)}` : null);
    return NextResponse.json(
      {
        error: "logistics search failed",
        url,
        sent: payload,
        upstreamStatus: upstream.status,
        upstreamBody: data,
        authSchemeUsed: authHeader ? authHeader.split(" ")[0] : null,
        tokenSamples: {
          cookieToken: mask(cookieToken),
          authHeader: authHeader ? mask(authHeader.split(" ").slice(1).join(" ")) : null,
        },
        extraHeaders: {
          xAccessToken: !!cookieToken,
          xAuthToken: !!cookieToken,
          cookieHeaderAccessToken: !!cookieToken,
          xConsumer: !!process.env.SMV_CONSUMER,
        },
      },
      { status: upstream.status }
    );
  }

  return NextResponse.json({ ok: true, result: data, sent: payload, url });
}
