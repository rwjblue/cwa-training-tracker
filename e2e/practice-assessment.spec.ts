import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expectResponsive, scopedRequest, signIn } from './helpers';

test.use({ hasTouch: true, extraHTTPHeaders: { 'CF-Connecting-IP': '192.0.2.191' } });
const rating = (page: Page) => page.getByRole('combobox', { name: /^Performance rating/ });
const event = (page: Page) => page.getByRole('combobox', { name: /^Event observations/ });
const count = (page: Page) => page.getByRole('spinbutton', { name: /^QSO count/ });
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.tap();
  await page.getByRole('button', { name, exact: true }).press('Enter');
}

test('private monitoring and worked CWT observations retain exact judgments through edit, retry, report and file restore', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  await page.getByRole('button', { name: 'Log practice', exact: true }).press('Enter');
  await expect(rating(page)).toHaveValue('');
  await page.getByRole('combobox', { name: 'Activity', exact: true }).selectOption('on-air');
  await page.getByLabel(/^Time practiced/).fill('5:00');
  await page.getByLabel('Practice date', { exact: true }).fill('2026-10-02');
  await event(page).selectOption('cwt');
  await rating(page).focus();
  await expect(rating(page)).toBeFocused();
  await rating(page).press('v');
  await expect(rating(page)).toHaveValue('very-good');
  await page.getByRole('textbox', { name: /^Callsigns heard/ }).fill('W1SYN\nK2SYN');
  await page.getByRole('textbox', { name: /^Names and exchanges heard/ }).fill('SAM 001');
  await page
    .getByRole('textbox', { name: /^CWT comments for the report/ })
    .fill('Monitoring report comment');
  await page.getByRole('textbox', { name: /^Notes/ }).fill('Separate private note');
  await expect(count(page)).toHaveValue('');
  await expectResponsive(page, 'assessment-monitoring');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.getByRole('textbox', { name: /^Callsigns heard/ }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `.tmp/parity-queue/issue-33-monitoring-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole('button', { name: 'Save practice', exact: true }).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const exported = () => context.request.get('/api/export').then((response) => response.json());
  const initial = (await exported()).sessions[0];
  expect(initial).not.toHaveProperty('qsoCount');
  expect(initial.metadata.assessment).toMatchObject({
    version: 1,
    source: 'self-reported',
    performanceRating: 'very-good',
    cwt: {
      heardCallsigns: 'W1SYN\nK2SYN',
      heardExchanges: 'SAM 001',
      comments: 'Monitoring report comment',
    },
  });
  await navigate(page, 'Practice log');
  await page.getByText('Performance and on-air observations', { exact: true }).press('Enter');
  await expect(
    page.getByText('Actual on-air QSO count: unknown (not recorded)', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Edit On air on 2026-10-02', exact: true }).tap();
  await expect(rating(page)).toHaveValue('very-good');
  await expect(count(page)).toHaveValue('');
  await rating(page).selectOption('poor');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await exported()).sessions[0].metadata.assessment.performanceRating).toBe('very-good');
  await page.getByRole('button', { name: 'Edit On air on 2026-10-02', exact: true }).tap();
  await rating(page).selectOption('fair');
  await count(page).fill('0');
  await page.getByRole('textbox', { name: /^Callsigns worked/ }).fill('K2SYN');
  await page.getByRole('textbox', { name: /^First names of people worked/ }).fill('KIM');
  await page
    .getByRole('textbox', { name: /^CWT comments for the report/ })
    .fill('Worked report comment');
  await page.route(
    `**/api/entries/${initial.id}`,
    (route) =>
      route.fulfill({ status: 503, json: { error: 'Synthetic observation save failed. Retry.' } }),
    { times: 1 },
  );
  await page.getByRole('button', { name: 'Save changes', exact: true }).tap();
  await expect(page.getByRole('alert')).toContainText('Synthetic observation save failed. Retry.');
  await expect(rating(page)).toHaveValue('fair');
  await expect(count(page)).toHaveValue('0');
  await expectResponsive(page, 'assessment-edit-retry');
  await page.getByRole('button', { name: 'Save changes', exact: true }).press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const saved = (await exported()).sessions[0];
  expect(saved).toMatchObject({
    qsoCount: 0,
    notes: 'Separate private note',
    metadata: {
      assessment: {
        performanceRating: 'fair',
        cwt: { workedCallsigns: 'K2SYN', workedNames: 'KIM', comments: 'Worked report comment' },
      },
    },
  });
  await navigate(page, 'Academy guide');
  await page.getByRole('button', { name: 'Practice report', exact: true }).tap();
  await page.getByLabel('From', { exact: true }).fill('2026-10-02');
  await page.getByLabel('Through', { exact: true }).fill('2026-10-02');
  const report = page.getByRole('dialog', { name: 'Your practice report', exact: true });
  await expect(report).toContainText(
    `Self-reported observations · record ${saved.id} · 2026-10-02`,
  );
  await expect(report).toContainText('0 actual on-air QSOs (self-reported)');
  await expect(report).toContainText('Performance: Fair (learner judgment)');
  await expect(report).toContainText('CWT comments for the report: Worked report comment');
  await expect(report).toContainText('Separate private note');
  await expectResponsive(page, 'assessment-report');
  await report.getByRole('button', { name: 'Close dialog', exact: true }).tap();
  await navigate(page, 'Your account');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).tap();
  const file = (await (await downloading).path())!;
  const backup = JSON.parse(await readFile(file, 'utf8'));
  expect(backup.sessions).toEqual([saved]);
  await navigate(page, 'Practice log');
  await page.getByRole('button', { name: 'Delete On air on 2026-10-02', exact: true }).tap();
  await page.getByRole('button', { name: 'Delete entry', exact: true }).tap();
  await expect.poll(async () => (await exported()).sessions.length).toBe(0);
  await navigate(page, 'Your account');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import backup', exact: true }).tap();
  await (await chooser).setFiles(file);
  await page.getByRole('button', { name: 'Import sessions', exact: true }).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await exported()).sessions).toEqual([saved]);
  // Imported source provenance remains authoritative when an activity is relabeled.
  const archived = {
    id: 'assessment-archived-runner',
    date: '2026-10-02',
    kind: 'simulator',
    minutes: 0.25,
    notes: 'Synthetic archived simulator',
    source: 'legacy',
    createdAt: '2026-10-02T00:00:00.000Z',
    qsoCount: 5,
    metadata: {
      legacyTask: { id: 'other:morse-runner', kind: 'simulator' },
      legacyAttempt: {
        taskId: 'other:morse-runner',
        assignmentId: 'other-practice',
        runnerResult: {
          version: 1,
          mode: 'SingleCall',
          wpm: 20,
          durationSeconds: 60,
          elapsedSeconds: 15,
          status: 'stopped',
          qsoCount: 5,
          verifiedPoints: 5,
          score: 25,
          speeds: [20],
          conditions: false,
          source: 'embedded',
        },
      },
    },
  };
  expect((await scopedRequest(context, 'POST', '/api/entries', archived)).status()).toBe(201);
  await navigate(page, 'Practice log');
  await page.reload();
  await page.getByRole('button', { name: 'Edit Simulator on 2026-10-02', exact: true }).tap();
  await page.getByRole('combobox', { name: 'Activity', exact: true }).selectOption('on-air');
  await expect(event(page)).toHaveCount(0);
  await expect(count(page)).toHaveCount(0);
  await expect(page.getByRole('dialog')).toContainText('historical');
  await rating(page).selectOption('fair');
  await page
    .getByRole('dialog')
    .evaluate((dialog) =>
      Promise.all(dialog.getAnimations({ subtree: true }).map((animation) => animation.finished)),
    );
  await expectResponsive(page, 'assessment-archived-source');
  await page.getByRole('button', { name: 'Save changes', exact: true }).press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const retained = (await exported()).sessions.find(
    (entry: { id: string }) => entry.id === archived.id,
  );
  expect(retained.qsoCount).toBe(5);
  expect(retained.metadata.legacyAttempt).toEqual(archived.metadata.legacyAttempt);
  expect(retained.metadata.assessment).toEqual({
    version: 1,
    source: 'self-reported',
    performanceRating: 'fair',
  });
  await navigate(page, 'Academy guide');
  await page.getByRole('button', { name: 'Practice report', exact: true }).tap();
  await page.getByLabel('From', { exact: true }).fill('2026-10-02');
  await page.getByLabel('Through', { exact: true }).fill('2026-10-02');
  await expect(page.getByRole('dialog')).toContainText(
    '5 historical count (not actual on-air QSOs)',
  );
  await expect(page.getByRole('dialog')).not.toContainText('5 actual on-air QSOs');
});

test('guest finished generated listening supports explicit ratings without on-air fields or private upload', async ({
  page,
  context,
}) => {
  await page.goto('/#practice');
  await page.getByRole('button', { name: 'QSO practice', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Start practice', exact: true }).press('Enter');
  await expect
    .poll(() =>
      page
        .getByLabel('Practice audio', { exact: true })
        .evaluate((audio: HTMLAudioElement) => audio.currentTime),
    )
    .toBeGreaterThan(1.25);
  await page.getByRole('button', { name: 'Review & save', exact: true }).press('Enter');
  await expect(rating(page)).toHaveValue('');
  await page.getByRole('combobox', { name: 'Activity', exact: true }).selectOption('on-air');
  await expect(event(page)).toHaveCount(0);
  await expect(count(page)).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Activity', exact: true }).selectOption('listening');
  await rating(page).selectOption('good');
  await expectResponsive(page, 'assessment-guest-generated');
  await page.getByRole('button', { name: 'Save practice', exact: true }).press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await navigate(page, 'Practice log');
  await page.getByText('Performance and on-air observations', { exact: true }).press('Enter');
  await expect(
    page.getByText('Performance: Good (learner judgment)', { exact: true }),
  ).toBeVisible();
  const pending = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('cwa:practice:pending:v1:guest:'))
      .map((key) => JSON.parse(localStorage.getItem(key)!)),
  );
  expect(pending).toHaveLength(1);
  expect(pending[0].metadata.assessment).toEqual({
    version: 1,
    source: 'self-reported',
    performanceRating: 'good',
  });
  expect(pending[0]).not.toHaveProperty('qsoCount');
  expect((await context.request.get('/api/entries')).status()).toBe(401);
});
