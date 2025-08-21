// app/api/smv/search/route.ts
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const inBody = await req.json().catch(() => ({} as any));

  // derive searchText from convenience inputs if not provided
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

  // Coerce strict numeric types (backend is strict)
  const limit = Number.isFinite(Number(inBody.limit)) ? Number(inBody.limit) : 10;
  const skip  = Number.isFinite(Number(inBody.skip))  ? Number(inBody.skip)  : 0;

  // Must be an array of strings like ["created_at#!#-1"]
  let sort = inBody.sort ?? ["created_at#!#-1"];
  if (typeof sort === "string") sort = [sort];
  if (!Array.isArray(sort) || sort.length === 0) sort = ["created_at#!#-1"];

  const type        = Array.isArray(inBody.type)    ? inBody.type    : [];
  const status      = Array.isArray(inBody.status)  ? inBody.status  : ["UNASSIGNED"];
  const filters     = Array.isArray(inBody.filters) ? inBody.filters : ["unassigned"];
  const currentTask = inBody.currentTask === undefined ? null : inBody.currentTask;

  const base   = process.env.SMV_API_BASE || "https://api.live.stampmyvisa.com";
  const url    = `${base}/v1/logistics/search`; // hard-locked
  const origin = req.headers.get("origin") || process.env.SMV_ORIGIN || "https://internal.stampmyvisa.com";

  const payload = { searchText, limit, skip, sort, type, status, filters, currentTask };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/plain, */*",
      "Origin": origin,
      "Referer": origin + "/",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const txt = await r.text();
  if (!r.ok) {
    let err: any; try { err = JSON.parse(txt); } catch { err = { raw: txt }; }
    return NextResponse.json(
      { error: "logistics search failed", upstreamStatus: r.status, upstreamBody: err, sent: payload, url },
      { status: r.status }
    );
  }

  let data: any; try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
  return NextResponse.json({ ok: true, result: data, sent: payload, url });
}
