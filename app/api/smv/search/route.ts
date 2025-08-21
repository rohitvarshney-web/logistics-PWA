import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getAuthFromReq(req: NextRequest): string | null {
  // 1) Explicit Authorization header wins
  const h = req.headers.get("authorization");
  if (h && h.trim()) return h;

  // 2) Same-origin cookie set by verify-otp
  const c = req.cookies.get("smv_token")?.value;
  if (c) return `Bearer ${c}`;

  // 3) Fallback: parse raw Cookie header (paranoid)
  const raw = req.headers.get("cookie") || "";
  const match = raw.split(";").map(s => s.trim()).find(s => s.startsWith("smv_token="));
  if (match) {
    const val = decodeURIComponent(match.split("=").slice(1).join("="));
    if (val) return `Bearer ${val}`;
  }
  return null;
}

export async function POST(req: NextRequest) {
  // ---- derive payload ----
  const inBody = await req.json().catch(() => ({} as any));
  const raw =
    inBody.searchText ??
    inBody.passport ??
    inBody.passportNumber ??
    inBody.orderId ??
    inBody.order_id;

  const searchText = raw == null ? "" : String(raw).trim();
  if (!searchText) {
    return NextResponse.json({ error: "Provide searchText or passport/orderId" }, { status: 400 });
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

  // ---- auth header from request/cookie ----
  const authHeader = getAuthFromReq(req);
  if (!authHeader) {
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
    "Authorization": authHeader,
  };
  if (origin) {
    headers["Origin"]  = origin;
    headers["Referer"] = origin.replace(/\/$/, "") + "/";
  }

  const payload = { searchText, limit, skip, sort, type, status, filters, currentTask };

  const upstream = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const txt = await upstream.text();
  let data: any; try { data = JSON.parse(txt); } catch { data = { raw: txt }; }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: "logistics search failed", upstreamStatus: upstream.status, upstreamBody: data, sent: payload, url },
      { status: upstream.status }
    );
  }

  return NextResponse.json({ ok: true, result: data, sent: payload, url });
}
