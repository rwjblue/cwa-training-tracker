import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { expectResponsive, openPracticeTool, setSidetone } from './helpers';
import { morsePcmBands, observeMorsePcm } from './morse-pcm';

test.use({ hasTouch: true });
const audio = (page: Page) => page.getByLabel('Practice audio', { exact: true });
async function exact(page: Page, label: string, value: number, unit = 'WPM') {
  const field = page.getByRole('spinbutton', { name: `${label} exact (${unit})`, exact: true });
  await field.fill(String(value));
  await field.press('Enter');
}
async function sound(page: Page) {
  const summary = page.getByText(/^Sound settings ·/);
  const details = page.locator('details').filter({ has: summary });
  if (!(await details.evaluate((element: HTMLDetailsElement) => element.open)))
    await summary.press('Enter');
}
test('public QSO random station cues survive native seek, replay and retiming and remember fixed opt-out', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await observeMorsePcm(page);
  await page.goto('/#tools');
  await openPracticeTool(page, 'QSO practice', (control) => control.press('Enter'));
  await sound(page);
  const variable = page.getByRole('checkbox', { name: 'Variable pitch', exact: true });
  await expect(variable).toBeChecked();
  await exact(page, 'Character speed', 55);
  await exact(page, 'Effective speed', 55);
  await expect(page.getByRole('slider', { name: 'Sidetone', exact: true })).toBeDisabled();
  const pair = page.getByLabel('QSO station tones', { exact: true });
  const tones = [...(await pair.innerText()).matchAll(/: (\d+) Hz/g)].map((match) =>
    Number(match[1]),
  );
  expect(tones).toHaveLength(2);
  expect(tones.every((hz) => hz >= 500 && hz <= 900)).toBe(true);
  expect(Math.abs(tones[0] - tones[1])).toBeGreaterThanOrEqual(35);
  await page.getByRole('button', { name: 'Reveal text', exact: true }).press('Enter');
  const pairText = await pair.innerText();
  const station1 = pairText.split(':')[0];
  const station2 = pairText.split(' · ')[1].split(':')[0];
  const current = page.getByLabel('Current QSO station', { exact: true });
  await expect(current).toHaveText(`${station1} · ${tones[0]} Hz`);
  await page.getByRole('button', { name: /^(Start|Resume) practice$/, exact: true }).press('Enter');
  await expect
    .poll(() => audio(page).evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(0.8);
  await page.getByRole('button', { name: 'Pause practice', exact: true }).press('Enter');
  const original = await audio(page).evaluate((element: HTMLAudioElement) => element.src);
  expect(await morsePcmBands(page)).toEqual({
    rate: 22050,
    bands: [...tones].sort((a, b) => a - b),
  });
  await page.getByRole('button', { name: 'Next', exact: true }).press('Enter');
  await expect(current).toHaveText(`${station2} · ${tones[1]} Hz`);
  await expect
    .poll(() => audio(page).evaluate((element: HTMLAudioElement) => element.paused))
    .toBe(true);
  await exact(page, 'Character speed', 60);
  await expect
    .poll(() => audio(page).evaluate((element: HTMLAudioElement) => element.src))
    .not.toBe(original);
  await expect(current).toHaveText(`${station2} · ${tones[1]} Hz`);
  expect(await pair.innerText()).toBe(pairText);
  expect(await morsePcmBands(page)).toEqual({
    rate: 22050,
    bands: [...tones].sort((a, b) => a - b),
  });
  await page
    .getByRole('button', { name: 'Replay current word and start playback', exact: true })
    .press('Enter');
  await expect
    .poll(() => audio(page).evaluate((element: HTMLAudioElement) => element.paused))
    .toBe(false);
  const replaySource = await audio(page).evaluate((element: HTMLAudioElement) => element.src);
  await expect(page.getByRole('slider', { name: 'Sidetone', exact: true })).toBeDisabled();
  expect(await audio(page).evaluate((element: HTMLAudioElement) => element.src)).toBe(replaySource);
  await expect(audio(page)).toHaveJSProperty('paused', false);
  await page.getByRole('button', { name: 'Pause practice', exact: true }).press('Enter');
  expect((await morsePcmBands(page)).bands).toEqual([...tones].sort((a, b) => a - b));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await variable.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.tmp/qso-pitch-${width}.png` });
  }
  await expectResponsive(page, 'qso-station-tones');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Check your copy', exact: true }).tap();
  await expect(current).toHaveCount(0);
  await expect(pair).toContainText(`Station 1: ${tones[0]} Hz`);
  await expect(pair).not.toContainText(station1);
  await expect(pair).not.toContainText(station2);
  await page.getByRole('button', { name: 'Show answers', exact: true }).tap();
  await expect(pair).toContainText(station1);
  await expect(pair).toContainText(station2);
  await page.getByRole('button', { name: 'Listen', exact: true }).tap();
  await sound(page);
  const variableSource = await audio(page).evaluate((element: HTMLAudioElement) => element.src);
  await expect(page.getByRole('slider', { name: 'Sidetone', exact: true })).toBeDisabled();
  expect(await audio(page).evaluate((element: HTMLAudioElement) => element.src)).toBe(
    variableSource,
  );
  await expect(page.getByRole('slider', { name: 'Sidetone', exact: true })).toBeDisabled();
  expect(await pair.innerText()).toBe(pairText);
  await variable.tap();
  await expect(variable).not.toBeChecked();
  await setSidetone(page, 975);
  await expect(pair).toContainText('975 Hz');
  await expect(pair).toContainText('925 Hz');
  await expect(
    page.getByRole('button', { name: /^(Start|Resume) practice$/, exact: true }),
  ).toBeVisible();
  await expect(audio(page)).toBeHidden();
  await page.getByRole('button', { name: /^(Start|Resume) practice$/, exact: true }).tap();
  await expect
    .poll(() => audio(page).evaluate((element: HTMLAudioElement) => element.paused))
    .toBe(false);
  await page.getByRole('button', { name: 'Pause practice', exact: true }).tap();
  expect((await morsePcmBands(page)).bands).toEqual([925, 975]);
  await page.getByRole('slider', { name: 'Sidetone', exact: true }).press('End');
  await expect(pair).toContainText('1000 Hz');
  await expect(pair).toContainText('950 Hz');
  await expect(pair).toContainText('lower to stay within the 1000 Hz limit');
  await page.reload();
  await openPracticeTool(page, 'QSO practice', (control) => control.tap());
  await sound(page);
  await expect(variable).not.toBeChecked();
  await expect(pair).toContainText(': 1000 Hz');
  await expect(pair).toContainText(': 950 Hz');
  await openPracticeTool(page, 'Word listening', (control) => control.tap());
  await expect(pair).toHaveCount(0);
  await openPracticeTool(page, 'Stories', (control) => control.tap());
  await sound(page);
  await expect(variable).toBeChecked();
  await expect(pair).toHaveCount(0);
});
