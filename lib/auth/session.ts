/**
 * Session tokens. EDGE-SAFE BY CONTRACT: this module runs inside Next.js
 * middleware, which uses the Edge runtime and has no `node:crypto`. Use only
 * Web Crypto here. Never import `node:crypto`, `Buffer`, or `./password`.
 *
 * Token format: "{userId}:{expiresAt}.{hmac_base64url}"
 * The HMAC signs the entire "{userId}:{expiresAt}" payload so tampering with
 * either part invalidates the signature.
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

/**
 * Signs a session token embedding the userId in the payload.
 * @param userId  - The authenticated user's DB id.
 * @param expiresAt - Unix timestamp in milliseconds when the session expires.
 * @param secret  - The HMAC secret from AUTH_SESSION_SECRET.
 */
export async function signSession(userId: number, expiresAt: number, secret: string): Promise<string> {
  const payload = `${userId}:${expiresAt}`;
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export interface SessionPayload {
  userId: number;
}

/**
 * Verifies the session token and returns the payload if valid, or null.
 */
export async function verifySession(
  token: string,
  secret: string,
  now: number = Date.now(),
): Promise<SessionPayload | null> {
  if (!token || !secret) return null;

  const separator = token.lastIndexOf('.');
  if (separator <= 0 || separator === token.length - 1) return null;

  const payload = token.slice(0, separator);

  // payload must be "{userId}:{expiresAt}"
  const colonIdx = payload.indexOf(':');
  if (colonIdx <= 0) return null;

  const userIdStr = payload.slice(0, colonIdx);
  const expiresAtStr = payload.slice(colonIdx + 1);

  if (!/^\d+$/.test(userIdStr) || !/^\d+$/.test(expiresAtStr)) return null;

  const userId = Number(userIdStr);
  const expiresAt = Number(expiresAtStr);

  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  if (!Number.isSafeInteger(expiresAt)) return null;

  const signature = base64UrlToBytes(token.slice(separator + 1));
  if (!signature) return null;

  const key = await importKey(secret);
  // crypto.subtle.verify compares in constant time.
  const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(payload));
  if (!valid) return null;

  if (expiresAt <= now) return null;

  return { userId };
}
