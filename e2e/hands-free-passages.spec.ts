import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import { test } from './fixtures';
import { expectResponsive, signIn } from './helpers';
import { practiceStory } from '../src/shared/listening-stories';
import { buildSpokenPassageTrack } from '../src/client/morse-track';
import type { PracticeSession } from '../src/shared/training';

test('hands-free passages cross recorded answers and next phrases in one native source, reopen paused and save played settings', async ({
  page,
  context,
  browser,
}) => {
  await signIn(page);
  await page.addInitScript(() =>
    Object.defineProperty(window, 'speechSynthesis', { value: undefined }),
  );
  await page.goto(
    '/#practice/stories?story=phrases-radio&hands-free=1&chunk=0&repeats=3&recall-gap=1&cwpm=60&ewpm=60&tone=650&variable=0&text=hide',
  );
  await expect(
    page.getByRole('checkbox', { name: 'Hands-free listening', exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Pause after each phrase', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'Morse repeats', exact: true })).toHaveValue('3');
  await expect(page.getByText('Loading prerecorded answers…')).toHaveCount(0);
  const story = practiceStory('phrases-radio');
  const speechIndex = JSON.parse(
    readFileSync('public/audio/cw-training/passages/index.json', 'utf8'),
  ) as { clips: Record<string, { url: string }> };
  const clips = new Map(
    Object.entries(speechIndex.clips).map(([line, clip]) => {
      const bytes = readFileSync(`public${clip.url}`);
      // Only duration is needed here; the fast suite validates shipped PCM and hashes.
      const data = bytes.indexOf('data');
      return [line, new Float32Array(bytes.readUInt32LE(data + 4) / 2)] as const;
    }),
  );
  const track = buildSpokenPassageTrack(story.lines, clips, {
    characterWpm: 60,
    effectiveWpm: 60,
    frequency: 650,
    volume: 0.4,
    voiceVolume: 0.4,
    morseRepeats: 3,
    recallGapSeconds: 1,
  });
  const media = page.getByLabel('Practice audio', { exact: true });
  const play = page.getByRole('button', { name: 'Play Morse', exact: true });
  const stop = page.getByRole('button', { name: 'Stop playback', exact: true });
  await play.click();
  await expect(media).toHaveJSProperty('paused', false);
  await expect
    .poll(() => media.evaluate((audio: HTMLAudioElement) => audio.duration))
    .toBeCloseTo(track.duration, 3);
  const source = await media.getAttribute('src');
  expect(source).toMatch(/^blob:/);
  await expect
    .poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title))
    .toBe('At the radio');
  expect(
    await page.evaluate(() => navigator.mediaSession.metadata?.artwork.length),
  ).toBeGreaterThan(0);
  // The prepared recording needs no further downloads across an answer/phrase boundary.
  await context.setOffline(true);
  await media.evaluate((audio: HTMLAudioElement, at) => {
    audio.currentTime = at;
  }, track.speech![0].at - 0.1);
  await expect(
    page.getByRole('button', { name: 'Seek to word 2: RADIO', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('PHRASE 2 OF 8 · LISTENING · 3 WORDS', { exact: true }),
  ).toBeVisible();
  await expect(media).toHaveJSProperty('paused', false);
  await expect(media).toHaveAttribute('src', source!);
  await expect(
    page.getByText('Listen first. Reveal when you’re ready.', { exact: true }),
  ).toBeVisible();
  await stop.click();
  const at = await media.evaluate((audio: HTMLAudioElement) => audio.currentTime);
  await play.click();
  await expect
    .poll(() => media.evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(at);
  await stop.click();
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Reveal text', exact: true }).click();
  await expect(page.locator('.trainer-current').getByRole('button')).toHaveCount(3);
  await page.getByRole('button', { name: 'Replay phrase', exact: true }).click();
  await expect
    .poll(() => media.evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeLessThan(track.items[1].start + 1);
  await stop.click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expectResponsive(page, 'hands-free-passages-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await expectResponsive(page, 'hands-free-passages-mobile');
  const url = page.url();
  const guestContext = await browser.newContext();
  try {
    const guest = await guestContext.newPage();
    await guest.goto(url);
    await expect(
      guest.getByRole('checkbox', { name: 'Hands-free listening', exact: true }),
    ).toBeChecked();
    await expect(guest.getByRole('combobox', { name: 'Morse repeats', exact: true })).toHaveValue(
      '3',
    );
    await expect(guest.getByLabel('Practice audio', { exact: true })).toHaveJSProperty(
      'paused',
      true,
    );
  } finally {
    await guestContext.close();
  }
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('3 Morse repeats + prerecorded spoken answer');
  await dialog.getByRole('button', { name: /^Save/ }).click();
  const entries = (await (await context.request.get('/api/entries')).json())
    .entries as PracticeSession[];
  const evidence = entries[0].metadata?.evidence;
  expect(evidence?.type).toBe('timed');
  if (evidence?.type !== 'timed') throw new Error('Expected timed listening evidence.');
  expect(evidence.generatedListening?.summaries).toContainEqual(
    expect.objectContaining({
      storyId: 'phrases-radio',
      handsFree: true,
      morseRepeats: 3,
      sentenceGapSeconds: 1,
    }),
  );
});
