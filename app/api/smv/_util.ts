import { cookies } from 'next/headers';
export function authHeaders(): Record<string,string> {
  const headers: Record<string,string> = { 'Content-Type': 'application/json' };
  const token = cookies().get('smv_token')?.value;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const bearer = process.env.SMV_API_BEARER;
  const keyHeader = process.env.SMV_API_KEY_HEADER;
  const apiKey = process.env.SMV_API_KEY;
  if (!token && bearer) headers['Authorization'] = `Bearer ${bearer}`;
  if (keyHeader && apiKey) headers[keyHeader] = apiKey;
  return headers;
}
export function smvBase(): string { return process.env.SMV_API_BASE || 'https://api.live.stampmyvisa.com'; }
