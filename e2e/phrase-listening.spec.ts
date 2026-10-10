import { expect } from '@playwright/test';
import { test } from './fixtures';
import { expectResponsive, signIn } from './helpers';
import {
  DEFAULT_PRACTICE_PREFERENCES,
  PRACTICE_PREFERENCES_KEY,
} from '../src/client/practice-preferences';
import type { PracticeSession } from '../src/shared/training';

test('phrases and sentences stop natively, replay whole chunks, share paused and save actual material', async ({
  page,
  context,
  browser,
}) => {
  await signIn(page);
  await page.goto(
    '/#practice/stories?story=phrases-radio&chunk=1&cwpm=60&ewpm=60&tone=650&variable=0',
  );
  const media = page.getByLabel('Practice audio', { exact: true });
  const choices = page.getByRole('group', { name: 'Practice length', exact: true });
  await expect(
    page.getByRole('heading', { name: 'Sentences & stories', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: 'Pause after each phrase', exact: true }),
  ).toBeChecked();
  await expect(page.getByText('8 phrases · 2–3 words each', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Replay phrase', exact: true }).press('Enter');
  await expect.poll(() => media.evaluate((audio: HTMLAudioElement) => audio.ended)).toBe(true);
  await expect(page.getByText('PHRASE 1 OF 8 · 2 WORDS', { exact: true })).toBeVisible();
  await expect(page.getByText('Phrase complete.', { exact: false })).toBeVisible();
  const first = await media.evaluate((audio: HTMLAudioElement) => ({
    src: audio.src,
    duration: audio.duration,
  }));
  await page.getByRole('button', { name: 'Reveal text', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Seek to word 2: RADIO', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Replay phrase', exact: true }).press('Enter');
  await expect(media).toHaveJSProperty('paused', false);
  expect(await media.evaluate((audio: HTMLAudioElement) => audio.src)).toBe(first.src);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(media).toHaveJSProperty('paused', true);
  await expect(page.getByText('PHRASE 2 OF 8 · 3 WORDS', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Replay phrase', exact: true }).click();
  await expect.poll(() => media.evaluate((audio: HTMLAudioElement) => audio.ended)).toBe(true);
  await expect(page.getByText('PHRASE 2 OF 8 · 3 WORDS', { exact: true })).toBeVisible();
  await page.getByText(/^Sound settings ·/).click();
  await page.getByRole('slider', { name: 'Character speed', exact: true }).press('ArrowLeft');
  await expect(media).toHaveJSProperty('paused', true);
  await expect(page.getByText('PHRASE 2 OF 8 · 3 WORDS', { exact: true })).toBeVisible();
  await page.getByText(/^Sound settings ·/).click();
  await choices.getByRole('button', { name: 'Sentences', exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Sentence collection', exact: true }),
  ).toHaveValue('sentences-radio');
  await page.getByRole('button', { name: 'Replay sentence', exact: true }).click();
  await expect.poll(() => media.evaluate((audio: HTMLAudioElement) => audio.ended)).toBe(true);
  await expect(page.getByText('SENTENCE 1 OF 8 · 4 WORDS', { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expectResponsive(page, 'phrase-sentence-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  const chunk = await page.locator('.trainer-transmission').boundingBox();
  const scratchpad = await page
    .getByRole('textbox', { name: 'Scratchpad', exact: true })
    .boundingBox();
  expect(chunk!.y + chunk!.height).toBeLessThan(scratchpad!.y);
  await expectResponsive(page, 'phrase-sentence-mobile');

  const sharedUrl = page.url();
  const recipient = await browser.newContext();
  try {
    await recipient.addInitScript(
      ({ key, preferences }) => localStorage.setItem(key, JSON.stringify(preferences)),
      {
        key: PRACTICE_PREFERENCES_KEY,
        preferences: {
          ...DEFAULT_PRACTICE_PREFERENCES,
          storySettings: {
            ...DEFAULT_PRACTICE_PREFERENCES.storySettings,
            storyId: 'story-trail',
            pauseAfterChunk: false,
          },
        },
      },
    );
    const guest = await recipient.newPage();
    await guest.goto(sharedUrl);
    await expect(
      guest.getByRole('combobox', { name: 'Sentence collection', exact: true }),
    ).toHaveValue('sentences-radio');
    await expect(
      guest.getByRole('checkbox', { name: 'Pause after each sentence', exact: true }),
    ).toBeChecked();
    const guestMedia = guest.getByLabel('Practice audio', { exact: true });
    await expect(guestMedia).toHaveJSProperty('paused', true);
    await expect(guest.getByRole('textbox', { name: 'Scratchpad', exact: true })).toHaveValue('');
    await guest.getByRole('button', { name: 'Replay sentence', exact: true }).click();
    await expect
      .poll(() => guestMedia.evaluate((audio: HTMLAudioElement) => audio.ended))
      .toBe(true);
    expect(await guestMedia.evaluate((audio: HTMLAudioElement) => audio.duration)).toBe(
      await media.evaluate((audio: HTMLAudioElement) => audio.duration),
    );
    await guest.reload();
    await expect(guestMedia).toHaveJSProperty('paused', true);
    await expect(
      guest.getByRole('checkbox', { name: 'Pause after each sentence', exact: true }),
    ).toBeChecked();
  } finally {
    await recipient.close();
  }

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('pause after each phrase');
  await expect(dialog).toContainText('pause after each sentence');
  await dialog.getByRole('button', { name: /^Save/, exact: false }).click();
  const saved = (await (await context.request.get('/api/entries')).json())
    .entries as PracticeSession[];
  expect(saved).toHaveLength(1);
  const evidence = saved[0].metadata?.evidence;
  expect(evidence?.type).toBe('timed');
  if (evidence?.type !== 'timed') throw new Error('Expected timed listening evidence.');
  expect(evidence.generatedListening?.summaries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        storyId: 'phrases-radio',
        pauseAfterChunk: true,
        sentenceGapSeconds: 0,
      }),
      expect.objectContaining({
        storyId: 'sentences-radio',
        pauseAfterChunk: true,
        sentenceGapSeconds: 0,
      }),
    ]),
  );
});
