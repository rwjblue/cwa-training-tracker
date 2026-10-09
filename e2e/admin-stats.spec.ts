import { expect, type Request } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { test } from './fixtures';
import { expectResponsive, navigateView, signIn } from './helpers';
import { e2eOrigin } from './environment';
import type { AdminStats } from '../src/shared/admin-stats';

async function localDatabasePaths() {
  const { configPath, statePath } = JSON.parse(
    await readFile('.tmp/e2e-admin-state.json', 'utf8'),
  ) as { configPath: string; statePath: string };
  const temporaryPrefix = `${resolve('.tmp')}${sep}e2e-`;
  if (!configPath.startsWith(temporaryPrefix) || !statePath.startsWith(temporaryPrefix))
    throw new Error('Admin fixtures must use the browser launcher’s isolated local database.');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  if (config.d1_databases?.[0]?.database_id !== 'local-e2e')
    throw new Error('Admin fixtures must never use a remote database.');
  return { configPath, statePath };
}

async function changeAccess(operation: 'grant' | 'revoke', email: string) {
  const { configPath, statePath } = await localDatabasePaths();
  const result = spawnSync(
    process.execPath,
    [
      'scripts/admin-stats-access.ts',
      operation,
      email,
      '--local',
      '--config',
      configPath,
      '--persist-to',
      statePath,
    ],
    { encoding: 'utf8', timeout: 45_000 },
  );
  expect(result.error, 'The local operator task should finish').toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain(`access ${operation === 'grant' ? 'granted' : 'revoked'}`);
}

async function arrangeHistoricalCounters(day: string) {
  const { configPath, statePath } = await localDatabasePaths();
  // Other browser journeys report today. A past UTC day makes this fixture
  // stable while the suite's independent accounts run against the same server.
  const sql = `UPDATE admin_stats_metadata
    SET practice_collection_started_day = min(practice_collection_started_day, '${day}')
    WHERE id = 1;
    INSERT INTO practice_usage (day, tool, audience, count)
    VALUES ('${day}', 'words', 'guest', 13), ('${day}', 'words', 'account', 7)
    ON CONFLICT (day, tool, audience) DO UPDATE SET count = excluded.count;`;
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'd1',
      'execute',
      'DB',
      '--local',
      '--config',
      configPath,
      '--persist-to',
      statePath,
      '--command',
      sql,
      '--json',
    ],
    { encoding: 'utf8', timeout: 30_000 },
  );
  expect(result.error, 'The isolated counter fixture should finish').toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
}

async function reportDetails(request: Request) {
  return { body: request.postDataJSON(), headers: await request.allHeaders() };
}

test('public counter accepts both audiences and rejects identifying fields', async ({
  request,
}) => {
  for (const audience of ['guest', 'account']) {
    const response = await request.post('/api/practice-usage', {
      headers: { Origin: e2eOrigin },
      data: { tool: 'free', audience },
    });
    expect(response.status()).toBe(204);
  }
  const invalid = await request.post('/api/practice-usage', {
    headers: { Origin: e2eOrigin },
    data: { tool: 'free', audience: 'guest', accountId: 'must-not-be-recorded' },
  });
  expect(invalid.status()).toBe(400);
  expect((await request.get('/api/admin/stats')).status()).toBe(401);
});

test('practice reporting and local grants lead to a read-only, revocable console', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(90_000);
  const reports: ReturnType<typeof reportDetails>[] = [];
  const entryReads: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/practice-usage')
      reports.push(reportDetails(request));
    if (new URL(request.url()).pathname === '/api/entries' && request.method() === 'GET')
      entryReads.push(request.url());
  });

  await page.goto('/#summary');
  await page.getByRole('button', { name: 'Log practice', exact: true }).click();
  await page.getByLabel(/^Time practiced/).fill('2');
  await page.getByLabel(/^Notes/).fill('Synthetic guest statistics practice');
  await page.getByRole('button', { name: 'Save practice', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => reports.length).toBe(1);

  const email = `admin-stats-${crypto.randomUUID()}@example.test`;
  await signIn(page, { email });
  await page.goto('/#overview');
  await page.getByRole('button', { name: 'Log practice', exact: true }).click();
  await page.getByLabel(/^Time practiced/).fill('3');
  await page.getByLabel(/^Notes/).fill('Synthetic account statistics practice');
  await page.getByRole('button', { name: 'Save practice', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => reports.length).toBe(2);
  const sent = await Promise.all(reports);
  expect(sent.map((report) => report.body)).toEqual([
    { tool: 'manual', audience: 'guest' },
    { tool: 'manual', audience: 'account' },
  ]);
  for (const report of sent) {
    expect(report.headers.cookie).toBeUndefined();
    expect(report.headers['x-cwa-account']).toBeUndefined();
  }

  await navigateView(page, 'Practice log');
  await page.getByRole('button', { name: /^Edit Listening on / }).click();
  await page.getByLabel(/^Notes/).fill('Synthetic corrected statistics practice');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(reports).toHaveLength(2);

  expect((await context.request.get('/api/admin/access')).status()).toBe(200);
  expect(await (await context.request.get('/api/admin/access')).json()).toEqual({ allowed: false });
  expect((await context.request.get('/api/admin/stats')).status()).toBe(403);
  await page.goto('/#admin');
  await expect(
    page.getByRole('heading', { name: 'Metrics access required', exact: true }),
  ).toBeVisible();

  await changeAccess('grant', email.toUpperCase());
  const fixtureDay = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  await arrangeHistoricalCounters(fixtureDay);
  const readsBeforeAdminReload = entryReads.length;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Service overview', exact: true })).toBeVisible();
  await expect(page.getByText('Account reach', { exact: true })).toBeVisible();
  expect(entryReads).toHaveLength(readsBeforeAdminReload);
  await navigateView(page, 'Practice log');
  await expect(
    page.getByText('Synthetic corrected statistics practice', { exact: true }),
  ).toBeVisible();
  await expect.poll(() => entryReads.length).toBeGreaterThan(readsBeforeAdminReload);
  await navigateView(page, 'Admin');
  await expect(page.getByText('Account reach', { exact: true })).toBeVisible();
  await expect(page.getByText('Read only', { exact: true })).toBeVisible();
  await expectResponsive(page, 'admin-overview');

  await page
    .getByRole('navigation', { name: 'Admin console views', exact: true })
    .getByRole('button', { name: 'Practice usage', exact: true })
    .click();
  const selected = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/admin/stats' &&
      new URL(response.url()).searchParams.get('days') === '180',
  );
  await page.getByRole('combobox', { name: 'Practice period', exact: true }).selectOption('180');
  const stats = (await (await selected).json()) as AdminStats;
  expect(stats.timezone).toBe('UTC');
  expect(stats.practice.days).toBe(180);
  expect(stats.practice.series).toHaveLength(180);
  const manualReports = stats.practice.tools.find((tool) => tool.tool === 'manual');
  expect(manualReports?.guest).toBeGreaterThanOrEqual(1);
  expect(manualReports?.account).toBeGreaterThanOrEqual(1);
  expect(stats.practice.series.find((row) => row.day === fixtureDay)).toEqual({
    day: fixtureDay,
    guest: 13,
    account: 7,
  });
  expect(stats.practice.series[0].guest).toBeNull();
  await page.getByText('View daily values', { exact: true }).click();
  const fixtureRow = page
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: fixtureDay, exact: true }) });
  await expect(fixtureRow.getByRole('cell')).toHaveText(['13', '7', '20']);
  await expect(page.getByRole('heading', { name: 'Practice by tool', exact: true })).toBeVisible();
  await expectResponsive(page, 'admin-practice-usage');
  await page.getByText('View daily values', { exact: true }).click();
  await page.getByRole('heading', { name: 'Practice usage', exact: true, level: 1 }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('admin-console-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(
      () =>
        page
          .getByRole('region', { name: 'Daily practice chart', exact: true })
          .evaluate((chart) =>
            Math.abs(chart.scrollLeft - (chart.scrollWidth - chart.clientWidth)),
          ),
      { message: 'Resizing the daily chart on mobile should keep its newest days visible' },
    )
    .toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('admin-console-mobile.png'), fullPage: true });

  await page
    .getByRole('navigation', { name: 'Admin console views', exact: true })
    .getByRole('button', { name: 'Operations', exact: true })
    .click();
  await expect(page.getByText('Database check passed', { exact: true })).toBeVisible();
  await expect(page.getByText('Account payload storage', { exact: true })).toBeVisible();
  await expect(page.getByText('Actual database storage', { exact: true })).toBeVisible();
  await expectResponsive(page, 'admin-operations');
  expect(reports).toHaveLength(2);

  await changeAccess('revoke', email);
  expect((await context.request.get('/api/admin/stats?days=180')).status()).toBe(403);
  await page.getByRole('button', { name: 'Refresh statistics', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Metrics access required', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Database check passed', { exact: true })).toHaveCount(0);
});
