import { expect, test } from '@playwright/test';
import { expectResponsive, scopedRequest, signIn } from './helpers';

// These separate synthetic clients retain the production email-request limit;
// adding a journey must not exhaust the existing suite's shared local IP quota.
test.use({ hasTouch: true, extraHTTPHeaders: { 'CF-Connecting-IP': '192.0.2.101' } });

const viewport = { width: 390, height: 844 };

test(`measured practice review retains raw facts, validates corrections and retries at ${viewport.width}px`, async ({
  page,
  context,
}) => {
  await page.setViewportSize(viewport);
  await signIn(page);
  const initial = {
    id: 'synthetic-evidence',
    date: '2026-09-30',
    kind: 'sending',
    source: 'timer',
    minutes: 90.25 / 60,
    notes: 'Synthetic timer practice',
    createdAt: '2026-09-30T12:00:00Z',
    metadata: { elapsedSeconds: 90.25, recallSeconds: 10, practiceTool: 'sending' },
  };
  expect((await scopedRequest(context, 'POST', '/api/entries', initial)).status()).toBe(201);
  await page.reload();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).tap();
  await page.getByRole('button', { name: 'Practice log', exact: true }).click();
  const edit = page.getByRole('button', { name: 'Edit Sending on 2026-09-30', exact: true });
  await edit.tap();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Measured 90.25 seconds, including 10.00 recall seconds');
  await expect(page.getByLabel(/^Time practiced/)).toHaveAttribute('readonly', '');
  await page.getByRole('checkbox', { name: 'Correct measured time', exact: true }).check();
  await page.getByLabel(/^Corrected total time/).fill('1:00');
  await page.getByLabel(/^Corrected recall time/).fill('1:01');
  await page.getByLabel('Correction reason', { exact: true }).fill('Timer was left running');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toContainText(
    'Corrected recall time cannot exceed corrected total practice time',
  );
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await (await context.request.get('/api/entries')).json()).entries[0].minutes).toBe(
    90.25 / 60,
  );
  await edit.tap();
  await page.getByRole('checkbox', { name: 'Correct measured time', exact: true }).focus();
  await page.keyboard.press('Space');
  await page.getByLabel(/^Corrected total time/).fill('1:00');
  await page.getByLabel(/^Corrected recall time/).fill('0:05');
  await page.getByLabel('Correction reason', { exact: true }).fill('Timer was left running');
  await page.route(
    '**/api/entries/synthetic-evidence',
    (route) => route.fulfill({ status: 503, json: { error: 'Synthetic save failure. Retry.' } }),
    { times: 1 },
  );
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toContainText('Synthetic save failure. Retry.');
  await expect(page.getByLabel(/^Corrected total time/)).toHaveValue('1:00');
  await expectResponsive(page, `evidence-${viewport.width}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByRole('button', { name: 'Save changes', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  const exported = await (await context.request.get('/api/export')).json();
  expect(exported.sessions[0]).toMatchObject({
    minutes: 1,
    metadata: {
      evidence: {
        measurement: { seconds: 90.25, recallSeconds: 10 },
        correction: { seconds: 60, recallSeconds: 5, reason: 'Timer was left running' },
      },
    },
  });
  await page.getByText('Practice evidence', { exact: true }).click();
  await expect(page.getByText(/Learner correction: 60.00 total seconds/)).toBeVisible();
});
