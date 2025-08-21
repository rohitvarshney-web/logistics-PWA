import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // derive searchText (passport/orderId convenience)
  const inBody = await req.json().catch(() => ({} as any));
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

  // coerce + defaults
  const limit = Number.isFinite(Number(inBody.limit)) ? Number(inBody.limit) : 10;
  const skip  = Number.isFinite(Number(inBody.skip))  ? Number(inBody.skip)  : 0;

  let sort = inBody.sort ?? ["created_at#!#-1"];
  if (typeof sort === "string") sort = [sort];
  if (!Array.isArray(sort) || !sort.length) sort = ["created_at#!#-1"];

  const type        = Array.isArray(inBody.type)    ? inBody.type    : [];
  const status      = Array.isArray(inBody.status)  ? inBody.status  : ["UNASSIGNED"];
  const filters     = Array.isArray(inBody.filters) ? inBody.filters : ["unassigned"];
  const currentTask = inBody.currentTask === undefined ? null : inBody.currentTask;

  // 🔐 Authorization: prefer incoming header, else cookie smv_token
  const cookieToken = cookies().get("smv_token")?.value;
  const incomingAuth = req.headers.get("authorization");
  const authHeader = incomingAuth || (cookieToken ? `Bearer ${cookieToken}` : "");

  if (!authHeader) {
    // fail fast so the UI tells user to log in again
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
    Accept: "application/json, text/plain, */*",
    Authorization: authHeader,                 // 👈 send token upstream
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
  try {
    const data = JSON.parse(txt);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: "logistics search failed", upstreamStatus: upstream.status, upstreamBody: data, sent: payload, url },
        { status: upstream.status }
      );
    }
    return NextResponse.json({ ok: true, result: data, sent: payload, url });
  } catch {
    // non-JSON upstream
    if (!upstream.ok) {
      return NextResponse.json(
        { error: "logistics search failed", upstreamStatus: upstream.status, upstreamBody: { raw: txt }, sent: payload, url },
        { status: upstream.status }
      );
    }
    return NextResponse.json({ ok: true, result: { raw: txt }, sent: payload, url });
  }
}
