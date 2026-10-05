import { readFile } from 'node:fs/promises';
import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { accountRequest, scopedRequest, expectResponsive, signIn } from './helpers';

test.use({ hasTouch: true, timezoneId: 'America/New_York' });
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.tap();
  const target = page.getByRole(
    ['Your account', 'This device'].includes(name) ? 'button' : 'link',
    { name, exact: true },
  );
  await expect(target).toBeEnabled();
  await target.press('Enter');
}
async function keyboardButton(page: Page, name: string) {
  const target = page.getByRole('button', { name, exact: true });
  await expect(target).toBeEnabled();
  await target.focus();
  await expect(target).toBeFocused();
  await target.press('Enter');
}
async function settled(page: Page) {
  await page.getByRole('dialog').evaluate(async (node) => {
    await Promise.all(
      node.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})),
    );
  });
}
async function consent(page: Page, password = 'fixture-normal', username = 'Student7') {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('LCWO username', { exact: true }).fill(username);
  await dialog.getByLabel('LCWO password', { exact: true }).fill(password);
  const check = dialog.getByRole('checkbox');
  await check.focus();
  await check.press('Space');
  await expect(check).toBeChecked();
}
test('keyboard linking, exact source inspection, overlap-safe report and actual portable backup restore', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.235' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  const settings = (await (await context.request.get('/api/settings')).json()).settings;
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        ...settings,
        timezone: 'America/New_York',
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await navigate(page, 'Your account');
  await keyboardButton(page, 'Link LCWO account');
  await expect(page.getByLabel('LCWO username', { exact: true })).toBeFocused();
  await settled(page);
  await expectResponsive(page, 'lcwo-link-consent');
  await consent(page);
  await keyboardButton(page, 'Link and refresh LCWO');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Refresh LCWO results', exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole('status').filter({ hasText: 'Refresh saved: 4 new source results' }),
  ).toBeVisible();
  const source = (await (await context.request.get('/api/lcwo')).json()).data;
  expect(source).toMatchObject({
    connected: true,
    estimateSeconds: 0,
    identity: { username: 'Student7', sourceUserId: '7' },
  });
  expect(source.runs).toHaveLength(4);
  await page.getByLabel('Estimated seconds per completed code-group result').fill('60');
  await keyboardButton(page, 'Save estimate preference');
  await expect(
    page.getByRole('status').filter({ hasText: 'Estimate preference saved' }),
  ).toBeVisible();
  await keyboardButton(page, 'Refresh LCWO results');
  await expect(page.getByLabel('LCWO password', { exact: true })).toHaveValue('');
  await consent(page);
  await keyboardButton(page, 'Refresh now');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: 'Refresh saved: 0 new source results' }),
  ).toBeVisible();
  await navigate(page, 'Practice log');
  await keyboardButton(page, 'View LCWO source results');
  await expect(
    page.getByRole('heading', { name: 'Retained LCWO results', exact: true }),
  ).toBeFocused();
  const history = page.getByRole('region', { name: 'Retained LCWO results' });
  await history
    .getByText('LCWO letter groups · 2026-09-29 · result 12', { exact: true })
    .press('Enter');
  await expect(history).toContainText('Stored accuracy (%) — not displayed errors: 90.5');
  await expect(history).toContainText('Actual run duration: unknown');
  await expect(history).toContainText('explicit per-result assumption, not measured audio');
  await expect(
    page.getByText('These totals include 1 explicitly estimated LCWO group minutes.', {
      exact: false,
    }),
  ).toBeVisible();
  await expectResponsive(page, 'lcwo-source-history');

  await page.setViewportSize({ width: 390, height: 844 });

  await navigate(page, 'Academy guide');
  await keyboardButton(page, 'Practice report');
  await page.getByLabel('From', { exact: true }).fill('2026-09-29');
  await page.getByLabel('Through', { exact: true }).fill('2026-09-29');
  await expect(page.getByRole('dialog')).toContainText('1 additional estimated group minutes');
  await expect(page.getByRole('dialog')).toContainText('Maximum achieved speed (WPM): 35');
  await expect(page.getByRole('dialog')).toContainText('Trainer score: 0');
  await expect(page.getByRole('dialog')).toContainText('Koch lesson: 12');
  await settled(page);
  await expectResponsive(page, 'lcwo-report');
  await page.keyboard.press('Escape');
  expect(
    (
      await scopedRequest(context, 'POST', '/api/entries', {
        id: 'lcwo-covered-block',
        date: '2026-09-29',
        kind: 'icr',
        minutes: 2,
        source: 'manual',
        notes: 'Synthetic date-only ICR block',
        createdAt: '2026-09-30T00:01:00Z',
      })
    ).status(),
  ).toBe(201);
  await page.reload();
  await navigate(page, 'Academy guide');
  await keyboardButton(page, 'Practice report');
  await page.getByLabel('From', { exact: true }).fill('2026-09-29');
  await page.getByLabel('Through', { exact: true }).fill('2026-09-29');
  await expect(page.getByRole('dialog')).toContainText('0 additional estimated group minutes');
  await expect(page.getByRole('dialog')).toContainText('unknown actual timestamps');
  await page.keyboard.press('Escape');
  await navigate(page, 'Your account');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).tap();
  const download = await downloading;
  const filename = await download.path();
  expect(filename).not.toBeNull();
  const text = await readFile(filename!, 'utf8'),
    backup = JSON.parse(text);
  expect(backup.lcwo).toMatchObject({ connected: false, estimateSeconds: 60, runs: source.runs });
  for (const secret of ['fixture-normal', 'PHPSESSID', 'password'])
    expect(text).not.toContain(secret);
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import backup', exact: true }).tap();
  await (
    await choosing
  ).setFiles({
    name: 'synthetic-lcwo-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(page.getByRole('dialog')).toContainText(
    '4 retained LCWO source results for Student7',
  );
  await expect(page.getByRole('dialog')).toContainText('Import keeps the link disconnected');
  await page.getByRole('button', { name: 'Import sessions', exact: true }).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Optional LCWO account link' })).toContainText(
    'Disconnected: Student7',
  );
  const restored = (await (await context.request.get('/api/lcwo')).json()).data;
  expect(restored.runs).toEqual(source.runs);
  expect(restored.connected).toBe(false);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('fixture-normal');
});

test('mobile empty identity, canceled request, safe partial failure, retry and disconnect retain source facts', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.236' });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await navigate(page, 'Your account');
  await page.getByRole('button', { name: 'Link LCWO account', exact: true }).tap();
  await consent(page, 'fixture-empty');
  await page.getByRole('button', { name: 'Link and refresh LCWO', exact: true }).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const panel = page.getByRole('region', { name: 'Optional LCWO account link' });
  await expect(panel).toContainText('Source account unknown until a result is exported');
  await expect(panel).toContainText('0 retained results');
  let release!: () => void, intercepted!: () => void, finished!: () => void;
  const arrived = new Promise<void>((resolve) => {
    intercepted = resolve;
  });
  const handled = new Promise<void>((resolve) => {
    finished = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/lcwo', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    intercepted();
    await held;
    await route.abort().catch(() => {});
    finished();
  });
  await page.getByRole('button', { name: 'Refresh LCWO results', exact: true }).tap();
  await consent(page);
  await page.getByRole('button', { name: 'Refresh now', exact: true }).tap();
  await arrived;
  await expect(page.getByLabel('LCWO password', { exact: true })).toHaveValue('');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).tap();
  release();
  await handled;
  await page.unroute('**/api/lcwo');
  await expect(panel.getByRole('alert')).toContainText('may already have saved');
  const afterCancel = (await (await context.request.get('/api/lcwo')).json()).data;
  await page.getByRole('button', { name: 'Refresh LCWO results', exact: true }).tap();
  await consent(page, 'fixture-partial');
  await page.getByRole('button', { name: 'Refresh now', exact: true }).tap();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'Retained results are unchanged',
  );
  await expect(page.getByLabel('LCWO password', { exact: true })).toHaveValue('');
  const failed = (await (await context.request.get('/api/lcwo')).json()).data;
  expect(failed).toEqual(afterCancel);
  await page.getByLabel('LCWO password', { exact: true }).fill('fixture-normal');
  await page.getByRole('button', { name: 'Refresh now', exact: true }).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(panel).toContainText('4 retained results');
  await expect(panel).toContainText('Source account 7');
  await expectResponsive(page, 'lcwo-link-status');
  await page.getByRole('button', { name: 'Disconnect LCWO', exact: true }).tap();
  await expect(panel).toContainText('Disconnected: Student7');
  await expect(panel).toContainText('4 retained results');
  await navigate(page, 'Practice log');
  await expect(page.getByRole('region', { name: 'Retained LCWO results' })).toContainText(
    '4 unique external source results',
  );
});
