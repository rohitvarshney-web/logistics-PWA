import { NextResponse } from 'next/server';
import { authHeaders, smvBase } from '../_util';

export async function POST(req: Request) {
  const body = await req.json().catch(()=>({}));
  const passportNumber = body.passportNumber;
  if (!passportNumber) return NextResponse.json({ error: 'passportNumber required' }, { status: 400 });
  const url = `${smvBase()}/v1/logistics/search`;
  const r = await fetch(url, { method:'POST', headers: authHeaders(), body: JSON.stringify({ passport_number: passportNumber }), cache:'no-store' });
  const text = await r.text(); let data:any=null; try { data=JSON.parse(text); } catch { data={ raw:text }; }
  return NextResponse.json(data, { status: r.status });
}
