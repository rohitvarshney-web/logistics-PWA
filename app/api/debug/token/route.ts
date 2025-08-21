import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
  const t = cookies().get('smv_token')?.value || null;
  if (!t) return NextResponse.json({ ok:false, reason:'no smv_token cookie' }, { status: 401 });

  // decode (no verify) just for debugging claims
  function b64urlDecode(s: string) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4 === 2 ? '==' : s.length % 4 === 3 ? '=' : '';
    return Buffer.from(s + pad, 'base64').toString('utf8');
  }

  let header:any=null, payload:any=null;
  try {
    const [h,p] = t.split('.');
    header = JSON.parse(b64urlDecode(h));
    payload = JSON.parse(b64urlDecode(p));
  } catch {}

  const sample = t ? `${t.slice(0,6)}…${t.slice(-6)}` : null;
  return NextResponse.json({ ok:true, tokenSample: sample, header, payload });
}
