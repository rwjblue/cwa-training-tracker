import { buildPublicCwCalendar } from '../shared/cw-calendar';
import { CW_EVENT_SCHEDULE } from '../shared/cw-events';

/** Deliberately public; this route never receives or queries account storage. */
export async function publicCwCalendarResponse(
  request: Request,
  origin: string,
): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response(null, {
      status: 405,
      headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' },
    });
  const body = buildPublicCwCalendar(origin);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const etag = `"${hash}"`;
  const headers = {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'inline; filename="cw-live-practice.ics"',
    'Cache-Control': 'public, max-age=300, s-maxage=3600',
    'Access-Control-Allow-Origin': '*',
    ETag: etag,
    'Last-Modified': new Date(CW_EVENT_SCHEDULE.modifiedAt).toUTCString(),
  };
  const condition = request.headers.get('If-None-Match');
  const notModified =
    condition !== null
      ? condition
          .split(',')
          .some((part) => part.trim() === '*' || part.trim().replace(/^W\//, '') === etag)
      : (() => {
          const modifiedSince = request.headers.get('If-Modified-Since');
          return (
            modifiedSince !== null &&
            Date.parse(modifiedSince) >= Date.parse(CW_EVENT_SCHEDULE.modifiedAt)
          );
        })();
  if (notModified) return new Response(null, { status: 304, headers });
  return new Response(request.method === 'HEAD' ? null : body, { headers });
}
