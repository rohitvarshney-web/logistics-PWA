import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const method = url.searchParams.get('method') || 'EMAIL';
  const identifier = url.searchParams.get('identifier') || '';
  if (!identifier) return NextResponse.json({ error: 'identifier required' }, { status: 400 });
  const base = process.env.SMV_API_BASE || 'https://api.live.stampmyvisa.com';
  const path = process.env.SMV_CHECK_USER_PATH || '/v1/auth/check-user';
  const qs = method === 'PHONE' ? `?method=PHONE&phone=${encodeURIComponent(identifier)}&email=`
                                : `?method=EMAIL&phone=&email=${encodeURIComponent(identifier)}`;
  const r = await fetch(`${base}${path}${qs}`, { method:'GET', cache:'no-store' });
  const text = await r.text(); let data:any=null; try { data=JSON.parse(text); } catch { data={ raw:text }; }
  if (!r.ok) return NextResponse.json({ error: 'check-user failed', data }, { status: r.status });
  return NextResponse.json({ ok: true, data, message: 'User exists' });
}
