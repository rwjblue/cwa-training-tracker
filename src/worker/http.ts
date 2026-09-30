export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  const response = new Response(JSON.stringify(value), { status, headers });
  response.headers.set('Content-Type', 'application/json; charset=utf-8');
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function readJson(
  request: Request,
  maxBytes = 16_384,
): Promise<Record<string, unknown>> {
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
    throw new HttpError(415, 'Send a JSON request.');
  }
  if (Number(request.headers.get('Content-Length')) > maxBytes) {
    throw new HttpError(413, 'This request is too large.');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'A JSON request body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, 'This request is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!isRecord(value)) throw new Error('object required');
    return value;
  } catch {
    throw new HttpError(400, 'The request must contain a valid JSON object.');
  }
}

export function requireSameOrigin(request: Request, env: Env): void {
  if (request.headers.get('Origin') !== env.APP_ORIGIN) {
    throw new HttpError(403, 'This request must come from the training tracker.');
  }
  const site = request.headers.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin' && site !== 'none') {
    throw new HttpError(403, 'Cross-site requests are not allowed.');
  }
}

export function cookieName(env: Env, purpose: string): string {
  return `${env.APP_ORIGIN.startsWith('https:') ? '__Host-' : ''}cwa-${purpose}`;
}

export function getCookie(request: Request, env: Env, purpose: string): string | null {
  const name = cookieName(env, purpose);
  return (
    request.headers
      .get('Cookie')
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? null
  );
}

export function cookie(env: Env, purpose: string, value: string, maxAge: number): string {
  return `${cookieName(env, purpose)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${env.APP_ORIGIN.startsWith('https:') ? '; Secure' : ''}`;
}

export function securityHeaders(response: Response, env: Env): Response {
  const secured = new Response(response.body, response);
  secured.headers.set('X-Content-Type-Options', 'nosniff');
  secured.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  secured.headers.set('X-Frame-Options', 'DENY');
  secured.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), publickey-credentials-get=(self), publickey-credentials-create=(self)',
  );
  if (env.APP_ORIGIN.startsWith('https:')) {
    secured.headers.set('Strict-Transport-Security', 'max-age=31536000');
  }
  return secured;
}
