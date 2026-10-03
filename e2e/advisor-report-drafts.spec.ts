import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { accountRequest, expectResponsive, signIn } from './helpers';
import { starterAdvisorReportDefinition } from '../src/shared/report-definition';
import { DEFAULT_PROFILE } from '../src/shared/training';

test.use({ hasTouch: true, timezoneId: 'UTC' });
const definition = {
  ...starterAdvisorReportDefinition(),
  fields: [
    ...starterAdvisorReportDefinition().fields,
    {
      key: 'summary',
      label: 'Summary',
      section: 'Practice',
      type: 'text',
      required: false,
      source: 'practiceSummary',
    },
    {
      key: 'notes',
      label: 'Notes',
      section: 'Questions',
      type: 'textarea',
      required: false,
      source: 'manual',
    },
  ],
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
  await expect(page.getByLabel('Questions — Notes (optional)', { exact: true })).toBeVisible();
}
async function deviceDrafts(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((key) => key.startsWith('cwa.reports.drafts.v1:'));
    return JSON.parse(localStorage.getItem(key!)!);
  });
}

test('device report sessions survive reload and exact offline account copies preserve edits while refreshing practice', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.237' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  await page.clock.setFixedTime(new Date('2026-10-03T12:00:00Z'));
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        ...DEFAULT_PROFILE,
        callsign: 'N0SYN',
        reportDefinition: definition,
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await accountRequest(context, 'POST', '/api/entries', {
        id: 'report-practice-one',
        date: '2026-10-02',
        kind: 'listening',
        minutes: 2,
        notes: 'Synthetic practice',
        createdAt: '2026-10-02T12:00:00Z',
      })
    ).status(),
  ).toBe(201);
  await page.reload();
  await open(page);
  const notes = () => page.getByLabel('Questions — Notes (optional)', { exact: true });
  const summary = () => page.getByLabel('Practice — Summary (optional)', { exact: true });
  const call = () => page.getByLabel('Report context — Callsign (optional)', { exact: true });
  const session = () => page.getByRole('combobox', { name: 'Class session', exact: true });
  await expect(summary()).toHaveValue(
    '1 saved practice result; 2 minutes (independent practice; inclusive window).',
  );
  await notes().fill('Exact learner text\n<tag> remains literal');
  await call().fill('');
  await expect(
    page.getByRole('button', { name: 'Use suggestion for Callsign', exact: true }),
  ).toBeVisible();
  const original = (await deviceDrafts(page)).drafts[0];
  await session().selectOption('2');
  await notes().fill('Second session only');
  await session().selectOption('1');
  await expect(notes()).toHaveValue(original.answers.notes);
  await page.keyboard.press('Escape');
  await page.reload();
  await open(page);
  await expect(notes()).toHaveValue(original.answers.notes);
  await expect(call()).toHaveValue('');
  expect(
    (await deviceDrafts(page)).drafts.find(
      (draft: { window: { session: number } }) => draft.window.session === 1,
    ).id,
  ).toBe(original.id);
  await expectResponsive(page, 'advisor-durable-draft');
  await page.screenshot({ path: '.tmp/advisor-durable-draft-desktop.png' });
  let unavailable = true;
  const bodies: unknown[] = [];
  await page.route('**/api/account-operations', async (route) => {
    if (
      route.request().method() === 'POST' &&
      route.request().postDataJSON().change.type === 'report-save'
    ) {
      bodies.push(route.request().postDataJSON());
      if (unavailable)
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Synthetic report save unavailable' }),
        });
    }
    return route.continue();
  });
  await page.getByRole('button', { name: 'Save account copy', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('status').filter({ hasText: 'Report copy saved on this device.' }),
  ).toBeVisible();
  expect((await (await context.request.get('/api/account-state')).json()).state.reports).toEqual(
    [],
  );
  await page.keyboard.press('Escape');
  await page.reload();
  await open(page);
  await expect(notes()).toHaveValue(original.answers.notes);
  await page.getByText('Saved report copies (1)', { exact: true }).click();
  await expect(page.getByText(/Session 1 · .*waiting to upload/, { exact: false })).toBeVisible();
  await page.keyboard.press('Escape');
  unavailable = false;
  await page.getByRole('button', { name: 'Retry account sync', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await context.request.get('/api/account-state')).json()).state.reports.length,
    )
    .toBe(1);
  expect(bodies.length).toBeGreaterThanOrEqual(2);
  expect(bodies.every((body) => JSON.stringify(body) === JSON.stringify(bodies[0]))).toBe(true);
  const saved = (await (await context.request.get('/api/account-state')).json()).state.reports[0];
  expect(saved.id).not.toBe(original.id);
  expect(saved.answers.notes).toBe(original.answers.notes);
  expect(saved.answers.callsign).toBe('');
  expect(saved.editedKeys).toEqual(['notes', 'callsign']);
  expect(
    (
      await accountRequest(context, 'POST', '/api/entries', {
        id: 'report-practice-two',
        date: '2026-10-03',
        kind: 'sending',
        minutes: 3,
        notes: 'Synthetic sending',
        createdAt: '2026-10-03T12:00:00Z',
      })
    ).status(),
  ).toBe(201);
  await page.reload();
  await open(page);
  await page.getByRole('button', { name: 'Refresh from saved practice', exact: true }).click();
  await expect(summary()).toHaveValue(
    '2 saved practice results; 5 minutes (independent practice; inclusive window).',
  );
  await expect(notes()).toHaveValue(original.answers.notes);
  await expect(call()).toHaveValue('');
  await page.getByRole('button', { name: 'Use suggestion for Callsign', exact: true }).click();
  await expect(call()).toHaveValue('N0SYN');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText('Saved report copies (1)', { exact: true }).tap();
  await page.getByText(/Session 1 · .*account-saved/, { exact: false }).tap();
  await page.getByRole('button', { name: 'Reopen session 1 copy as new draft', exact: true }).tap();
  await expect(notes()).toHaveValue(original.answers.notes);
  expect(
    (await deviceDrafts(page)).drafts.find(
      (draft: { window: { session: number } }) => draft.window.session === 1,
    ).id,
  ).not.toBe(original.id);
  expect((await (await context.request.get('/api/account-state')).json()).state.reports[0]).toEqual(
    saved,
  );
  await page.getByRole('button', { name: 'Remove session 1 draft copy', exact: true }).tap();
  await page.getByRole('button', { name: 'Cancel report removal', exact: true }).tap();
  expect(
    (await (await context.request.get('/api/account-state')).json()).state.reports,
  ).toHaveLength(1);
  await expectResponsive(page, 'advisor-reopened-draft');
  await page.screenshot({ path: '.tmp/advisor-reopened-draft-mobile.png' });
  await page.keyboard.press('Escape');
  await navigate(page, 'Your account');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).tap();
  const exported = JSON.parse(await readFile((await (await downloading).path())!, 'utf8'));
  expect(exported.reports).toEqual([saved]);
  // Exercise the actual local D1 boundary, beyond the SQLite adapter: the full
  // valid report inventory exceeds a single 2 MB value but each row is bounded.
  const largeDefinition = {
    ...saved.definition,
    fields: [
      ...saved.definition.fields,
      ...Array.from({ length: 20 }, (_, i) => ({
        key: `largeNote${i}`,
        label: `Large notes ${i}`,
        section: 'Questions',
        type: 'textarea',
        required: false,
        source: 'manual',
      })),
    ],
  };
  const largeAnswers = {
    ...saved.answers,
    ...Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`largeNote${i}`, 'x'.repeat(4000)]),
    ),
  };
  const largeCopies = Array.from({ length: 28 }, (_, i) => ({
    ...saved,
    id: `large-runtime-report-${i}`,
    definition: largeDefinition,
    answers: largeAnswers,
  }));
  const incoming = { ...exported, reports: [saved, ...largeCopies] };
  expect(Buffer.byteLength(JSON.stringify(incoming.reports))).toBeGreaterThan(2_000_000);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import backup', exact: true }).tap();
  await (
    await chooser
  ).setFiles({
    name: 'synthetic-native-reports.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(incoming)),
  });
  await expect(page.getByText(/29 immutable advisor report copies/)).toBeVisible();
  await page.getByRole('button', { name: 'Import sessions', exact: true }).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const restored = (await (await context.request.get('/api/account-state')).json()).state.reports;
  expect(restored).toHaveLength(29);
  expect(restored.find((report: { id: string }) => report.id === saved.id)).toEqual(saved);
  const runtimeExport = await context.request.get('/api/export');
  expect(runtimeExport.status()).toBe(200);
  const runtimeReports = (await runtimeExport.json()).reports;
  expect(runtimeReports).toHaveLength(29);
  expect(
    runtimeReports.find((report: { id: string }) => report.id === 'large-runtime-report-17')
      .answers,
  ).toEqual(largeAnswers);
});

test('explicit original device draft copying validates mapping and session while preserving archives and intentional blanks', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.238' });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.clock.setFixedTime(new Date('2026-10-03T12:00:00Z'));
  const original = {
    id: 'source-working-one',
    session: 1,
    reportDate: '2026-10-02',
    status: 'draft',
    answers: { notes: '', callsign: 'N0OLD' },
    sourceAttemptIds: ['original-source-one'],
    sourceLcwoIds: [],
  };
  const legacy = {
    source: 'rwjblue.com',
    data: {
      reportDrafts: {
        '1': original,
        '2': { ...original, id: 'source-working-two', session: 2 },
        '3': {
          ...original,
          id: 'source-unmatched',
          answers: { unmatched: '<literal> private source' },
        },
        '4': { ...original, id: 'source-submitted', status: 'submitted' },
      },
      reportEditsBySession: { '1': ['notes', 'callsign'] },
      snapshot: {
        reports: [
          {
            ...original,
            id: 'historical-submitted',
            status: 'submitted',
            submittedAt: '2026-10-02T13:00:00Z',
          },
        ],
      },
    },
  };
  expect(
    (
      await accountRequest(context, 'POST', '/api/import', {
        mode: 'merge',
        data: {
          format: 'cwa-training-tracker',
          version: 1,
          exportedAt: '2026-10-03T12:00:00Z',
          sessions: [],
          profile: { ...DEFAULT_PROFILE, reportDefinition: definition },
          legacy,
        },
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await open(page);
  await page.getByText('Copy a preserved original device draft', { exact: true }).tap();
  await page.getByRole('button', { name: 'Load original device drafts', exact: true }).tap();
  await expect(
    page.getByRole('combobox', { name: 'Original device draft', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Copy original draft into selected session', exact: true })
    .tap();
  await expect(
    page.getByRole('status').filter({ hasText: 'Original draft copied explicitly.' }),
  ).toBeVisible();
  await expect(page.getByLabel('Questions — Notes (optional)', { exact: true })).toHaveValue('');
  await expect(
    page.getByLabel('Report context — Callsign (optional)', { exact: true }),
  ).toHaveValue('N0OLD');
  const copied = (await deviceDrafts(page)).drafts[0];
  expect(copied.id).not.toBe(original.id);
  expect(copied.source).toMatchObject({ kind: 'original-device', id: original.id });
  expect(copied.editedKeys).toEqual(['notes', 'callsign']);
  await page.getByRole('button', { name: 'Refresh from saved practice', exact: true }).tap();
  await expect(
    page.getByLabel('Report context — Callsign (optional)', { exact: true }),
  ).toHaveValue('N0OLD');
  await page.getByRole('button', { name: 'Save account copy', exact: true }).tap();
  await expect(
    page.getByRole('status').filter({ hasText: 'Report copy saved in your account.' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Copy original draft into selected session', exact: true })
    .tap();
  await expect(page.getByRole('alert')).toContainText('already been copied');
  const select = page.getByRole('combobox', { name: 'Original device draft', exact: true });
  await select.selectOption('source-working-two');
  await page
    .getByRole('button', { name: 'Copy original draft into selected session', exact: true })
    .tap();
  await expect(page.getByRole('alert')).toContainText('matching class session');
  await select.selectOption('source-unmatched');
  await page
    .getByRole('button', { name: 'Copy original draft into selected session', exact: true })
    .tap();
  await expect(page.getByRole('alert')).toContainText('mapping');
  await expect(page.getByText(/<literal> private source/)).toBeVisible();
  await select.selectOption('source-submitted');
  await page
    .getByRole('button', { name: 'Copy original draft into selected session', exact: true })
    .tap();
  await expect(page.getByRole('alert')).toContainText('historical references');
  expect((await (await context.request.get('/api/export')).json()).legacy).toEqual(legacy);
  expect(
    (await (await context.request.get('/api/account-state')).json()).state.reports,
  ).toHaveLength(1);
  await expectResponsive(page, 'advisor-original-copy-errors');
  await page.screenshot({ path: '.tmp/advisor-original-copy-mobile.png' });
});

test('device storage refusal and a newer tab retain both drafts with explicit download and reopen recovery', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.239' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  await page.clock.setFixedTime(new Date('2026-10-03T12:00:00Z'));
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
  const notes = page.getByLabel('Questions — Notes (optional)', { exact: true });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (
        key.startsWith('cwa.reports.drafts.v1:') &&
        sessionStorage.getItem('syntheticReportStorageRefusal') === 'yes'
      )
        throw new DOMException('Synthetic storage refusal', 'QuotaExceededError');
      return original.call(this, key, value);
    };
    sessionStorage.setItem('syntheticReportStorageRefusal', 'yes');
  });
  await notes.fill('Retained after storage refusal');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Draft retained in this page only' }),
  ).toBeVisible();
  expect((await deviceDrafts(page)).drafts[0].answers.notes).not.toBe(
    'Retained after storage refusal',
  );
  await page.evaluate(() => sessionStorage.removeItem('syntheticReportStorageRefusal'));
  await page.getByRole('button', { name: 'Retry device save', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Draft retained in this page only' }),
  ).toHaveCount(0);
  expect((await deviceDrafts(page)).drafts[0].answers.notes).toBe('Retained after storage refusal');
  const other = await context.newPage();
  await other.clock.setFixedTime(new Date('2026-10-03T12:00:00Z'));
  await other.goto('/');
  await open(other);
  await other.getByLabel('Questions — Notes (optional)', { exact: true }).fill('Newer tab text');
  await notes.fill('Older tab text retained separately');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Another tab changed these report drafts' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retry device save', exact: true }).click();
  expect((await deviceDrafts(page)).drafts[0].answers.notes).toBe('Newer tab text');
  await expectResponsive(page, 'advisor-device-conflict-recovery');
  const downloading = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download current and reopen device drafts', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  const recovered = JSON.parse(await readFile((await (await downloading).path())!, 'utf8'));
  expect(recovered.answers.notes).toBe('Older tab text retained separately');
  await expect(notes).toHaveValue('Newer tab text');
  expect((await deviceDrafts(page)).drafts[0].answers.notes).toBe('Newer tab text');
  await other.close();
  await page.setViewportSize({ width: 390, height: 844 });
  await expectResponsive(page, 'advisor-device-conflict-resolved');
  await page.screenshot({ path: '.tmp/advisor-device-recovery-mobile.png' });
});

test('reopening original-derived submitted history saves a separate draft copy without changing confirmed history', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.241' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  await page.clock.setFixedTime(new Date('2026-10-03T12:00:00Z'));
  const legacy = {
    source: 'rwjblue.com',
    data: {
      reportDrafts: {
        '1': {
          id: 'original-submitted-source',
          session: 1,
          status: 'draft',
          reportDate: '2026-10-03',
          answers: { callsign: '' },
        },
      },
    },
  };
  const sourceBackup = {
    format: 'cwa-training-tracker',
    version: 1,
    exportedAt: '2026-10-03T12:00:00Z',
    profile: { ...DEFAULT_PROFILE, reportDefinition: definition },
    sessions: [],
    plan: [],
    legacy,
  };
  expect(
    (
      await accountRequest(context, 'POST', '/api/import', { mode: 'merge', data: sourceBackup })
    ).status(),
  ).toBe(200);
  const archived = (await (await context.request.get('/api/export')).json()).legacy;
  const submitted = {
    version: 1,
    id: 'original-derived-submitted',
    status: 'submitted',
    definition,
    window: {
      session: 1,
      reportDate: '2026-10-03',
      timezone: 'UTC',
      preparationDates: [],
      fromDate: '2026-10-01',
      toDate: '2026-10-03',
      empty: false,
      fallback: true,
      explanation: 'Two days before the chosen report date through that date.',
    },
    answers: {
      callsign: '',
      name: '',
      session: '1',
      reportDate: '2026-10-03',
      summary: '',
      notes: 'Exact confirmed original-derived answer',
    },
    editedKeys: ['notes', 'callsign'],
    evidence: [],
    createdAt: '2026-10-03T12:00:00Z',
    updatedAt: '2026-10-03T12:00:00Z',
    submittedAt: '2026-10-03T12:00:00Z',
    source: {
      kind: 'original-device',
      id: 'original-submitted-source',
      archiveId: createHash('sha256').update(JSON.stringify(archived)).digest('hex'),
    },
  };
  expect(
    (
      await accountRequest(context, 'POST', '/api/import', {
        mode: 'merge',
        data: { ...sourceBackup, reports: [submitted] },
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await open(page);
  await page.getByText('Saved report copies (1)', { exact: true }).click();
  await page.getByText(/Session 1 · .*submitted · account-saved/).click();
  await expect(
    page.getByRole('button', { name: 'Remove session 1 draft copy', exact: true }),
  ).toHaveCount(0);
  const reopen = page.getByRole('button', {
    name: 'Reopen session 1 copy as new draft',
    exact: true,
  });
  await reopen.focus();
  await reopen.press('Enter');
  await expect(page.getByLabel('Questions — Notes (optional)', { exact: true })).toHaveValue(
    submitted.answers.notes,
  );
  const working = (await deviceDrafts(page)).drafts[0];
  expect(working.status).toBe('draft');
  expect(working.id).not.toBe(submitted.id);
  expect(working).not.toHaveProperty('submittedAt');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Save account copy', exact: true }).tap();
  await expect(
    page.getByRole('status').filter({ hasText: 'Report copy saved in your account.' }),
  ).toBeVisible();
  const history = (await (await context.request.get('/api/account-state')).json()).state.reports;
  expect(history).toHaveLength(2);
  expect(history.find((copy: { id: string }) => copy.id === submitted.id)).toEqual(submitted);
  const draft = history.find((copy: { status: string }) => copy.status === 'draft');
  expect(draft.id).not.toBe(working.id);
  expect(draft.answers).toEqual(submitted.answers);
  expect(draft.source).toEqual(submitted.source);
  await expectResponsive(page, 'advisor-submitted-reopened-draft');
});
