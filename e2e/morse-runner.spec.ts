import { expect, test } from '@playwright/test';
import { expectAccessible, signIn } from './helpers';

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
  await page.getByRole('button', { name: 'Word trainer', exact: true }).click();
  await signIn(page);
  await page.clock.setFixedTime(new Date('2026-10-07T16:00:00Z'));
  const settings = (await (await context.request.get('/api/settings')).json()).settings;
  const saved = await context.request.put('/api/settings', {
    headers: { Origin: 'http://localhost:8791' },
    data: {
      settings: {
        ...settings,
        level: 'intermediate',
        firstClassDate: '2026-10-08',
        timezone: 'UTC',
      },
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
  await page.setViewportSize({ width: 1280, height: 1000 });

  // AudioContext uses a real audio-engine clock, so do not fast-forward JS time.
  await run.click();
  await expect(runner.getByRole('button', { name: /Stop$/ })).toBeEnabled();
  await expect.poll(async () => await runner.locator('#clock').textContent()).not.toBe('00:00:00');
  await page.getByRole('button', { name: 'Stop run', exact: true }).click();
  await expect(runner.getByRole('button', { name: 'Run finished', exact: true })).toBeDisabled();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page).toHaveURL(/#practice$/);
  await page.getByRole('button', { name: 'Review & save run', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Activity', exact: true })).toHaveValue(
    'simulator',
  );
  await expect(page.getByRole('button', { name: 'Save practice', exact: true })).toBeFocused();
  await page.screenshot({ path: '.tmp/runner-review-desktop.png', fullPage: true });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/#overview$/);
  await expect(row.getByText('Started', { exact: true })).toBeVisible();
  const entries = (await (await context.request.get('/api/entries')).json()).entries;
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    kind: 'simulator',
    characterWpm: 10,
    qsoCount: 0,
    metadata: { plannedTaskId: 'curriculum:cwa-intermediate-v2.3:s1-d2-t6' },
  });
  expect(entries[0].minutes).toBeGreaterThan(0);
  expect(entries[0].minutes).toBeLessThan(1);
  expect(entries[0].metadata.runner).toMatchObject({
    status: 'stopped',
    summary: { qsoCount: 0, score: 0 },
  });
  expect(entries[0].metadata.elapsedSeconds).toBeCloseTo(entries[0].minutes * 60, 8);
});
