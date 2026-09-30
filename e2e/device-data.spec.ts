import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expectAccessible, scopedRequest, signIn } from './helpers';

test.use({ hasTouch: true });

async function navigate(page: Page, name: string, touch: boolean) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) {
    if (touch) await menu.tap();
    else await menu.click();
  }
  const button = page.getByRole('button', { name, exact: true });
  if (touch) await button.tap();
  else {
    await button.focus();
    await page.keyboard.press('Enter');
  }
}

async function downloadDevice(page: Page) {
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download device backup', exact: true }).click();
  const file = await downloaded;
  return { bytes: await readFile((await file.path())!), name: file.suggestedFilename() };
}

async function chooseBackup(page: Page, bytes: Buffer, name = 'synthetic-device.json') {
  await page.getByLabel('Choose a device backup file', { exact: true }).setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: bytes,
  });
}

for (const mobile of [false, true]) {
  test(`device backup, reviewed restore and scoped clear (${mobile ? 'mobile touch' : 'desktop keyboard'})`, async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await context.setExtraHTTPHeaders({
      'CF-Connecting-IP': mobile ? '192.0.2.132' : '192.0.2.131',
    });
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto('/#logbook');
    await page.getByRole('button', { name: 'Log practice', exact: true }).click();
    await page.getByLabel(/^Time practiced/).fill('0:43');
    await page.getByLabel(/^Notes/).fill('Guest work must survive account-only clear');
    await page.getByRole('button', { name: 'Save practice', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await navigate(page, 'This device', mobile);
    const guestFile = await downloadDevice(page);
    const guestBackup = JSON.parse(guestFile.bytes.toString());
    expect(guestBackup.scope.id).toBe('guest');
    expect(guestBackup.stores.practice).toHaveLength(1);
    if (mobile) await page.getByRole('button', { name: 'Close dialog', exact: true }).tap();
    else await page.keyboard.press('Escape');
    const guestKeys = await page.evaluate(() =>
      Object.entries(localStorage).filter(([key]) =>
        key.startsWith('cwa:practice:pending:v1:guest:'),
      ),
    );

    await signIn(page);
    const scope = (await (await context.request.get('/api/me')).json()).user.id as string;
    expect(
      (
        await scopedRequest(context, 'POST', '/api/entries', {
          id: `device-confirmed-${mobile}`,
          date: '2026-09-30',
          kind: 'other',
          minutes: 1,
          notes: 'Confirmed history stays on the server',
          createdAt: '2026-09-30T12:00:00.000Z',
          source: 'manual',
        })
      ).ok(),
    ).toBe(true);
    await page.reload();
    await context.route('**/api/entries', (route) =>
      route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue(),
    );
    await context.route('**/api/account-operations', (route) => route.abort('internetdisconnected'));
    await page.getByRole('button', { name: 'Log practice', exact: true }).first().click();
    await page.getByLabel(/^Time practiced/).fill('1:17');
    await page.getByLabel(/^Notes/).fill('Pending device result retains exact identity');
    await page.getByRole('button', { name: 'Save practice', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await navigate(page, 'Your account', mobile);
    await page.getByLabel('Name', { exact: true }).fill('Queued device preference');
    await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Account sync status' })).toContainText(
      '1 account edit',
    );
    await navigate(page, 'Practice studio', mobile);
    await page.getByRole('button', { name: 'Word listening', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Scratchpad', exact: true })
      .fill('Retained listening notes without invented time');
    await page.getByText(/^Sound settings ·/).click();
    const tone = page.getByRole('slider', { name: 'Sidetone', exact: true });
    await tone.focus();
    await page.keyboard.press('Home');
    for (let index = 0; index < 16; index++) await page.keyboard.press('ArrowRight');
    await expect(tone).toHaveValue('700');
    await page.getByRole('button', { name: 'Copy practice', exact: true }).click();
    await page.getByRole('combobox', { name: 'Target duration', exact: true }).selectOption('10');
    await page.getByRole('button', { name: 'Start code groups', exact: true }).click();
    await page.getByRole('textbox', { name: 'Your copy', exact: true }).fill('ES');
    await expect
      .poll(() =>
        page
          .getByLabel('Copy practice audio', { exact: true })
          .evaluate((audio: HTMLAudioElement) => audio.currentTime),
      )
      .toBeGreaterThan(0);
    await page.getByText('Notes (optional)', { exact: true }).click();
    await page
      .getByLabel('Notes for this round', { exact: true })
      .fill('A paused retained copy draft');
    await navigate(page, 'This device', mobile);
    const file = await downloadDevice(page);
    const backup = JSON.parse(file.bytes.toString());
    expect(backup.format).toBe('cwa-device');
    expect(backup.scope.id).toBe(scope);
    expect(backup.stores.practice).toHaveLength(1);
    expect(backup.stores.accountOperations).toHaveLength(1);
    expect(backup.stores.copyDraft.answer).toBe('ES');
    expect(backup.stores.copyDraft.notes).toBe('A paused retained copy draft');
    expect(
      backup.stores.scratchpads.some(
        (note: { text: string }) => note.text === 'Retained listening notes without invented time',
      ),
    ).toBe(true);
    expect(backup.shared.practicePreferences.tone).toBe(700);
    expect(file.bytes.toString()).not.toContain('cwa:account:active');
    expect(
      await page
        .getByLabel('Copy practice audio', { exact: true })
        .evaluate((audio: HTMLAudioElement) => audio.paused),
    ).toBe(true);
    await expectAccessible(page, `device-inventory-${mobile ? 'mobile' : 'desktop'}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const clear = page.getByRole('button', { name: 'Clear local device work', exact: true });
    expect((await clear.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({
      path: `.tmp/device-inventory-${mobile ? 'mobile' : 'desktop'}.png`,
      fullPage: true,
    });
    await clear.click();
    await page.getByRole('button', { name: 'Cancel clear', exact: true }).click();
    expect(
      await page.evaluate(
        (id) =>
          Object.keys(localStorage).filter((key) =>
            key.startsWith(`cwa:practice:pending:v1:${id}:`),
          ).length,
        scope,
      ),
    ).toBe(1);

    // Clear from another tab while the original copy owner remains mounted.
    const clearer = await context.newPage();
    await clearer.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await clearer.goto('/');
    await navigate(clearer, 'This device', mobile);
    await clearer.getByRole('button', { name: 'Clear local device work', exact: true }).click();
    if (mobile) await clearer.getByRole('button', { name: 'Clear device work', exact: true }).tap();
    else {
      await clearer.getByRole('button', { name: 'Clear device work', exact: true }).focus();
      await clearer.keyboard.press('Enter');
    }
    await expect(
      clearer.getByRole('status').filter({ hasText: 'Device work cleared for' }),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Copy practice', exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Practice upload status' })).toHaveCount(0);
    const afterClear = await page.evaluate(
      (id) => ({
        results: Object.keys(localStorage).filter((key) =>
          key.startsWith(`cwa:practice:pending:v1:${id}:`),
        ),
        draft: localStorage.getItem(`cwa:copy:v1:${id}`),
        guests: Object.entries(localStorage).filter(([key]) =>
          key.startsWith('cwa:practice:pending:v1:guest:'),
        ),
        defaults: JSON.parse(localStorage.getItem('cwa.practice.preferences.v1')!),
      }),
      scope,
    );
    expect(afterClear.results).toEqual([]);
    expect(afterClear.draft).toBeNull();
    expect(afterClear.guests).toEqual(guestKeys);
    expect(afterClear.defaults.tone).toBe(700);
    expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(1);
    await clearer.close();

    await chooseBackup(page, Buffer.from('{malformed'));
    await expect(page.getByRole('alert')).toContainText(/JSON|backup/);
    const wrongAccount = { ...backup, scope: { ...backup.scope, id: 'different-account' } };
    await chooseBackup(page, Buffer.from(JSON.stringify(wrongAccount)));
    await expect(page.getByRole('alert')).toContainText(/account|scope/i);
    expect(
      await page.evaluate((id) => localStorage.getItem(`cwa:copy:v1:${id}`), scope),
    ).toBeNull();
    await page.evaluate(() => {
      const preferences = JSON.parse(localStorage.getItem('cwa.practice.preferences.v1')!);
      localStorage.setItem(
        'cwa.practice.preferences.v1',
        JSON.stringify({ ...preferences, tone: 750 }),
      );
      const original = Storage.prototype.setItem;
      Reflect.set(window, 'restoreSyntheticDeviceStorage', () => {
        Storage.prototype.setItem = original;
      });
      let refuse = true;
      Storage.prototype.setItem = function (key, value) {
        if (refuse && key.startsWith('cwa:practice:origin:v1:')) {
          refuse = false;
          throw new DOMException('Synthetic restore storage refusal', 'QuotaExceededError');
        }
        original.call(this, key, value);
      };
    });
    await chooseBackup(page, file.bytes);
    await page.getByRole('button', { name: 'Restore device work', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(/restor|update|rolled|storage/i);
    expect(
      await page.evaluate(
        (id) =>
          Object.keys(localStorage).filter((key) =>
            key.startsWith(`cwa:practice:pending:v1:${id}:`),
          ).length,
        scope,
      ),
    ).toBe(0);
    await page.evaluate(() =>
      (
        window as unknown as { restoreSyntheticDeviceStorage: () => void }
      ).restoreSyntheticDeviceStorage(),
    );
    await page.getByRole('button', { name: 'Restore device work', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Device work restored for' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem('cwa.practice.preferences.v1')!).tone,
      ),
    ).toBe(750);
    await chooseBackup(page, file.bytes);
    const replace = page.getByRole('checkbox', {
      name: 'Replace the current copy draft with the draft in this backup',
      exact: true,
    });
    if (await replace.isVisible()) await replace.check();
    await page
      .getByRole('checkbox', {
        name: 'Also restore shared device preferences used by every account',
        exact: true,
      })
      .check();
    await page.getByRole('button', { name: 'Restore device work', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Device work restored for' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem('cwa.practice.preferences.v1')!).tone,
      ),
    ).toBe(700);
    const restored = await page.evaluate(
      (id) =>
        Object.entries(localStorage).filter(([key]) =>
          key.startsWith(`cwa:practice:pending:v1:${id}:`),
        ),
      scope,
    );
    expect(restored).toHaveLength(1);
    expect(restored[0][1]).toBe(backup.stores.practice[0].body);
    expect(
      await page.evaluate(
        (id) => JSON.parse(localStorage.getItem(`cwa:copy:v1:${id}`)!).attempt.id,
        scope,
      ),
    ).toBe(backup.stores.copyDraft.attempt.id);
    await expectAccessible(page, `device-restored-${mobile ? 'mobile' : 'desktop'}`);
    await page.screenshot({
      path: `.tmp/device-restored-${mobile ? 'mobile' : 'desktop'}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Your copy', exact: true })).toHaveValue('ES');
    await context.unroute('**/api/entries');
    await context.unroute('**/api/account-operations');
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect
      .poll(async () => (await (await context.request.get('/api/entries')).json()).entries.length)
      .toBe(2);
    await expect(page.getByRole('region', { name: 'Practice upload status' })).toHaveCount(0);
    const saved = (await (await context.request.get('/api/entries')).json()).entries;
    expect(
      saved.filter((entry: { id: string }) => entry.id === backup.stores.practice[0].id),
    ).toHaveLength(1);
  });
}

test('local clear suppresses a lost acknowledgement and identifies its possible server commit', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.133' });
  await signIn(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let committedId = '';
  await page.route('**/api/entries', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    committedId = route.request().postDataJSON().id;
    await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.getByRole('button', { name: 'Log practice', exact: true }).first().click();
  await page.getByLabel(/^Time practiced/).fill('1:17');
  await page.getByLabel(/^Notes/).fill('Committed result with a held acknowledgement');
  await page.getByRole('button', { name: 'Save practice', exact: true }).click();
  await expect.poll(() => committedId).not.toBe('');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await navigate(page, 'This device', false);
  await page.getByRole('button', { name: 'Clear local device work', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Confirm local clear' })).toContainText(
    'may already be stored on the server',
  );
  await page.getByRole('button', { name: 'Clear device work', exact: true }).click();
  await page.getByText(/^Request identities with an uncertain server outcome/).click();
  await expect(page.getByText(`Practice: ${committedId}`, { exact: true })).toBeVisible();
  release();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Practice upload status' })).toHaveCount(0);
  await expect(
    page.getByText('Committed result with a held acknowledgement', { exact: true }),
  ).toHaveCount(0);
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(1);
  await page.reload();
  await navigate(page, 'Practice log', false);
  await expect(
    page.getByText('Committed result with a held acknowledgement', { exact: true }),
  ).toBeVisible();
});
