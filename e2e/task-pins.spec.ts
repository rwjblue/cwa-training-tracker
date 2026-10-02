import { readFile } from 'node:fs/promises';
import { expect, test, type Locator } from '@playwright/test';
import { accountRequest, scopedRequest, expectResponsive, signIn } from './helpers';
import { DEFAULT_PROFILE, type TrainingExport } from '../src/shared/training';
import type { PlannedTask } from '../src/shared/plan';
import type { AccountOperation } from '../src/shared/account-sync';

test.use({ hasTouch: true });

test('Today pins preserve original work through dismissal, retry, backup, timezone changes and local midnight', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.127' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  await page.clock.install({ time: new Date('2026-10-08T03:59:59Z') });
  await page.clock.setFixedTime(new Date('2026-10-08T03:59:59Z'));
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        settings: { ...DEFAULT_PROFILE, timezone: 'America/New_York' },
      })
    ).ok(),
  ).toBe(true);
  const task: PlannedTask = {
    id: 'pin-earlier',
    title: 'Original earlier sending',
    kind: 'sending',
    dueDate: '2026-10-05',
    done: false,
    notes: 'Original assignment instructions',
    createdAt: '2026-10-01T12:00:00.000Z',
  };
  const dismissed = {
    ...task,
    id: 'pin-dismissed',
    title: 'Dismissed earlier sending',
    dismissedFromToday: true,
  };
  for (const item of [task, dismissed])
    expect((await accountRequest(context, 'POST', '/api/plan', { task: item })).status()).toBe(201);
  const entry = {
    id: 'pin-original-history',
    date: '2026-10-05',
    kind: 'sending',
    minutes: 2,
    notes: 'Original saved history',
    createdAt: '2026-10-05T12:00:00.000Z',
    metadata: { plannedTaskId: task.id, practicePurpose: 'assigned' },
  };
  expect((await scopedRequest(context, 'POST', '/api/entries', entry)).status()).toBe(201);
  const originalHistory = (await (await context.request.get('/api/entries')).json()).entries;
  await page.reload();
  let mobile = false;
  const activate = async (control: Locator) => {
    await expect(control).toBeEnabled();
    if (mobile) await control.tap();
    else {
      await control.focus();
      await expect(control).toBeFocused();
      await page.keyboard.press('Enter');
    }
  };
  const navigate = async (name: string) => {
    const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (await menu.isVisible()) await activate(menu);
    await activate(page.getByRole('button', { name, exact: true }));
  };
  const today = page.getByRole('region', { name: 'What should I do today?', exact: true });
  const pinned = today.getByRole('region', { name: 'Added to today', exact: true });
  const row = (title: string) =>
    page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  const plan = async (): Promise<PlannedTask[]> =>
    (await (await context.request.get('/api/plan')).json()).plan;
  await activate(today.locator('summary').filter({ hasText: 'Earlier unfinished work' }));
  await activate(row(task.title).getByRole('button', { name: 'Add to today', exact: true }));
  await expect(
    today.getByRole('heading', { name: 'What should I do today?', exact: true }),
  ).toBeFocused();
  await expect(pinned).toContainText(task.title);
  await expect(pinned).toContainText('Pinned for today');
  await expect(pinned).toContainText('2 min practiced');
  await expectResponsive(page, 'task-pin-today');
  await today.screenshot({ path: '.tmp/parity-queue/issue-23-today-desktop.png' });
  await navigate('Academy guide');
  await activate(row(dismissed.title).getByRole('button', { name: 'Add to today', exact: true }));
  await expect(row(dismissed.title)).toContainText('Dismissed from Today');
  await expect(row(dismissed.title)).toContainText('Pinned for today');
  await expectResponsive(page, 'task-pin-dismissed-plan');
  await navigate('Today');
  await activate(
    row(dismissed.title).getByRole('button', { name: 'Remove from today', exact: true }),
  );
  await expect(pinned.getByRole('heading', { name: dismissed.title, exact: true })).toHaveCount(0);
  await expect(
    today.getByRole('heading', { name: 'What should I do today?', exact: true }),
  ).toBeFocused();
  await activate(row(task.title).getByRole('button', { name: 'Remove from today', exact: true }));
  await expect(pinned).toHaveCount(0);
  await activate(today.locator('summary').filter({ hasText: 'Earlier unfinished work' }));
  await activate(today.getByRole('button', { name: 'Dismiss earlier work', exact: true }));
  await expect(today).toContainText('1 earlier exercise is hidden');
  await page.setViewportSize({ width: 390, height: 844 });
  mobile = true;
  await navigate('Academy guide');
  await activate(row(task.title).getByRole('button', { name: 'Restore to Today', exact: true }));
  await expect(row(task.title).getByText('Dismissed from Today', { exact: true })).toHaveCount(0);
  const posted: AccountOperation[] = [];
  await page.route('**/api/account-operations', (route) => {
    posted.push(route.request().postDataJSON());
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Synthetic pin save unavailable' }),
    });
  });
  await activate(row(task.title).getByRole('button', { name: 'Add to today', exact: true }));
  const sync = page.getByRole('region', { name: 'Account sync status', exact: true });
  await expect(sync).toContainText('Waiting to sync');
  await expect(sync).toContainText('Synthetic pin save unavailable');
  await expect(row(task.title)).toContainText('Waiting to sync');
  expect((await plan()).find((item) => item.id === task.id)).not.toHaveProperty('pinnedForDate');
  await navigate('Today');
  await expect(pinned).toContainText('Waiting to sync');
  await expectResponsive(page, 'task-pin-pending');
  await page.reload();
  await expect(pinned).toContainText(task.title);
  const frozen = posted[0];
  expect(frozen.change).toEqual({
    type: 'task-edit',
    id: task.id,
    changes: { pinnedForDate: '2026-10-07' },
  });
  await page.unroute('**/api/account-operations');
  const retried = page.waitForRequest(
    (request) => request.url().endsWith('/api/account-operations') && request.method() === 'POST',
  );
  await activate(sync.getByRole('button', { name: 'Retry account sync', exact: true }));
  expect((await retried).postDataJSON()).toEqual(frozen);
  await expect(sync).toHaveCount(0);
  const saved = (await plan()).find((item) => item.id === task.id)!;
  expect(saved).toEqual({ ...task, dismissedFromToday: false, pinnedForDate: '2026-10-07' });
  await navigate('Your account');
  const download = page.waitForEvent('download');
  await activate(page.getByRole('button', { name: 'Export backup', exact: true }));
  const exported: TrainingExport = JSON.parse(
    await readFile((await (await download).path())!, 'utf8'),
  );
  expect(exported.plan?.find((item) => item.id === task.id)).toEqual(saved);
  expect(exported.sessions).toEqual(originalHistory);
  const file = {
    ...exported,
    plan: [{ ...saved, id: 'pin-restored', title: 'Restored dated pin' }],
  };
  const choose = page.waitForEvent('filechooser');
  await activate(page.getByRole('button', { name: 'Import backup', exact: true }));
  await (
    await choose
  ).setFiles({
    name: 'synthetic-pins.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  const dialog = page.getByRole('dialog', { name: 'Bring your practice along.', exact: true });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() =>
      dialog.evaluate((element) =>
        element
          .getAnimations({ subtree: true })
          .every((animation) => animation.playState !== 'running'),
      ),
    )
    .toBe(true);
  await expectResponsive(page, 'task-pin-import-review');
  await activate(dialog.getByRole('button', { name: 'Cancel', exact: true }));
  expect((await plan()).some((item) => item.id === 'pin-restored')).toBe(false);
  const again = page.waitForEvent('filechooser');
  await activate(page.getByRole('button', { name: 'Import backup', exact: true }));
  await (
    await again
  ).setFiles({
    name: 'synthetic-pins.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await activate(dialog.getByRole('button', { name: 'Import sessions', exact: true }));
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(async () => (await plan()).find((item) => item.id === 'pin-restored')?.pinnedForDate)
    .toBe('2026-10-07');
  const timezone = page.getByRole('combobox', { name: 'Practice timezone', exact: true });
  await timezone.selectOption('UTC');
  await activate(page.getByRole('button', { name: 'Save preferences', exact: true }));
  await navigate('Today');
  await expect(pinned).toHaveCount(0);
  expect((await plan()).find((item) => item.id === task.id)?.pinnedForDate).toBe('2026-10-07');
  await navigate('Your account');
  await timezone.selectOption('America/New_York');
  await activate(page.getByRole('button', { name: 'Save preferences', exact: true }));
  await navigate('Today');
  await expect(pinned).toContainText(task.title);
  await expect(pinned).toContainText('Restored dated pin');
  await today.screenshot({ path: '.tmp/parity-queue/issue-23-today-mobile.png' });
  await page.clock.setFixedTime(new Date('2026-10-08T04:00:00Z'));
  await page.clock.runFor(1001);
  await expect(pinned).toHaveCount(0);
  await activate(today.locator('summary').filter({ hasText: 'Earlier unfinished work' }));
  await expect(
    row(task.title).getByRole('button', { name: 'Add to today', exact: true }),
  ).toBeVisible();
  await expectResponsive(page, 'task-pin-expired');
  expect((await plan()).find((item) => item.id === task.id)).toEqual(saved);
  expect((await (await context.request.get('/api/entries')).json()).entries).toEqual(
    originalHistory,
  );
});
