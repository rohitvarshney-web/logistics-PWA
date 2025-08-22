import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  const bodyIn = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(bodyIn?.ids) ? bodyIn.ids.map(String) : [];
  const status: string = String(bodyIn?.status || '').trim();

  if (!ids.length || !status) {
    return NextResponse.json(
      { error: 'ids[] and status are required' },
      { status: 400 }
    );
  }

  const token = cookies().get('smv_token')?.value;
  if (!token) {
    return NextResponse.json(
      { error: 'Not authenticated. Missing smv_token cookie.' },
      { status: 401 }
    );
  }

  const base = process.env.SMV_API_BASE || 'https://api.live.stampmyvisa.com';
  const path = process.env.SMV_BULK_UPDATE_PATH || '/v1/logistics/bulk-update';
  const url  = `${base}${path}`;

  const origin   = process.env.SMV_ORIGIN || 'https://internal.stampmyvisa.com';
  const consumer = process.env.SMV_CONSUMER;

  const headers: Record<string, string> = {
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'Origin': origin,
    'Referer': origin + '/',
  };
  if (consumer) headers['x-consumer'] = consumer;

  const payload = { ids, status };

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const txt = await r.text();
    let data: any; try { data = JSON.parse(txt); } catch { data = { raw: txt }; }

    if (!r.ok) {
      return NextResponse.json(
        {
          error: 'bulk-update failed',
          upstreamStatus: r.status,
          upstreamBody: data,
          url,
          sent: payload,
        },
        { status: 502 }
      );
    }

    const updated =
      data?.updated ||
      data?.data?.updated ||
      data?.data?.ids ||
      data?.ids ||
      [];

    return NextResponse.json({ ok: true, updated, upstream: data, url });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'bulk-update network error', message: String(e) },
      { status: 500 }
    );
  }
}
