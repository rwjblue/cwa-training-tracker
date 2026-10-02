import { describe, expect, it } from 'vitest';
import { publicCwCalendarResponse } from './cw-calendar';
const request = (method = 'GET', headers?: HeadersInit) =>
  new Request('https://cwa.n1rwj.com/api/live-practice/calendar.ics', { method, headers });
const response = (method = 'GET', headers?: HeadersInit) =>
  publicCwCalendarResponse(request(method, headers), 'https://cwa.n1rwj.com');
describe('public calendar HTTP contract', () => {
  it('serves GET/HEAD identically except for body without request-derived private data', async () => {
    const get = await response('GET', {
      Cookie: 'private-token',
      Authorization: 'Bearer synthetic-private',
      'X-CWA-Account': 'private-account',
    });
    const head = await response('HEAD');
    expect(get.status).toBe(200);
    expect(head.status).toBe(200);
    expect([...head.headers]).toEqual([...get.headers]);
    expect(await head.text()).toBe('');
    const body = await get.text();
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).not.toMatch(/private-token|private-account|synthetic-private/);
    expect(get.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
    expect(get.headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=3600');
    expect(get.headers.has('Set-Cookie')).toBe(false);
    expect(get.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
  it('handles strong, weak, lists, wildcard and modified-date conditions bodylessly', async () => {
    const first = await response();
    const etag = first.headers.get('ETag')!;
    for (const method of ['GET', 'HEAD'])
      for (const condition of [etag, `W/${etag}`, `"old", W/${etag}`, '*']) {
        const cached = await response(method, { 'If-None-Match': condition });
        expect(cached.status).toBe(304);
        expect(await cached.text()).toBe('');
        expect(cached.headers.get('ETag')).toBe(etag);
      }
    expect(
      (await response('GET', { 'If-Modified-Since': first.headers.get('Last-Modified')! })).status,
    ).toBe(304);
    expect((await response('GET', { 'If-Modified-Since': 'invalid' })).status).toBe(200);
    expect(
      (
        await response('GET', {
          'If-None-Match': '"old"',
          'If-Modified-Since': first.headers.get('Last-Modified')!,
        })
      ).status,
    ).toBe(200);
  });
  it('rejects unsupported methods and gives each deployment variant its actual content ETag', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
      const rejected = await response(method);
      expect(rejected.status).toBe(405);
      expect(rejected.headers.get('Allow')).toBe('GET, HEAD');
    }
    const local = await publicCwCalendarResponse(request(), 'http://localhost:8791');
    expect(local.headers.get('ETag')).not.toBe((await response()).headers.get('ETag'));
    expect(await local.text()).toContain('http://localhost:8791/#events');
  });
});
