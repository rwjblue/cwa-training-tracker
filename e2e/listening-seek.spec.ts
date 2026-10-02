import { expect, test, type Page } from '@playwright/test';
import { expectResponsive, signIn } from './helpers';
import { observeNativeMovement, readNativeMovement } from './native-movement';

test.use({ hasTouch: true, extraHTTPHeaders: { 'CF-Connecting-IP': '192.0.2.227' } });
const media = (page: Page) => page.getByLabel('Practice audio', { exact: true });
const position = (page: Page) => media(page).evaluate((a: HTMLAudioElement) => a.currentTime);
const replay = (page: Page) =>
  page.getByRole('button', { name: 'Replay current word and start playback', exact: true });

async function settle(page: Page, paused: boolean) {
  await expect.poll(() => media(page).evaluate((a: HTMLAudioElement) => a.seeking)).toBe(false);
  await expect(media(page)).toHaveJSProperty('paused', paused);
}

test('word selection, stepping and rewind retain state and save only actual heard movement', async ({
  page,
  context,
}) => {
  await signIn(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Practice studio', exact: true }).click();
  await page.getByRole('button', { name: 'Word listening', exact: true }).click();
  await page.getByRole('combobox', { name: 'Word list', exact: true }).selectOption('custom');
  await page.getByRole('textbox', { name: /^Your word list/ }).fill('PARIS E PARIS E');
  await page.getByRole('checkbox', { name: 'Shuffle list', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Repeat list', exact: true }).uncheck();
  const settings = page.locator('details').filter({ has: page.getByText(/^Sound settings ·/) });
  await settings.getByText(/^Sound settings ·/).click();
  await page.getByRole('slider', { name: 'Character speed', exact: true }).press('End');
  await page.getByRole('slider', { name: 'Effective speed', exact: true }).press('End');
  await page.getByText('View word list', { exact: true }).click();
  await observeNativeMovement(media(page));
  // Hold source attachment, not time or events, to exercise a real seek before
  // native decoding/metadata. Release the actual Blob through the native setter.
  await media(page).evaluate((audio: HTMLAudioElement) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src')!;
    const load = audio.load.bind(audio);
    let source = '';
    Object.defineProperty(audio, 'src', {
      configurable: true,
      get: () => descriptor.get!.call(audio),
      set: (value: string) => {
        source = value;
      },
    });
    audio.load = () => {};
    Reflect.set(window, 'releaseSeekSource', () => {
      Reflect.deleteProperty(audio, 'src');
      Reflect.deleteProperty(audio, 'load');
      descriptor.set!.call(audio, source);
      load();
    });
  });
  const pending = page.getByRole('button', { name: 'Seek to word 3: PARIS', exact: true });
  await pending.press('Enter');
  await expect(media(page)).toHaveJSProperty('readyState', 0);
  await expect(media(page)).toHaveJSProperty('paused', true);
  await expect(pending).toHaveAttribute('aria-current', 'true');
  await page.getByRole('button', { name: 'Next', exact: true }).press('Enter');
  await pending.press('Enter');
  const pendingPosition = await position(page);
  await page.evaluate(() => (Reflect.get(window, 'releaseSeekSource') as () => void)());
  await expect
    .poll(() => media(page).evaluate((a: HTMLAudioElement) => a.readyState))
    .toBeGreaterThan(0);
  await settle(page, true);
  expect(await position(page)).toBeCloseTo(pendingPosition, 3);
  await expect(pending).toHaveAttribute('aria-current', 'true');
  await page.getByRole('button', { name: 'Back 10 sec', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Start practice', exact: true }).click();
  await expect.poll(() => position(page)).toBeGreaterThan(1.1);
  await page.getByRole('button', { name: 'Pause practice', exact: true }).click();
  const source = await media(page).getAttribute('src');
  const third = page.getByRole('button', { name: 'Seek to word 3: PARIS', exact: true });
  await third.focus();
  await page.keyboard.press('Enter');
  await settle(page, true);
  await expect(third).toHaveAttribute('aria-current', 'true');
  const selected = await position(page);
  await page.getByRole('button', { name: 'Next', exact: true }).press('Enter');
  await settle(page, true);
  await expect(
    page.getByRole('button', { name: 'Seek to word 4: E', exact: true }),
  ).toHaveAttribute('aria-current', 'true');
  await page.getByRole('button', { name: 'Previous', exact: true }).press('Enter');
  await settle(page, true);
  expect(await position(page)).toBeCloseTo(selected, 3);
  await expectResponsive(page, 'seek-words-paused');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Next', exact: true }).tap();
  await settle(page, true);
  await page.getByRole('button', { name: 'Back 10 sec', exact: true }).tap();
  await settle(page, true);
  expect(await position(page)).toBe(0);
  await third.tap();
  await settle(page, true);
  await page.getByRole('button', { name: 'Review & save', exact: true }).tap();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).tap();
  await settle(page, true);
  expect(await position(page)).toBeCloseTo(selected, 3);
  await replay(page).tap();
  await settle(page, false);
  await expect.poll(() => position(page)).toBeGreaterThan(selected + 0.15);
  await page.getByRole('button', { name: 'Previous', exact: true }).tap();
  await settle(page, false);
  await page.getByRole('button', { name: 'Back 10 sec', exact: true }).tap();
  await settle(page, false);
  await expect.poll(() => position(page)).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: 'Pause practice', exact: true }).tap();
  await page.getByRole('button', { name: 'Seek to word 4: E', exact: true }).tap();
  await replay(page).tap();
  await expect.poll(() => media(page).evaluate((a: HTMLAudioElement) => a.ended)).toBe(true);
  await third.tap();
  await settle(page, true);
  await expect(third).toHaveAttribute('aria-current', 'true');
  await replay(page).tap();
  await settle(page, false);
  await expect.poll(() => position(page)).toBeGreaterThan(selected + 0.1);
  await page.getByRole('button', { name: 'Pause practice', exact: true }).tap();
  expect(await media(page).getAttribute('src')).toBe(source);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.screenshot({
      path: `.tmp/parity-queue/issue-27-words-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole('button', { name: 'Review & save', exact: true }).tap();
  const saved = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/entries' && r.request().method() === 'POST',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Save practice', exact: true }).tap();
  expect((await saved).ok()).toBe(true);
  const entries = (await (await context.request.get('/api/entries')).json()).entries;
  const evidence = entries[0].metadata.evidence;
  expect(evidence.wordListeningSeconds).toBeGreaterThan(1);
  const observed = await readNativeMovement(page);
  expect(Math.abs(evidence.wordListeningSeconds - observed.seconds)).toBeLessThan(0.02);
  expect(evidence.wordListeningSeconds).toBeCloseTo(evidence.measurement.seconds, 6);
});

test('public QSO and free text use exact paused occurrences and deliberate replay', async ({
  page,
}) => {
  await page.goto('/#practice');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'QSO practice', exact: true }).tap();
  await page.getByRole('combobox', { name: 'QSO scenario', exact: true }).selectOption('repeat');
  await page.getByText('View full conversation', { exact: true }).click();
  await page.getByRole('button', { name: 'Start practice', exact: true }).tap();
  await expect.poll(() => position(page)).toBeGreaterThan(0.2);
  await page.getByRole('button', { name: 'Pause practice', exact: true }).tap();
  const second = page.getByRole('button', { name: 'Seek to word 2: CQ', exact: true });
  await second.tap();
  await settle(page, true);
  await expect(second).toHaveAttribute('aria-current', 'true');
  const selected = await position(page);
  await expectResponsive(page, 'seek-qso-paused');
  await replay(page).tap();
  await settle(page, false);
  await expect.poll(() => position(page)).toBeGreaterThan(selected + 0.15);
  await page.getByRole('button', { name: 'Pause practice', exact: true }).tap();
  await page.getByRole('button', { name: 'Free practice', exact: true }).tap();
  await page.getByLabel('Practice text', { exact: true }).fill('PARIS E PARIS E');
  await page.getByRole('button', { name: /^(Start|Resume) practice$/, exact: true }).tap();
  await expect.poll(() => position(page)).toBeGreaterThan(0.15);
  await page.getByRole('button', { name: 'Pause practice', exact: true }).tap();
  const third = page.getByRole('button', { name: 'Seek to word 3: PARIS', exact: true });
  await third.tap();
  await settle(page, true);
  await expect(third).toHaveAttribute('aria-current', 'true');
  const freeSource = await media(page).getAttribute('src');
  await page.getByRole('button', { name: 'Back 10 sec', exact: true }).tap();
  await settle(page, true);
  await third.tap();
  await replay(page).tap();
  await settle(page, false);
  await page.getByRole('button', { name: 'Pause practice', exact: true }).tap();
  expect(await media(page).getAttribute('src')).toBe(freeSource);
  await expectResponsive(page, 'seek-free-paused');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.screenshot({ path: `.tmp/parity-queue/issue-27-free-${width}.png`, fullPage: true });
  }
});
