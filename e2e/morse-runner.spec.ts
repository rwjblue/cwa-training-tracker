import { expect } from '@playwright/test';
import { test } from './fixtures';
import { openDisclosure, accountRequest, expectAccessible, signIn } from './helpers';

test.use({ hasTouch: true });

test('embedded Runner startup preserves outer focus and mobile tool navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let releaseSimulator!: () => void;
  const loading = new Promise<void>((resolve) => {
    releaseSimulator = resolve;
  });
  await page.route('**/vendor/web-morse-runner/integration/main.js', async (route) => {
    await loading;
    await route.continue();
  });
  await page.goto('/#practice');
  await page.getByRole('button', { name: 'Morse Runner', exact: true }).tap();
  const runner = page.frameLocator('iframe');
  await expect(runner.getByRole('button', { name: /Run$/ })).toBeDisabled();
  const wordListening = page.getByRole('button', { name: 'Word listening', exact: true });
  await wordListening.focus();
  const beforeBootScroll = await page.evaluate(() => window.scrollY);
  releaseSimulator();
  await expect(runner.getByRole('button', { name: /Run$/ })).toBeEnabled();
  await expect(wordListening).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(beforeBootScroll);
  await expectAccessible(page, 'runner-startup-mobile');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await wordListening.tap();
  await expect(wordListening).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('heading', { name: 'The listening room', exact: true }),
  ).toBeVisible();
});

test('assigned Morse Runner uses the real engine and saves one linked run', async ({
  page,
  context,
}) => {
  let releaseSimulator!: () => void;
  const loading = new Promise<void>((resolve) => {
    releaseSimulator = resolve;
  });
  await page.route('**/vendor/web-morse-runner/integration/main.js', async (route) => {
    await loading;
    await route.continue();
  });
  await page.goto('/#practice');
  await page.getByRole('button', { name: 'Morse Runner', exact: true }).click();
  const publicRunner = page.frameLocator('iframe');
  await expect(publicRunner.getByRole('button', { name: /Run$/ })).toBeDisabled();
  const wordListening = page.getByRole('button', { name: 'Word listening', exact: true });
  await wordListening.focus();
  const beforeBootScroll = await page.evaluate(() => window.scrollY);
  releaseSimulator();
  await expect(publicRunner.getByRole('button', { name: /Run$/ })).toBeEnabled();
  await expect(wordListening).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(beforeBootScroll);
  await publicRunner.getByRole('button', { name: /Run$/ }).click();
  await expect(page.getByRole('button', { name: 'Stop run', exact: true })).toBeEnabled();
  await expect(publicRunner.locator('#call')).toBeFocused();
  await expect.poll(() => publicRunner.locator('#clock').textContent()).not.toBe('00:00:00');
  await page.getByRole('button', { name: 'Stop run', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review & save run', exact: true })).toBeEnabled();
  expect((await context.request.get('/api/entries')).status()).toBe(401);
  await page.getByRole('button', { name: 'Word listening', exact: true }).click();
  await signIn(page);
  // Keep the curriculum day deterministic while wall time advances alongside
  // the real AudioWorklet clock and its start/end evidence.
  await page.clock.setSystemTime(new Date('2026-10-07T16:00:00Z'));
  const settings = (await (await context.request.get('/api/settings')).json()).settings;
  const saved = await accountRequest(context, 'PUT', '/api/settings', {
    settings: {
      ...settings,
      level: 'intermediate',
      firstClassDate: '2026-10-08',
      timezone: 'UTC',
    },
  });
  expect(saved.ok()).toBe(true);
  await page.reload();
  const panel = page.getByRole('region', { name: 'What should I do today?' });
  const row = panel.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: 'Morse Runner: single calls', exact: true }),
  });
  await row.getByRole('button', { name: 'Practice', exact: true }).click();
  const runner = page.frameLocator('iframe[title="Web Morse Runner practice simulator"]');
  const run = runner.getByRole('button', { name: /Run$/, exact: false });
  await expect(run).toBeEnabled();
  await expect(runner.getByLabel('CW Speed', { exact: true })).toHaveValue('10');
  await expect(runner.getByLabel('min.', { exact: true })).toHaveValue('15');
  await expect(runner.getByLabel('Mode', { exact: true })).toHaveValue('single');

  const rootHeaders = (await context.request.get('/')).headers();
  const frameHeaders = (await context.request.get('/vendor/web-morse-runner/')).headers();
  expect(rootHeaders['x-frame-options']).toBe('DENY');
  expect(rootHeaders['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(frameHeaders['x-frame-options']).toBe('SAMEORIGIN');
  expect(frameHeaders['content-security-policy']).toContain("frame-ancestors 'self'");
  const missingHeaders = (
    await context.request.get('/vendor/web-morse-runner/not-a-real-document')
  ).headers();
  expect(missingHeaders['x-frame-options']).toBe('DENY');
  expect(missingHeaders['content-security-policy']).toContain("frame-ancestors 'none'");
  const frame = page.frames().find((item) => item.url().includes('/vendor/web-morse-runner/'))!;
  // The vendored engine can fetch its synthetic call list, but not account APIs.
  expect(
    await frame.evaluate(() =>
      fetch('/api/me').then(
        () => false,
        () => true,
      ),
    ),
  ).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expectAccessible(page, 'runner-mobile');

  await page.setViewportSize({ width: 1440, height: 1000 });

  // AudioContext uses a real audio-engine clock, so do not fast-forward JS time.
  await run.click();
  await expect(runner.getByRole('button', { name: /Stop$/ })).toBeEnabled();
  await expect.poll(async () => await runner.locator('#clock').textContent()).not.toBe('00:00:00');
  await openDisclosure(page, 'Browse other views');
  await page.getByRole('button', { name: 'Inspect Today', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#overview$/);
  await expect(
    runner.getByRole('button', { name: 'Run finished', exact: true, includeHidden: true }),
  ).toBeDisabled();
  const stoppedClock = await runner.locator('#clock').textContent();
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(0);
  const retained = page.getByRole('region', { name: 'Current practice block', exact: true });
  await retained.getByRole('button', { name: 'View/save result', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#practice$/);
  await expect(page.getByRole('region', { name: 'Your next practice', exact: true })).toContainText(
    'The stopped engine cannot be resumed',
  );
  expect(page.frames()).toContain(frame);
  await expect(runner.locator('#clock')).toHaveText(stoppedClock!);
  await page.setViewportSize({ width: 390, height: 844 });
  await openDisclosure(page, 'Browse other views');
  await page.getByRole('button', { name: 'Inspect this week', exact: true }).tap();
  await retained.getByRole('button', { name: 'Inspect report', exact: true }).tap();
  const report = page.getByRole('dialog');
  await expect(report).toBeVisible();
  await expectAccessible(page, 'runner-retained-report-mobile');

  await report.getByRole('button', { name: 'Return to practice', exact: true }).tap();
  await expect(page).toHaveURL(/#practice$/);
  expect(page.frames()).toContain(frame);
  await expect(runner.locator('#clock')).toHaveText(stoppedClock!);
  await expect(page.getByRole('button', { name: 'Stop run', exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Review & save run', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(page.frames()).toContain(frame);
  await expect(runner.locator('#clock')).toHaveText(stoppedClock!);
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(0);
  await page.getByRole('button', { name: 'Review & save run', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Activity', exact: true })).toHaveValue(
    'simulator',
  );
  await expect(page.getByRole('heading', { name: 'Save practice', exact: true })).toBeFocused();

  await page.getByRole('button', { name: 'Save practice', exact: true }).focus();
  // The server commits, but the acknowledgement is lost. The durable device
  // receipt releases review; retrying must preserve the engine result identity.
  const submitted: unknown[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/entries' && request.method() === 'POST')
      submitted.push(request.postDataJSON());
  });
  await page.route(
    '**/api/entries',
    async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.fulfill({
        status: 502,
        json: { error: 'Synthetic lost Runner acknowledgement.' },
      });
    },
    { times: 1 },
  );
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/#overview$/);
  await expect(row.getByText('Started', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Practice log', exact: true }).click();
  await expect(page.getByText('Waiting to upload', { exact: true })).toBeVisible();
  const retryAcknowledgement = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/entries' &&
      response.request().method() === 'POST' &&
      response.status() === 200,
  );
  await page.reload();
  expect((await (await retryAcknowledgement).json()).duplicate).toBe(true);
  await expect(
    page.getByRole('heading', { name: 'Keep a record. See the progress.', exact: true }),
  ).toBeVisible();
  await expect.poll(() => submitted.length).toBe(2);
  await expect(page.getByText('Waiting to upload', { exact: true })).toHaveCount(0);
  expect(submitted[1]).toEqual(submitted[0]);
  const entries = (await (await context.request.get('/api/entries')).json()).entries;
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    kind: 'simulator',
    characterWpm: 10,
    qsoCount: 0,
    metadata: {
      plannedTaskId: 'curriculum:cwa-intermediate-v2.3:s1-d2-t6',
      practicePurpose: 'assigned',
    },
  });
  expect(entries[0].minutes).toBeGreaterThan(0);
  expect(entries[0].minutes).toBeLessThan(1);
  expect(entries[0].metadata.runner).toMatchObject({
    status: 'stopped',
    summary: { qsoCount: 0, score: 0 },
  });
  expect(entries[0].metadata.elapsedSeconds).toBeCloseTo(entries[0].minutes * 60, 8);
});
