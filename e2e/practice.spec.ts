import { expect, test } from '@playwright/test';
import { expectAccessible, signIn } from './helpers';

test('practice preferences persist and generated material follows exact selected lengths', async ({
  page,
}) => {
  await page.goto('/#practice');
  await expect(page.getByRole('heading', { name: 'The listening room' })).toBeVisible();
  await page.getByRole('button', { name: 'Free practice', exact: true }).click();
  await page.getByText(/^Sound settings ·/).click();
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
  await page.getByText(/^Sound settings ·/).click();
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
  await page.goto('/#practice');
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
  expect((await context.request.get('/api/entries')).status()).toBe(401);
  await page.getByRole('button', { name: 'Review & save 01:23', exact: true }).click();
  await signIn(page, { dialogAlreadyOpen: true });
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
  await page.getByRole('textbox', { name: 'Scratchpad', exact: true }).fill('Unsaved copy notes');
  await page.getByRole('button', { name: 'Morse Runner', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'current session before opening Morse Runner',
  );
  await expect(page.getByRole('textbox', { name: 'Scratchpad', exact: true })).toHaveValue(
    'Unsaved copy notes',
  );
  await page.getByRole('button', { name: 'Reset session', exact: true }).click();
  await page.getByRole('button', { name: 'Discard & reset', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Scratchpad', exact: true })).toHaveValue('');
});

test('word and QSO trainers expose the complete material and remember listening choices', async ({
  page,
}) => {
  await page.goto('/#practice');
  await page.getByRole('button', { name: 'Word trainer', exact: true }).click();
  const list = page.getByRole('combobox', { name: 'Word list', exact: true });
  await expect(list).toHaveValue('common-qso');
  await page.getByText('View word list', { exact: true }).click();
  const vocabulary = page.locator('.trainer-catalog p');
  expect((await vocabulary.innerText()).trim().split(/\s+/)).toHaveLength(70);
  await page.getByRole('checkbox', { name: 'Shuffle list', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Reveal text', exact: true }).click();
  await page.getByRole('button', { name: 'Start practice', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause practice', exact: true })).toBeVisible();
  await expect(page.locator('.trainer-current')).toHaveText('VVV');
  await page.getByRole('button', { name: 'Pause practice', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play Morse', exact: true })).toBeVisible();
  await list.selectOption('common-30');
  expect((await vocabulary.innerText()).trim().split(/\s+/)).toHaveLength(30);
  await page.getByRole('combobox', { name: 'Extra word pause', exact: true }).selectOption('2');
  await page.reload();
  await expect(list).toHaveValue('common-30');
  await expect(page.getByRole('combobox', { name: 'Extra word pause', exact: true })).toHaveValue(
    '2',
  );
  await expect(page.getByRole('checkbox', { name: 'Shuffle list', exact: true })).not.toBeChecked();

  await list.selectOption('custom');
  await expect(page.getByRole('textbox', { name: /^Your word list/ })).toBeVisible();
  await page.getByRole('textbox', { name: /^Your word list/ }).fill('E T');
  await expect(vocabulary).toContainText('E T');

  await page.getByRole('button', { name: 'QSO practice', exact: true }).click();
  await page.getByRole('combobox', { name: 'QSO scenario', exact: true }).selectOption('ragchew');
  await expect(page.getByText(/A fictional (spring|summer|autumn|winter) contact/)).toBeVisible();
  await page.getByText('View full conversation', { exact: true }).click();
  const conversation = page.locator('.trainer-catalog p');
  const first = await conversation.innerText();
  expect(first).toContain('RIG HR');
  expect(first).toContain('WX');
  expect(first).toContain('<SK>');
  await page.getByRole('button', { name: 'New QSO', exact: true }).click();
  await expect(conversation).not.toHaveText(first);
  await page.getByRole('button', { name: 'Play Morse', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeVisible();
  const media = page.getByLabel('Practice audio', { exact: true });
  await expect(media).toHaveAttribute('src', /^blob:/);
  await expect
    .poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title))
    .toBe('Rigs, antennas, and weather');
  expect(await page.evaluate(() => navigator.mediaSession.metadata?.artist)).toBe(
    'CW Academy Companion',
  );
  // Real, same-origin PNGs are usable by the OS independently of the page favicon.
  expect(
    await page.evaluate(async () => {
      return Promise.all(
        (navigator.mediaSession.metadata?.artwork ?? []).map(async (art) => {
          const image = new Image();
          image.src = art.src;
          await image.decode();
          return [image.naturalWidth, image.naturalHeight];
        }),
      );
    }),
  ).toEqual([
    [512, 512],
    [192, 192],
  ]);
  await expect
    .poll(() => media.evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(0);
  const laterWord = conversation.getByRole('button', { name: /^Play from word 12:/ });
  await laterWord.click();
  await expect(laterWord).toHaveAttribute('aria-current', 'true');
  await expect
    .poll(() => media.evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(10);
  await conversation.getByRole('button', { name: 'Play from word 1: CQ', exact: true }).click();
  await expect
    .poll(() => media.evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeLessThan(2);
  // Native controls and the app controls share one playback state and resume position.
  await media.evaluate((element: HTMLAudioElement) => element.pause());
  await expect(page.getByRole('button', { name: 'Play Morse', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Play Morse', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
  await expectAccessible(page, 'qso-desktop');
  await page.screenshot({ path: '.tmp/qso-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectAccessible(page, 'qso-mobile');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: '.tmp/qso-mobile.png', fullPage: true });
});
