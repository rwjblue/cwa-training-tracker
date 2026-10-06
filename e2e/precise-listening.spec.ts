import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { openDisclosure, openPracticeTool, expectResponsive, signIn, setSidetone } from './helpers';

test.use({ hasTouch: true, extraHTTPHeaders: { 'CF-Connecting-IP': '192.0.2.231' } });
const media = (page: Page) => page.getByLabel('Practice audio', { exact: true });
const exact = (page: Page, label: string, unit = 'WPM') =>
  page.getByRole('spinbutton', { name: `${label} exact (${unit})`, exact: true });
async function setExact(page: Page, label: string, value: number, unit = 'WPM') {
  if (label === 'Sidetone') return setSidetone(page, value);
  if (label === 'Extra word pause')
    await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await exact(page, label, unit).fill(String(value));
  await exact(page, label, unit).press('Enter');
}
async function sound(page: Page) {
  const summary = page.getByText(/^Sound settings ·/);
  const details = page.locator('details').filter({ has: summary });
  if (!(await details.evaluate((element: HTMLDetailsElement) => element.open)))
    await summary.press('Enter');
}
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.tap();
  await page
    .getByRole(['Your account', 'This device'].includes(name) ? 'button' : 'link', {
      name,
      exact: true,
    })
    .click();
}
async function start(page: Page) {
  await page.getByRole('button', { name: /^(Start|Resume) practice$/, exact: true }).click();
  await expect
    .poll(() => media(page).evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(0.65);
}
async function pause(page: Page) {
  await page.getByRole('button', { name: 'Pause practice', exact: true }).click();
  await expect
    .poll(() => media(page).evaluate((audio: HTMLAudioElement) => audio.paused))
    .toBe(true);
}

test('precise public mode settings migrate, preview locally, cancel, and survive reload at both widths', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    if (localStorage.getItem('cwa.practice.preferences.v1') === null)
      localStorage.setItem(
        'cwa.practice.preferences.v1',
        JSON.stringify({
          tool: 'words',
          characterWpm: 5,
          effectiveWpm: 3,
          tone: 617,
          wordGap: 0.3,
        }),
      );
  });
  await page.goto('/#tools');
  await openPracticeTool(page, 'Word listening');
  await sound(page);
  await expect(exact(page, 'Character speed')).toHaveValue('5');
  await expect(exact(page, 'Effective speed')).toHaveValue('3');
  await expect(page.getByRole('slider', { name: 'Sidetone', exact: true })).toHaveValue('617');
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await expect(exact(page, 'Extra word pause', 'seconds')).toHaveValue('0.3');
  await setExact(page, 'Character speed', 51);
  await expect(
    page.getByRole('combobox', { name: 'Character speed preset', exact: true }),
  ).toHaveValue('51');
  await setExact(page, 'Character speed', 55);
  await page.getByRole('button', { name: 'Use normal spacing', exact: true }).press('Enter');
  await expect(exact(page, 'Effective speed')).toHaveValue('55');
  await page.getByRole('combobox', { name: 'Word list', exact: true }).selectOption('custom');
  await page.getByRole('textbox', { name: /^Your word list/ }).fill('PARIS PARIS PARIS');
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Shuffle list', exact: true }).uncheck();
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Repeat list', exact: true }).uncheck();
  await start(page);
  const slider = page.getByRole('slider', { name: 'Character speed', exact: true });
  await slider.scrollIntoViewIfNeeded();
  const box = (await slider.boundingBox())!;
  const source = await media(page).evaluate((audio: HTMLAudioElement) => audio.src);
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 4 });
  await expect(page.getByText(/Preview only. Release to apply; active 55 WPM/)).toBeVisible();
  expect(await media(page).evaluate((audio: HTMLAudioElement) => audio.src)).toBe(source);
  await page.mouse.up();
  await expect
    .poll(() => media(page).evaluate((audio: HTMLAudioElement) => audio.src))
    .not.toBe(source);
  await expect
    .poll(() => media(page).evaluate((audio: HTMLAudioElement) => audio.paused))
    .toBe(false);
  await pause(page);
  await setExact(page, 'Character speed', 55);
  await setExact(page, 'Effective speed', 55);
  const cancelSource = await media(page).evaluate((audio: HTMLAudioElement) => audio.src);
  await slider.scrollIntoViewIfNeeded();
  const cancelBox = (await slider.boundingBox())!;
  await page.mouse.move(cancelBox.x + cancelBox.width * 0.9, cancelBox.y + cancelBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cancelBox.x + cancelBox.width * 0.7, cancelBox.y + cancelBox.height / 2, {
    steps: 3,
  });
  await slider.press('Escape');
  await page.mouse.up();
  await expect(slider).toHaveValue('55');
  expect(await media(page).evaluate((audio: HTMLAudioElement) => audio.src)).toBe(cancelSource);
  await exact(page, 'Character speed').fill('61');
  await exact(page, 'Character speed').press('Enter');
  await expect(page.getByRole('alert')).toContainText('active value stays 55 WPM');
  await exact(page, 'Character speed').press('Escape');
  await expect(exact(page, 'Character speed')).toHaveValue('55');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await openPracticeTool(page, 'QSO practice', (control) => control.tap());
  await sound(page);
  await page.getByRole('checkbox', { name: 'Variable pitch', exact: true }).uncheck();
  await expect(exact(page, 'Character speed')).toHaveValue('5');
  await expect(exact(page, 'Effective speed')).toHaveValue('3');
  await setExact(page, 'Character speed', 20);
  await setExact(page, 'Effective speed', 8);
  await setExact(page, 'Sidetone', 731, 'Hz');
  await openPracticeTool(page, 'Stories', (control) => control.tap());
  await sound(page);
  await page.getByRole('checkbox', { name: 'Variable pitch', exact: true }).uncheck();
  await setExact(page, 'Character speed', 60);
  await setExact(page, 'Effective speed', 51);
  await setExact(page, 'Sidetone', 419, 'Hz');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('slider', { name: 'Sidetone', exact: true }).press('ArrowRight');
  await expect(
    page.getByText('Sound settings · 60/51 WPM · 420 Hz', { exact: true }),
  ).toBeVisible();
  await expectResponsive(page, 'precise-story-controls');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page).toHaveURL(/#practice\/stories\?/);
  await expect(page.getByRole('heading', { name: 'Stories', exact: true, level: 1 })).toBeVisible();
  await sound(page);
  await expect(exact(page, 'Character speed')).toHaveValue('60');
  await expect(exact(page, 'Effective speed')).toHaveValue('51');
  await expect(page.getByRole('slider', { name: 'Sidetone', exact: true })).toHaveValue('420');
  await openPracticeTool(page, 'QSO practice', (control) => control.tap());
  await sound(page);
  await expect(exact(page, 'Character speed')).toHaveValue('20');
  await expect(exact(page, 'Effective speed')).toHaveValue('8');
  await openPracticeTool(page, 'Word listening', (control) => control.tap());
  await sound(page);
  await expect(exact(page, 'Character speed')).toHaveValue('55');
  await expect(exact(page, 'Effective speed')).toHaveValue('55');
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await expect(exact(page, 'Extra word pause', 'seconds')).toHaveValue('0.3');
  await expect(
    page.getByRole('combobox', { name: 'Character speed preset', exact: true }),
  ).toHaveValue('55');
  await start(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Reflect.set(window, 'restorePreciseStorage', () => {
      Storage.prototype.setItem = original;
    });
    Storage.prototype.setItem = function (key, value) {
      if (key === 'cwa.practice.preferences.v1')
        throw new DOMException('Synthetic preference refusal', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await setExact(page, 'Character speed', 56);
  await expect(
    page.getByText(
      'Active for this visit. Your browser is not allowing these preferences to be remembered.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect
    .poll(() => media(page).evaluate((audio: HTMLAudioElement) => audio.paused))
    .toBe(false);
  await page.getByText(/^Sound settings ·/).press('Enter');
  await expect(page.getByText(' · Not saved on this device', { exact: true })).toBeVisible();
  await page.evaluate(() => (Reflect.get(window, 'restorePreciseStorage') as () => void)());
  await sound(page);
  const retrySource = await media(page).evaluate((audio: HTMLAudioElement) => audio.src);
  await page.getByRole('button', { name: 'Retry saving listening preferences', exact: true }).tap();
  await expect(
    page.getByRole('button', { name: 'Retry saving listening preferences', exact: true }),
  ).toHaveCount(0);
  expect(await media(page).evaluate((audio: HTMLAudioElement) => audio.src)).toBe(retrySource);
  await expect
    .poll(() => media(page).evaluate((audio: HTMLAudioElement) => audio.paused))
    .toBe(false);
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('cwa.practice.preferences.v1')!).characterWpm,
      ),
    )
    .toBe(56);
  await setExact(page, 'Character speed', 55);
  await expect(page.getByText(/Sound defaults are saved on this device/)).toBeVisible();
  await pause(page);
  await expectResponsive(page, 'precise-word-controls');
});

test('native 55/60 WPM listening survives canceled review and exact save retry into private evidence and history', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await signIn(page);
  await openPracticeTool(page, 'Word listening');
  await sound(page);
  await setExact(page, 'Character speed', 55);
  await setExact(page, 'Effective speed', 55);
  await page.getByRole('checkbox', { name: 'Variable pitch', exact: true }).uncheck();
  await setExact(page, 'Sidetone', 617, 'Hz');
  await setExact(page, 'Extra word pause', 0.3, 'seconds');
  await page.getByRole('combobox', { name: 'Word list', exact: true }).selectOption('custom');
  await page.getByRole('textbox', { name: /^Your word list/ }).fill('PARIS PARIS PARIS');
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Shuffle list', exact: true }).uncheck();
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Repeat list', exact: true }).uncheck();
  await start(page);
  await pause(page);
  await setExact(page, 'Character speed', 60);
  await setExact(page, 'Effective speed', 60);
  await page.getByRole('button', { name: /^(Start|Resume) practice$/, exact: true }).click();
  // Speed changes finish the current word and its pause at the original timing.
  // Hear the retimed later words before reviewing evidence for both speeds.
  await expect
    .poll(() => media(page).evaluate((audio: HTMLAudioElement) => audio.ended))
    .toBe(true);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('55 character / 55 effective WPM');
  await expect(dialog).toContainText('60 character / 60 effective WPM');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).press('Enter');
  const bodies: string[] = [];
  let reject = true;
  await page.route('**/api/entries', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    bodies.push(route.request().postData()!);
    if (reject)
      return route.fulfill({ status: 503, json: { error: 'Synthetic precise save unavailable' } });
    return route.continue();
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save practice', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Practice upload status' })).toContainText(
    '1 practice result saved on this device',
  );
  reject = false;
  await page.getByRole('button', { name: 'Retry practice uploads', exact: true }).press('Enter');
  await expect(page.getByRole('region', { name: 'Practice upload status' })).toHaveCount(0);
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toBe(bodies[0]);
  const entries = (await (await context.request.get('/api/entries')).json()).entries;
  expect(entries).toHaveLength(1);
  const evidence = entries[0].metadata.evidence;
  expect(evidence.measurement.seconds).toBeGreaterThan(0.5);
  expect(entries[0].minutes).toBe(evidence.measurement.seconds / 60);
  expect(
    evidence.generatedListening.summaries.map(
      (item: { characterWpm: number; effectiveWpm: number }) => [
        item.characterWpm,
        item.effectiveWpm,
      ],
    ),
  ).toEqual([
    [55, 55],
    [60, 60],
  ]);
  await navigate(page, 'Practice log');
  await page.getByText('Practice evidence', { exact: true }).click();
  await expect(page.getByText(/55 character \/ 55 effective WPM/)).toBeVisible();
  await expect(page.getByText(/60 character \/ 60 effective WPM/)).toBeVisible();
  await expectResponsive(page, 'precise-private-history');
});
