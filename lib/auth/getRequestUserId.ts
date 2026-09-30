import { NextRequest } from 'next/server';

/**
 * Reads the authenticated user's id from the X-User-Id header, which is
 * injected by middleware after verifying the session token.
 *
 * This header is never sent by clients — it is only set server-side by
 * middleware.ts, so it can be trusted unconditionally here.
 *
 * Throws if the header is missing or invalid (should never happen if
 * middleware is correctly configured, but we guard anyway).
 */
export function getRequestUserId(req: NextRequest): number {
  const raw = req.headers.get('X-User-Id');
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Missing or invalid X-User-Id header — request did not pass through auth middleware.');
  }
  return id;
}
