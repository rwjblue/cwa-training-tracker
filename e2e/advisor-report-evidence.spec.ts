import { expect, type Page, type Locator } from '@playwright/test';
import { test } from './fixtures';
import { readFile } from 'node:fs/promises';
import { accountRequest, expectResponsive, signIn } from './helpers';
import {
  evidenceProfile,
  evidenceSessions,
  evidenceLcwo,
  evidenceRunner,
} from './report-evidence-fixture';

test.use({ hasTouch: true, timezoneId: 'UTC' });
async function keyboard(control: Locator) {
  await expect(control).toBeVisible();
  await expect(control).toBeEnabled();
  await control.focus();
  await expect(control).toBeFocused();
  await control.press('Enter');
}
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.tap();
  const control =
    name === 'Your account'
      ? page.getByRole('button', { name, exact: true })
      : page
          .getByRole('navigation', { name: 'Main navigation', exact: true })
          .getByRole('link', { name, exact: true });
  await keyboard(control);
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

test('actual report mappings expose frozen source facts and protect edited answers through canceled configuration and save retry', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '198.51.100.10' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  await page.clock.setFixedTime(new Date('2026-10-03T12:00:00Z'));
  const imported = await accountRequest(context, 'POST', '/api/import', {
    mode: 'merge',
    data: {
      format: 'cwa-training-tracker',
      version: 1,
      exportedAt: '2026-10-03T12:00:00Z',
      profile: evidenceProfile,
      sessions: evidenceSessions(),
      lcwo: evidenceLcwo,
    },
  });
  expect(imported.status(), await imported.text()).toBe(200);
  await page.reload();
  await open(page);
  const points = page.getByLabel('Practice — Runner points (optional)', { exact: true });
  const length = page.getByLabel('Practice — Letters group length (optional)', { exact: true });
  await expect(points).toHaveValue('6');
  await expect(page.getByLabel('Practice — Runner score (optional)', { exact: true })).toHaveValue(
    '12',
  );
  await expect(
    page.getByLabel('Practice — Played short words (optional)', { exact: true }),
  ).toHaveValue('WD201 10, WD201 15');
  await expect(
    page.getByLabel('Practice — Letters error percent (optional)', { exact: true }),
  ).toHaveValue('10');
  await expect(length).toHaveValue('');
  await expect(
    page.getByLabel('Practice — Native Copy errors (optional)', { exact: true }),
  ).toHaveValue('0');
  await expect(page.getByRole('complementary', { name: 'Suggestion cautions' })).toContainText(
    'Mixed-speed run',
  );
  const inspector = page.getByLabel('Advisor suggestion evidence', { exact: true });
  await keyboard(inspector.getByText(/^Review suggestion evidence/));
  await keyboard(inspector.getByText('Evidence for Practice — Runner points', { exact: true }));
  const runnerEvidence = inspector
    .locator('details')
    .filter({ has: page.getByText('Evidence for Practice — Runner points', { exact: true }) });
  await keyboard(
    runnerEvidence.getByText('View saved result runner:runner-evidence', { exact: true }),
  );
  await expect(runnerEvidence).toContainText('25 WPM at 10 engine seconds');
  await expect(runnerEvidence).toContainText('qrn on');
  await expect(runnerEvidence).toContainText('without scaling points');
  await expect(inspector).not.toContainText('Private synthetic notes');
  await expectResponsive(page, 'advisor-source-evidence-desktop');

  // Exercise learner configuration, not just an API-arranged mapped field.
  await keyboard(page.getByRole('button', { name: 'Configure advisor fields', exact: true }));
  await keyboard(page.getByText('5. Runner points', { exact: true }));
  const field = page.getByRole('group', { name: 'Field 5', exact: true });
  await field
    .getByRole('combobox', { name: 'Source mapping', exact: true })
    .selectOption('runner:elapsedSeconds');
  await expectResponsive(page, 'advisor-evidence-mapping-desktop');
  await keyboard(page.getByRole('button', { name: 'Cancel configuration', exact: true }));
  await expect(points).toHaveValue('6');
  await points.fill('77');
  await length.fill('3');
  await length.fill('');
  await keyboard(page.getByRole('button', { name: 'Refresh from saved practice', exact: true }));
  await expect(points).toHaveValue('77');
  await expect(length).toHaveValue('');
  let fail = true;
  const bodies: unknown[] = [];
  await page.route('**/api/account-operations', async (route) => {
    if (
      route.request().method() === 'POST' &&
      route.request().postDataJSON().change.type === 'report-save'
    ) {
      bodies.push(route.request().postDataJSON());
      if (fail)
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Synthetic source copy unavailable' }),
        });
    }
    return route.continue();
  });
  await keyboard(page.getByRole('button', { name: 'Save account copy', exact: true }));
  await expect(
    page.getByRole('status').filter({ hasText: 'Report copy saved on this device.' }),
  ).toBeVisible();
  // A new owned result arriving during a failed save must not rewrite its frozen copy.
  const later = await accountRequest(
    context,
    'POST',
    '/api/entries',
    evidenceRunner('later-runner', 10),
  );
  expect(later.status(), await later.text()).toBe(201);
  await page.keyboard.press('Escape');
  fail = false;
  await keyboard(page.getByRole('button', { name: 'Retry account sync', exact: true }));
  await expect
    .poll(
      async () =>
        (await (await context.request.get('/api/account-state')).json()).state.reports.length,
    )
    .toBe(1);
  expect(bodies.at(-1)).toEqual(bodies[0]);
  const saved = (await (await context.request.get('/api/account-state')).json()).state.reports[0];
  expect(saved.answers.points).toBe('77');
  expect(
    saved.provenance.fields.find((field: { key: string }) => field.key === 'points').value,
  ).toBe('6');
  expect(
    saved.evidence.some(
      (ref: { id: string }) => ref.id === 'class-evidence' || ref.id === 'outside-evidence',
    ),
  ).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await open(page);
  const mobileEvidence = page
    .getByLabel('Advisor suggestion evidence', { exact: true })
    .filter({ visible: true });
  await mobileEvidence.getByText(/^Review suggestion evidence/).tap();
  await mobileEvidence
    .getByText('Evidence for Practice — Letters group length', { exact: true })
    .tap();
  await expect(mobileEvidence).toContainText('no older result or course default');
  await expect(mobileEvidence).toContainText('intentional blank');
  const latestGroup = mobileEvidence.locator('details').filter({
    has: page.getByText('Evidence for Practice — Letters group length', { exact: true }),
  });
  await latestGroup.getByText('View saved result groups:7:3', { exact: true }).tap();
  await expect(latestGroup).toContainText('2026-10-02');
  await expect(latestGroup).toContainText('Estimated 60 seconds');
  await expectResponsive(page, 'advisor-source-evidence-mobile');
  const geometry = await page
    .getByRole('dialog')
    .evaluate((dialog) => ({ scroll: dialog.scrollWidth, width: dialog.clientWidth }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);

  await page.getByRole('button', { name: 'Refresh from saved practice', exact: true }).tap();
  await expect(points).toHaveValue('77');
  await expect(length).toHaveValue('');
  const updated = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((key) => key.startsWith('cwa.reports.drafts.v1:'))!;
    return JSON.parse(localStorage.getItem(key)!).drafts[0];
  });
  expect(
    updated.provenance.fields.find((field: { key: string }) => field.key === 'points').value,
  ).toBe('10');
  expect((await (await context.request.get('/api/account-state')).json()).state.reports).toEqual([
    saved,
  ]);
  await page.getByRole('button', { name: 'Configure advisor fields', exact: true }).tap();
  await page.getByText('5. Runner points', { exact: true }).tap();
  await page
    .getByRole('group', { name: 'Field 5', exact: true })
    .getByRole('combobox', { name: 'Source mapping', exact: true })
    .selectOption('runner:elapsedSeconds');
  await page.getByRole('button', { name: 'Save report definition', exact: true }).tap();
  await expect(
    page.getByRole('status').filter({ hasText: 'Report definition saved.' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Use current definition for new draft', exact: true })
    .tap();
  await expect(points).toHaveValue('300');
  expect((await (await context.request.get('/api/account-state')).json()).state.reports).toEqual([
    saved,
  ]);
  await page.keyboard.press('Escape');
  await navigate(page, 'Your account');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).tap();
  const exported = JSON.parse(await readFile((await (await downloading).path())!, 'utf8'));
  expect(exported.reports).toEqual([saved]);
});
