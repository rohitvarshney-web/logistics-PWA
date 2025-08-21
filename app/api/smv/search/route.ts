import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

function buildPayload(inBody: any) {
  const raw =
    inBody.searchText ??
    inBody.passport ??
    inBody.passportNumber ??
    inBody.orderId ??
    inBody.order_id;

  const searchText = raw == null ? "" : String(raw).trim();
  if (!searchText) return { error: "Provide searchText or passport/orderId" };

  const limit = Number.isFinite(Number(inBody.limit)) ? Number(inBody.limit) : 10;
  const skip  = Number.isFinite(Number(inBody.skip))  ? Number(inBody.skip)  : 0;

  let sort = inBody.sort ?? ["created_at#!#-1"];
  if (typeof sort === "string") sort = [sort];
  if (!Array.isArray(sort) || !sort.length) sort = ["created_at#!#-1"];

  const payload: Record<string, any> = { searchText, limit, skip, sort };

  // ONLY include these if caller provided them
  if (Array.isArray(inBody.type) && inBody.type.length) payload.type = inBody.type;
  if (Array.isArray(inBody.status) && inBody.status.length) payload.status = inBody.status;
  if (Array.isArray(inBody.filters) && inBody.filters.length) payload.filters = inBody.filters;
  if (inBody.currentTask !== undefined) payload.currentTask = inBody.currentTask;

  return { payload };
}

async function callUpstream(url: string, headers: Record<string,string>, body: any) {
  const r = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const txt = await r.text();
  let data: any; try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
  return { r, data };
}

export async function POST(req: NextRequest) {
  const inBody = await req.json().catch(() => ({} as any));
  const built = buildPayload(inBody) as any;
  if (built.error) return NextResponse.json({ error: built.error }, { status: 400 });
  const payload = built.payload;

  // 🔐 Always source token from cookie (avoid pass-through mismatch)
  const token = cookies().get("smv_token")?.value || "";
  if (!token) {
    return NextResponse.json(
      { error: "Not authenticated. Missing Authorization bearer token." },
      { status: 401 }
    );
  }

  const base = process.env.SMV_API_BASE || "https://api.live.stampmyvisa.com";
  const url  = `${base}/v1/logistics/search`;

  // First attempt: RAW Authorization (matches your 200 OK trace)
  let headers: Record<string,string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/plain, */*",
    "Authorization": token,
  };
  // Intentionally do NOT set Origin/Referer
  if (process.env.SMV_CONSUMER) headers["X-Consumer"] = process.env.SMV_CONSUMER!;

  let { r, data } = await callUpstream(url, headers, payload);

  // If 401, retry with Bearer scheme once
  if (r.status === 401) {
    headers = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/plain, */*",
      "Authorization": `Bearer ${token}`,
    };
    if (process.env.SMV_CONSUMER) headers["X-Consumer"] = process.env.SMV_CONSUMER!;
    ({ r, data } = await callUpstream(url, headers, payload));
  }

  if (!r.ok) {
    const mask = (t?: string) => (t ? `${t.slice(0,6)}…${t.slice(-6)}` : null);
    return NextResponse.json(
      {
        error: "logistics search failed",
        url,
        sent: payload,
        upstreamStatus: r.status,
        upstreamBody: data,
        tokenSample: mask(token),
        schemeTried: r.status === 401 ? "Bearer (after RAW failed)" : "RAW",
      },
      { status: r.status }
    );
  }

  return NextResponse.json({ ok: true, result: data, sent: payload, url });
}
