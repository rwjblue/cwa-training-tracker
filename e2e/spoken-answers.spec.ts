import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`prerecorded answers use continuous native playback at ${viewport.width}px`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      localStorage.setItem(
        'cwa.practice.preferences.v1',
        JSON.stringify({
          tool: 'words',
          wordList: 'common-qso',
          shuffleWords: false,
          spokenAnswers: true,
          repeatList: true,
          hideTrainerText: false,
          characterWpm: 50,
          effectiveWpm: 50,
          wordGap: 0,
        }),
      );
      // Speech must work even on devices with no speech synthesis API.
      Object.defineProperty(window, 'speechSynthesis', { value: undefined });
    });
    await page.goto('/#practice');
    const play = page.getByRole('button', { name: 'Play Morse', exact: true });
    const stop = page.getByRole('button', { name: 'Stop playback', exact: true });
    const media = page.getByLabel('Practice audio', { exact: true });
    await expect(
      page.getByRole('checkbox', { name: 'Three repeats + spoken answer' }),
    ).toBeEnabled();
    await expect(page.getByText('Loading prerecorded answers…')).toHaveCount(0);
    await play.click();
    await expect(media).toBeVisible();
    await expect(media).toHaveJSProperty('paused', false);
    await expect
      .poll(() => media.evaluate((node: HTMLAudioElement) => node.duration))
      .toBeGreaterThan(120);
    const source = await media.getAttribute('src');
    expect(source).toMatch(/^blob:/);
    await expect(page.getByText('WORD 2 OF 70 · LISTENING', { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(media).toHaveAttribute('src', source!);
    await stop.click();
    const paused = await media.evaluate((node: HTMLAudioElement) => node.currentTime);
    await play.click();
    await expect
      .poll(() => media.evaluate((node: HTMLAudioElement) => node.currentTime))
      .toBeGreaterThan(paused);
    await expect(media).toHaveAttribute('src', source!);
    await stop.click();

    // A short real round crosses both word boundaries and the native loop seam.
    await page.getByRole('combobox', { name: 'Word list', exact: true }).selectOption('custom');
    await page.getByRole('textbox', { name: /^Your word list/ }).fill('A I');
    await expect(page.getByText('Loading prerecorded answers…')).toHaveCount(0);
    await play.click();
    await expect(media).toHaveJSProperty('loop', true);
    const shortSource = await media.getAttribute('src');
    await stop.click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(media).toHaveJSProperty('paused', true);
    await expect(page.getByText('WORD 2 OF 2', { exact: true })).toBeVisible();
    expect(await media.evaluate((node: HTMLAudioElement) => node.currentTime)).toBeGreaterThan(0);
    await page
      .locator('.trainer-current')
      .getByRole('button', { name: 'Play from word 2: I', exact: true })
      .click();
    await expect(page.getByText('WORD 2 OF 2 · LISTENING', { exact: true })).toBeVisible();
    await expect(page.getByText('WORD 1 OF 2 · LISTENING', { exact: true })).toBeVisible();
    await expect(media).toHaveAttribute('src', shortSource!);

    // This checks our hidden-page handler, not an emulated iOS lock screen.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(media).toHaveJSProperty('paused', false);
    const hiddenAt = await media.evaluate((node: HTMLAudioElement) => node.currentTime);
    await expect
      .poll(() => media.evaluate((node: HTMLAudioElement) => node.currentTime))
      .not.toBe(hiddenAt);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await stop.click();
    await page.getByRole('checkbox', { name: 'Repeat list', exact: true }).uncheck();
    await play.click();
    await expect(media).toHaveJSProperty('loop', false);
    await expect(page.getByText('ROUND COMPLETE', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `.tmp/spoken-answers-${viewport.width}.png`, fullPage: true });

    await page.getByRole('textbox', { name: /^Your word list/ }).fill('UNRECORDED');
    await expect(page.getByRole('alert')).toContainText('No prerecorded answer for UNRECORDED');
    await expect(media).not.toHaveAttribute('src');
    await page.getByRole('checkbox', { name: 'Three repeats + spoken answer' }).uncheck();
    await play.click();
    await expect(media).toHaveJSProperty('paused', false);
  });
}
