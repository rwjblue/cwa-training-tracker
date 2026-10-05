import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { openDisclosure, navigateView, expectResponsive, signIn } from './helpers';
import { observeNativeMovement, readNativeMovement } from './native-movement';

test.use({ hasTouch: true, extraHTTPHeaders: { 'CF-Connecting-IP': '192.0.2.228' } });
const media = (page: Page) => page.getByLabel('Practice audio', { exact: true });
const state = (page: Page) =>
  media(page).evaluate((a: HTMLAudioElement) => ({
    source: a.src,
    at: a.currentTime,
    paused: a.paused,
    duration: a.duration,
    ended: a.ended,
    volume: a.volume,
    rate: a.playbackRate,
  }));
const list = (page: Page) =>
  page.getByRole('button', { name: /^Seek to word \d+:/ }).allTextContents();
async function words(page: Page) {
  await page.getByRole('button', { name: 'Word listening', exact: true }).click();
  await page.getByRole('combobox', { name: 'Word list', exact: true }).selectOption('custom');
  await page.getByRole('textbox', { name: /^Your word list/ }).fill('PARIS E PARIS <AR>');
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Shuffle list', exact: true }).uncheck();
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Repeat list', exact: true }).check();
  const settings = page.locator('details').filter({ has: page.getByText(/^Sound settings ·/) });
  await settings.getByText(/^Sound settings ·/).click();
  await page.getByRole('slider', { name: 'Character speed', exact: true }).press('End');
  await page.getByRole('slider', { name: 'Effective speed', exact: true }).press('End');
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page
    .getByRole('spinbutton', { name: 'Extra word pause exact (seconds)', exact: true })
    .fill('0.5');
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page
    .getByRole('spinbutton', { name: 'Extra word pause exact (seconds)', exact: true })
    .press('Enter');
  await page.getByText('View word list', { exact: true }).click();
}

test('native repeated rounds use fresh source order and count only actual boundary movement', async ({
  page,
  context,
}) => {
  await signIn(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Practice studio', exact: true }).click();
  await words(page);
  await observeNativeMovement(media(page));
  // Observe real native tails before source replacement; do not forge end events.
  await media(page).evaluate((a: HTMLAudioElement) => {
    const completed: number[] = [];
    Reflect.set(window, 'completedNativeRoundSeconds', completed);
    a.addEventListener('ended', () => completed.push(a.duration), { capture: true });
  });
  await page.getByRole('button', { name: 'Start practice', exact: true }).click();
  await expect.poll(async () => (await state(page)).at).toBeGreaterThan(0.25);
  const first = await state(page);
  const ordered = ['PARIS', 'E', 'PARIS', '<AR>'];
  expect(await list(page)).toEqual(ordered);
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Shuffle list', exact: true }).press('Space');
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Repeat list', exact: true }).press('Space');
  expect((await state(page)).source).toBe(first.source);
  expect((await state(page)).paused).toBe(false);
  expect(await list(page)).toEqual(ordered);
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Repeat list', exact: true }).press('Space');
  await expect
    .poll(async () => (await state(page)).source, {
      timeout: Math.ceil(first.duration * 1000) + 3000,
    })
    .not.toBe(first.source);
  await expect.poll(async () => (await state(page)).at).toBeGreaterThan(0.2);
  await page.getByRole('button', { name: 'Pause practice', exact: true }).click();
  const second = await state(page);
  const shuffled = await list(page);
  expect([...shuffled].sort()).toEqual([...ordered].sort());
  await expectResponsive(page, 'repeat-round-paused');
  await page.setViewportSize({ width: 390, height: 844 });
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Shuffle list', exact: true }).tap();
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Repeat list', exact: true }).tap();
  expect((await state(page)).source).toBe(second.source);
  expect((await state(page)).at).toBeCloseTo(second.at, 3);
  expect((await state(page)).paused).toBe(true);
  expect(await list(page)).toEqual(shuffled);
  await page.getByRole('button', { name: /^(Start|Resume) practice$/, exact: true }).tap();
  await expect
    .poll(async () => (await state(page)).ended, {
      timeout: Math.ceil(second.duration * 1000) + 3000,
    })
    .toBe(true);
  expect((await state(page)).source).toBe(second.source);
  expect((await state(page)).paused).toBe(true);
  const finished = await page.evaluate(
    () => Reflect.get(window, 'completedNativeRoundSeconds') as number[],
  );
  expect(finished).toHaveLength(2);
  // Third round remains ordered with Shuffle off, without disturbing the saved
  // completed measurements. New round is an explicit learner action.
  await page.getByRole('button', { name: 'New round', exact: true }).tap();
  expect(await list(page)).toEqual(ordered);
  await page.getByRole('button', { name: 'Review & save', exact: true }).tap();
  const review = page.getByRole('dialog');
  await review.evaluate((e) =>
    Promise.all(e.getAnimations({ subtree: true }).map((a) => a.finished)),
  );
  await review.getByRole('button', { name: 'Cancel', exact: true }).tap();
  await page.getByRole('button', { name: 'Review & save', exact: true }).tap();
  const saved = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/entries' && r.request().method() === 'POST',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Save practice', exact: true }).tap();
  expect((await saved).ok()).toBe(true);
  const entries = (await (await context.request.get('/api/entries')).json()).entries;
  const evidence = entries[0].metadata.evidence;
  const actualTails = finished.reduce((sum, seconds) => sum + seconds, 0);
  const observed = await readNativeMovement(page);
  const observedMovement = observed.seconds;
  // Native resume can settle ahead before its playing event. That unobserved
  // pause/resume gap is excluded; compare actual playing intervals, not file length.
  try {
    expect(observedMovement).toBeGreaterThan(1);
    expect(observedMovement).toBeLessThanOrEqual(actualTails);
    expect(Math.abs(evidence.wordListeningSeconds - observedMovement)).toBeLessThan(0.02);
    expect(evidence.wordListeningSeconds).toBeCloseTo(evidence.measurement.seconds, 6);
    expect(
      evidence.generatedListening.summaries.map((s: { shuffle: boolean }) => s.shuffle),
    ).toEqual([false, true]);
  } catch (error) {
    await test.info().attach('native-boundary-evidence', {
      body: JSON.stringify(
        { finished, observed, observedMovement, heard: evidence.wordListeningSeconds },
        null,
        2,
      ),
      contentType: 'application/json',
    });
    throw error;
  }
});

test('next-round failure retries visibly and cancels late native continuation on pause and source change', async ({
  page,
}) => {
  await page.goto('/#practice');
  await page.setViewportSize({ width: 390, height: 844 });
  await words(page);
  await page.getByRole('textbox', { name: /^Your word list/ }).fill('E T');
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Shuffle list', exact: true }).check();
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Shuffle list', exact: true }).uncheck();
  // Start immediately, without waiting for the regenerated catalog to render.
  await page.getByRole('button', { name: 'Start practice', exact: true }).press('Enter');
  await expect.poll(async () => (await state(page)).at).toBeGreaterThan(0.15);
  const first = await state(page);
  await page.evaluate(() => {
    const create = URL.createObjectURL;
    URL.createObjectURL = function () {
      URL.createObjectURL = create;
      throw new Error('Synthetic next-round preparation unavailable.');
    };
  });
  await expect(page.getByRole('button', { name: 'Retry next round', exact: true })).toBeVisible();
  expect((await state(page)).paused).toBe(true);
  expect((await state(page)).source).toBe(first.source);
  await expect(
    page.getByRole('alert').filter({ hasText: 'Earned listening time is retained.' }),
  ).toBeVisible();
  await expectResponsive(page, 'repeat-error');
  await page.setViewportSize({ width: 390, height: 844 });
  const holdAcknowledgement = async () =>
    media(page).evaluate((a: HTMLAudioElement) => {
      const play = a.play;
      a.play = function () {
        a.play = play;
        const actual = play.call(a);
        return new Promise<void>((resolve, reject) => {
          Reflect.set(window, 'releaseRepeatedPlay', () => actual.then(resolve, reject));
        });
      };
    });
  await media(page).evaluate((a: HTMLAudioElement) => {
    a.volume = 0.3;
    a.playbackRate = 1.5;
  });
  await holdAcknowledgement();
  await page.getByRole('button', { name: 'Retry next round', exact: true }).press('Enter');
  await expect.poll(async () => (await state(page)).at).toBeGreaterThan(0.1);
  expect((await state(page)).source).not.toBe(first.source);
  expect((await state(page)).volume).toBe(0.3);
  expect((await state(page)).rate).toBe(1.5);
  await expect(
    page.getByRole('alert').filter({ hasText: 'Synthetic next-round preparation unavailable.' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Pause practice', exact: true }).tap();
  await page.evaluate(() => (Reflect.get(window, 'releaseRepeatedPlay') as () => void)());
  expect((await state(page)).paused).toBe(true);
  const orderedSource = (await state(page)).source;
  await page.getByRole('button', { name: /^(Start|Resume) practice$/, exact: true }).tap();
  await expect.poll(async () => (await state(page)).source).not.toBe(orderedSource);
  await expect.poll(async () => (await state(page)).at).toBeGreaterThan(0.1);
  expect((await state(page)).volume).toBe(0.3);
  expect((await state(page)).rate).toBe(1.5);
  await page.getByRole('button', { name: 'Pause practice', exact: true }).tap();
  expect(await list(page)).toEqual(['E', 'T']);
  await holdAcknowledgement();
  await page.getByRole('button', { name: /^(Start|Resume) practice$/, exact: true }).tap();
  await expect.poll(async () => (await state(page)).paused).toBe(false);
  await page.getByRole('combobox', { name: 'Word list', exact: true }).selectOption('common-qso');
  await page.evaluate(() => (Reflect.get(window, 'releaseRepeatedPlay') as () => void)());
  expect((await state(page)).paused).toBe(true);
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Shuffle list', exact: true }).check();
  await page.getByRole('button', { name: /^(Start|Resume) practice$/, exact: true }).tap();
  await expect.poll(async () => (await state(page)).at).toBeGreaterThan(0.1);
  const qsoSource = (await state(page)).source;
  const catalog = await list(page);
  expect(catalog).toHaveLength(70);
  expect(catalog[0]).toBe('VVV');
  const last = page.getByRole('button', { name: /^Seek to word 70:/ });
  await last.tap();
  await expect.poll(async () => (await state(page)).source).not.toBe(qsoSource);
  await expect.poll(async () => (await state(page)).at).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: 'Pause practice', exact: true }).tap();
  const repeatedCatalog = await list(page);
  expect(repeatedCatalog[0]).toBe('VVV');
  expect([...repeatedCatalog].sort()).toEqual([...catalog].sort());
  await navigateView(page, 'Overview', (control) => control.tap());
  await page
    .getByRole('region', { name: 'Current practice block', exact: true })
    .getByRole('button', { name: 'Return to practice', exact: true })
    .tap();
  expect((await state(page)).paused).toBe(true);
});
