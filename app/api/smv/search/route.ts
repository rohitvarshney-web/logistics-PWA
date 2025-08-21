// app/api/smv/search/route.ts
import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

/**
 * Accepts either:
 *  - { passport: "T8554064" }
 *  - { orderId: "ORD123" }
 *  - or a direct { searchText, limit, skip, sort, type, status, filters, currentTask }
 * and forwards EXACTLY the shape your backend needs.
 */
export async function POST(req: Request) {
  try {
    const inBody = await req.json().catch(() => ({} as any));

    // map convenience inputs -> backend shape
    const searchText: string | undefined =
      (inBody.searchText ??
        inBody.passport ??
        inBody.passportNumber ??
        inBody.orderId ??
        inBody.order_id)?.toString().trim();

    if (!searchText) {
      return NextResponse.json({ error: 'Provide searchText or passport/orderId' }, { status: 400 });
    }

    const limit = Number(inBody.limit ?? 10);
    const skip  = Number(inBody.skip ?? 0);

    // Backend expects: sort: ["created_at#!#-1"] (desc on created_at)
    // Allow override; if user passes a single string, wrap it in an array.
    let sort = inBody.sort ?? ["created_at#!#-1"];
    if (typeof sort === 'string') sort = [sort];

    // Optional filters your screenshot shows
    const type        = Array.isArray(inBody.type) ? inBody.type : [];
    const status      = Array.isArray(inBody.status) ? inBody.status : ["UNASSIGNED"];
    const filters     = Array.isArray(inBody.filters) ? inBody.filters : ["unassigned"];
    const currentTask = inBody.currentTask ?? null;

    const base   = process.env.SMV_API_BASE || 'https://api.live.stampmyvisa.com';
    const path   = process.env.SMV_SEARCH_PATH || '/v1/logistics/search';
    const url    = `${base}${path}`;
    const origin = req.headers.get('origin') || process.env.SMV_ORIGIN || 'https://internal.stampmyvisa.com';

    const payload = {
      searchText,
      limit,
      skip,
      sort,
      type,
      status,
      filters,
      currentTask,
    };

    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Origin': origin,
        'Referer': origin + '/',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const txt = await r.text();
    if (!r.ok) {
      let err: any; try { err = JSON.parse(txt); } catch { err = { raw: txt }; }
      return NextResponse.json(
        { error: 'logistics search failed', upstreamStatus: r.status, upstreamBody: err, sent: payload, url },
        { status: r.status }
      );
    }

    let data: any; try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
    return NextResponse.json({ ok: true, result: data, sent: payload, url });
  } catch (e: any) {
    return NextResponse.json({ error: 'Unexpected error in search', detail: String(e) }, { status: 500 });
  }
}
