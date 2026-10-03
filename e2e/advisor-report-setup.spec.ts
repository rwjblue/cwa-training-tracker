import { expect, test, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { accountRequest, expectResponsive, signIn } from './helpers';

test.use({ hasTouch: true, timezoneId: 'Pacific/Auckland' });
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.tap();
  const button = page.getByRole('button', { name, exact: true });
  await expect(button).toBeEnabled();
  await button.focus();
  await button.press('Enter');
}
async function keyboard(control: Locator) {
  await control.focus();
  await expect(control).toBeFocused();
  await control.press('Enter');
}
async function settled(page: Page) {
  await page.getByRole('dialog').evaluate(async (node) => {
    await Promise.all(
      node.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})),
    );
  });
}
test('private report definition, exact field rules, preparation window and retained sync retry', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.236' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  await page.clock.setFixedTime(new Date('2026-10-03T12:00:00Z'));
  const settings = (await (await context.request.get('/api/settings')).json()).settings;
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        ...settings,
        firstClassDate: '2026-10-01',
        level: 'intermediate',
        timezone: 'Pacific/Auckland',
        classSchedule: {
          version: 1,
          timezone: 'America/New_York',
          exceptions: [
            {
              session: 1,
              date: '2026-10-03',
              startTime: '19:00',
              endTime: '20:00',
              endsNextDay: false,
            },
          ],
        },
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await navigate(page, 'Academy guide');
  await keyboard(page.getByRole('button', { name: 'Practice report', exact: true }));
  await expect(page.getByLabel('From', { exact: true })).toBeVisible();
  await keyboard(page.getByRole('button', { name: 'Advisor report setup', exact: true }));
  await settled(page);
  await page.getByLabel('Report title', { exact: true }).fill('My synthetic advisor report');
  await page
    .getByLabel('External form URL (optional)', { exact: true })
    .fill('https://secret:password@forms.example.test');
  await keyboard(page.getByRole('button', { name: 'Save report definition', exact: true }));
  await expect(page.getByRole('alert')).toContainText('without username/password');
  expect(
    (await (await context.request.get('/api/settings')).json()).settings.reportDefinition,
  ).toBeUndefined();
  await expect(page.getByLabel('Report title', { exact: true })).toHaveValue(
    'My synthetic advisor report',
  );
  await page
    .getByLabel('External form URL (optional)', { exact: true })
    .fill('https://forms.example.test/student?course=synthetic');
  await keyboard(page.getByRole('button', { name: 'Add report field', exact: true }));
  let field = page.getByRole('group', { name: 'Field 5', exact: true });
  await keyboard(page.getByText('5. New field', { exact: true }));
  await field.getByLabel('Field key', { exact: true }).fill('points');
  await field.getByLabel('Field label', { exact: true }).fill('Verified points');
  await field.getByRole('combobox', { name: 'Field type', exact: true }).selectOption('number');
  await field.getByLabel('Minimum (inclusive)', { exact: true }).fill('0');
  await field.getByLabel('Maximum (inclusive)', { exact: true }).fill('100');
  await field.getByRole('checkbox', { name: 'Whole numbers only' }).check();
  await keyboard(page.getByRole('button', { name: 'Add report field', exact: true }));
  field = page.getByRole('group', { name: 'Field 6', exact: true });
  await keyboard(page.getByText('6. New field', { exact: true }));
  await field.getByLabel('Field key', { exact: true }).fill('sendingRating');
  await field.getByLabel('Field label', { exact: true }).fill('Sending rating');
  await field.getByRole('combobox', { name: 'Field type', exact: true }).selectOption('rating');
  await field
    .getByLabel('Exact rating choices (one per line)', { exact: false })
    .fill('Very Good\nGood\nFair\nPoor');
  await field.getByLabel('External field ID (optional)', { exact: true }).fill('entry.42');
  await keyboard(field.getByRole('button', { name: 'Move Sending rating up', exact: true }));
  await expect(page.getByRole('group', { name: 'Field 5', exact: true })).toContainText(
    'Sending rating',
  );
  await settled(page);
  await expectResponsive(page, 'advisor-report-definition');
  let fail = true;
  const bodies: unknown[] = [];
  await page.route('**/api/account-operations', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    bodies.push(route.request().postDataJSON());
    if (fail)
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Synthetic definition unavailable' }),
      });
    return route.continue();
  });
  await keyboard(page.getByRole('button', { name: 'Save report definition', exact: true }));
  await expect(
    page.getByRole('status').filter({ hasText: 'Definition saved on this device.' }),
  ).toBeVisible();
  expect(
    (await (await context.request.get('/api/settings')).json()).settings.reportDefinition,
  ).toBeUndefined();
  await page.keyboard.press('Escape');
  fail = false;
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/account-operations') &&
      response.request().method() === 'POST' &&
      response.ok(),
  );
  await keyboard(page.getByRole('button', { name: 'Retry account sync', exact: true }));
  await saved;
  expect(bodies.at(-1)).toEqual(bodies[0]);
  const persisted = (await (await context.request.get('/api/settings')).json()).settings
    .reportDefinition;
  expect(persisted.fields.map((field: { key: string }) => field.key)).toEqual([
    'callsign',
    'name',
    'session',
    'reportDate',
    'sendingRating',
    'points',
  ]);
  expect(persisted.fields[4].options).toEqual(['Very Good', 'Good', 'Fair', 'Poor']);
  await keyboard(page.getByRole('button', { name: 'Practice report', exact: true }));
  await keyboard(page.getByRole('button', { name: 'Advisor report setup', exact: true }));
  await expect(page.getByRole('combobox', { name: 'Class session', exact: true })).toBeFocused();
  const preparation = page.getByRole('region', { name: 'Report preparation window' });
  await expect(preparation).toContainText('America/New_York');
  await expect(preparation).toContainText('2026-09-29, 2026-09-30, 2026-10-01');
  await expect(preparation).toContainText('2026-10-03');
  await page.getByLabel('Report date', { exact: true }).fill('2026-09-30');
  await expect(preparation).toContainText('2026-09-29 through 2026-09-30');
  await page.getByLabel('Report date', { exact: true }).fill('2026-09-28');
  await expect(preparation).toContainText(
    'Empty — preparation starts 2026-09-29; report ends 2026-09-28',
  );
  await expect(preparation).toContainText('includes no future evidence');
  await page.getByLabel('Report date', { exact: true }).fill('2026-10-04');
  await expect(page.getByRole('alert')).toContainText('future');
  await page.getByLabel('Report date', { exact: true }).fill('2026-09-30');
  await page.getByLabel('Practice — Verified points (optional)', { exact: true }).fill('0');
  await page
    .getByRole('combobox', { name: 'Practice — Sending rating (optional)', exact: true })
    .selectOption('Very Good');
  await keyboard(page.getByRole('button', { name: 'Check preview answers', exact: true }));
  await expect(
    page.getByRole('status').filter({ hasText: 'satisfy your configured field rules' }),
  ).toBeVisible();
  await page.getByLabel('Practice — Verified points (optional)', { exact: true }).fill('10%');
  await keyboard(page.getByRole('button', { name: 'Check preview answers', exact: true }));
  await expect(page.getByRole('alert')).toContainText('without units or a percent sign');
  await page.getByLabel('Practice — Verified points (optional)', { exact: true }).fill('');
  await keyboard(page.getByRole('button', { name: 'Check preview answers', exact: true }));
  await expect(
    page.getByRole('status').filter({ hasText: 'satisfy your configured field rules' }),
  ).toBeVisible();
  await keyboard(page.getByRole('button', { name: 'Generic practice report', exact: true }));
  await expect(page.getByRole('button', { name: 'Copy report', exact: true })).toBeVisible();
  await keyboard(page.getByRole('button', { name: 'Advisor report setup', exact: true }));
  await expect(page.getByLabel('Report date', { exact: true })).toHaveValue('2026-09-30');
  await expect(
    page.getByRole('combobox', { name: 'Practice — Sending rating (optional)', exact: true }),
  ).toHaveValue('Very Good');
  await settled(page);
  await expectResponsive(page, 'advisor-report-window-preview');
  await page.screenshot({ path: '.tmp/advisor-report-preview-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.tmp/advisor-report-preview-mobile.png' });
  await page.getByRole('button', { name: 'Configure advisor fields', exact: true }).tap();
  await page.getByLabel('Report title', { exact: true }).fill('Canceled change');
  await page.getByRole('button', { name: 'Cancel configuration', exact: true }).tap();
  await expect(
    page.getByRole('heading', { name: 'My synthetic advisor report', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Class session', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Generic practice report', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Copy report', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await navigate(page, 'Your account');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).tap();
  const filename = await (await downloading).path();
  expect(filename).not.toBeNull();
  const backupText = await readFile(filename!, 'utf8');
  expect(JSON.parse(backupText).profile.reportDefinition).toEqual(persisted);
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import backup', exact: true }).tap();
  await (
    await choosing
  ).setFiles({
    name: 'synthetic-report-definition.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backupText),
  });
  await page.getByRole('button', { name: 'Import sessions', exact: true }).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    (await (await context.request.get('/api/settings')).json()).settings.reportDefinition,
  ).toEqual(persisted);
  // Reconfigure a persisted field: obsolete rating rules must not follow its new type.
  await navigate(page, 'Academy guide');
  await keyboard(page.getByRole('button', { name: 'Practice report', exact: true }));
  await keyboard(page.getByRole('button', { name: 'Advisor report setup', exact: true }));
  await page.getByRole('button', { name: 'Configure advisor fields', exact: true }).tap();
  await keyboard(page.getByText('5. Sending rating', { exact: true }));
  await page
    .getByRole('group', { name: 'Field 5', exact: true })
    .getByRole('combobox', { name: 'Field type', exact: true })
    .selectOption('textarea');
  await page.getByRole('button', { name: 'Save report definition', exact: true }).tap();
  await expect(
    page.getByRole('status').filter({ hasText: 'Report definition saved.' }),
  ).toBeVisible({ timeout: 5000 });
  const changed = (await (await context.request.get('/api/settings')).json()).settings
    .reportDefinition.fields[4];
  expect(changed).toMatchObject({ key: 'sendingRating', type: 'textarea', externalId: 'entry.42' });
  expect(changed.options).toBeUndefined();
  // A whole-number definition must have a safe answer even with one-sided limits.
  await page.getByRole('button', { name: 'Configure advisor fields', exact: true }).tap();
  await keyboard(page.getByText('6. Verified points', { exact: true }));
  const wholeField = page.getByRole('group', { name: 'Field 6', exact: true });
  await wholeField.getByLabel('Minimum (inclusive)', { exact: true }).fill('');
  await wholeField.getByLabel('Maximum (inclusive)', { exact: true }).fill('');
  await wholeField.getByRole('checkbox', { name: 'Answer required', exact: true }).check();
  await wholeField
    .getByLabel('Greater than (exclusive)', { exact: true })
    .fill(String(Number.MAX_SAFE_INTEGER));
  const beforeImpossible = (await (await context.request.get('/api/account-state')).json()).state;
  await page.getByRole('button', { name: 'Save report definition', exact: true }).tap();
  await expect(page.getByRole('alert')).toContainText(
    'Field 6: Numeric limits must allow at least one whole number.',
  );
  await expect(wholeField.getByLabel('Greater than (exclusive)', { exact: true })).toHaveValue(
    String(Number.MAX_SAFE_INTEGER),
  );
  expect((await (await context.request.get('/api/account-state')).json()).state).toEqual(
    beforeImpossible,
  );
  await settled(page);
  await expectResponsive(page, 'advisor-report-invalid-integer');
  await page.screenshot({ path: '.tmp/advisor-report-integer-rejection-mobile.png' });
  await wholeField
    .getByLabel('Greater than (exclusive)', { exact: true })
    .fill(String(Number.MAX_SAFE_INTEGER - 1));
  await page.getByRole('button', { name: 'Save report definition', exact: true }).tap();
  await expect(
    page.getByRole('status').filter({ hasText: 'Report definition saved.' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Use current definition for new draft', exact: true })
    .tap();
  await page
    .getByLabel('Practice — Verified points (required)', { exact: true })
    .fill(String(Number.MAX_SAFE_INTEGER));
  await page.getByRole('button', { name: 'Check preview answers', exact: true }).tap();
  await expect(
    page.getByRole('status').filter({ hasText: 'satisfy your configured field rules' }),
  ).toBeVisible();
});
