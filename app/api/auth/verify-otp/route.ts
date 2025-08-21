// app/api/auth/verify-otp/route.ts
import { NextResponse } from 'next/server';

type Variant = {
  headers: Record<string, string>;
  body: string;
  label: string;
  bodyPreview: any;
  contentType: 'json' | 'form';
};

const sanitizeHeaders = (h: Record<string, string>) => {
  const out = { ...h };
  // nothing sensitive here, but keep the helper if you add auth later
  return out;
};

const isEmail = (s: string) => s.includes('@');

function buildBase(identifier: string) {
  const consumer = process.env.SMV_CONSUMER || 'nucleus';
  const method = isEmail(identifier) ? 'EMAIL' : 'PHONE';
  const email = isEmail(identifier) ? identifier : '';
  const phone = isEmail(identifier) ? '' : identifier;
  return { consumer, method, email, phone };
}

function makeJson(obj: any, label: string, origin: string): Variant {
  return {
    label,
    contentType: 'json',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Origin': origin,
      'Referer': origin + '/',
    },
    body: JSON.stringify(obj),
    bodyPreview: obj,
  };
}

function makeForm(obj: Record<string, string>, label: string, origin: string): Variant {
  return {
    label,
    contentType: 'form',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json, text/plain, */*',
      'Origin': origin,
      'Referer': origin + '/',
    },
    body: new URLSearchParams(obj).toString(),
    bodyPreview: obj,
  };
}

function buildVariants(identifier: string, code: string, origin: string): Variant[] {
  const base = buildBase(identifier);

  const keys = ['otp', 'code', 'otp_code', 'token', 'otpCode'] as const;
  const variants: Variant[] = [];

  for (const retry of [true, false]) {
    for (const k of keys) {
      const obj = { ...base, retry, [k]: code };
      variants.push(makeJson(obj, `json:${k}:retry=${retry}`, origin));
    }
    for (const k of keys) {
      const obj = Object.fromEntries(
        Object.entries({ ...base, retry, [k]: code }).map(([kk, vv]) => [kk, String(vv ?? '')])
      ) as Record<string, string>;
      variants.push(makeForm(obj, `form:${k}:retry=${retry}`, origin));
    }
  }

  return variants;
}

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const bodyIn = await req.json().catch(() => ({} as any));
  const identifier = String(bodyIn.identifier || '').trim();
  const code = String(
    bodyIn.otp ??
    bodyIn.code ??
    bodyIn.otp_code ??
    bodyIn.token ??
    bodyIn.otpCode ??
    ''
  ).trim();

  if (!identifier || !code) {
    return NextResponse.json(
      { error: 'identifier and otp/code required' },
      { status: 400 }
    );
  }

  const origin =
    req.headers.get('origin') ||
    process.env.SMV_ORIGIN ||
    'https://example.com';

  const base = process.env.SMV_API_BASE || 'https://api.live.stampmyvisa.com';
  const path = process.env.SMV_VERIFY_OTP_PATH || '/v1/auth/verify-login-otp';
  const url = `${base}${path}`;

  let last = { status: 0, body: '', label: '', variant: null as null | Variant };

  for (const v of buildVariants(identifier, code, origin)) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: v.headers,
      body: v.body,
      cache: 'no-store',
    });

    const text = await resp.text();
    last = { status: resp.status, body: text, label: v.label, variant: v };

    if (resp.ok) {
      let data: any = null;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }

      return NextResponse.json({
        ok: true,
        user: data?.user ?? null,
        token: data?.access_token || data?.token || null,
        usedVariant: v.label,
      });
    }
  }

  // Prepare readable upstream body
  let upstreamParsed: any = null;
  try { upstreamParsed = JSON.parse(last.body); } catch { upstreamParsed = last.body; }

  // Return FULL DEBUG so you can see it on the page
  return NextResponse.json(
    {
      error: 'verify-otp failed',
      upstreamStatus: last.status,
      upstreamBody: upstreamParsed,
      triedVariant: last.label,
      debug: {
        url,
        method: 'POST',
        headersSent: last.variant ? sanitizeHeaders(last.variant.headers) : null,
        contentType: last.variant?.contentType ?? null,
        payloadPreview: last.variant?.bodyPreview ?? null,
      },
    },
    { status: 502 }
  );
}
