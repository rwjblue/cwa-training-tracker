import {
  STATS_RANGES,
  USAGE_TOOLS,
  USAGE_RETENTION_DAYS,
  isUsageTool,
  type AdminStats,
  type AdminStatsRange,
  type PracticeToolUsage,
  type PracticeUsageDay,
  type UsageTool,
} from '../shared/admin-stats';
import { requireAuth } from './auth';
import { HttpError, json, readJson, requireSameOrigin } from './http';
import { PracticeUsageBurstLimiter } from './practice-usage-burst';

const DAY_MS = 86_400_000;
const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);
const dayStart = (day: string) => Date.parse(`${day}T00:00:00.000Z`);
const firstDay = (today: string, days: number) => utcDay(dayStart(today) - (days - 1) * DAY_MS);
const practiceUsageBurstLimiter = new PracticeUsageBurstLimiter();

type UsageRow = { day: string; tool: UsageTool; audience: 'guest' | 'account'; count: number };
type AccountTotals = {
  total: number;
  created7: number;
  created30: number;
  activeToday: number;
  active7: number;
  active30: number;
  storageBytes: number;
};
type MetadataRow = { practice_collection_started_day: string; last_cleanup_at: string | null };

/** Deliberately never resolves authentication, cookies, or any individual identity. */
export async function recordPracticeUsage(request: Request, env: Env): Promise<Response> {
  requireSameOrigin(request, env);
  const input = await readJson(request, 256);
  if (
    Object.keys(input).length !== 2 ||
    !Object.hasOwn(input, 'tool') ||
    !Object.hasOwn(input, 'audience') ||
    !isUsageTool(input.tool) ||
    (input.audience !== 'guest' && input.audience !== 'account')
  ) {
    throw new HttpError(400, 'Send only a supported practice tool and guest or account audience.');
  }
  const now = Date.now();
  if (!practiceUsageBurstLimiter.allow(now)) {
    throw new HttpError(429, 'Practice reporting is temporarily busy.');
  }
  await env.DB.prepare(
    `INSERT INTO practice_usage (day, tool, audience, count) VALUES (?, ?, ?, 1)
     ON CONFLICT(day, tool, audience) DO UPDATE SET count = count + 1`,
  )
    .bind(utcDay(now), input.tool, input.audience)
    .run();
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

export async function hasMetricsAccess(env: Env, userId: string): Promise<boolean> {
  const role = await env.DB.prepare(
    `SELECT 1 AS allowed FROM account_roles WHERE user_id = ? AND role = 'metrics_viewer'`,
  )
    .bind(userId)
    .first<{ allowed: number }>();
  return role?.allowed === 1;
}

/** One overwritten UTC day; failure must never affect the user's workspace. */
export async function recordAccountActivity(env: Env, userId: string): Promise<void> {
  const today = utcDay(Date.now());
  try {
    await env.DB.prepare(
      `UPDATE users SET last_activity_day = ?
       WHERE id = ? AND (last_activity_day IS NULL OR last_activity_day < ?)`,
    )
      .bind(today, userId, today)
      .run();
  } catch {
    // This optional measurement must not log identifiers or interfere with private use.
  }
}

/** Called after the other scheduled cleanup succeeds. Retains today and 179 previous UTC days. */
export async function cleanupAdminStats(env: Env, now: number): Promise<void> {
  const oldestDay = firstDay(utcDay(now), USAGE_RETENTION_DAYS);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM practice_usage WHERE day < ?').bind(oldestDay),
    env.DB.prepare('UPDATE admin_stats_metadata SET last_cleanup_at = ? WHERE id = 1').bind(
      new Date(now).toISOString(),
    ),
  ]);
}

export async function getAdminStats(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!(await hasMetricsAccess(env, auth.user.id))) {
    throw new HttpError(403, 'Metrics viewer access is required.');
  }
  const search = new URL(request.url).searchParams;
  const suppliedDays = search.getAll('days');
  const selectedDays = suppliedDays.length ? suppliedDays[0] : '30';
  if (suppliedDays.length > 1 || !STATS_RANGES.some((range) => String(range) === selectedDays)) {
    throw new HttpError(400, 'Choose a 7, 30, or 180 day statistics window.');
  }
  const days = Number(selectedDays) as AdminStatsRange;
  const now = Date.now();
  const today = utcDay(now);
  const start7 = firstDay(today, 7);
  const start30 = firstDay(today, 30);
  const start = firstDay(today, days);
  // These privileged queries read only aggregate/account metadata, never personal JSON.
  const [accountResult, metadataResult, usageResult] = await env.DB.batch([
    env.DB.prepare(
      `SELECT count(*) AS total,
       coalesce(sum(created_at >= ? AND created_at <= ?), 0) AS created7,
       coalesce(sum(created_at >= ? AND created_at <= ?), 0) AS created30,
       coalesce(sum(last_activity_day = ?), 0) AS activeToday,
       coalesce(sum(last_activity_day BETWEEN ? AND ?), 0) AS active7,
       coalesce(sum(last_activity_day BETWEEN ? AND ?), 0) AS active30,
       coalesce(sum(storage_bytes), 0) AS storageBytes
       FROM users`,
    ).bind(dayStart(start7), now, dayStart(start30), now, today, start7, today, start30, today),
    env.DB.prepare(
      'SELECT practice_collection_started_day, last_cleanup_at FROM admin_stats_metadata WHERE id = 1',
    ),
    env.DB.prepare(
      'SELECT day, tool, audience, count FROM practice_usage WHERE day BETWEEN ? AND ? ORDER BY day, tool, audience',
    ).bind(start, today),
  ]);
  const accountTotals = accountResult.results[0] as AccountTotals;
  const metadata = (metadataResult.results[0] as MetadataRow | undefined) ?? null;
  const collectedSince = metadata?.practice_collection_started_day ?? null;
  const rows = usageResult.results as UsageRow[];
  const series: PracticeUsageDay[] = [];
  for (let offset = 0; offset < days; offset++) {
    const day = utcDay(dayStart(start) + offset * DAY_MS);
    const measured = collectedSince !== null && day >= collectedSince;
    series.push({ day, guest: measured ? 0 : null, account: measured ? 0 : null });
  }
  const byDay = new Map(series.map((item) => [item.day, item]));
  const tools: PracticeToolUsage[] = USAGE_TOOLS.map((tool) => ({ tool, guest: 0, account: 0 }));
  const byTool = new Map(tools.map((item) => [item.tool, item]));
  const totals = { guest: 0, account: 0, total: 0 };
  for (const row of rows) {
    const day = byDay.get(row.day);
    const tool = byTool.get(row.tool);
    if (!day || !tool || day[row.audience] === null) continue;
    day[row.audience] = (day[row.audience] ?? 0) + row.count;
    tool[row.audience] += row.count;
    totals[row.audience] += row.count;
    totals.total += row.count;
  }
  const databaseSize = accountResult.meta.size_after;
  const stats: AdminStats = {
    generatedAt: new Date(now).toISOString(),
    timezone: 'UTC',
    accounts: {
      total: accountTotals.total,
      created7: accountTotals.created7,
      created30: accountTotals.created30,
      activeToday: accountTotals.activeToday,
      active7: accountTotals.active7,
      active30: accountTotals.active30,
    },
    practice: { days, today, collectionStartedDay: collectedSince, series, tools, totals },
    operations: {
      accountStorageBytes: accountTotals.storageBytes,
      databaseStorageBytes: Number.isFinite(databaseSize) && databaseSize > 0 ? databaseSize : null,
      databaseReachable: true,
      lastCleanupAt: metadata?.last_cleanup_at ?? null,
      monitoringUrl: 'https://dash.cloudflare.com/',
    },
  };
  return json(stats);
}
