import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { readFile } from 'node:fs/promises';
import { WORD_LISTS } from '../src/client/word-content';
import { openDisclosure, expectResponsive, signIn } from './helpers';

test.use({ hasTouch: true, extraHTTPHeaders: { 'CF-Connecting-IP': '192.0.2.229' } });
const editor = (page: Page) => page.getByRole('textbox', { name: /^Your word list/ });
const list = (page: Page) => page.getByRole('combobox', { name: 'Word list', exact: true });
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.tap();
  await page.getByRole('button', { name, exact: true }).click();
}
async function openWords(page: Page) {
  await navigate(page, 'Practice studio');
  await page.getByRole('button', { name: 'Word listening', exact: true }).click();
}
async function pausedAtZero(page: Page) {
  const media = page.getByLabel('Practice audio', { exact: true });
  await expect.poll(() => media.evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);
  await expect.poll(() => media.evaluate((a: HTMLAudioElement) => a.currentTime)).toBe(0);
}
async function logout(page: Page) {
  await page.getByRole('button', { name: 'Open your account', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
}

test('editable source survives tool return, reopen/reload and device backup with explicit storage retry', async ({
  page,
}) => {
  await page.goto('/');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openWords(page);
  await list(page).selectOption('common-30');
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Shuffle list', exact: true }).check();
  await openDisclosure(page, 'Word list editor');
  await page.getByRole('button', { name: 'Edit this list', exact: true }).press('Enter');
  await expect(list(page)).toHaveValue('custom');
  await expect(editor(page)).toHaveValue(WORD_LISTS['common-30'].words.join(' '));
  const source = 'e E <AR> HW?';
  await editor(page).fill(source);
  await editor(page).fill('E 💡');
  await expect(page.getByRole('alert')).toContainText('Use letters');
  await page.getByRole('button', { name: 'Use saved words', exact: true }).press('Enter');
  await expect(editor(page)).toHaveValue(source);
  await editor(page).fill('');
  await expect(page.getByRole('alert')).toContainText('last valid saved words');
  await page.getByRole('button', { name: 'Use saved words', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'QSO practice', exact: true }).click();
  await page.getByRole('button', { name: 'Word listening', exact: true }).click();
  await expect(editor(page)).toHaveValue(source);
  await pausedAtZero(page);
  await page.getByRole('button', { name: 'Finish practice', exact: true }).click();
  await openWords(page);
  await expect(editor(page)).toHaveValue(source);
  await page.reload();
  await openWords(page);
  await expect(editor(page)).toHaveValue(source);
  await pausedAtZero(page);
  await expectResponsive(page, 'word-source-retained');

  await navigate(page, 'This device');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download device backup', exact: true }).press('Enter');
  const file = await download;
  const bytes = await readFile((await file.path())!);
  const backup = JSON.parse(bytes.toString());
  expect(backup.scope.id).toBe('guest');
  expect(backup.stores.wordContent).toEqual({ version: 1, wordList: 'custom', customText: source });
  expect(backup.stores.practice).toEqual([]);
  await page.keyboard.press('Escape');
  await openWords(page);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    const remove = Storage.prototype.removeItem;
    Reflect.set(window, 'refuseWordWrites', true);
    Reflect.set(window, 'refuseWordClear', false);
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('cwa.words.content.v1:') && Reflect.get(window, 'refuseWordWrites'))
        throw new Error('Synthetic word storage refusal');
      return set.call(this, key, value);
    };
    Storage.prototype.removeItem = function (key) {
      if (key.startsWith('cwa.words.content.v1:') && Reflect.get(window, 'refuseWordClear'))
        throw new Error('Synthetic word clear refusal');
      return remove.call(this, key);
    };
  });
  await editor(page).fill('T T <BT>');
  await expect(page.getByRole('alert')).toContainText('Words were not saved');
  await page.getByRole('button', { name: 'QSO practice', exact: true }).click();
  await page.getByRole('button', { name: 'Word listening', exact: true }).click();
  await expect(editor(page)).toHaveValue('T T <BT>');
  await expect(page.getByRole('alert')).toContainText('Words were not saved');
  await page.getByRole('button', { name: 'Finish practice', exact: true }).click();
  await openWords(page);
  await expect(editor(page)).toHaveValue('T T <BT>');
  await expect(page.getByRole('alert')).toContainText('Words were not saved');
  await page.getByRole('button', { name: 'Retry saving words', exact: true }).press('Enter');
  await expect(page.getByRole('alert')).toContainText('Words were not saved');
  await expectResponsive(page, 'word-source-storage-failure');
  await page.evaluate(() => Reflect.set(window, 'refuseWordWrites', false));
  await page.getByRole('button', { name: 'Retry saving words', exact: true }).press('Enter');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.evaluate(() => Reflect.set(window, 'refuseWordClear', true));
  await openDisclosure(page, 'Word list editor');
  await page.getByRole('button', { name: 'Clear saved words', exact: true }).press('Enter');
  await expect(page.getByRole('alert')).toContainText('could not be cleared');
  await expect(editor(page)).toHaveValue('T T <BT>');
  await page.evaluate(() => Reflect.set(window, 'refuseWordClear', false));
  await openDisclosure(page, 'Word list editor');
  await page.getByRole('button', { name: 'Clear saved words', exact: true }).press('Enter');
  await expect(list(page)).toHaveValue('common-qso');
  await list(page).selectOption('custom');
  await editor(page).fill('T T <BT>');
  await page.reload();
  await openWords(page);
  await expect(editor(page)).toHaveValue('T T <BT>');
  await navigate(page, 'This device');
  await page
    .getByLabel('Choose a device backup file', { exact: true })
    .setInputFiles({ name: 'synthetic-words.json', mimeType: 'application/json', buffer: bytes });
  await expect(
    page.getByText('Your current saved words and list selection differ;', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel restore', exact: true }).press('Enter');
  await page
    .getByLabel('Choose a device backup file', { exact: true })
    .setInputFiles({ name: 'synthetic-words.json', mimeType: 'application/json', buffer: bytes });
  await page.getByRole('button', { name: 'Restore device work', exact: true }).press('Enter');
  await expect(
    page.getByRole('status').filter({ hasText: 'Current saved words were kept.' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await openWords(page);
  await expect(editor(page)).toHaveValue('T T <BT>');
  await page.setViewportSize({ width: 390, height: 844 });
  await openDisclosure(page, 'Word list editor');
  await page.getByRole('button', { name: 'Clear saved words', exact: true }).tap();
  await expect(list(page)).toHaveValue('common-qso');
  await navigate(page, 'This device');
  await page
    .getByLabel('Choose a device backup file', { exact: true })
    .setInputFiles({ name: 'synthetic-words.json', mimeType: 'application/json', buffer: bytes });
  await page.getByRole('button', { name: 'Restore device work', exact: true }).tap();
  await page.keyboard.press('Escape');
  await openWords(page);
  await expect(editor(page)).toHaveValue(source);
  await pausedAtZero(page);
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Shuffle list', exact: true }).uncheck();
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Repeat list', exact: true }).uncheck();
  await page.getByText('View word list', { exact: true }).click();
  expect(await page.getByRole('button', { name: /^Seek to word \d+:/ }).allTextContents()).toEqual([
    'E',
    'E',
    '<AR>',
    'HW?',
  ]);
  await page.getByRole('button', { name: 'Start practice', exact: true }).tap();
  await expect
    .poll(() =>
      page
        .getByLabel('Practice audio', { exact: true })
        .evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThan(0.1);
  await page.getByRole('button', { name: 'Pause practice', exact: true }).tap();
  expect(await page.getByRole('button', { name: /^Seek to word \d+:/ }).allTextContents()).toEqual([
    'E',
    'E',
    '<AR>',
    'HW?',
  ]);
});

test('guest and two accounts retain only their private device words without implicit upload', async ({
  page,
  context,
}) => {
  const sentBodies: string[] = [];
  page.on('request', (request) => {
    const body = request.postData();
    if (body) sentBodies.push(body);
  });
  await page.goto('/');
  await openWords(page);
  await list(page).selectOption('custom');
  await editor(page).fill('GUESTWORD E E');
  const emailA = `words-a-${crypto.randomUUID()}@example.test`;
  await signIn(page, { email: emailA });
  await openWords(page);
  await expect(list(page)).toHaveValue('common-qso');
  await list(page).selectOption('custom');
  await expect(editor(page)).toHaveValue('');
  await editor(page).fill('ALPHAALPHA E E');
  const accountA = (await (await context.request.get('/api/me')).json()).user.id;
  await page.reload();
  await openWords(page);
  await expect(editor(page)).toHaveValue('ALPHAALPHA E E');
  await pausedAtZero(page);
  await expectResponsive(page, 'word-source-private');
  await logout(page);
  await openWords(page);
  await expect(editor(page)).toHaveValue('GUESTWORD E E');
  await signIn(page);
  await openWords(page);
  await expect(list(page)).toHaveValue('common-qso');
  await list(page).selectOption('custom');
  await expect(editor(page)).toHaveValue('');
  await editor(page).fill('BRAVOBRAVO E E');
  await openDisclosure(page, 'Word list editor');
  await page.getByRole('button', { name: 'Clear saved words', exact: true }).press('Enter');
  await expect(list(page)).toHaveValue('common-qso');
  expect(
    await page.evaluate(
      (scope) =>
        JSON.parse(localStorage.getItem(`cwa.words.content.v1:${encodeURIComponent(scope)}`)!),
      accountA,
    ),
  ).toEqual({ version: 1, wordList: 'custom', customText: 'ALPHAALPHA E E' });
  await logout(page);
  await openWords(page);
  await expect(editor(page)).toHaveValue('GUESTWORD E E');
  expect(sentBodies.join('\n')).not.toMatch(/GUESTWORD|ALPHAALPHA|BRAVOBRAVO/);
  expect(page.url()).not.toMatch(/GUESTWORD|ALPHAALPHA|BRAVOBRAVO/);
});
