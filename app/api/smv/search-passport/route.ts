// app/api/smv/search-passport/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// try a few sort formats once; we'll lock to the working one after we see logs
const SORT_VARIANTS: any[] = [
  [{ field: 'updated_at', order: 'desc' }],
  [{ field: 'created_at', order: 'desc' }],
  ['-updated_at'],
  ['-created_at'],
];

export async function POST(req: Request) {
  try {
    const inBody = await req.json().catch(() => ({} as any));
    const passport: string = String(inBody.passport || inBody.passportNumber || '').trim();

    if (!passport) {
      return NextResponse.json({ error: 'passport is required' }, { status: 400 });
    }

    const origin = req.headers.get('origin') || process.env.SMV_ORIGIN || 'https://internal.stampmyvisa.com';
    const base = process.env.SMV_API_BASE || 'https://api.live.stampmyvisa.com';
    const path = process.env.SMV_SEARCH_PASSPORT_PATH || '/v1/orders/search';
    const url = `${base}${path}`;

    let last = { status: 0, body: '', sort: null as any };

    for (const sort of SORT_VARIANTS) {
      const payload = {
        query: {
          passport: passport,
          passport_number: passport, // send both likely keys; backend ignores extra
        },
        sort,
        limit: 20,
        page: 1,
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

      const text = await r.text();
      last = { status: r.status, body: text, sort };

      if (r.ok) {
        let data: any = null; try { data = JSON.parse(text); } catch { data = { raw: text }; }
        return NextResponse.json({ ok: true, usedSort: sort, result: data });
      }

      // if error still complains about sort, try next variant
      if (text.toLowerCase().includes('sort') && text.toLowerCase().includes('must')) continue;

      // otherwise bubble error immediately
      let err: any = null; try { err = JSON.parse(text); } catch { err = { raw: text }; }
      return NextResponse.json(
        { error: 'passport search failed', upstreamStatus: r.status, upstreamBody: err, triedSort: sort },
        { status: r.status }
      );
    }

    let err: any = null; try { err = JSON.parse(last.body); } catch { err = { raw: last.body }; }
    return NextResponse.json(
      { error: 'passport search failed (all sort variants)', upstreamStatus: last.status, upstreamBody: err, triedSort: last.sort },
      { status: last.status || 502 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: 'Unexpected error in search-passport', detail: String(e) }, { status: 500 });
  }
}
