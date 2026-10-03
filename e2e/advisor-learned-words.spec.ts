import { expect, type Page, type Locator } from '@playwright/test';
import { test } from './fixtures';
import { readFile } from 'node:fs/promises';
import { accountRequest, expectResponsive, signIn } from './helpers';
import { DEFAULT_PROFILE } from '../src/shared/training';
import { starterAdvisorReportDefinition } from '../src/shared/report-definition';

test.use({ hasTouch: true, timezoneId: 'UTC' });
async function keyboard(control: Locator) {
  await expect(control).toBeEnabled();
  await control.focus();
  await expect(control).toBeFocused();
  await control.press('Enter');
}
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.tap();
  await keyboard(page.getByRole('button', { name, exact: true }));
}
async function open(page: Page) {
  await expect(page.getByRole('button', { name: 'Open your account', exact: true })).toBeVisible();
  await navigate(page, 'Academy guide');
  await keyboard(page.getByRole('button', { name: 'Practice report', exact: true }));
  await keyboard(page.getByRole('button', { name: 'Advisor report setup', exact: true }));
  await page
    .getByRole('dialog')
    .evaluate(async (node) =>
      Promise.all(
        node
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
}
async function download(page: Page, name: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  return JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
}

test('saved explicit learned words stay eligible through handoff and retire only its confirmed answers, with protected edits and private history', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '198.51.100.12' });
  await context.route('https://advisor.learned.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Synthetic learned responder</h1>' }),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  await page.clock.setFixedTime(new Date('2026-10-03T00:00:00Z'));
  const definition = {
    ...starterAdvisorReportDefinition(),
    formUrl: 'https://advisor.learned.test/viewform',
    fields: [
      ...starterAdvisorReportDefinition().fields,
      {
        key: 'words',
        label: 'Words learned',
        section: 'New words',
        type: 'textarea',
        source: 'manual',
        required: false,
      },
    ].map((field) => ({ ...field, externalId: `entry.${field.key}` })),
  };
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        ...DEFAULT_PROFILE,
        timezone: 'UTC',
        reportDefinition: definition,
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await navigate(page, 'Practice studio');
  await keyboard(page.getByRole('button', { name: 'Word listening', exact: true }));
  await page
    .getByRole('textbox', { name: 'Scratchpad', exact: true })
    .fill('Heard NAME and ordinary private prose.\nLearned: Rig, QTH\nlearned: RIG');
  await keyboard(page.getByRole('button', { name: 'Save notes', exact: true }));
  await expect(page.getByText('Notes saved to history.', { exact: true })).toBeVisible();
  const source = (await (await context.request.get('/api/entries')).json()).entries[0];
  expect(source.minutes).toBe(0);
  await open(page);
  const words = () => page.getByLabel('New words — Words learned (optional)', { exact: true });
  await expect(words()).toHaveValue('');
  await keyboard(page.getByRole('button', { name: 'Configure advisor fields', exact: true }));
  await keyboard(page.getByText('5. Words learned', { exact: true }));
  await page
    .getByRole('group', { name: 'Field 5', exact: true })
    .getByRole('combobox', { name: 'Source mapping', exact: true })
    .selectOption('learned:words');
  await keyboard(page.getByRole('button', { name: 'Cancel configuration', exact: true }));
  await expect(words()).toHaveValue('');
  await keyboard(page.getByRole('button', { name: 'Configure advisor fields', exact: true }));
  await keyboard(page.getByText('5. Words learned', { exact: true }));
  await page
    .getByRole('group', { name: 'Field 5', exact: true })
    .getByRole('combobox', { name: 'Source mapping', exact: true })
    .selectOption('learned:words');
  await keyboard(page.getByRole('button', { name: 'Save report definition', exact: true }));
  await expect(
    page.getByRole('status').filter({ hasText: 'Report definition saved.' }),
  ).toBeVisible();
  await keyboard(
    page.getByRole('button', { name: 'Use current definition for new draft', exact: true }),
  );
  await expect(words()).toHaveValue('Rig, QTH');
  const inspector = () => page.getByLabel('Learned word sources and history', { exact: true });
  await keyboard(inspector().getByText('Review learned-word candidates (2)', { exact: true }));
  await expect(inspector()).toContainText(`${source.id} (2026-10-03)`);
  await expect(inspector()).not.toContainText('ordinary private prose');
  await expect(inspector()).not.toContainText('NAME');
  await expectResponsive(page, 'learned-word-candidates');

  await keyboard(page.getByRole('button', { name: 'Save account copy', exact: true }));
  await expect(
    page.getByRole('status').filter({ hasText: 'Report copy saved in your account.' }),
  ).toBeVisible();
  await keyboard(page.getByRole('button', { name: 'Refresh from saved practice', exact: true }));
  await expect(words()).toHaveValue('Rig, QTH');
  await words().fill('Rig');
  await keyboard(page.getByRole('button', { name: 'Prepare reviewed handoff', exact: true }));
  await expect(
    page.getByRole('status').filter({ hasText: 'Reviewed handoff retained in your account.' }),
  ).toBeVisible();
  const handoff = await download(page, 'Download handoff JSON');
  expect(handoff.answers.words).toBe('Rig');
  await page.getByRole('button', { name: 'Print captured answers', exact: true }).click();
  const popupEvent = page.waitForEvent('popup');
  await keyboard(page.getByRole('link', { name: 'Open captured form', exact: true }));
  const popup = await popupEvent;
  await expect(popup.getByRole('heading', { name: 'Synthetic learned responder' })).toBeVisible();
  expect(new URL(popup.url()).searchParams.get('entry.words')).toBe('Rig');
  await popup.close();
  await expect(inspector()).not.toContainText('Already confirmed in submission');
  await words().fill('QTH');
  let offline = true;
  const bodies: unknown[] = [];
  await page.route('**/api/account-operations', (route) => {
    if (
      route.request().method() === 'POST' &&
      route.request().postDataJSON().change.type === 'report-confirm'
    ) {
      bodies.push(route.request().postDataJSON());
      if (offline)
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Synthetic learned confirmation offline' }),
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
  await page.getByRole('button', { name: 'Record confirmed submission', exact: true }).tap();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Your confirmation of this exact copy is retained on this device' }),
  ).toBeVisible();
  await expect(inspector()).toContainText('Already confirmed in submission');
  await page.getByRole('combobox', { name: 'Class session', exact: true }).selectOption('2');
  await expect(words()).toHaveValue('QTH');
  await words().fill('');
  await page.getByRole('button', { name: 'Refresh from saved practice', exact: true }).tap();
  await expect(words()).toHaveValue('');
  await page.keyboard.press('Escape');
  await page.reload();
  await open(page);
  await expect(words()).toHaveValue('');
  await page.getByRole('button', { name: 'Use suggestion for Words learned', exact: true }).tap();
  await expect(words()).toHaveValue('QTH');
  await inspector().getByText('Review learned-word candidates (2)', { exact: true }).tap();
  await inspector()
    .getByRole('button', { name: 'Include Rig in Words learned', exact: true })
    .tap();
  await expect(words()).toHaveValue('QTH, Rig');
  await page.getByRole('button', { name: 'Refresh from saved practice', exact: true }).tap();
  await expect(words()).toHaveValue('QTH, Rig');
  await inspector().getByText('Confirmed learned-word history (1)', { exact: true }).tap();
  await expect(inspector()).toContainText('Rig · submission');
  await expectResponsive(page, 'learned-word-confirmed-history');
  await inspector().scrollIntoViewIfNeeded();

  await page.keyboard.press('Escape');
  offline = false;
  const retry = page.getByRole('button', { name: 'Retry account sync', exact: true });
  if (await retry.isVisible()) await retry.tap();
  await expect
    .poll(
      async () =>
        (await (await context.request.get('/api/account-state')).json()).state.reports.filter(
          (row: { status: string }) => row.status === 'submitted',
        ).length,
    )
    .toBe(1);
  expect(bodies.length).toBeGreaterThanOrEqual(1);
  expect(bodies.every((body) => JSON.stringify(body) === JSON.stringify(bodies[0]))).toBe(true);
  await navigate(page, 'Your account');
  const backup = await download(page, 'Export backup');
  expect(
    backup.reports.find((row: { id: string }) => row.id === handoff.handoff.submissionId).answers
      .words,
  ).toBe('Rig');
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import backup', exact: true }).tap();
  await (
    await choosing
  ).setFiles({
    name: 'synthetic-learned-history.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...backup, reports: [...backup.reports].reverse() })),
  });
  await page.getByRole('button', { name: 'Import sessions', exact: true }).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await open(page);
  await page.getByRole('combobox', { name: 'Class session', exact: true }).selectOption('3');
  await expect(words()).toHaveValue('QTH');
  const current = await download(page, 'Download working report');
  expect(
    current.provenance.fields
      .find((field: { key: string }) => field.key === 'words')
      .warnings.join('\n'),
  ).toContain(handoff.handoff.submissionId);
  expect(
    current.provenance.sources.some((snapshot: { facts: string[] }) =>
      snapshot.facts.join('\n').includes('Explicit Learned: Rig, QTH'),
    ),
  ).toBe(true);
  // A different eligible report date must still retire the exact confirmed word.
  expect(
    (
      await accountRequest(context, 'POST', '/api/entries', {
        id: 'prior-day-learned-declaration',
        date: '2026-10-02',
        kind: 'listening',
        minutes: 0,
        notes: '',
        createdAt: '2026-10-02T00:00:00Z',
        metadata: { scratchpad: 'Learned: Rig' },
      })
    ).status(),
  ).toBe(201);
  await page.keyboard.press('Escape');
  await page.reload();
  await open(page);
  await page.getByLabel('Report date', { exact: true }).fill('2026-10-02');
  await expect(words()).toHaveValue('');
  const savingDate = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/account-operations') &&
      response.request().postDataJSON()?.change.type === 'report-save',
  );
  await page.getByRole('button', { name: 'Save account copy', exact: true }).tap();
  expect((await savingDate).status()).toBe(200);
  await words().fill('Deliberately omit these words');
  await words().fill('');
  await page.getByLabel('Report date', { exact: true }).fill('2026-10-03');
  await expect(words()).toHaveValue('');
  await page.getByRole('button', { name: 'Use suggestion for Words learned', exact: true }).tap();
  await expect(words()).toHaveValue('QTH');
  // Bounded disclosure keeps all candidate actions reachable, and selection appends to literal edits.
  expect(
    (
      await accountRequest(context, 'POST', '/api/entries', {
        id: 'bulk-learned-declarations',
        date: '2026-10-03',
        kind: 'listening',
        minutes: 0,
        notes: '',
        createdAt: '2026-10-03T00:00:00Z',
        metadata: {
          scratchpad: `Learned: ${Array.from({ length: 101 }, (_, index) => `fixture-${index}`).join(', ')}`,
        },
      })
    ).status(),
  ).toBe(201);
  await page.keyboard.press('Escape');
  await page.reload();
  await open(page);
  await inspector().getByText('Review learned-word candidates (103)', { exact: true }).tap();
  const finalCandidate = inspector().getByRole('button', {
    name: 'Include fixture-100 in Words learned',
    exact: true,
  });
  await expect(finalCandidate).toHaveCount(0);
  await keyboard(inspector().getByRole('button', { name: 'Show 3 more candidates', exact: true }));
  await words().fill(' QTH;\n');
  await finalCandidate.tap();
  await expect(words()).toHaveValue(' QTH;\n, fixture-100');
});
