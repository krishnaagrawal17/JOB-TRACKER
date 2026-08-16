/**
 * Session tokens. EDGE-SAFE BY CONTRACT: this module runs inside Next.js
 * middleware, which uses the Edge runtime and has no `node:crypto`. Use only
 * Web Crypto here. Never import `node:crypto`, `Buffer`, or `./password`.
 */
export const SESSION_COOKIE_NAME = 'jt_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export async function signSession(expiresAt: number, secret: string): Promise<string> {
  const payload = String(expiresAt);
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifySession(
  token: string,
  secret: string,
  now: number = Date.now(),
): Promise<boolean> {
  if (!token || !secret) return false;

  const separator = token.lastIndexOf('.');
  if (separator <= 0 || separator === token.length - 1) return false;

  const payload = token.slice(0, separator);
  if (!/^\d+$/.test(payload)) return false;

  const expiresAt = Number(payload);
  if (!Number.isSafeInteger(expiresAt)) return false;

  const signature = base64UrlToBytes(token.slice(separator + 1));
  if (!signature) return false;

  const key = await importKey(secret);
  // crypto.subtle.verify compares in constant time.
  const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(payload));
  if (!valid) return false;

  return expiresAt > now;
}
