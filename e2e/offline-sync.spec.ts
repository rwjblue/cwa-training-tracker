import { expect, test } from '@playwright/test';
import { accountRequest, expectAccessible, signIn } from './helpers';

test.use({ hasTouch: true });

for (const mobile of [false, true]) {
  test(`finished results and account edits survive offline reopen (${mobile ? 'mobile touch' : 'desktop keyboard'})`, async ({
    page,
    context,
  }) => {
    await context.setExtraHTTPHeaders({
      'CF-Connecting-IP': mobile ? '192.0.2.112' : '192.0.2.111',
    });
    if (mobile) {
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await signIn(page);
    const navigate = async (name: string) => {
      if (mobile) await page.getByRole('button', { name: 'Open navigation', exact: true }).tap();
      const button = page.getByRole('button', { name, exact: true });
      if (mobile) await button.tap();
      else await button.click();
    };
    const task = {
      id: `offline-${mobile ? 'mobile' : 'desktop'}`,
      title: 'Offline sending exercise',
      kind: 'sending',
      done: false,
      notes: 'Synthetic queue practice',
      createdAt: new Date().toISOString(),
      source: 'manual',
    };
    expect((await accountRequest(context, 'POST', '/api/plan', { task })).ok()).toBe(true);
    await page.reload();
    const posted: unknown[] = [];
    context.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/entries' && request.method() === 'POST')
        posted.push(request.postDataJSON());
    });
    // Load the actual engine before disconnecting. Running-time recovery is excluded.
    await navigate('Practice studio');
    await page.getByRole('button', { name: 'Morse Runner', exact: true }).click();
    const runner = page.frameLocator('iframe[title="Web Morse Runner practice simulator"]');
    await expect(runner.getByRole('button', { name: /Run$/ })).toBeEnabled();
    await runner.getByRole('button', { name: /Run$/ }).click();
    await expect.poll(() => runner.locator('#clock').textContent()).not.toBe('00:00:00');
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Stop run', exact: true }).click();
    await page.getByRole('button', { name: 'Review & save run', exact: true }).click();
    await page.getByLabel(/^Notes/).fill('Offline real Runner result');
    const save = page.getByRole('button', { name: 'Save practice', exact: true });
    await save.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Practice upload status' })).toContainText(
      '1 practice result saved on this device.',
    );
    await navigate('Academy guide');
    await page.getByRole('button', { name: 'Whole course', exact: true }).click();
    await page.getByRole('button', { name: 'Log practice', exact: true }).click();
    await page.getByLabel('Time practiced', { exact: false }).fill('2:15');
    await page.getByLabel(/^Notes/).fill('Offline manual result');
    await page.getByRole('button', { name: 'Save practice', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await navigate('Academy guide');
    await page.getByRole('button', { name: 'Whole course', exact: true }).click();
    const complete = page.getByRole('checkbox', { name: 'Mark Offline sending exercise complete' });
    await complete.focus();
    await page.keyboard.press('Space');
    await page.getByRole('checkbox', { name: 'Show completed' }).check();
    await expect(
      page.getByRole('checkbox', { name: 'Mark Offline sending exercise incomplete' }),
    ).toBeChecked();
    await page
      .getByRole('checkbox', { name: 'Mark Offline sending exercise incomplete' })
      .uncheck();
    // Deleting its task must not strand the already frozen offline result.
    await page.getByRole('button', { name: `Delete ${task.title}`, exact: true }).click();
    await page.getByRole('button', { name: 'Delete exercise', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: task.title, exact: true })).toHaveCount(0);
    await navigate('Your account');
    await page.getByLabel('Name', { exact: true }).fill('Offline Student');
    await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Account sync status' })).toContainText(
      '4 account edits saved on this device.',
    );
    await expectAccessible(page, `offline-sync-${mobile ? 'mobile' : 'desktop'}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `.tmp/offline-sync-${mobile ? 'mobile' : 'desktop'}.png`,
      fullPage: true,
    });
    const frozen = await page.evaluate(() =>
      Object.entries(localStorage)
        .filter(([key]) => key.startsWith('cwa:practice:pending:v1:'))
        .map(([, value]) => JSON.parse(value)),
    );
    expect(frozen).toHaveLength(2);
    // Browser serves the already built shell while the API remains genuinely offline.
    const shell = await context.newPage();
    await shell.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/')) await route.abort('internetdisconnected');
      else await route.continue();
    });
    await page.close();
    await context.setOffline(false);
    await shell.goto('/#logbook');
    await expect(shell.getByRole('region', { name: 'Practice upload status' })).toContainText(
      '2 practice results saved on this device.',
    );
    await expect(shell.getByText('Offline manual result', { exact: true })).toBeVisible();
    await expect(shell.getByText('Offline real Runner result', { exact: true })).toBeVisible();
    await expect(shell.getByRole('region', { name: 'Account sync status' })).toContainText(
      '4 account edits saved on this device.',
    );
    await shell.unroute('**/*');
    await shell.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(shell.getByRole('region', { name: 'Account sync status' })).toHaveCount(0);
    await expect(shell.getByRole('region', { name: 'Practice upload status' })).toHaveCount(0);
    const entries = (await (await context.request.get('/api/entries')).json()).entries;
    expect(entries).toHaveLength(2);
    for (const entry of frozen) {
      const attempts = posted.filter(
        (body) => body && typeof body === 'object' && 'id' in body && body.id === entry.id,
      );
      expect(attempts.length).toBeGreaterThan(0);
      for (const body of attempts) expect(body).toEqual(entry);
      const expected = structuredClone(entry);
      if (expected.metadata?.plannedTaskId === task.id) {
        expected.historicalPlannedTaskId = task.id;
        delete expected.metadata.plannedTaskId;
      }
      expect(entries.find((saved: { id: string }) => saved.id === entry.id)).toEqual(expected);
    }
    const exported = await (await context.request.get('/api/export')).json();
    expect(
      exported.sessions.find((entry: { notes: string }) => entry.notes === 'Offline manual result'),
    ).toMatchObject({ historicalPlannedTaskId: task.id });
    const state = (await (await context.request.get('/api/account-state')).json()).state;
    expect(state.settings.displayName).toBe('Offline Student');
    expect(state.plan.find((item: { id: string }) => item.id === task.id)).toBeUndefined();
  });
}

test('a stale settings draft requires an explicit visible conflict decision', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.113' });
  await signIn(page);
  await page.getByRole('button', { name: 'Open your account', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Older tab name');
  const other = await context.newPage();
  await other.goto('/#settings');
  await other.getByLabel('Name', { exact: true }).fill('Newer confirmed name');
  await other.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await context.request.get('/api/account-state')).json()).state.settings.displayName,
    )
    .toBe('Newer confirmed name');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Older tab name');
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  const status = page.getByRole('region', { name: 'Account sync status' });
  await expect(status).toContainText('Conflicted');
  await expect(status).toContainText(
    'saved online Newer confirmed name; your edit Older tab name.',
  );
  expect(
    (await (await context.request.get('/api/account-state')).json()).state.settings.displayName,
  ).toBe('Newer confirmed name');
  await page.screenshot({ path: '.tmp/offline-conflict-desktop.png', fullPage: true });
  await status.getByRole('button', { name: 'Keep online version', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(status).toHaveCount(0);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Newer confirmed name');
  await page.getByLabel('Name', { exact: true }).fill('Deliberately reapplied name');
  await other.getByLabel(/^Daily practice goal/).fill('35');
  await other.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await context.request.get('/api/account-state')).json()).state.settings
          .dailyGoalMinutes,
    )
    .toBe(35);
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect(status).toContainText('Conflicted');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expectAccessible(page, 'offline-conflict-mobile');
  await page.screenshot({ path: '.tmp/offline-conflict-mobile.png', fullPage: true });
  await status.getByRole('button', { name: 'Apply my edit to this version', exact: true }).tap();
  await expect(status).toHaveCount(0);
  const reapplied = (await (await context.request.get('/api/account-state')).json()).state;
  expect(reapplied.settings).toMatchObject({
    displayName: 'Deliberately reapplied name',
    dailyGoalMinutes: 35,
  });
  await other.close();
});

test('a guest review stays open when durable storage fails and retries the frozen result', async ({
  page,
  context,
}) => {
  await page.goto('/#logbook');
  await page.getByRole('button', { name: 'Log practice', exact: true }).click();
  await page.getByLabel(/^Time practiced/).fill('1:23');
  const notes = page.getByLabel(/^Notes/);
  await notes.fill('Storage unavailable result');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Reflect.set(window, 'restoreSyntheticStorage', () => {
      Storage.prototype.setItem = original;
    });
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('cwa:practice:pending:v1:'))
        throw new DOMException('Synthetic storage full', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Save practice', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText('This browser could not save your result.');
  await expect(page.getByRole('alert')).toContainText('retained for an exact retry');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(notes).toBeDisabled();
  expect(
    await page.evaluate(
      () =>
        Object.keys(localStorage).filter((key) => key.startsWith('cwa:practice:pending:v1:'))
          .length,
    ),
  ).toBe(0);
  expect((await context.request.get('/api/entries')).status()).toBe(401);
  await page.evaluate(() =>
    (window as unknown as { restoreSyntheticStorage: () => void }).restoreSyntheticStorage(),
  );
  await page.getByRole('button', { name: 'Save practice', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Storage unavailable result', { exact: true })).toBeVisible();
  const local = await page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([key]) => key.startsWith('cwa:practice:pending:v1:'))
      .map(([, raw]) => JSON.parse(raw)),
  );
  expect(local).toHaveLength(1);
  expect(local[0]).toMatchObject({ notes: 'Storage unavailable result', minutes: 83 / 60 });
  await page.reload();
  await expect(page.getByText('Storage unavailable result', { exact: true })).toBeVisible();
});
