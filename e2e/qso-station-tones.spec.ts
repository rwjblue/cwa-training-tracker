import { expect, test, type Page } from '@playwright/test';
import { expectResponsive } from './helpers';

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
async function bands(page: Page) {
  return audio(page).evaluate(async (element: HTMLAudioElement) => {
    const blobs = Reflect.get(window, 'qsoEmittedBlobs') as Map<string, Blob>;
    const data = new DataView(await blobs.get(element.src)!.arrayBuffer());
    const rate = data.getUint32(24, true);
    const frames = (data.byteLength - 44) / 2;
    const sample = (index: number) => data.getInt16(44 + index * 2, true);
    const measured = new Set<number>();
    let beginning = -1;
    let silence = 0;
    const measure = (end: number) => {
      const crossings: number[] = [];
      for (let index = beginning + Math.ceil(rate * 0.005); index < end - rate * 0.005; index++) {
        const before = sample(index - 1),
          value = sample(index);
        if (before <= 0 && value > 0) crossings.push(index - 1 - before / (value - before));
      }
      if (crossings.length > 5)
        measured.add(
          Math.round(((crossings.length - 1) * rate) / (crossings.at(-1)! - crossings[0])),
        );
    };
    for (let index = 0; index < frames; index++) {
      if (Math.abs(sample(index)) > 1) {
        if (beginning < 0) beginning = index;
        silence = 0;
      } else if (beginning >= 0 && ++silence > rate * 0.008) {
        measure(index - silence + 1);
        beginning = -1;
      }
    }
    if (beginning >= 0) measure(frames);
    return { rate, bands: [...measured].sort((a, b) => a - b) };
  });
}

test('public QSO upper-bound station cues survive native seek, replay and retiming on desktop/mobile', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    // Observe actual emitted PCM without bypassing CSP or changing native playback.
    const create = URL.createObjectURL;
    const blobs = new Map<string, Blob>();
    Reflect.set(window, 'qsoEmittedBlobs', blobs);
    URL.createObjectURL = function (blob) {
      const url = create.call(this, blob);
      if (blob instanceof Blob) blobs.set(url, blob);
      return url;
    };
  });
  await page.goto('/#practice');
  await page.getByRole('button', { name: 'QSO practice', exact: true }).press('Enter');
  await sound(page);
  await exact(page, 'Character speed', 55);
  await exact(page, 'Effective speed', 55);
  await exact(page, 'Sidetone', 1000, 'Hz');
  const pair = page.getByLabel('QSO station tones', { exact: true });
  await expect(pair).toContainText('Station 1: 1000 Hz');
  await expect(pair).toContainText('Station 2: 950 Hz');
  await expect(pair).toContainText('lower to stay within the 1000 Hz limit');
  await page.getByRole('button', { name: 'Reveal text', exact: true }).press('Enter');
  const pairText = await pair.innerText();
  const station1 = pairText.split(':')[0];
  const station2 = pairText.split(' · ')[1].split(':')[0];
  const current = page.getByLabel('Current QSO station', { exact: true });
  await expect(current).toHaveText(`${station1} · 1000 Hz`);
  await page.getByRole('button', { name: /^(Start|Resume) practice$/, exact: true }).press('Enter');
  await expect
    .poll(() => audio(page).evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(0.8);
  await page.getByRole('button', { name: 'Pause practice', exact: true }).press('Enter');
  const original = await audio(page).evaluate((element: HTMLAudioElement) => element.src);
  expect(await bands(page)).toEqual({ rate: 22050, bands: [950, 1000] });
  await page.getByRole('button', { name: 'Next', exact: true }).press('Enter');
  await expect(current).toHaveText(`${station2} · 950 Hz`);
  await expect
    .poll(() => audio(page).evaluate((element: HTMLAudioElement) => element.paused))
    .toBe(true);
  await exact(page, 'Character speed', 60);
  await expect
    .poll(() => audio(page).evaluate((element: HTMLAudioElement) => element.src))
    .not.toBe(original);
  await expect(current).toHaveText(`${station2} · 950 Hz`);
  expect(await pair.innerText()).toBe(pairText);
  expect(await bands(page)).toEqual({ rate: 22050, bands: [950, 1000] });
  await page
    .getByRole('button', { name: 'Replay current word and start playback', exact: true })
    .press('Enter');
  await expect
    .poll(() => audio(page).evaluate((element: HTMLAudioElement) => element.paused))
    .toBe(false);
  await page.getByRole('button', { name: 'Pause practice', exact: true }).press('Enter');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await expectResponsive(page, 'qso-station-tones');
    await page.screenshot({
      path: `.tmp/parity-queue/issue-32-tones-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole('button', { name: 'Check your copy', exact: true }).tap();
  await expect(current).toHaveCount(0);
  await expect(pair).toContainText('Station 1: 1000 Hz');
  await expect(pair).not.toContainText(station1);
  await expect(pair).not.toContainText(station2);
  await page.getByRole('button', { name: 'Show answers', exact: true }).tap();
  await expect(pair).toContainText(station1);
  await expect(pair).toContainText(station2);
  await page.getByRole('button', { name: 'Listen', exact: true }).tap();
  await sound(page);
  await exact(page, 'Sidetone', 975, 'Hz');
  await expect(pair).toContainText('975 Hz');
  await expect(pair).toContainText('925 Hz');
  await expect(
    page.getByRole('button', { name: /^(Start|Resume) practice$/, exact: true }),
  ).toBeVisible();
  await expect(audio(page)).toBeHidden();
  await page.getByRole('button', { name: 'Word listening', exact: true }).tap();
  await expect(pair).toHaveCount(0);
  await page.getByRole('button', { name: 'Stories', exact: true }).tap();
  await expect(pair).toHaveCount(0);
});
