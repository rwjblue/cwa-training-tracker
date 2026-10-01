import { expect, test } from '@playwright/test';
import { accountRequest, expectAccessible, signIn } from './helpers';

test.use({ hasTouch: true });

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
  releaseSimulator();
  await expect(publicRunner.getByRole('button', { name: /Run$/ })).toBeEnabled();
  await publicRunner.getByRole('button', { name: /Run$/ }).click();
  await expect(page.getByRole('button', { name: 'Stop run', exact: true })).toBeEnabled();
  await expect.poll(() => publicRunner.locator('#clock').textContent()).not.toBe('00:00:00');
  await page.getByRole('button', { name: 'Stop run', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review & save run', exact: true })).toBeEnabled();
  expect((await context.request.get('/api/entries')).status()).toBe(401);
  page.once('dialog', (dialog) => dialog.accept());
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

  await page.screenshot({ path: '.tmp/runner-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expectAccessible(page, 'runner-mobile');
  await page.screenshot({ path: '.tmp/runner-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  // AudioContext uses a real audio-engine clock, so do not fast-forward JS time.
  await run.click();
  await expect(runner.getByRole('button', { name: /Stop$/ })).toBeEnabled();
  await expect.poll(async () => await runner.locator('#clock').textContent()).not.toBe('00:00:00');
  await page.getByRole('button', { name: 'Inspect Today', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#overview$/);
  await expect(
    runner.getByRole('button', { name: 'Run finished', exact: true, includeHidden: true }),
  ).toBeDisabled();
  const stoppedClock = await runner.locator('#clock').textContent();
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(0);
  const retained = page.getByRole('region', { name: 'Current practice block', exact: true });
  await retained.getByRole('button', { name: 'Return to practice', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#practice$/);
  expect(page.frames()).toContain(frame);
  await expect(runner.locator('#clock')).toHaveText(stoppedClock!);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Inspect this week', exact: true }).tap();
  await retained.getByRole('button', { name: 'Inspect report', exact: true }).tap();
  const report = page.getByRole('dialog');
  await expect(report).toBeVisible();
  await expectAccessible(page, 'runner-retained-report-mobile');
  await page.screenshot({ path: '.tmp/runner-retained-report-mobile.png', fullPage: true });
  await report.getByRole('button', { name: 'Return to practice', exact: true }).tap();
  await expect(page).toHaveURL(/#practice$/);
  expect(page.frames()).toContain(frame);
  await expect(runner.locator('#clock')).toHaveText(stoppedClock!);
  await expect(page.getByRole('button', { name: 'Stop run', exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Inspect Today', exact: true }).click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await row.getByRole('button', { name: 'Extra review', exact: true }).click();
  await expect(page).toHaveURL(/#overview$/);
  await expect(retained).toContainText('Morse Runner: single calls');
  await retained.getByRole('button', { name: 'Return to practice', exact: true }).click();
  expect(page.frames()).toContain(frame);
  await expect(runner.locator('#clock')).toHaveText(stoppedClock!);
  await page.getByRole('button', { name: 'Review & save run', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Activity', exact: true })).toHaveValue(
    'simulator',
  );
  await expect(page.getByRole('button', { name: 'Save practice', exact: true })).toBeFocused();
  await page.screenshot({ path: '.tmp/runner-review-desktop.png', fullPage: true });
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

  // Extra review uses the same real engine and keeps its own run identity. It
  // contributes useful practice without adding to the source assignment.
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  const requiredBefore = await row.getByText(/min practiced/).textContent();
  await row.getByRole('button', { name: 'Extra review', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Your extra review.', exact: true }),
  ).toBeVisible();
  await runner.getByRole('button', { name: /Run$/ }).click();
  await expect.poll(() => runner.locator('#clock').textContent()).not.toBe('00:00:00');
  await page.getByRole('button', { name: 'Stop run', exact: true }).click();
  await page.getByRole('button', { name: 'Review & save run', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Extra review.');
  await page.getByRole('button', { name: 'Save practice', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row.getByText(/min practiced/)).toHaveText(requiredBefore!);
  const afterReview = (await (await context.request.get('/api/entries')).json()).entries;
  expect(afterReview).toHaveLength(2);
  const reviewed = afterReview.find(
    (entry: { metadata: { practicePurpose: string } }) =>
      entry.metadata.practicePurpose === 'review',
  );
  expect(reviewed).toMatchObject({
    kind: 'simulator',
    metadata: { plannedTaskId: 'curriculum:cwa-intermediate-v2.3:s1-d2-t6' },
  });
  expect(reviewed.id).not.toBe(entries[0].id);
  expect(reviewed.metadata.runner.runId).not.toBe(entries[0].metadata.runner.runId);
  expect(reviewed.minutes).toBeGreaterThan(0);
  expect(reviewed.metadata.elapsedSeconds).toBeCloseTo(reviewed.minutes * 60, 8);
  expect(
    (await (await context.request.get('/api/plan')).json()).plan.find(
      (task: { id: string }) => task.id === reviewed.metadata.plannedTaskId,
    ).done,
  ).toBe(false);
});
