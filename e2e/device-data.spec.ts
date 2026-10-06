import { expect, type Locator, type Page } from '@playwright/test';
import { test } from './fixtures';
import { readFile } from 'node:fs/promises';
import {
  expectAccessible,
  expectResponsive,
  openDisclosure,
  openPracticeTool,
  scopedRequest,
  signIn,
} from './helpers';

test.use({ hasTouch: true });

async function navigate(page: Page, name: string, touch: boolean) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) {
    if (touch) await menu.tap();
    else await menu.click();
  }
  const button = page.getByRole(
    ['Your account', 'This device'].includes(name) ? 'button' : 'link',
    { name, exact: true },
  );
  await expect(button).toBeEnabled();
  if (touch) await button.tap();
  else {
    await button.focus();
    await page.keyboard.press('Enter');
  }
}

async function activateDeviceControl(page: Page, control: Locator, touch: boolean) {
  if (touch) {
    await control.scrollIntoViewIfNeeded();
    const bounds = await control.boundingBox();
    expect(bounds).not.toBeNull();
    await page.touchscreen.tap(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  } else {
    await control.focus();
    await page.keyboard.press('Enter');
  }
}

async function downloadDevice(page: Page, touch?: boolean) {
  const downloaded = page.waitForEvent('download');
  const control = page.getByRole('button', { name: 'Download device backup', exact: true });
  if (touch === undefined) await control.click();
  else await activateDeviceControl(page, control, touch);
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

const mobile = false;

test(`device backup, reviewed restore and scoped clear (desktop keyboard)`, async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await context.setExtraHTTPHeaders({
    'CF-Connecting-IP': '192.0.2.131',
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#logbook');
  await page.getByRole('button', { name: 'Log practice', exact: true }).click();
  await page.getByLabel(/^Time practiced/).fill('0:43');
  await page.getByLabel(/^Notes/).fill('Guest work must survive account-only clear');
  await page.getByRole('button', { name: 'Save practice', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await navigate(page, 'This device', mobile);
  const closeDialog = page.getByRole('button', { name: 'Close dialog', exact: true });
  const clearLocal = page.getByRole('button', { name: 'Clear local device work', exact: true });
  await expect(closeDialog).toBeFocused();
  await expect(page.getByRole('region', { name: 'Scoped device work', exact: true })).toBeVisible();
  await clearLocal.focus();
  await page.keyboard.press('Tab');
  await expect(closeDialog).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(clearLocal).toBeFocused();
  const guestFile = await downloadDevice(page);
  const guestBackup = JSON.parse(guestFile.bytes.toString());
  expect(guestBackup.scope.id).toBe('guest');
  expect(guestBackup.stores.practice).toHaveLength(1);
  await page.keyboard.press('Escape');
  const guestKeys = await page.evaluate(() =>
    Object.entries(localStorage).filter(([key]) =>
      key.startsWith('cwa:practice:pending:v1:guest:'),
    ),
  );

  await signIn(page);
  const scope = (await (await context.request.get('/api/me')).json()).user.id as string;
  const signInNotice = page.getByRole('status').filter({ hasText: 'You’re signed in.' });
  await navigate(page, 'This device', mobile);
  await expect(page.getByRole('region', { name: 'Scoped device work', exact: true })).toBeVisible();
  await expect(signInNotice).toBeVisible();
  const accountFile = await downloadDevice(page, mobile);
  expect(JSON.parse(accountFile.bytes.toString()).scope.id).toBe(scope);
  await expect(signInNotice).toBeVisible();
  const chosen = page.waitForEvent('filechooser');
  await activateDeviceControl(
    page,
    page.getByRole('button', { name: 'Choose device backup', exact: true }),
    mobile,
  );
  await (
    await chosen
  ).setFiles({
    name: accountFile.name,
    mimeType: 'application/json',
    buffer: accountFile.bytes,
  });
  await expect(page.getByRole('region', { name: 'Review device restore' })).toBeVisible();
  await expect(signInNotice).toBeVisible();
  await activateDeviceControl(
    page,
    page.getByRole('button', { name: 'Cancel restore', exact: true }),
    mobile,
  );
  await expect(page.getByRole('region', { name: 'Review device restore' })).toHaveCount(0);
  await page.keyboard.press('Escape');
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
  await openPracticeTool(page, 'Word listening', async (control) => {
    if (mobile) await control.tap();
    else {
      await control.focus();
      await control.press('Enter');
    }
  });
  await page
    .getByRole('textbox', { name: 'Scratchpad', exact: true })
    .fill('Retained listening notes without invented time');
  await page.getByText(/^Sound settings ·/).click();
  const tone = page.getByRole('slider', { name: 'Sidetone', exact: true });
  await page.getByRole('checkbox', { name: 'Variable pitch', exact: true }).uncheck();
  await tone.press('End');
  await expect(tone).toHaveValue('1000');
  await openPracticeTool(page, 'Copy practice');
  await openDisclosure(page, 'Round settings');
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
  expect(backup.shared.practicePreferences.tone).toBe(1000);
  expect(file.bytes.toString()).not.toContain('cwa:account:active');
  expect(
    await page
      .getByLabel('Copy practice audio', { exact: true })
      .evaluate((audio: HTMLAudioElement) => audio.paused),
  ).toBe(true);
  await expectResponsive(page, `device-inventory-desktop`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const clear = page.getByRole('button', { name: 'Clear local device work', exact: true });
  expect((await clear.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  // Exercise the mobile confirmation controls without replaying backup/restore.
  await page.setViewportSize({ width: 390, height: 844 });
  await clear.tap();
  await page.getByRole('button', { name: 'Cancel clear', exact: true }).tap();
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(
    await page.evaluate(
      (id) =>
        Object.keys(localStorage).filter((key) => key.startsWith(`cwa:practice:pending:v1:${id}:`))
          .length,
      scope,
    ),
  ).toBe(1);

  // Clear from another tab while the original copy owner remains mounted.
  const clearer = await context.newPage();
  await clearer.setViewportSize({ width: 1440, height: 1000 });
  await clearer.goto('/');
  await navigate(clearer, 'This device', mobile);
  await clearer.getByRole('button', { name: 'Clear local device work', exact: true }).click();

  await clearer.getByRole('button', { name: 'Clear device work', exact: true }).focus();
  await clearer.keyboard.press('Enter');

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
  expect(afterClear.defaults.tone).toBe(1000);
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(1);
  await clearer.close();

  await chooseBackup(page, Buffer.from('{malformed'));
  await expect(page.getByRole('alert')).toContainText(/JSON|backup/);
  const wrongAccount = { ...backup, scope: { ...backup.scope, id: 'different-account' } };
  await chooseBackup(page, Buffer.from(JSON.stringify(wrongAccount)));
  await expect(page.getByRole('alert')).toContainText(/account|scope/i);
  expect(await page.evaluate((id) => localStorage.getItem(`cwa:copy:v1:${id}`), scope)).toBeNull();
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
        Object.keys(localStorage).filter((key) => key.startsWith(`cwa:practice:pending:v1:${id}:`))
          .length,
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
  ).toBe(1000);
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
  await expectAccessible(page, `device-restored-desktop`);

  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await openPracticeTool(page, 'Copy practice', (control) =>
    activateDeviceControl(page, control, mobile),
  );
  await expect(page.getByRole('textbox', { name: 'Your copy', exact: true })).toHaveValue('ES');
  await expect(
    page.getByText('Copy practice is open in another tab.', { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Resume audio', exact: true })).toBeEnabled();
  const restoredAudio = page.getByLabel('Copy practice audio', { exact: true });
  const restoredPosition = await restoredAudio.evaluate(
    (audio: HTMLAudioElement) => audio.currentTime,
  );
  const resumeAudio = page.getByRole('button', { name: 'Resume audio', exact: true });

  await resumeAudio.focus();
  await page.keyboard.press('Enter');

  await expect
    .poll(() => restoredAudio.evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(restoredPosition);
  await page.getByRole('button', { name: 'Pause audio', exact: true }).click();
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

test('guest restore remains usable after clearing account context and reopening with disconnected APIs', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.134' });
  await page.goto('/#logbook');
  await page.getByRole('button', { name: 'Log practice', exact: true }).click();
  await page.getByLabel(/^Time practiced/).fill('0:42');
  await page.getByLabel(/^Notes/).fill('Guest recovery is independent of account cache');
  await page.getByRole('button', { name: 'Save practice', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await navigate(page, 'This device', false);
  const guestFile = await downloadDevice(page);
  await page.keyboard.press('Escape');
  await signIn(page);
  const accountId = (await (await context.request.get('/api/me')).json()).user.id as string;
  await navigate(page, 'This device', false);
  await page.getByRole('button', { name: 'Clear local device work', exact: true }).click();
  await page.getByRole('button', { name: 'Clear device work', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Device work cleared for' }),
  ).toBeVisible();
  expect(
    await page.evaluate((id) => localStorage.getItem(`cwa:account:identity:v1:${id}`), accountId),
  ).toBeNull();
  await context.route('**/api/**', (route) => route.abort('internetdisconnected'));
  const reopened = await context.newPage();
  await reopened.goto('/#logbook');
  await navigate(reopened, 'This device', false);
  await expect(reopened.getByRole('dialog')).toContainText('Guest — this browser');
  await chooseBackup(reopened, guestFile.bytes);
  await expect(reopened.getByRole('region', { name: 'Review device restore' })).toBeVisible();
  await reopened.getByRole('button', { name: 'Restore device work', exact: true }).click();
  await expect(
    reopened.getByRole('status').filter({ hasText: 'Device work restored for Guest' }),
  ).toBeVisible();
  expect(await reopened.evaluate(() => localStorage.getItem('cwa:account:active:v1'))).toBe(
    accountId,
  );
  expect(JSON.parse(guestFile.bytes.toString()).scope.id).toBe('guest');
  await reopened.close();
});
