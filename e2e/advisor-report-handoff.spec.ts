import { evidenceSessions } from './report-evidence-fixture';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { accountRequest, expectResponsive, signIn } from './helpers';
import { DEFAULT_PROFILE } from '../src/shared/training';
import { starterAdvisorReportDefinition } from '../src/shared/report-definition';
import { reportDocumentText } from '../src/shared/report-document';

test.use({ hasTouch: true, timezoneId: 'UTC' });
const definition = {
  ...starterAdvisorReportDefinition(),
  formUrl: 'https://advisor.example.test/viewform?entry.session=stale',
  fields: [
    ...starterAdvisorReportDefinition().fields,
    {
      key: 'notes',
      label: 'Notes',
      section: 'Questions',
      type: 'textarea',
      required: true,
      source: 'manual',
    },
  ].map((field) => ({ ...field, externalId: `entry.${field.key}` })),
};
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.tap();
  const control = page.getByRole('button', { name, exact: true });
  await expect(control).toBeEnabled();
  await control.focus();
  await control.press('Enter');
}
async function open(page: Page) {
  await expect(page.getByRole('button', { name: 'Open your account', exact: true })).toBeVisible();
  await navigate(page, 'Academy guide');
  await page.getByRole('button', { name: 'Practice report', exact: true }).click();
  await page.getByRole('button', { name: 'Advisor report setup', exact: true }).click();
  await page.getByRole('dialog').evaluate(async (node) => {
    await Promise.all(
      node.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})),
    );
  });
  await expect(page.getByLabel('Questions — Notes (required)', { exact: true })).toBeVisible();
}
async function download(page: Page, name: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  return JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
}

test('reviewed prefill and offline confirmation keep the exact capture through edits, reload, retry, correction and private backup', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.246' });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await context.route('https://advisor.example.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<h1>Synthetic responder form</h1><p>Nothing submitted automatically.</p>',
    }),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  await page.clock.setFixedTime(new Date('2026-10-03T00:00:00Z'));
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        ...DEFAULT_PROFILE,
        reportDefinition: definition,
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await open(page);
  const notes = () => page.getByLabel('Questions — Notes (required)', { exact: true });
  const prepare = page.getByRole('button', { name: 'Prepare reviewed handoff', exact: true });
  await prepare.focus();
  await prepare.press('Enter');
  await expect(notes()).toBeFocused();
  await expect(notes()).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('link', { name: 'Open captured form', exact: true })).toHaveCount(0);
  const exact = ' Reviewed <literal> & +\nsecond line ';
  await notes().fill(exact);
  await prepare.focus();
  await prepare.press('Enter');
  await expect(
    page.getByRole('status').filter({ hasText: 'Reviewed handoff retained in your account.' }),
  ).toBeVisible();
  const captured = (await (await context.request.get('/api/account-state')).json()).state
    .reports[0];
  expect(captured.status).toBe('handoff');
  expect(captured.answers.notes).toBe(exact);
  await page.getByText('Review preserved answers and field mapping', { exact: true }).click();
  await expect(page.getByLabel('Captured handoff text', { exact: true })).toHaveText(
    reportDocumentText(captured),
  );
  await expectResponsive(page, 'advisor-handoff-reviewed');
  await page.screenshot({ path: '.tmp/advisor-handoff-desktop.png' });
  const confirm = page.getByRole('button', { name: 'Record confirmed submission', exact: true });
  await expect(confirm).toBeDisabled();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Open captured form', exact: true }).focus();
  await page.keyboard.press('Enter');
  const popup = await popupPromise;
  await expect(popup.getByRole('heading', { name: 'Synthetic responder form' })).toBeVisible();
  const url = new URL(popup.url());
  for (const field of captured.definition.fields)
    expect(url.searchParams.get(field.externalId)).toBe(captured.answers[field.key] ?? '');
  expect(url.searchParams.getAll('entry.session')).toEqual(['1']);
  await popup.close();
  await page.getByRole('button', { name: 'Copy captured answers', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    reportDocumentText(captured),
  );
  // Exercise the actual print control and its separate text-node document; native OS dialog is not asserted.
  await page.getByRole('button', { name: 'Print captured answers', exact: true }).click();
  const print = page.frameLocator('iframe[title="Captured advisor report print"]');
  await expect(print.locator('pre')).toHaveText(reportDocumentText(captured));
  expect(
    (await (await context.request.get('/api/account-state')).json()).state.reports,
  ).toHaveLength(1);
  await notes().fill('Draft edited after opening');
  await page.getByRole('combobox', { name: 'Class session', exact: true }).selectOption('2');
  await notes().fill('Another session');
  expect((await download(page, 'Download handoff JSON')).answers.notes).toBe(exact);
  let disconnected = true;
  const bodies: unknown[] = [];
  await page.route('**/api/account-operations', async (route) => {
    if (
      route.request().method() === 'POST' &&
      route.request().postDataJSON().change.type === 'report-confirm'
    ) {
      bodies.push(route.request().postDataJSON());
      if (disconnected)
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Synthetic confirmation unavailable' }),
        });
    }
    return route.continue();
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('checkbox', {
      name: 'The external form confirmed acceptance of this exact captured copy.',
    })
    .tap();
  await confirm.tap();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Your confirmation of this exact copy is retained on this device' }),
  ).toBeVisible();
  await page.getByText('Confirmed submission history (1)', { exact: true }).tap();
  await page.getByText(/Session 1 · 2026-10-03 · confirmed .*waiting to upload/).tap();
  const queued = await download(page, 'Download submitted JSON');
  expect(queued.id).toBe(captured.handoff.submissionId);
  expect(queued.answers).toEqual(captured.answers);
  await expectResponsive(page, 'advisor-confirmation-waiting');
  await page
    .getByRole('button', { name: 'Download submitted JSON', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.tmp/advisor-confirmation-mobile.png' });
  await page.keyboard.press('Escape');
  await page.reload();
  await open(page);
  await page.getByText('Confirmed submission history (1)', { exact: true }).tap();
  await page.getByText(/Session 1 · 2026-10-03 · confirmed .*waiting to upload/).tap();
  expect(await download(page, 'Download submitted JSON')).toEqual(queued);
  await page.keyboard.press('Escape');
  disconnected = false;
  await page.getByRole('button', { name: 'Retry account sync', exact: true }).tap();
  await expect
    .poll(
      async () =>
        (await (await context.request.get('/api/account-state')).json()).state.reports.length,
    )
    .toBe(2);
  expect(bodies.length).toBeGreaterThanOrEqual(2);
  expect(bodies.every((body) => JSON.stringify(body) === JSON.stringify(bodies[0]))).toBe(true);
  await open(page);
  await page.getByText('Confirmed submission history (1)', { exact: true }).tap();
  await page.getByText(/Session 1 · 2026-10-03 · confirmed .*account-saved/).tap();
  await page.getByRole('button', { name: 'Correct as a new linked draft', exact: true }).tap();
  await expect(notes()).toHaveValue(exact);
  await notes().fill('New corrected answer');
  await page.getByRole('button', { name: 'Prepare reviewed handoff', exact: true }).tap();
  await expect(
    page.getByRole('status').filter({ hasText: 'Reviewed handoff retained in your account.' }),
  ).toBeVisible();
  await page
    .getByRole('checkbox', {
      name: 'The external form confirmed acceptance of this exact captured copy.',
    })
    .tap();
  await page.getByRole('button', { name: 'Record confirmed submission', exact: true }).tap();
  await expect(page.getByText('Confirmed submission history (2)', { exact: true })).toBeVisible();
  const result = (await (await context.request.get('/api/account-state')).json()).state.reports;
  expect(result.find((row: { id: string }) => row.id === queued.id)).toEqual(queued);
  expect(
    result.find(
      (row: { status: string; revisionOf: string }) =>
        row.status === 'submitted' && row.revisionOf === queued.id,
    ).answers.notes,
  ).toBe('New corrected answer');
  await page.keyboard.press('Escape');
  await navigate(page, 'Your account');
  const backup = await download(page, 'Export backup');
  expect(backup.reports).toEqual(result);
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import backup', exact: true }).tap();
  await (
    await choosing
  ).setFiles({
    name: 'synthetic-confirmed-reports.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...backup, reports: [...backup.reports].reverse() })),
  });
  await page.getByRole('button', { name: 'Import sessions', exact: true }).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await (await context.request.get('/api/account-state')).json()).state.reports).toEqual(
    result,
  );
});

test('failed durable handoff storage exposes no new external action and cancel/retry preserves reviewed answers', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.247' });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.clock.setFixedTime(new Date('2026-10-03T00:00:00Z'));
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        ...DEFAULT_PROFILE,
        reportDefinition: definition,
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await open(page);
  await page
    .getByLabel('Questions — Notes (required)', { exact: true })
    .fill('Retained review after refused capture storage');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (
        key.startsWith('cwa:account:operation:v1:') &&
        sessionStorage.getItem('refuseHandoff') === 'yes'
      )
        throw new DOMException('Synthetic refusal', 'QuotaExceededError');
      return original.call(this, key, value);
    };
    sessionStorage.setItem('refuseHandoff', 'yes');
  });
  await page.getByRole('button', { name: 'Prepare reviewed handoff', exact: true }).tap();
  await expect(
    page.getByRole('alert').filter({ hasText: 'could not retain your account edit' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open captured form', exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Copy captured answers', exact: true }),
  ).toHaveCount(0);
  expect((await (await context.request.get('/api/account-state')).json()).state.reports).toEqual(
    [],
  );
  await expectResponsive(page, 'advisor-handoff-storage-failure');
  await page.keyboard.press('Escape');
  await open(page);
  await expect(page.getByLabel('Questions — Notes (required)', { exact: true })).toHaveValue(
    'Retained review after refused capture storage',
  );
  await page.evaluate(() => sessionStorage.removeItem('refuseHandoff'));
  await page.getByRole('button', { name: 'Prepare reviewed handoff', exact: true }).tap();
  await expect(page.getByRole('link', { name: 'Open captured form', exact: true })).toBeVisible();
  expect(
    (await (await context.request.get('/api/account-state')).json()).state.reports,
  ).toHaveLength(1);
  await page.keyboard.press('Escape');
  await open(page);
  await expect(
    page.getByRole('button', { name: 'Record confirmed submission', exact: true }),
  ).toBeDisabled();
});

test('offline reviewed handoff and confirmation upload unchanged after a source assessment and working draft change', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.248' });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.clock.setFixedTime(new Date('2026-10-03T00:00:00Z'));
  const schema = {
    ...definition,
    fields: [
      ...definition.fields,
      {
        key: 'wordRating',
        label: 'Word rating',
        section: 'Listening',
        type: 'rating',
        required: false,
        source: 'audio:shortWords:rating',
        options: ['poor', 'good'],
        externalId: 'entry.wordRating',
      },
    ],
  };
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        ...DEFAULT_PROFILE,
        reportDefinition: schema,
      })
    ).status(),
  ).toBe(200);
  const first = evidenceSessions().find((entry) => entry.id === 'audio-evidence')!;
  const entry = {
    ...first,
    metadata: {
      ...first.metadata,
      assessment: { version: 1, source: 'self-reported', performanceRating: 'good' },
    },
  };
  expect((await accountRequest(context, 'POST', '/api/entries', entry)).status()).toBe(201);
  await page.reload();
  await open(page);
  const rating = () =>
    page.getByRole('combobox', { name: 'Listening — Word rating (optional)', exact: true });
  await expect(rating()).toHaveValue('good');
  await page
    .getByLabel('Questions — Notes (required)', { exact: true })
    .fill('Exact historical capture');
  let offline = true;
  const handoffBodies: unknown[] = [];
  await page.route('**/api/account-operations', async (route) => {
    if (
      route.request().method() === 'POST' &&
      route.request().postDataJSON().change.type === 'report-handoff'
    ) {
      handoffBodies.push(route.request().postDataJSON());
      if (offline)
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Synthetic offline handoff' }),
        });
    }
    return route.continue();
  });
  await page.getByRole('button', { name: 'Prepare reviewed handoff', exact: true }).tap();
  await expect(
    page.getByRole('status').filter({ hasText: 'Reviewed handoff retained on this device' }),
  ).toBeVisible();
  const captured = await download(page, 'Download handoff JSON');
  expect(captured.answers.wordRating).toBe('good');
  expect(
    (
      await accountRequest(context, 'PUT', '/api/entries/audio-evidence', {
        ...entry,
        metadata: {
          ...entry.metadata,
          assessment: { ...entry.metadata.assessment, performanceRating: 'poor' },
        },
      })
    ).status(),
  ).toBe(200);
  await page.keyboard.press('Escape');
  await page.reload();
  await open(page);
  await page.getByRole('button', { name: 'Refresh from saved practice', exact: true }).tap();
  await expect(rating()).toHaveValue('poor');
  expect(await download(page, 'Download handoff JSON')).toEqual(captured);
  await page
    .getByRole('checkbox', {
      name: 'The external form confirmed acceptance of this exact captured copy.',
    })
    .tap();
  await page.getByRole('button', { name: 'Record confirmed submission', exact: true }).tap();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Your confirmation of this exact copy is retained on this device' }),
  ).toBeVisible();
  await page.getByText('Confirmed submission history (1)', { exact: true }).tap();
  await page.getByText(/Session 1 · 2026-10-03 · confirmed .*waiting to upload/).tap();
  const submitted = await download(page, 'Download submitted JSON');
  expect(submitted.answers.wordRating).toBe('good');
  await expectResponsive(page, 'advisor-offline-historical-capture');
  await page.keyboard.press('Escape');
  offline = false;
  await page.getByRole('button', { name: 'Retry account sync', exact: true }).tap();
  await expect
    .poll(
      async () =>
        (await (await context.request.get('/api/account-state')).json()).state.reports.length,
    )
    .toBe(2);
  const reports = (await (await context.request.get('/api/account-state')).json()).state.reports;
  expect(reports.find((row: { id: string }) => row.id === captured.id)).toEqual(captured);
  expect(reports.find((row: { id: string }) => row.id === submitted.id)).toEqual(submitted);
  expect(handoffBodies.length).toBeGreaterThanOrEqual(2);
  expect(
    handoffBodies.every((body) => JSON.stringify(body) === JSON.stringify(handoffBodies[0])),
  ).toBe(true);
});
