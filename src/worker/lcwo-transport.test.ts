import { describe, expect, it, vi } from 'vitest';
import { fetchLcwoExports, parseLcwoRows, validateLcwoCredentials } from './lcwo-transport';
import type { LcwoSourceType } from '../shared/lcwo';

const credentials = { username: 'student7', password: 'synthetic & = password' };
const base = { uid: '7', NR: '12', time: '2026-09-30 00:00:15' };
const exports: Record<LcwoSourceType, Record<string, unknown>[]> = {
  words: [{ ...base, max: '35', score: '0', valid: '0' }],
  callsigns: [{ ...base, max: '28', score: '100', valid: '1' }],
  groups: [{ ...base, mode: 'letters', speed: '25', eff: '18', accuracy: '90.5', valid: '1' }],
  koch: [{ ...base, lesson: '12', speed: '25', eff: '18', accuracy: '0' }],
};
function exported(type: LcwoSourceType, body: unknown = exports[type], name = 'Student7') {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="lcwo-export-${type === 'koch' ? 'lesson' : type}-${name}.json"`,
    },
  });
}
function login() {
  const headers = new Headers();
  headers.append('Set-Cookie', 'PHPSESSID=fixture-session; Path=/; Secure; HttpOnly');
  headers.append('Set-Cookie', 'unrelated=not-forwarded; Path=/');
  return new Response(
    '<!-- LOGIN_SUCCESS --><script>throw new Error("never execute login HTML")</script>',
    { headers },
  );
}
function transport(overrides: Partial<Record<LcwoSourceType, () => Response>> = {}) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === '/dologin') return login();
    const type = url.searchParams.get('type') as LcwoSourceType;
    return overrides[type]?.() ?? exported(type);
  });
}
describe('bounded request-only LCWO transport', () => {
  it('uses the fixed origin, one transient session and canonical authenticated identity', async () => {
    const fetchImpl = transport();
    const result = await fetchLcwoExports(credentials, { fetchImpl });
    expect(result.identity).toEqual({ username: 'Student7', sourceUserId: '7' });
    expect(result.runs).toHaveLength(4);
    expect(result.runs.find((run) => run.sourceType === 'words')).toMatchObject({
      maximumWpm: 35,
      score: 0,
      competitive: false,
    });
    expect(result.runs.find((run) => run.sourceType === 'groups')).toMatchObject({
      characterWpm: 25,
      effectiveWpm: 18,
      accuracyPercent: 90.5,
    });
    const calls = fetchImpl.mock.calls;
    expect(calls).toHaveLength(5);
    expect(calls.map(([input]) => new URL(String(input)).origin)).toEqual(
      Array(5).fill('https://lcwo.net'),
    );
    const form = new URLSearchParams(String(calls[0][1]?.body));
    expect(form.get('password')).toBe(credentials.password);
    expect(calls[0][1]).toMatchObject({ method: 'POST', redirect: 'manual' });
    for (const [, init] of calls.slice(1)) {
      expect(init).toMatchObject({
        method: 'GET',
        redirect: 'manual',
        headers: { Cookie: 'PHPSESSID=fixture-session' },
      });
      expect(init).not.toHaveProperty('body');
    }
    const serialized = JSON.stringify(result);
    for (const secret of [
      credentials.password,
      'fixture-session',
      'PHPSESSID',
      'password',
      'unrelated',
    ])
      expect(serialized).not.toContain(secret);
  });
  it('empty exports verify the server-supplied username without fabricating a numeric UID', async () => {
    const fetchImpl = transport(
      Object.fromEntries(
        ['words', 'callsigns', 'groups', 'koch'].map((type) => [
          type,
          () => exported(type as LcwoSourceType, []),
        ]),
      ),
    );
    const result = await fetchLcwoExports(credentials, { fetchImpl });
    expect(result).toEqual({ identity: { username: 'Student7' }, runs: [], skippedMixed: 0 });
    await expect(
      fetchLcwoExports(credentials, { fetchImpl: transport({ words: () => new Response('[]') }) }),
    ).rejects.toMatchObject({ code: 'identity' });
  });
  it('checks account IDs even for skipped mixed groups and reports that limit honestly', async () => {
    const result = await fetchLcwoExports(credentials, {
      fetchImpl: transport({ groups: () => exported('groups', [{ ...base, mode: 'mixed' }]) }),
    });
    expect(result.skippedMixed).toBe(1);
    expect(result.runs).toHaveLength(3);
    await expect(
      fetchLcwoExports(credentials, {
        fetchImpl: transport({
          groups: () => exported('groups', [{ ...base, uid: '8', mode: 'mixed' }]),
        }),
      }),
    ).rejects.toMatchObject({ code: 'identity' });
  });
  it.each(['OtherAccount', 'student7'])(
    'rejects mismatched canonical export identity %s',
    async (name) => {
      const fetchImpl = transport({
        callsigns: () => exported('callsigns', exports.callsigns, name),
      });
      await expect(fetchLcwoExports(credentials, { fetchImpl })).rejects.toMatchObject({
        code: 'identity',
      });
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    },
  );
  it.each([
    {},
    null,
    { ...credentials, username: '../outside' },
    { ...credentials, password: '' },
    { ...credentials, password: 'x'.repeat(1025) },
  ])('rejects invalid credentials before fetching', async (value) => {
    const fetchImpl = transport();
    expect(() => validateLcwoCredentials(value)).toThrow();
    await expect(fetchLcwoExports(value, { fetchImpl })).rejects.toMatchObject({
      code: 'credentials',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it.each([
    new Response('bad credentials'),
    new Response('<!-- LOGIN_SUCCESS -->'),
    new Response('<!-- LOGIN_SUCCESS -->', {
      headers: { 'Set-Cookie': 'PHPSESSID=unsafe space; Path=/' },
    }),
  ])('requires a success marker and exactly one valid PHP session', async (response) => {
    await expect(
      fetchLcwoExports(credentials, { fetchImpl: vi.fn(async () => response) }),
    ).rejects.toMatchObject({ code: 'authentication' });
  });
  it('refuses redirects and never forwards a cookie to another origin', async () => {
    const fetchImpl = transport({
      words: () =>
        new Response(null, {
          status: 302,
          headers: { Location: 'https://outside.invalid/secret' },
        }),
    });
    await expect(fetchLcwoExports(credentials, { fetchImpl })).rejects.toMatchObject({
      code: 'upstream',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const wrong = exported('words');
    Object.defineProperty(wrong, 'url', { value: 'https://outside.invalid/export' });
    await expect(
      fetchLcwoExports(credentials, { fetchImpl: transport({ words: () => wrong }) }),
    ).rejects.toMatchObject({ code: 'upstream' });
  });
  it('safe errors do not expose thrown upstream bodies or credentials', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error(credentials.password + ' fixture-session upstream response');
    });
    try {
      await fetchLcwoExports(credentials, { fetchImpl });
      expect.fail('Expected a safe upstream error');
    } catch (error) {
      expect(error).toMatchObject({ code: 'upstream' });
      expect((error as Error).message).not.toContain(credentials.password);
      expect((error as Error).message).not.toContain('fixture-session');
    }
    await expect(
      fetchLcwoExports(credentials, {
        fetchImpl: transport({
          words: () => new Response('{"msg":"you must log in to use this function"}'),
        }),
      }),
    ).rejects.toMatchObject({ code: 'authentication' });
  });
  it('caps declared and streamed response bytes and cancels oversized bodies', async () => {
    const canceled = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1));
      },
      cancel: canceled,
    });
    await expect(
      fetchLcwoExports(credentials, {
        fetchImpl: transport({ words: () => new Response(stream) }),
      }),
    ).rejects.toMatchObject({ code: 'limit' });
    expect(canceled).toHaveBeenCalled();
    await expect(
      fetchLcwoExports(credentials, {
        fetchImpl: transport({
          words: () =>
            new Response('[]', { headers: { 'Content-Length': String(8 * 1024 * 1024 + 1) } }),
        }),
      }),
    ).rejects.toMatchObject({ code: 'limit' });
  });
  it('caps the entire export even when each category fits its own response bound', async () => {
    const padding = ' '.repeat(5 * 1024 * 1024);
    const response = (type: LcwoSourceType) =>
      new Response('[]' + padding, {
        headers: {
          'Content-Disposition': `attachment; filename="lcwo-export-${type}-Student7.json"`,
        },
      });
    await expect(
      fetchLcwoExports(credentials, {
        fetchImpl: transport({
          words: () => response('words'),
          callsigns: () => response('callsigns'),
        }),
      }),
    ).rejects.toMatchObject({ code: 'limit' });
  });
  it('times out a stalled body and cancels it, with safe error feedback', async () => {
    const canceled = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel: canceled });
    await expect(
      fetchLcwoExports(credentials, {
        fetchImpl: transport({ words: () => new Response(stream) }),
        timeoutMs: 10,
      }),
    ).rejects.toMatchObject({ code: 'timeout' });
    expect(canceled).toHaveBeenCalled();
  });
  it('honors cancellation before and during fetch without persisting a partial export', async () => {
    const before = new AbortController();
    before.abort();
    const unused = transport();
    await expect(
      fetchLcwoExports(credentials, { fetchImpl: unused, signal: before.signal }),
    ).rejects.toMatchObject({ code: 'canceled' });
    expect(unused).not.toHaveBeenCalled();
    const active = new AbortController();
    const pending = fetchLcwoExports(credentials, {
      fetchImpl: vi.fn(() => new Promise<Response>(() => {})),
      signal: active.signal,
    });
    active.abort();
    await expect(pending).rejects.toMatchObject({ code: 'canceled' });
  });
  it.each([
    new Response('{'),
    new Response(new Uint8Array([0xff])),
    exported('words', { unsupported: true }),
    exported('words', Array(50_001).fill({})),
  ])('rejects invalid UTF-8/JSON/shape and excessive rows atomically', async (response) => {
    await expect(
      fetchLcwoExports(credentials, { fetchImpl: transport({ words: () => response }) }),
    ).rejects.toMatchObject({ code: expect.stringMatching(/invalid_export|limit/) });
  });
  it('rejects a later malformed category after reading earlier exports', async () => {
    const fetchImpl = transport({ koch: () => exported('koch', [{ ...base, lesson: '41' }]) });
    await expect(fetchLcwoExports(credentials, { fetchImpl })).rejects.toMatchObject({
      code: 'invalid_export',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });
  it('preserves null/empty unknowns and numeric zeros while rejecting incompatible source fields', () => {
    const words = parseLcwoRows('words', [{ ...base, max: null, score: '0', valid: '' }]).runs[0];
    expect(words.score).toBe(0);
    expect(words).not.toHaveProperty('maximumWpm');
    expect(words).not.toHaveProperty('competitive');
    expect(() =>
      parseLcwoRows('groups', [{ ...base, mode: 'letters', accuracy: '100.01' }]),
    ).toThrow();
    expect(() =>
      parseLcwoRows('groups', [
        { ...base, mode: 'letters', accuracy: '90' },
        { ...base, mode: 'letters', accuracy: '80' },
      ]),
    ).toThrow();
    expect(parseLcwoRows('words', [exports.words[0], exports.words[0]]).runs).toHaveLength(1);
  });
  it('cancels an unread HTTP body when a malformed UTF-8 prefix is rejected', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Uint8Array.of(255));
      },
      cancel,
    });
    await expect(
      fetchLcwoExports(credentials, {
        fetchImpl: transport({
          groups: () => new Response(stream, { headers: exported('groups').headers }),
        }),
      }),
    ).rejects.toMatchObject({ code: 'invalid_export' });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
