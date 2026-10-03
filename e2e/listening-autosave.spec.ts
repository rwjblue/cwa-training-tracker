import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { expectAccessible, signIn } from './helpers';

async function startListening(page: Page) {
  await page.getByRole('button', { name: 'Word listening', exact: true }).click();
  await page.getByRole('combobox', { name: 'Word list', exact: true }).selectOption('custom');
  // Native audio must actually move for listening credit. This track is long
  // enough to cross the autosave threshold without seeking or mocking time.
  await page.getByRole('textbox', { name: /^Your word list/ }).fill(Array(100).fill('E').join(' '));
  await page.getByRole('button', { name: 'Start practice', exact: true }).click();
  const audio = page.getByLabel('Practice audio', { exact: true });
  await expect(audio).toHaveAttribute('src', /^blob:/);
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(0);
  return audio;
}

async function navigateToLog(page: Page) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Practice log', exact: true }).click();
  await expect(page).toHaveURL(/#logbook$/);
}

test('listening tool changes save measured time once and recover a lost save response', async ({
  page,
  context,
}) => {
  test.setTimeout(75_000);
  await signIn(page);
  await page.getByRole('button', { name: 'Practice studio', exact: true }).click();
  // Opening an empty tool and switching must not create a junk entry.
  await page.getByRole('button', { name: 'Word listening', exact: true }).click();
  await page.getByRole('button', { name: 'QSO practice', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'QSO scenario', exact: true })).toBeVisible();
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(0);

  const audio = await startListening(page);
  const scratchpad = 'Automatic listening save keeps these notes.';
  await page.getByRole('textbox', { name: 'Scratchpad', exact: true }).fill(scratchpad);
  await expectAccessible(page, 'word-listening-autosave-desktop');

  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime), {
      timeout: 35_000,
    })
    .toBeGreaterThan(31);

  const submitted: Record<string, unknown>[] = [];
  let droppedResponse = false;
  await page.route('**/api/entries', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    submitted.push(route.request().postDataJSON());
    if (!droppedResponse) {
      droppedResponse = true;
      const committed = await route.fetch();
      expect(committed.ok()).toBe(true);
      return route.abort('failed');
    }
    return route.continue();
  });
  await page.getByRole('button', { name: 'Copy practice', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Copy practice', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => submitted.length).toBeGreaterThan(0);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => submitted.length).toBeGreaterThanOrEqual(2);
  expect(submitted[1]).toEqual(submitted[0]);
  const entries = (await (await context.request.get('/api/entries')).json()).entries;
  expect(entries).toHaveLength(1);
  const saved = entries[0];
  expect(saved.metadata.elapsedSeconds).toBeGreaterThanOrEqual(30);
  expect(saved.metadata.elapsedSeconds).toBeLessThan(36);
  expect(saved.minutes).toBeCloseTo(saved.metadata.elapsedSeconds / 60, 8);
  expect(saved.metadata.scratchpad).toBe(scratchpad);
  expect(saved.metadata.practiceTool).toBe('words');
  expect(saved.metadata.wordList).toBe('custom');
  await navigateToLog(page);
  await expect(page.getByText('Custom word recognition', { exact: false })).toBeVisible();
  await expectAccessible(page, 'listening-autosaved-history-desktop');
});

test('guest inspection retains listening and explicit Finish saves it on this device', async ({
  page,
  context,
}) => {
  test.setTimeout(75_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const posts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/entries')
      posts.push(request.url());
  });
  await page.goto('/#practice');
  // Opening an empty tool and switching must not create a junk entry.
  await page.getByRole('button', { name: 'Word listening', exact: true }).click();
  await page.getByRole('button', { name: 'QSO practice', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'QSO scenario', exact: true })).toBeVisible();
  const audio = await startListening(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expectAccessible(page, 'word-listening-autosave-mobile');

  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime), {
      timeout: 35_000,
    })
    .toBeGreaterThan(31);
  await navigateToLog(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Custom word recognition', { exact: false })).toHaveCount(0);
  const retained = page.getByRole('region', { name: 'Current practice block', exact: true });
  await expect(retained).toContainText('paused');
  await retained.getByRole('button', { name: 'Return to practice', exact: true }).click();
  await expect(audio).toBeVisible();
  expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  expect(await audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(
    31,
  );
  await page.getByRole('button', { name: 'Finish practice', exact: true }).click();
  await expect(retained).toHaveCount(0);
  await navigateToLog(page);
  await expect(page.getByText('Custom word recognition', { exact: false })).toHaveCount(1);
  await page.reload();
  await expect(page.getByText('Custom word recognition', { exact: false })).toHaveCount(1);
  expect((await context.request.get('/api/entries')).status()).toBe(401);
  expect(posts).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expectAccessible(page, 'listening-device-history-mobile');

  // Choosing a device entry to keep in the account uses the normal sign-in and
  // review flow; inspecting or finishing practice never prompts for an account.
  await page.getByRole('button', { name: /^Edit Head copy on / }).click();
  await signIn(page, { dialogAlreadyOpen: true });
  await expect(page.getByRole('dialog')).toContainText('Save practice');
  await page.getByRole('button', { name: 'Save practice', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const entries = (await (await context.request.get('/api/entries')).json()).entries;
  expect(entries).toHaveLength(1);
  expect(entries[0].metadata.elapsedSeconds).toBeGreaterThanOrEqual(30);
  expect(entries[0].metadata.elapsedSeconds).toBeLessThan(36);
  expect(posts).toHaveLength(1);
  await page.reload();
  await expect(page.getByText('Custom word recognition', { exact: false })).toHaveCount(1);
});
