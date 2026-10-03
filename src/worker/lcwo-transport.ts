import {
  LCWO_EXPORT_TYPES,
  MAX_LCWO_RESULTS,
  lcwoSourceId,
  lcwoSourceTimestamp,
  mergeLcwoRuns,
  validateLcwoRun,
  type LcwoIdentity,
  type LcwoRun,
  type LcwoSourceType,
} from '../shared/lcwo';

const ORIGIN = 'https://lcwo.net';
const LOGIN_LIMIT = 512 * 1024;
const EXPORT_LIMIT = 8 * 1024 * 1024;
const ROW_LIMIT = 50_000;
const TIMEOUT = 10_000;
const messages = {
  credentials: 'Enter your LCWO username and password for this request.',
  authentication: 'LCWO sign-in failed. Check your username and password.',
  upstream: 'LCWO could not be reached. Retained results are unchanged; try again later.',
  timeout: 'LCWO took too long to respond. Retained results are unchanged; try again later.',
  invalid_export: 'LCWO returned an unsupported export. No results were changed.',
  identity:
    'LCWO exports did not identify one consistent signed-in account. No results were changed.',
  limit: 'The LCWO export exceeds the response or record limit. No results were changed.',
  canceled: 'LCWO refresh was interrupted. Check retained results before retrying.',
} as const;
/** Only these fixed messages cross the API boundary; never upstream error text. */
export class LcwoTransportError extends Error {
  constructor(readonly code: keyof typeof messages) {
    super(messages[code]);
    this.name = 'LcwoTransportError';
  }
}
function fail(code: keyof typeof messages): never {
  throw new LcwoTransportError(code);
}

export function validateLcwoCredentials(value: unknown) {
  const row = value as { username?: unknown; password?: unknown } | null;
  if (
    !row ||
    typeof row.username !== 'string' ||
    !/^[A-Za-z0-9]{1,24}$/.test(row.username) ||
    typeof row.password !== 'string' ||
    !row.password.length ||
    row.password.length > 1024
  )
    fail('credentials');
  return { username: row.username, password: row.password };
}
function rows(body: string): Record<string, unknown>[] {
  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    fail('invalid_export');
  }
  if (
    input &&
    !Array.isArray(input) &&
    typeof input === 'object' &&
    'msg' in input &&
    input.msg === 'you must log in to use this function'
  )
    fail('authentication');
  if (!Array.isArray(input)) fail('invalid_export');
  if (input.length > ROW_LIMIT) fail('limit');
  return input.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid_export');
    return value as Record<string, unknown>;
  });
}
function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  if (
    typeof value !== 'number' &&
    (typeof value !== 'string' || !/^\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?$/.test(value))
  )
    fail('invalid_export');
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) fail('invalid_export');
  return result;
}
export function parseLcwoRows(type: LcwoSourceType, values: readonly Record<string, unknown>[]) {
  const runs: LcwoRun[] = [];
  let sourceUserId: string | undefined;
  let skippedMixed = 0;
  const identities = new Map<string, string>();
  try {
    if (!LCWO_EXPORT_TYPES.includes(type)) fail('invalid_export');
    for (const row of values) {
      const uid = lcwoSourceId(row.uid);
      if (sourceUserId !== undefined && uid !== sourceUserId) fail('identity');
      sourceUserId = uid;
      const sourceResultId = lcwoSourceId(row.NR);
      const recordedAt = lcwoSourceTimestamp(row.time);
      const id = `${type}:${uid}:${sourceResultId}`;
      const relevant =
        type === 'groups'
          ? ['mode', 'speed', 'eff', 'accuracy', 'valid']
          : type === 'koch'
            ? ['lesson', 'speed', 'eff', 'accuracy']
            : ['max', 'score', 'valid'];
      const fingerprint = JSON.stringify([row.time, ...relevant.map((key) => row[key])]);
      if (identities.has(id)) {
        if (identities.get(id) !== fingerprint) fail('invalid_export');
        continue;
      }
      identities.set(id, fingerprint);
      // Verify identities/timestamps even for the original unsupported mixed category.
      if (type === 'groups' && row.mode === 'mixed') {
        skippedMixed++;
        continue;
      }
      const run: Record<string, unknown> = {
        version: 1,
        source: 'lcwo-export',
        id,
        sourceType: type,
        kind: type === 'groups' ? row.mode : type === 'callsigns' ? 'callsign' : type,
        sourceUserId: uid,
        sourceResultId,
        recordedAt,
        sourceTime: row.time,
      };
      const fields =
        type === 'words' || type === 'callsigns'
          ? { maximumWpm: 'max', score: 'score' }
          : {
              characterWpm: 'speed',
              effectiveWpm: 'eff',
              accuracyPercent: 'accuracy',
              ...(type === 'koch' ? { lesson: 'lesson' } : {}),
            };
      for (const [key, source] of Object.entries(fields)) {
        const value = optionalNumber(row[source]);
        if (value !== undefined) run[key] = value;
      }
      if (type !== 'koch') {
        const competitive = optionalNumber(row.valid);
        if (competitive !== undefined) {
          if (competitive !== 0 && competitive !== 1) fail('invalid_export');
          run.competitive = competitive === 1;
        }
      }
      runs.push(validateLcwoRun(run));
    }
    if (runs.length > MAX_LCWO_RESULTS) fail('limit');
    return { runs: mergeLcwoRuns([], runs), sourceUserId, skippedMixed };
  } catch (error) {
    if (error instanceof LcwoTransportError) throw error;
    fail('invalid_export');
  }
}
async function boundedBody(response: Response, maximum: number, signal: AbortSignal) {
  if (Number(response.headers.get('content-length')) > maximum) {
    await response.body?.cancel();
    fail('limit');
  }
  if (!response.body) return { body: '', bytes: 0 };
  const reader = response.body.getReader();
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let body = '';
  let bytes = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximum) {
        await reader.cancel();
        fail('limit');
      }
      try {
        body += decoder.decode(chunk.value, { stream: true });
      } catch {
        fail('invalid_export');
      }
    }
    try {
      body += decoder.decode();
    } catch {
      fail('invalid_export');
    }
    return { body, bytes };
  } catch (error) {
    // A malformed prefix must not leave the remaining HTTP body downloading.
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}
async function request(
  path: string,
  init: RequestInit,
  maximum: number,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  parent?: AbortSignal,
) {
  if (parent?.aborted) fail('canceled');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  let timedOut = false;
  const interrupted = new Promise<never>((_, reject) => {
    abort = () => {
      controller.abort();
      reject(new LcwoTransportError('canceled'));
    };
    parent?.addEventListener('abort', abort, { once: true });
    if (parent?.aborted) abort();
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new LcwoTransportError('timeout'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        controller.signal.throwIfAborted();
        const response = await fetchImpl(`${ORIGIN}${path}`, {
          ...init,
          redirect: 'manual',
          signal: controller.signal,
        });
        if (
          !response.ok ||
          response.redirected ||
          (response.url && new URL(response.url).origin !== ORIGIN)
        ) {
          await response.body?.cancel();
          fail(response.status === 401 || response.status === 403 ? 'authentication' : 'upstream');
        }
        return {
          headers: response.headers,
          ...(await boundedBody(response, maximum, controller.signal)),
        };
      })(),
      interrupted,
    ]);
  } catch (error) {
    if (parent?.aborted) fail('canceled');
    if (timedOut) fail('timeout');
    if (error instanceof LcwoTransportError) throw error;
    fail('upstream');
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (abort) parent?.removeEventListener('abort', abort);
  }
}
/** One explicit request: never return or persist password, cookie or login HTML. */
export async function fetchLcwoExports(
  value: unknown,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number; signal?: AbortSignal } = {},
) {
  const credentials = validateLcwoCredentials(value);
  const timeoutMs = options.timeoutMs ?? TIMEOUT;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > TIMEOUT) fail('credentials');
  const fetchImpl = options.fetchImpl ?? fetch;
  const login = await request(
    '/dologin',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' },
      body: new URLSearchParams(credentials).toString(),
    },
    LOGIN_LIMIT,
    fetchImpl,
    timeoutMs,
    options.signal,
  );
  const sessions = login.headers.getSetCookie().flatMap((cookie) => {
    const value = cookie.match(/^PHPSESSID=([A-Za-z0-9,-]{1,128})(?:;|$)/)?.[1];
    return value ? [value] : [];
  });
  if (!login.body.includes('<!-- LOGIN_SUCCESS -->') || sessions.length !== 1)
    fail('authentication');
  const runs: LcwoRun[] = [];
  let username: string | undefined;
  let uid: string | undefined;
  let totalBytes = 0;
  let totalRows = 0;
  let skippedMixed = 0;
  for (const type of LCWO_EXPORT_TYPES) {
    const response = await request(
      `/api/index.php?action=export_results&type=${type}&fmt=json`,
      {
        method: 'GET',
        headers: { Accept: 'application/json', Cookie: `PHPSESSID=${sessions[0]}` },
      },
      EXPORT_LIMIT - totalBytes,
      fetchImpl,
      timeoutMs,
      options.signal,
    );
    totalBytes += response.bytes;
    const values = rows(response.body);
    totalRows += values.length;
    if (totalRows > ROW_LIMIT) fail('limit');
    const table = type === 'koch' ? 'lesson' : type;
    const name = response.headers
      .get('content-disposition')
      ?.match(
        new RegExp(`^attachment;\\s*filename="lcwo-export-${table}-([A-Za-z0-9]{1,24})\\.json"$`),
      )?.[1];
    // The export handler supplies its authenticated canonical username even for [].
    if (
      !name ||
      name.toLowerCase() !== credentials.username.toLowerCase() ||
      (username !== undefined && name !== username)
    )
      fail('identity');
    username = name;
    const parsed = parseLcwoRows(type, values);
    if (uid !== undefined && parsed.sourceUserId !== undefined && parsed.sourceUserId !== uid)
      fail('identity');
    uid ??= parsed.sourceUserId;
    runs.push(...parsed.runs);
    skippedMixed += parsed.skippedMixed;
  }
  if (options.signal?.aborted) fail('canceled');
  if (runs.length > MAX_LCWO_RESULTS) fail('limit');
  const identity: LcwoIdentity = {
    username: username!,
    ...(uid === undefined ? {} : { sourceUserId: uid }),
  };
  return { identity, runs: mergeLcwoRuns([], runs), skippedMixed };
}
