import { expect } from '@playwright/test';
import { test } from './fixtures';
import { openDisclosure, openPracticeTool, expectResponsive } from './helpers';

{
  const viewport = { width: 390, height: 844 };
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
    await page.goto('/#tools');
    await openPracticeTool(page, 'Word listening');
    const play = page.getByRole('button', { name: 'Play Morse', exact: true });
    const stop = page.getByRole('button', { name: 'Stop playback', exact: true });
    const media = page.getByLabel('Practice audio', { exact: true });
    await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
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

    // The QSO catalog generates a fresh spoken round and still opens with VVV.
    await page.getByText('View word list', { exact: true }).click();
    await page.getByRole('button', { name: 'Seek to word 70: DX', exact: true }).click();
    await play.click();
    await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
    await page.getByRole('checkbox', { name: 'Shuffle list', exact: true }).check();
    await expect(media).toHaveAttribute('src', source!);
    await expect(media).toHaveJSProperty('paused', false);
    await expect.poll(() => media.getAttribute('src'), { timeout: 15000 }).not.toBe(source);
    await expect(page.getByText('WORD 1 OF 70 · LISTENING', { exact: true })).toBeVisible();
    expect((await page.locator('.trainer-catalog').getByRole('button').allTextContents())[0]).toBe(
      'VVV',
    );
    await stop.click();
    await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
    await page.getByRole('checkbox', { name: 'Shuffle list', exact: true }).uncheck();

    // A short real round crosses both word boundaries and the fresh-round seam.
    await page.getByRole('combobox', { name: 'Word list', exact: true }).selectOption('custom');
    await page.getByRole('textbox', { name: /^Your word list/ }).fill('A I');
    await expect(page.getByText('Loading prerecorded answers…')).toHaveCount(0);
    await play.click();
    await expect(media).toHaveJSProperty('loop', false);
    const shortSource = await media.getAttribute('src');
    await stop.click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(media).toHaveJSProperty('paused', true);
    await expect(page.getByText('WORD 2 OF 2', { exact: true })).toBeVisible();
    expect(await media.evaluate((node: HTMLAudioElement) => node.currentTime)).toBeGreaterThan(0);
    await page
      .locator('.trainer-current')
      .getByRole('button', { name: 'Seek to word 2: I', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Replay current word and start playback', exact: true })
      .click();
    await expect(page.getByText('WORD 2 OF 2 · LISTENING', { exact: true })).toBeVisible();
    await expect(page.getByText('WORD 1 OF 2 · LISTENING', { exact: true })).toBeVisible();
    await expect(media).not.toHaveAttribute('src', shortSource!);

    await page.getByText(/^Sound settings ·/).click();
    const morseVolume = page.getByRole('slider', { name: 'Morse volume', exact: true });
    const voiceVolume = page.getByRole('slider', { name: 'Voice volume', exact: true });
    await expect(morseVolume).toHaveValue('40');
    await expect(voiceVolume).toHaveValue('40');
    const beforeMix = await media.evaluate((a: HTMLAudioElement) => ({
      source: a.src,
      at: a.currentTime,
    }));
    await voiceVolume.press('Home');
    await expect(morseVolume).toHaveValue('40');
    await expect(media).toHaveJSProperty('paused', false);
    expect(await media.evaluate((a: HTMLAudioElement) => a.src)).not.toBe(beforeMix.source);
    expect(await media.evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThanOrEqual(
      beforeMix.at,
    );
    await morseVolume.press('End');
    await expect(voiceVolume).toHaveValue('0');
    await expect(media).toHaveJSProperty('paused', false);

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
    await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
    await page.getByRole('checkbox', { name: 'Repeat list', exact: true }).uncheck();
    await play.click();
    await expect(media).toHaveJSProperty('loop', false);
    await expect(page.getByText('ROUND COMPLETE', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );

    await expectResponsive(page, 'spoken-answers-complete');
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({ path: `.tmp/spoken-sound-${width}.png`, fullPage: true });
    }
    await page.getByRole('textbox', { name: /^Your word list/ }).fill('UNRECORDED');
    await expect(page.getByRole('alert')).toContainText('No prerecorded answer for UNRECORDED');
    await expect(media).not.toHaveAttribute('src');
    await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
    await page.getByRole('checkbox', { name: 'Three repeats + spoken answer' }).uncheck();
    await play.click();
    await expect(media).toHaveJSProperty('paused', false);
  });
}
