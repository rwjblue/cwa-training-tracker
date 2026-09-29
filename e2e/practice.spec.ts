import { expect, test } from '@playwright/test';
import { expectAccessible, signIn } from './helpers';

test('practice preferences persist and generated material follows exact selected lengths', async ({
  page,
}) => {
  await page.goto('/#practice');
  await expect(page.getByRole('heading', { name: 'The listening room' })).toBeVisible();
  const characterSpeed = page.getByRole('slider', { name: 'Character speed', exact: true });
  const effectiveSpeed = page.getByRole('slider', { name: 'Effective speed', exact: true });
  await characterSpeed.press('End');
  await effectiveSpeed.press('End');
  await page.getByRole('slider', { name: 'Sidetone', exact: true }).press('Home');
  await page.getByRole('slider', { name: 'Volume', exact: true }).press('Home');
  await page.getByRole('combobox', { name: 'Word length', exact: true }).selectOption('3');
  let words = (await page.getByLabel('Practice text', { exact: true }).inputValue()).split(' ');
  expect(words).toHaveLength(12);
  expect(words.every((word) => word.length === 3 && /^[A-Z]+$/.test(word))).toBe(true);

  await page.reload();
  await expect(characterSpeed).toHaveValue('50');
  await expect(effectiveSpeed).toHaveValue('50');
  await expect(page.getByRole('slider', { name: 'Sidetone', exact: true })).toHaveValue('300');
  await expect(page.getByRole('slider', { name: 'Volume', exact: true })).toHaveValue('0');
  await expect(page.getByRole('combobox', { name: 'Word length', exact: true })).toHaveValue('3');
  words = (await page.getByLabel('Practice text', { exact: true }).inputValue()).split(' ');
  expect(words.every((word) => word.length === 3)).toBe(true);
  await characterSpeed.press('Home');
  await expect(characterSpeed).toHaveValue('5');
  await expect(effectiveSpeed).toHaveValue('5');
  await page.getByRole('combobox', { name: 'Word length', exact: true }).selectOption('8');
  expect(
    (await page.getByLabel('Practice text', { exact: true }).inputValue())
      .split(' ')
      .every((word) => word.length === 8),
  ).toBe(true);

  await page.getByRole('button', { name: 'Letter groups', exact: true }).click();
  await page.getByRole('combobox', { name: 'Letters per group', exact: true }).selectOption('3');
  expect(
    (await page.getByLabel('Practice text', { exact: true }).inputValue())
      .split(' ')
      .every((group) => /^[A-Z]{3}$/.test(group)),
  ).toBe(true);
  await page.getByRole('button', { name: 'Numbers', exact: true }).click();
  await page.getByRole('combobox', { name: 'Digits per group', exact: true }).selectOption('10');
  expect(
    (await page.getByLabel('Practice text', { exact: true }).inputValue())
      .split(' ')
      .every((group) => /^\d{10}$/.test(group)),
  ).toBe(true);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Digits per group', exact: true })).toHaveValue(
    '10',
  );
  await page.getByRole('button', { name: 'Callsigns', exact: true }).click();
  await expect(page.getByText(/fictional, randomly generated practice examples/)).toBeVisible();
  await page.getByRole('button', { name: 'Your text', exact: true }).click();
  await page.getByLabel('Practice text', { exact: true }).fill('MY PRIVATE PRACTICE TEXT');
  await page.reload();
  await expect(page.getByLabel('Practice text', { exact: true })).toHaveValue('');
  await expectAccessible(page, 'studio-preferences-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expectAccessible(page, 'studio-preferences-mobile');
  await page.screenshot({ path: '.tmp/practice-preferences-mobile.png', fullPage: true });
});

test('timer waits for explicit save, preserves seconds and pauses, and allows manual logging', async ({
  page,
  context,
}) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Practice studio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Time your practice.' })).toBeVisible();
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important}',
  });
  const time = new Date('2026-09-29T12:00:00Z');
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.getTime() + 1000));
  await page.getByRole('button', { name: 'Start timer', exact: true }).click();
  await page.clock.fastForward(83_000);
  await page.getByRole('button', { name: 'Pause timer', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Review & save 01:23', exact: true }),
  ).toBeEnabled();
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(0);
  await page.getByRole('button', { name: 'Review & save 01:23', exact: true }).click();
  expect(Number(await page.getByLabel(/^Time practiced/).inputValue())).toBeCloseTo(83 / 60, 8);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.clock.fastForward(120_000);
  await expect(
    page.getByRole('button', { name: 'Review & save 01:23', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Resume timer', exact: true }).click();
  await page.clock.fastForward(42_000);
  await page.getByRole('button', { name: 'Pause timer', exact: true }).click();
  await page.getByRole('button', { name: 'Review & save 02:05', exact: true }).click();
  await page.getByRole('button', { name: 'Save practice', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const timed = (await (await context.request.get('/api/entries')).json()).entries[0];
  expect(timed.minutes).toBeCloseTo(125 / 60, 10);
  expect(timed.metadata.elapsedSeconds).toBe(125);
  expect(timed.source).toBe('morse');
  await expect(
    page.getByRole('button', { name: 'Review & save session', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Start timer', exact: true })).toBeEnabled();

  await page.getByRole('button', { name: 'Log practice manually', exact: true }).click();
  await page.getByLabel(/^Time practiced/).fill('7');
  await page.getByRole('button', { name: 'Save practice', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const entries = (await (await context.request.get('/api/entries')).json()).entries;
  expect(entries).toHaveLength(2);
  expect(entries.find((entry: { source: string }) => entry.source === 'manual').minutes).toBe(7);
  await page.clock.resume();
});
