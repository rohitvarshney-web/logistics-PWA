import { NextResponse } from 'next/server';
import { authHeaders, smvBase } from '../_util';

function updatePath() { return process.env.SMV_UPDATE_STATUS_PATH || '/v1/logistics/update-status'; }

export async function POST(req: Request) {
  const body = await req.json().catch(()=>({}));
  const { orderId, status, note } = body || {};
  if (!orderId || !status) return NextResponse.json({ error: 'orderId and status required' }, { status: 400 });
  const url = `${smvBase()}${updatePath()}`;
  const payload = { order_id: String(orderId), status: String(status), note: note || '', at: new Date().toISOString() };
  const r = await fetch(url, { method:'POST', headers: authHeaders(), body: JSON.stringify(payload), cache:'no-store' });
  const text = await r.text(); let data:any=null; try { data=JSON.parse(text); } catch { data={ raw:text }; }
  return NextResponse.json(data, { status: r.status });
}
