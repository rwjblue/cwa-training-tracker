import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { PRACTICE_STORIES, practiceStory } from '../src/shared/listening-stories';
import { storyListeningTrack } from '../src/client/listening-configuration';
import { DEFAULT_PRACTICE_PREFERENCES } from '../src/client/practice-preferences';
import { expectResponsive, signIn } from './helpers';

test.use({ hasTouch: true, extraHTTPHeaders: { 'CF-Connecting-IP': '192.0.2.230' } });
const media = (page: Page) => page.getByLabel('Practice audio', { exact: true });
const sound = (page: Page) =>
  page.locator('details').filter({ has: page.getByText(/^Sound settings ·/) });
const selector = (page: Page) => page.getByRole('combobox', { name: 'Story', exact: true });
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.tap();
  await page.getByRole('button', { name, exact: true }).click();
}
async function openStories(page: Page) {
  await navigate(page, 'Practice studio');
  await page.getByRole('button', { name: 'Stories', exact: true }).press('Enter');
}
async function paused(page: Page) {
  await expect
    .poll(() => media(page).evaluate((audio: HTMLAudioElement) => audio.paused))
    .toBe(true);
}
async function start(page: Page) {
  await page.getByRole('button', { name: /^(Start|Resume) practice$/, exact: true }).click();
  await expect
    .poll(() => media(page).evaluate((audio: HTMLAudioElement) => audio.paused))
    .toBe(false);
}
async function pause(page: Page) {
  await page.getByRole('button', { name: 'Pause practice', exact: true }).click();
  await paused(page);
}

test('public Stories share native sentence/word transport and retain independent paused settings', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openStories(page);
  await expect(selector(page).locator('option')).toHaveCount(3);
  await expect(page.getByRole('combobox', { name: 'QSO scenario', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New QSO', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Check your copy', exact: true })).toHaveCount(0);
  for (const story of PRACTICE_STORIES) {
    await selector(page).selectOption(story.id);
    await paused(page);
    await start(page);
    await expect
      .poll(() => media(page).evaluate((audio: HTMLAudioElement) => audio.currentTime))
      .toBeGreaterThan(0.1);
    expect(await page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe(story.title);
    expect(
      await page.evaluate(() => navigator.mediaSession.metadata?.artwork.length),
    ).toBeGreaterThan(0);
    await pause(page);
  }
  await page.getByRole('button', { name: 'Reveal text', exact: true }).press('Enter');
  const track = storyListeningTrack(practiceStory('story-light'), DEFAULT_PRACTICE_PREFERENCES);
  await page.getByRole('button', { name: 'Next', exact: true }).press('Enter');
  await paused(page);
  await expect
    .poll(() => media(page).evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeCloseTo(track.items[1].start, 3);
  await expect(page.getByText('SENTENCE 2 OF 13', { exact: true })).toBeVisible();
  const catalog = page
    .locator('details')
    .filter({ has: page.getByText('View full story', { exact: true }) });
  await catalog.getByText('View full story', { exact: true }).click();
  const occurrence = track.words.findIndex((word) => word.itemIndex === 1 && word.text === 'THE');
  const exactWord = catalog.getByRole('button', {
    name: `Seek to word ${occurrence + 1}: THE`,
    exact: true,
  });
  await exactWord.press('Enter');
  await paused(page);
  await expect
    .poll(() => media(page).evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeCloseTo(track.words[occurrence].start, 3);
  await page.getByRole('button', { name: 'Back 10 sec', exact: true }).press('Enter');
  await paused(page);
  await expect
    .poll(() => media(page).evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeCloseTo(Math.max(0, track.words[occurrence].start - 10), 3);
  const selectedName = await catalog
    .locator('button[aria-current="true"]')
    .getAttribute('aria-label');
  await sound(page)
    .getByText(/^Sound settings ·/)
    .click();
  const before = await media(page).evaluate((audio: HTMLAudioElement) => audio.src);
  await page.getByRole('slider', { name: 'Character speed', exact: true }).press('ArrowRight');
  await expect
    .poll(() => media(page).evaluate((audio: HTMLAudioElement) => audio.src))
    .not.toBe(before);
  await paused(page);
  await expect(catalog.getByRole('button', { name: selectedName!, exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await start(page);
  const playingSource = await media(page).evaluate((audio: HTMLAudioElement) => audio.src);
  await page.getByRole('slider', { name: 'Effective speed', exact: true }).press('ArrowRight');
  await expect
    .poll(() => media(page).evaluate((audio: HTMLAudioElement) => audio.src))
    .not.toBe(playingSource);
  await expect
    .poll(() => media(page).evaluate((audio: HTMLAudioElement) => audio.paused))
    .toBe(false);
  await pause(page);
  await expect(page.locator('.playback-note')).toContainText('21 / 11 WPM');
  const retainedPosition = await media(page).evaluate(
    (audio: HTMLAudioElement) => audio.currentTime,
  );
  await navigate(page, 'Academy guide');
  await page.getByRole('button', { name: /Return to practice/ }).click();
  await paused(page);
  await expect
    .poll(() => media(page).evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeCloseTo(retainedPosition, 3);
  await page.getByRole('button', { name: 'Reset story to beginning', exact: true }).press('Enter');
  await paused(page);
  await expect
    .poll(() => media(page).evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBe(0);
  await page.getByRole('button', { name: 'Hide text', exact: true }).press('Enter');
  await expect(
    page.getByText('Listen first. Reveal when you’re ready.', { exact: true }),
  ).toBeVisible();
  await expectResponsive(page, 'story-native-retained');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Word listening', exact: true }).tap();
  await expect(
    sound(page).getByText('Sound settings · 20/10 WPM · 600 Hz', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Stories', exact: true }).tap();
  await expect(selector(page)).toHaveValue('story-light');
  await expect(
    sound(page).getByText('Sound settings · 21/11 WPM · 600 Hz', { exact: true }),
  ).toBeVisible();
  await paused(page);
  await page.reload();
  await openStories(page);
  await expect(selector(page)).toHaveValue('story-light');
  await expect(
    sound(page).getByText('Sound settings · 21/11 WPM · 600 Hz', { exact: true }),
  ).toBeVisible();
  await paused(page);
  await expect
    .poll(() => media(page).evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBe(0);
  await sound(page)
    .getByText(/^Sound settings ·/)
    .click();
  await page.getByRole('button', { name: 'Log practice manually', exact: true }).tap();
  const manual = page.getByRole('dialog');
  await expect(manual.getByLabel('Character WPM', { exact: true })).toHaveValue('21');
  await expect(manual.getByLabel('Effective WPM', { exact: true })).toHaveValue('11');
  await manual.getByRole('button', { name: 'Cancel', exact: true }).tap();
  await paused(page);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Reflect.set(window, 'refuseStoryPreferences', true);
    Storage.prototype.setItem = function (key, value) {
      if (key === 'cwa.practice.preferences.v1' && Reflect.get(window, 'refuseStoryPreferences'))
        throw new Error('Synthetic preference storage refusal');
      return set.call(this, key, value);
    };
  });
  await page.getByRole('slider', { name: 'Character speed', exact: true }).press('ArrowRight');
  await expect(
    page.getByText(
      'Active for this visit. Your browser is not allowing these preferences to be remembered.',
      { exact: true },
    ),
  ).toBeVisible();
  await page.evaluate(() => Reflect.set(window, 'refuseStoryPreferences', false));
  await page.getByRole('slider', { name: 'Character speed', exact: true }).press('ArrowRight');
  await expect(
    page.getByText('Sound defaults are saved on this device, including when you sign out.', {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole('slider', { name: 'Effective speed', exact: true }).press('Home');
  await page.getByRole('slider', { name: 'Character speed', exact: true }).press('Home');
  await expect(page.getByRole('alert')).toContainText('exceeds 20 minutes');
  await expect(selector(page)).toHaveValue('story-light');
  await page.getByRole('slider', { name: 'Character speed', exact: true }).press('End');
  await page.getByRole('slider', { name: 'Effective speed', exact: true }).press('End');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await start(page);
  await expect
    .poll(() => media(page).evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(0.1);
  await pause(page);
});

test('actual Story save keeps native time, canceled review and exact retry private through saved evidence and history', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  await openStories(page);
  await selector(page).selectOption('story-trail');
  await start(page);
  await expect
    .poll(() => media(page).evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(1.3);
  await pause(page);
  const heard = await media(page).evaluate((audio: HTMLAudioElement) => audio.currentTime);
  await selector(page).selectOption('story-radio');
  await page.getByRole('button', { name: 'Review & save', exact: true }).press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('The trail marker (short)');
  await expect(dialog).not.toContainText('The quiet band (medium)');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).press('Enter');
  await expect(selector(page)).toHaveValue('story-radio');
  await paused(page);
  const bodies: string[] = [];
  let reject = true;
  await page.route('**/api/entries', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    bodies.push(route.request().postData()!);
    if (reject)
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Synthetic Story save unavailable' }),
      });
    await route.continue();
  });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Reflect.set(window, 'restoreStoryResultStorage', () => {
      Storage.prototype.setItem = original;
    });
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('cwa:practice:pending:v1:'))
        throw new DOMException('Synthetic storage full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Review & save', exact: true }).tap();
  await dialog.evaluate((element) =>
    Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)),
  );
  await expectResponsive(page, 'story-private-review');
  await dialog.getByRole('button', { name: 'Save practice', exact: true }).tap();
  await expect(dialog.getByRole('alert')).toContainText('retained for an exact retry');
  reject = false;
  await page.evaluate(() => (Reflect.get(window, 'restoreStoryResultStorage') as () => void)());
  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/entries' &&
      response.request().method() === 'POST' &&
      [200, 201].includes(response.status()),
  );
  await dialog.getByRole('button', { name: 'Save practice', exact: true }).tap();
  await saved;
  await expect(dialog).toHaveCount(0);
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toBe(bodies[0]);
  const entries = (await (await context.request.get('/api/entries')).json()).entries;
  expect(entries).toHaveLength(1);
  const entry = entries[0];
  expect(entry.notes).toContain('The trail marker (short)');
  expect(entry.qsoCount).toBeUndefined();
  expect(entry.metadata.evidence.measurement.seconds).toBeCloseTo(heard, 2);
  expect(entry.minutes).toBe(entry.metadata.evidence.measurement.seconds / 60);
  expect(entry.metadata.evidence.generatedListening.summaries).toEqual([
    {
      mode: 'story',
      storyId: 'story-trail',
      characterWpm: 20,
      effectiveWpm: 10,
      toneHz: 600,
      sentenceGapSeconds: 2,
    },
  ]);
  await navigate(page, 'Practice log');
  await page.getByText('Practice evidence', { exact: true }).tap();
  await expect(page.getByText(/Played The trail marker \(short\)/)).toBeVisible();
  await expectResponsive(page, 'story-private-history');
});
