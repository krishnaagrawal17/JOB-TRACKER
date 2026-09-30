import { NextRequest } from 'next/server';
import { getRequestUserId } from './getRequestUserId';

function requestWithHeader(value: string | null): NextRequest {
  const headers = new Headers();
  if (value !== null) headers.set('X-User-Id', value);
  return new NextRequest('http://localhost:3000/api/jobs', { headers });
}

describe('getRequestUserId', () => {
  it('returns the numeric id from the X-User-Id header', () => {
    expect(getRequestUserId(requestWithHeader('42'))).toBe(42);
  });

  it('throws when the header is missing', () => {
    expect(() => getRequestUserId(requestWithHeader(null))).toThrow();
  });

  it('throws when the header is not a positive integer', () => {
    expect(() => getRequestUserId(requestWithHeader('0'))).toThrow();
    expect(() => getRequestUserId(requestWithHeader('-1'))).toThrow();
    expect(() => getRequestUserId(requestWithHeader('1.5'))).toThrow();
    expect(() => getRequestUserId(requestWithHeader('not-a-number'))).toThrow();
  });
});
