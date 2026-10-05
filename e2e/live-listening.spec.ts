import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import {
  openDisclosure,
  openPracticeTool,
  navigateView,
  expectResponsive,
  signIn,
} from './helpers';
import { morseTimeline } from '../src/client/audio';

test.use({ hasTouch: true, extraHTTPHeaders: { 'CF-Connecting-IP': '192.0.2.226' } });
async function studio(page: Page, tool: string) {
  await signIn(page);
  await openPracticeTool(page, tool);
  const settings = page.locator('details').filter({ has: page.getByText(/^Sound settings ·/) });
  await settings.getByText(/^Sound settings ·/).click();
}
const audioAt = (page: Page) => page.getByLabel('Practice audio', { exact: true });
const state = (page: Page) =>
  audioAt(page).evaluate((audio: HTMLAudioElement) => ({
    at: audio.currentTime,
    paused: audio.paused,
    source: audio.src,
    volume: audio.volume,
  }));

test('native word speed edits preserve heard timing, paused position and continuous volume', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await studio(page, 'Word listening');
  await page.getByRole('combobox', { name: 'Word list', exact: true }).selectOption('custom');
  await page.getByRole('textbox', { name: /^Your word list/ }).fill('PARIS E PARIS E');
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Shuffle list', exact: true }).uncheck();
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Repeat list', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Reveal text', exact: true }).click();
  await page.getByRole('button', { name: 'Start practice', exact: true }).click();
  await audioAt(page).evaluate((audio: HTMLAudioElement) => {
    audio.playbackRate = 1.25;
  });
  await expect.poll(async () => (await state(page)).at).toBeGreaterThan(0.3);
  const before = await state(page);
  await page.getByRole('slider', { name: 'Character speed', exact: true }).press('End');
  await expect.poll(async () => (await state(page)).source).not.toBe(before.source);
  expect((await state(page)).at).toBeGreaterThanOrEqual(before.at - 0.02);
  await expect.poll(async () => (await state(page)).paused).toBe(false);
  await expect(
    page.getByRole('button', { name: 'Seek to word 1: PARIS', exact: true }),
  ).toHaveAttribute('aria-current', 'true');
  await page.getByRole('button', { name: 'Pause practice', exact: true }).click();
  const paused = await state(page);
  const metadata = await page.evaluate(() => ({
    title: navigator.mediaSession.metadata?.title,
    artwork: navigator.mediaSession.metadata?.artwork,
  }));
  expect(metadata.title).toBe('Your word list');
  expect(metadata.artwork?.length).toBeGreaterThan(0);
  await page.getByRole('slider', { name: 'Effective speed', exact: true }).press('End');
  await expect.poll(async () => (await state(page)).source).not.toBe(paused.source);
  expect((await state(page)).paused).toBe(true);
  expect((await state(page)).at).toBeCloseTo(paused.at, 3);
  expect(await audioAt(page).evaluate((audio: HTMLAudioElement) => audio.playbackRate)).toBe(1.25);
  expect(
    await page.evaluate(() => ({
      title: navigator.mediaSession.metadata?.title,
      artwork: navigator.mediaSession.metadata?.artwork,
    })),
  ).toEqual(metadata);
  expect(await page.evaluate(() => navigator.mediaSession.playbackState)).toBe('paused');
  const volumeSource = (await state(page)).source;
  await page.getByRole('slider', { name: 'Volume', exact: true }).press('Home');
  expect((await state(page)).volume).toBe(0);
  expect((await state(page)).source).toBe(volumeSource);
  await page.getByRole('slider', { name: 'Volume', exact: true }).press('End');
  expect((await state(page)).volume).toBe(1);
  await page.getByRole('button', { name: /^(Start|Resume) practice$/, exact: true }).click();
  await expect.poll(async () => (await state(page)).at).toBeGreaterThan(paused.at + 0.25);
  const playing = await state(page);
  await page.getByRole('slider', { name: 'Volume', exact: true }).press('ArrowLeft');
  expect((await state(page)).source).toBe(playing.source);
  expect((await state(page)).paused).toBe(false);
  await expect
    .poll(
      () =>
        page
          .getByRole('button', { name: 'Seek to word 2: E', exact: true })
          .getAttribute('aria-current'),
      {
        timeout:
          Math.ceil(
            (morseTimeline('PARIS', 20, 10).duration + morseTimeline('PARIS', 20, 10).wordGap + 1) *
              1000,
          ) + 3000,
      },
    )
    .toBe('true');
  await page.getByRole('button', { name: 'Pause practice', exact: true }).click();
  await expectResponsive(page, 'live-word-retimed');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Review & save', exact: true }).tap();
  const review = page.getByRole('dialog');
  await expect(review).toContainText('20 character / 10 effective WPM');
  await expect(review).toContainText('60 character / 60 effective WPM');
  await review.evaluate((element) =>
    Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)),
  );
  await expectResponsive(page, 'live-word-review');
  await review.getByRole('button', { name: 'Cancel', exact: true }).tap();
  await expect(page.getByRole('textbox', { name: /^Your word list/ })).toHaveValue(
    'PARIS E PARIS E',
  );
  await page.getByRole('button', { name: 'Review & save', exact: true }).tap();
  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/entries' &&
      response.request().method() === 'POST' &&
      [200, 201].includes(response.status()),
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Save practice', exact: true }).tap();
  await saved;
  const response = await context.request.get('/api/entries');
  const entries = (await response.json()).entries;
  const evidence = entries.find(
    (entry: { metadata?: { evidence?: { generatedListening?: unknown } } }) =>
      entry.metadata?.evidence?.generatedListening,
  )?.metadata.evidence;
  expect(evidence.wordListeningSeconds).toBeGreaterThan(1);
  expect(evidence.wordListeningSeconds).toBeCloseTo(evidence.measurement.seconds, 6);
  expect(
    evidence.generatedListening.summaries.map(
      (summary: { entryCount: number }) => summary.entryCount,
    ),
  ).toEqual([4, 4]);
});

test('native QSO retiming retains exact occurrence and rejects canceled asynchronous resumes', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await studio(page, 'QSO practice');
  await page.getByRole('combobox', { name: 'QSO scenario', exact: true }).selectOption('repeat');
  await page.getByRole('button', { name: 'Reveal text', exact: true }).click();
  await page.getByRole('button', { name: 'Start practice', exact: true }).click();
  await expect.poll(async () => (await state(page)).at).toBeGreaterThan(0.25);
  const occurrence = page.getByRole('button', { name: /^Seek to word 3:/ });
  const exactName = await occurrence.getAttribute('aria-label');
  await occurrence.focus();
  await page.keyboard.press('Enter');
  await expect(occurrence).toHaveAttribute('aria-current', 'true');
  await page.getByRole('button', { name: 'Pause practice', exact: true }).click();
  const paused = await state(page);
  await page.getByRole('slider', { name: 'Effective speed', exact: true }).press('ArrowRight');
  await expect.poll(async () => (await state(page)).source).not.toBe(paused.source);
  expect((await state(page)).paused).toBe(true);
  await expect(page.getByRole('button', { name: exactName!, exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await page.getByRole('button', { name: /^(Start|Resume) practice$/, exact: true }).click();
  await expect.poll(async () => (await state(page)).paused).toBe(false);
  const old = await state(page);
  await page.getByRole('slider', { name: 'Character speed', exact: true }).press('ArrowRight');
  await expect.poll(async () => (await state(page)).source).not.toBe(old.source);
  await expect.poll(async () => (await state(page)).paused).toBe(false);
  await expect(page.getByRole('button', { name: exactName!, exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  );
  // Delay only native play acknowledgement; all heard time still comes from actual media.
  await audioAt(page).evaluate((audio: HTMLAudioElement) => {
    const play = audio.play;
    audio.play = function () {
      audio.play = play;
      const actual = play.call(audio);
      return new Promise<void>((resolve, reject) => {
        Reflect.set(window, 'resolveRetimedPlay', () => actual.then(resolve, reject));
      });
    };
  });
  await page.getByRole('slider', { name: 'Effective speed', exact: true }).press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Pause practice', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause practice', exact: true }).click();
  await page.evaluate(() => Reflect.get(window, 'resolveRetimedPlay')());
  await expect.poll(async () => (await state(page)).paused).toBe(true);
  await expect(
    page.getByRole('button', { name: /^(Start|Resume) practice$/, exact: true }),
  ).toBeVisible();
  await expectResponsive(page, 'live-qso-paused');
  await page.setViewportSize({ width: 390, height: 844 });
  await navigateView(page, 'Today', (control) => control.tap());
  const retained = page.getByRole('region', { name: 'Current practice block', exact: true });
  await retained.getByRole('button', { name: 'Return to practice', exact: true }).tap();
  expect((await state(page)).paused).toBe(true);
  await expect(page.getByRole('button', { name: exactName!, exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  );
});

test('a last-word speed edit applies on the next native loop and explicit ended replay', async ({
  page,
}) => {
  test.setTimeout(45_000);
  await studio(page, 'Word listening');
  await page.getByRole('combobox', { name: 'Word list', exact: true }).selectOption('custom');
  await page.getByRole('textbox', { name: /^Your word list/ }).fill('E');
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Shuffle list', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Start practice', exact: true }).click();
  await expect.poll(async () => (await state(page)).at).toBeGreaterThan(0.1);
  const duration = await audioAt(page).evaluate((audio: HTMLAudioElement) => audio.duration);
  await page.getByRole('slider', { name: 'Effective speed', exact: true }).press('End');
  await expect
    .poll(() => audioAt(page).evaluate((audio: HTMLAudioElement) => audio.duration))
    .toBeCloseTo(duration, 3);
  await expect
    .poll(() => audioAt(page).evaluate((audio: HTMLAudioElement) => audio.duration))
    .toBeLessThan(duration - 0.2);
  expect((await state(page)).paused).toBe(false);
  await page.getByRole('button', { name: 'Pause practice', exact: true }).click();
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Repeat list', exact: true }).uncheck();
  await page.getByRole('button', { name: /^(Start|Resume) practice$/, exact: true }).click();
  await expect.poll(async () => (await state(page)).at).toBeGreaterThan(0.1);
  const lastDuration = await audioAt(page).evaluate((audio: HTMLAudioElement) => audio.duration);
  await page.getByRole('slider', { name: 'Character speed', exact: true }).press('End');
  await page.getByRole('slider', { name: 'Effective speed', exact: true }).press('End');
  await expect
    .poll(() => audioAt(page).evaluate((audio: HTMLAudioElement) => audio.ended))
    .toBe(true);
  expect((await state(page)).paused).toBe(true);
  await page.getByRole('button', { name: /^(Start|Resume) practice$/, exact: true }).click();
  await expect
    .poll(() => audioAt(page).evaluate((audio: HTMLAudioElement) => audio.duration))
    .toBeLessThan(lastDuration - 0.1);
  await expect.poll(async () => (await state(page)).paused).toBe(false);
  await page.getByRole('button', { name: 'Pause practice', exact: true }).click();
});

test('explicit keyboard and native rewinds retain a mixed word prefix near the loop seam', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await studio(page, 'Word listening');
  await page.getByRole('combobox', { name: 'Word list', exact: true }).selectOption('custom');
  await page.getByRole('textbox', { name: /^Your word list/ }).fill('PARIS E');
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Shuffle list', exact: true }).uncheck();
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Repeat list', exact: true }).check();
  await page.getByText('View word list', { exact: true }).click();
  await page.getByRole('button', { name: 'Start practice', exact: true }).click();
  await expect.poll(async () => (await state(page)).at).toBeGreaterThan(1.1);
  await page.getByRole('slider', { name: 'Character speed', exact: true }).press('End');
  await page.getByRole('slider', { name: 'Effective speed', exact: true }).press('End');
  await expect
    .poll(() => audioAt(page).evaluate((a: HTMLAudioElement) => a.readyState))
    .toBeGreaterThan(0);
  const source = (await state(page)).source;
  const duration = await audioAt(page).evaluate((a: HTMLAudioElement) => a.duration);
  const first = page.getByRole('button', { name: 'Seek to word 1: PARIS', exact: true });
  await first.focus();
  for (const operation of ['keyboard', 'native'] as const) {
    // Arrange the boundary only. The tested rewind is a real control action;
    // neither the media clock nor the heard-time owner is fast-forwarded.
    await audioAt(page).evaluate((a: HTMLAudioElement) => {
      a.currentTime = a.duration - 0.35;
    });
    await expect.poll(() => audioAt(page).evaluate((a: HTMLAudioElement) => a.seeking)).toBe(false);
    if (operation === 'keyboard') await first.press('Enter');
    else {
      // Chromium native controls have no DOM locator for their shadow seek bar.
      const box = (await audioAt(page).boundingBox())!;
      await audioAt(page).click({ position: { x: 130, y: box.height / 2 } });
    }
    await expect.poll(async () => (await state(page)).at).toBeLessThan(0.5);
    expect((await state(page)).source).toBe(source);
    expect((await state(page)).paused).toBe(false);
    expect(await audioAt(page).evaluate((a: HTMLAudioElement) => a.duration)).toBeCloseTo(
      duration,
      3,
    );
  }
  await page.getByRole('button', { name: 'Pause practice', exact: true }).click();
  await page.getByRole('button', { name: 'Review & save', exact: true }).first().click();
  const review = page.getByRole('dialog');
  const saved = page.waitForResponse(
    (response) => response.url().endsWith('/api/entries') && response.request().method() === 'POST',
  );
  await review.getByRole('button', { name: 'Save practice', exact: true }).click();
  expect((await saved).ok()).toBe(true);
  const entries = await (await page.request.get('/api/entries')).json();
  const measured = entries.entries[0].metadata.evidence.wordListeningSeconds;
  expect(measured).toBeGreaterThan(1);
  expect(measured).toBeLessThan(4);
});
