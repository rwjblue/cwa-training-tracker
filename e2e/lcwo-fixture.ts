/** Synthetic current LCWO response shapes, verified against source 3d0b25b5.
 * This never authenticates to the live service or uses real credentials. */
export function lcwoFixtureResponse(input: RequestInfo | URL, init?: RequestInit): Response {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
  );
  if (url.origin !== 'https://lcwo.net')
    throw new Error('Fixture only serves the fixed LCWO origin.');
  if (url.pathname === '/dologin') {
    const form = new URLSearchParams(String(init?.body));
    const username = form.get('username') ?? '';
    const mode = form.get('password')?.replace(/^fixture-/, '') ?? '';
    if (
      !['normal', 'empty', 'partial', 'conflict', 'oversized', 'malformed'].includes(mode) ||
      !/^Student[78]$/i.test(username)
    )
      return new Response('Synthetic sign-in denied');
    return new Response('<!-- LOGIN_SUCCESS -->', {
      headers: { 'Set-Cookie': `PHPSESSID=fixture-${mode}-${username}; Path=/; HttpOnly` },
    });
  }
  const cookie = new Headers(init?.headers).get('Cookie') ?? '';
  const match = cookie.match(/^PHPSESSID=fixture-(\w+)-(Student[78])$/i);
  if (!match) return new Response(JSON.stringify({ msg: 'you must log in to use this function' }));
  const [, mode, username] = match;
  const type = url.searchParams.get('type');
  if (mode === 'partial' && type === 'koch')
    return new Response('Synthetic unavailable', { status: 503 });
  if (mode === 'oversized' && type === 'groups')
    return new Response('[]', { headers: { 'Content-Length': String(9 * 1024 * 1024) } });
  const base = { uid: username.endsWith('8') ? '8' : '7', NR: '12', time: '2026-09-30 00:00:15' };
  const values: Record<string, unknown[]> = {
    words: [{ ...base, max: '35', score: '0', valid: '0' }],
    callsigns: [{ ...base, max: '28', score: '100', valid: '1' }],
    groups: [
      {
        ...base,
        mode: 'letters',
        speed: '25',
        eff: '18',
        accuracy: mode === 'conflict' ? '99' : '90.5',
        valid: '1',
      },
    ],
    koch: [{ ...base, lesson: '12', speed: '25', eff: '18', accuracy: '0' }],
  };
  return new Response(
    mode === 'malformed' && type === 'koch'
      ? '{'
      : JSON.stringify(mode === 'empty' ? [] : values[type ?? '']),
    {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="lcwo-export-${type === 'koch' ? 'lesson' : type}-${username}.json"`,
      },
    },
  );
}
