import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { openDisclosure, expectResponsive, accountRequest, signIn } from './helpers';

test.use({
  hasTouch: true,
  timezoneId: 'Asia/Tokyo',
});
const dialog = (page: Page) => page.getByRole('dialog');
const external = (page: Page) => page.getByRole('combobox', { name: /^External result/ });
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.tap();
  await page.getByRole('button', { name, exact: true }).press('Enter');
}
async function settled(page: Page) {
  await dialog(page).evaluate(async (node) => {
    await Promise.all(
      node.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})),
    );
  });
}

test('all external LCWO families create, inspect and edit without generic score or speed claims', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.210' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  const profile = (await (await context.request.get('/api/settings')).json()).settings;
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        ...profile,
        timezone: 'America/New_York',
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  const rows: { id: string; kind: string }[] = [];
  for (const kind of ['letters', 'figures', 'custom', 'words', 'callsign']) {
    await navigate(page, 'Today');
    await page.getByRole('button', { name: 'Log practice', exact: true }).press('Enter');
    await openDisclosure(page, 'External results and exact timing');
    await external(page).focus();
    await openDisclosure(page, 'External results and exact timing');
    await expect(external(page)).toBeFocused();
    if (kind === 'letters') {
      await openDisclosure(page, 'External results and exact timing');
      await external(page).press('l');
      await openDisclosure(page, 'External results and exact timing');
      await expect(external(page)).toHaveValue('letters');
    } else await external(page).selectOption(kind);
    await page.getByLabel(/^Time practiced/).fill('2:00');
    await page.getByLabel('Practice date', { exact: true }).fill('2026-09-28');
    await expect(page.getByRole('spinbutton', { name: 'Character WPM', exact: true })).toHaveCount(
      0,
    );
    if (['letters', 'figures', 'custom'].includes(kind)) {
      await page.getByLabel(/^Actual effective speed/).fill('25.5');
      await page.getByLabel(/^Group length/).fill('5');
      await page.getByLabel(/^Errors \(%\)/).fill('0');
      await expect(page.getByLabel(/^LCWO score/)).toHaveCount(0);
    } else {
      await page.getByLabel(/^Actual trainer speed/).fill('200');
      await page.getByLabel(/^Number of errors/).fill('0');
      await page.getByLabel(/^LCWO score/).fill('0');
      if (kind === 'words') await page.getByLabel(/^Maximum word length/).fill('12');
      await expect(page.getByLabel(/^Errors \(%\)/)).toHaveCount(0);
    }
    if (kind === 'words') {
      await page.getByLabel(/^Actual local completion/).fill('2026-09-29T00:01:30');
      await expect(page.getByLabel(/^Practice timezone/)).toHaveValue('America/New_York');
      await expect(dialog(page)).toContainText('practice date: 2026-09-28 in America/New_York');
    }
    await page.getByLabel(/^Notes/).fill(`Synthetic external ${kind}`);
    await settled(page);
    if (kind === 'words') await page.setViewportSize({ width: 390, height: 844 });
    // These share three form shapes; exhaustive family values remain asserted.
    if (['letters', 'words', 'callsign'].includes(kind))
      await expectResponsive(page, `external-${kind}-form`);

    await page.getByRole('button', { name: 'Save practice', exact: true }).tap();
    await expect(dialog(page)).toHaveCount(0);
    const saved = (await (await context.request.get('/api/export')).json()).sessions.find(
      (value: { notes: string }) => value.notes === `Synthetic external ${kind}`,
    );
    expect(saved.metadata.externalResult).toMatchObject({
      trainer: 'lcwo',
      kind,
      source: 'user-entered',
    });
    expect(saved).not.toHaveProperty('characterWpm');
    expect(saved).not.toHaveProperty('accuracy');
    if (kind === 'words')
      expect(saved.metadata.manualTiming).toMatchObject({
        startedAt: '2026-09-29T03:59:30.000Z',
        completedAt: '2026-09-29T04:01:30.000Z',
        timezone: 'America/New_York',
      });
    else expect(saved.metadata).not.toHaveProperty('manualTiming');
    rows.push({ id: saved.id, kind });
    await navigate(page, 'Practice log');
    const row = page.getByText(`Synthetic external ${kind}`, { exact: true }).locator('..');
    await row.getByText('Practice evidence', { exact: true }).press('Enter');
    await expect(row).toContainText('user-entered external evidence, not native Copy measurements');
    await expect(row).toContainText(
      kind === 'words' ? 'Actual practice start:' : 'Actual start and completion: unknown',
    );
    // Each record has unique notes; select its containing session row rather than a date-only duplicate.
    await row
      .locator('..')
      .getByRole('button', { name: 'Edit Listening on 2026-09-28', exact: true })
      .tap();
    await openDisclosure(page, 'External results and exact timing');
    await expect(external(page)).toHaveValue(kind);
    if (['letters', 'figures', 'custom'].includes(kind))
      await page.getByLabel(/^Group length/).fill('6');
    else await page.getByLabel(/^LCWO score/).fill('125.5');
    if (kind === 'callsign') {
      await page.route(
        `**/api/entries/${saved.id}`,
        (route) =>
          route.fulfill({
            status: 503,
            json: { error: 'Synthetic external edit refused. Retry.' },
          }),
        { times: 1 },
      );
      await page.getByRole('button', { name: 'Save changes', exact: true }).tap();
      await expect(page.getByRole('alert')).toContainText(
        'Synthetic external edit refused. Retry.',
      );
      await expect(page.getByLabel(/^LCWO score/)).toHaveValue('125.5');
      await expectResponsive(page, 'external-edit-retry');
    }
    await page.getByRole('button', { name: 'Save changes', exact: true }).press('Enter');
    await expect(dialog(page)).toHaveCount(0);
  }
  await navigate(page, 'Academy guide');
  await page.getByRole('button', { name: 'Practice report', exact: true }).tap();
  await page.getByLabel('From', { exact: true }).fill('2026-09-28');
  await page.getByLabel('Through', { exact: true }).fill('2026-09-28');
  await expect(dialog(page)).toContainText('Actual effective speed (WPM): 25.5');
  await expect(dialog(page)).toContainText('LCWO score: 125.5');
  await expect(dialog(page)).toContainText('2026-09-29T03:59:30.000Z');
  await expect(dialog(page)).not.toContainText('200 character WPM');
  await settled(page);
  await expectResponsive(page, 'external-source-report');
});

test('manual Runner resolves DST, preserves captured timezone and actual runtime through cancellation and queued exact retry', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.211' });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.getByRole('button', { name: 'Log practice', exact: true }).tap();
  await openDisclosure(page, 'External results and exact timing');
  await external(page).selectOption('morse-runner');
  await expect(page.getByRole('combobox', { name: 'Activity', exact: true })).toHaveValue(
    'simulator',
  );
  await expect(page.getByRole('combobox', { name: 'Activity', exact: true })).toBeDisabled();
  await page.getByLabel(/^Time practiced/).fill('15:30');
  const externalOptions = page.getByText('External results and exact timing', { exact: true });
  await externalOptions.click();
  await expect(externalOptions.locator('..')).not.toHaveAttribute('open', '');
  await page.getByRole('button', { name: 'Save practice', exact: true }).tap();
  await expect(externalOptions.locator('..')).toHaveAttribute('open', '');
  await expect(
    page.getByRole('combobox', { name: 'External Runner mode', exact: true }),
  ).toBeFocused();
  await page
    .getByRole('combobox', { name: 'External Runner mode', exact: true })
    .selectOption('WPX');
  await page.getByLabel(/^Runner starting speed/).fill('30');
  await page.getByLabel(/^Actual used Runner speeds/).fill('30, 40');
  await page.getByLabel(/^Runner verified points/).fill('0');
  await page.getByLabel(/^Runner score/).fill('0');
  await page.getByLabel(/^Actual local completion/).fill('2025-03-09T02:30');
  await page.getByLabel(/^Practice timezone/).fill('America/New_York');
  await expect(page.getByRole('alert')).toContainText('does not exist');
  await page.getByRole('button', { name: 'Save practice', exact: true }).tap();
  expect((await (await context.request.get('/api/export')).json()).sessions).toEqual([]);
  await page.getByLabel(/^Actual local completion/).fill('2025-11-02T01:30');
  await expect(
    page.getByRole('combobox', { name: 'Repeated completion time', exact: true }),
  ).toHaveValue('');
  await page
    .getByRole('combobox', { name: 'Repeated completion time', exact: true })
    .selectOption('1');
  await expect(dialog(page)).toContainText('Actual start: 2025-11-02T06:14:30.000Z');
  await settled(page);
  const zone = page.getByLabel(/^Practice timezone/);
  const zoneBox = (await zone.boundingBox())!;
  const timingBox = (await zone.locator('..').locator('..').boundingBox())!;
  expect(Math.abs(zoneBox.width - timingBox.width)).toBeLessThanOrEqual(1);
  expect(zoneBox.x).toBeGreaterThanOrEqual(0);
  expect(zoneBox.x + zoneBox.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expectResponsive(page, 'manual-runner-fold');

  const bodies: unknown[] = [];
  await page.route('**/api/entries', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1)
      return route.fulfill({
        status: 503,
        json: { error: 'Synthetic manual result upload refused. Retry.' },
      });
    await route.continue();
  });
  await page.getByRole('button', { name: 'Save practice', exact: true }).tap();
  await expect(dialog(page)).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Retry practice uploads', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retry practice uploads', exact: true }).tap();
  await expect
    .poll(async () => (await (await context.request.get('/api/export')).json()).sessions.length)
    .toBe(1);
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
  const saved = (await (await context.request.get('/api/export')).json()).sessions[0];
  expect(saved.source).toBe('manual');
  expect(saved.date).toBe('2025-11-02');
  expect(saved.metadata.externalResult).toMatchObject({
    mode: 'WPX',
    elapsedSeconds: 930,
    startingWpm: 30,
    usedWpms: [30, 40],
    verifiedPoints: 0,
    score: 0,
  });
  expect(saved.metadata.externalResult).not.toHaveProperty('contacts');
  expect(saved.metadata).not.toHaveProperty('evidence');
  expect(saved.metadata).not.toHaveProperty('runner');
  await navigate(page, 'Practice log');
  await page.getByRole('button', { name: 'Edit Simulator on 2025-11-02', exact: true }).tap();
  await expect(page.getByLabel(/^Practice timezone/)).toHaveValue('America/New_York');
  await page.getByLabel(/^Runner score/).fill('123');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  expect((await (await context.request.get('/api/export')).json()).sessions[0]).toEqual(saved);
  await page.getByText('Practice evidence', { exact: true }).press('Enter');
  await expect(page.getByText(/not an acknowledged native engine result/)).toBeVisible();
  await expect(
    page.getByText(/Verified points: 0 · score: 0 · simulated contacts: unknown/),
  ).toBeVisible();
  await expectResponsive(page, 'manual-runner-history');
});
