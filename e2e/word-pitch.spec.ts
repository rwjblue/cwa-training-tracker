import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { expectResponsive, openDisclosure, openPracticeTool } from './helpers';
import { morsePcmBands, observeMorsePcm } from './morse-pcm';

test.use({ hasTouch: true });
const audio = (page: Page) => page.getByLabel('Practice audio', { exact: true });
async function sound(page: Page) {
  const summary = page.getByText(/^Sound settings ·/);
  const details = page.locator('details').filter({ has: summary });
  if (!(await details.evaluate((element: HTMLDetailsElement) => element.open)))
    await summary.press('Enter');
}
async function exact(page: Page, label: string, value: number, unit = 'WPM') {
  const field = page.getByRole('spinbutton', { name: `${label} exact (${unit})`, exact: true });
  await field.fill(String(value));
  await field.press('Enter');
}
async function listenAndPause(page: Page) {
  await page.getByRole('button', { name: /^(Start|Resume) practice$/, exact: true }).click();
  await expect
    .poll(() => audio(page).evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(0.25);
  await page.getByRole('button', { name: 'Pause practice', exact: true }).click();
}

test('word pitch defaults on, reaches native audio, stays stable on replay/retime and remembers opt-out', async ({
  page,
}) => {
  await observeMorsePcm(page);
  await page.goto('/#tools');
  await openPracticeTool(page, 'Word listening');
  await sound(page);
  const variable = page.getByRole('checkbox', { name: 'Variable pitch', exact: true });
  await expect(variable).toBeChecked();
  await expect(
    page.getByRole('spinbutton', { name: 'Sidetone exact (Hz)', exact: true }),
  ).toHaveValue('450');
  await variable.uncheck();
  await expect(page.getByText(/^Sound settings ·/)).toContainText('450 Hz');
  await variable.check();
  await expect(page.getByRole('combobox', { name: 'Word list', exact: true })).toHaveValue(
    'common-qso',
  );
  await page.getByRole('combobox', { name: 'Word list', exact: true }).selectOption('common-30');
  await expect(variable).toBeChecked();
  await page.getByRole('combobox', { name: 'Word list', exact: true }).selectOption('custom');
  await page.getByRole('textbox', { name: /^Your word list/ }).fill('T T T T');
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Shuffle list', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Repeat list', exact: true }).uncheck();
  await exact(page, 'Extra word pause', 0.2, 'seconds');
  await sound(page);
  await exact(page, 'Character speed', 40);
  await exact(page, 'Effective speed', 40);
  await exact(page, 'Sidetone', 975, 'Hz');
  await expect(page.getByText('40 / 40 WPM · 500–900 Hz variable', { exact: true })).toBeVisible();
  await listenAndPause(page);
  const original = await audio(page).evaluate((a: HTMLAudioElement) => a.src);
  const { bands: variableBands } = await morsePcmBands(page);
  expect(variableBands.length).toBeGreaterThan(0);
  expect(variableBands.every((hz) => hz >= 500 && hz <= 900)).toBe(true);
  await exact(page, 'Sidetone', 1000, 'Hz');
  expect(await audio(page).evaluate((a: HTMLAudioElement) => a.src)).toBe(original);
  await page
    .getByRole('button', { name: 'Replay current word and start playback', exact: true })
    .press('Enter');
  await expect(audio(page)).toHaveJSProperty('paused', false);
  await page.getByRole('button', { name: 'Pause practice', exact: true }).click();
  expect(await audio(page).evaluate((a: HTMLAudioElement) => a.src)).toBe(original);
  await exact(page, 'Character speed', 50);
  await expect.poll(() => audio(page).evaluate((a: HTMLAudioElement) => a.src)).not.toBe(original);
  expect((await morsePcmBands(page)).bands).toEqual(variableBands);
  await variable.press('Space');
  await expect(variable).not.toBeChecked();
  await listenAndPause(page);
  expect((await morsePcmBands(page)).bands).toEqual([1000]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await openPracticeTool(page, 'Word listening', (control) => control.tap());
  await sound(page);
  await expect(variable).not.toBeChecked();
  await variable.tap();
  await page.reload();
  await openPracticeTool(page, 'Word listening', (control) => control.tap());
  await sound(page);
  await expect(variable).toBeChecked();
  await expect(page.getByText(/^Sound settings ·/)).toContainText('500–900 Hz variable');
  await page.getByRole('textbox', { name: /^Your word list/ }).fill('A I');
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Three repeats + spoken answer', exact: true }).check();
  await expect(page.getByText('Loading prerecorded answers…')).toHaveCount(0);
  await listenAndPause(page);
  const spokenSource = await audio(page).evaluate((a: HTMLAudioElement) => a.src);
  await exact(page, 'Sidetone', 975, 'Hz');
  expect(await audio(page).evaluate((a: HTMLAudioElement) => a.src)).toBe(spokenSource);
  await expectResponsive(page, 'word-variable-pitch');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await variable.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.tmp/word-pitch-${width}.png` });
  }
});
