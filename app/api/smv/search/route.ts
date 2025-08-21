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
  if (Array.isArray(inBody.type) && inBody.type.length) payload.type = inBody.type;
  if (Array.isArray(inBody.status) && inBody.status.length) payload.status = inBody.status;
  if (Array.isArray(inBody.filters) && inBody.filters.length) payload.filters = inBody.filters;
  if (inBody.currentTask !== undefined) payload.currentTask = inBody.currentTask;

  return { payload };
}

function makeHeaders({
  scheme, token, origin, passThroughAuth,
}: { scheme: "raw" | "Bearer" | "JWT" | "Token"; token: string; origin: string; passThroughAuth?: string | null }) {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/plain, */*",
  };
  if (passThroughAuth) {
    // If client supplied Authorization, pass it unchanged.
    h["Authorization"] = passThroughAuth;
  } else if (token) {
    h["Authorization"] = scheme === "raw" ? token : `${scheme} ${token}`;
  }
  if (origin) {
    h["Origin"] = origin;
    h["Referer"] = origin.replace(/\/$/, "") + "/";
  }
  const consumer = process.env.SMV_CONSUMER;
  if (consumer) h["X-Consumer"] = consumer;
  return h;
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
  const { payload, error } = buildPayload(inBody) as any;
  if (error) return NextResponse.json({ error }, { status: 400 });

  const cookieToken  = cookies().get("smv_token")?.value || "";
  const passThroughAuth = req.headers.get("authorization"); // if client set it, we keep it
  const haveAnyToken = !!passThroughAuth || !!cookieToken;
  if (!haveAnyToken) {
    return NextResponse.json(
      { error: "Not authenticated. Missing Authorization bearer token." },
      { status: 401 }
    );
  }

  const base   = process.env.SMV_API_BASE || "https://api.live.stampmyvisa.com";
  const url    = `${base}/v1/logistics/search`;
  const origin = req.headers.get("origin") || process.env.SMV_ORIGIN || "";

  // Preferred scheme: default to RAW (matches your 200 OK trace). Override with SMV_LOGISTICS_AUTH_SCHEME.
  const preferred = (process.env.SMV_LOGISTICS_AUTH_SCHEME || "raw").trim() as "raw" | "Bearer" | "JWT" | "Token";
  const alt       = preferred === "raw" ? "Bearer" : "raw";

  // 1st attempt
  let headers = makeHeaders({ scheme: preferred, token: cookieToken, origin, passThroughAuth });
  let { r, data } = await callUpstream(url, headers, payload);

  // If auth failed and we built the header (i.e., client didn’t pass one), try alternate scheme once
  if (r.status === 401 && !passThroughAuth && cookieToken) {
    headers = makeHeaders({ scheme: alt, token: cookieToken, origin });
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
        authSchemeTried: passThroughAuth ? "pass-through" : preferred,
        retriedWith: (r.status === 401 && !passThroughAuth && cookieToken) ? alt : null,
        tokenSample: mask(cookieToken),
      },
      { status: r.status }
    );
  }

  return NextResponse.json({ ok: true, result: data, sent: payload, url });
}
