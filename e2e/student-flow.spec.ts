import { expect } from '@playwright/test';
import { test } from './fixtures';
import { accountRequest, expectResponsive, openDisclosure, signIn } from './helpers';

test.use({ hasTouch: true });

test('Today opens a focused listening workspace and a concise save review at both widths', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  await page.clock.setFixedTime(new Date('2026-10-06T16:00:00Z'));
  const settings = (await (await context.request.get('/api/settings')).json()).settings;
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        settings: {
          ...settings,
          level: 'intermediate',
          timezone: 'UTC',
          firstClassDate: '2026-10-08',
        },
      })
    ).ok(),
  ).toBe(true);
  await page.reload();
  await expect(page.getByRole('region', { name: 'What should I do today?' })).toBeVisible();
  await page.getByRole('button', { name: 'Practice words', exact: true }).click();
  const play = page.getByRole('button', { name: 'Play Morse', exact: true });
  const notes = page.getByRole('textbox', { name: 'Scratchpad', exact: true });
  const startPractice = page.getByRole('button', { name: 'Start practice', exact: true });
  await expect(play).toBeVisible();
  await expect(notes).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const playBox = (await play.boundingBox())!;
    const notesBox = (await notes.boundingBox())!;
    expect(playBox.y).toBeGreaterThanOrEqual(0);
    expect(
      playBox.y + playBox.height,
      `Play should be fully reachable in the first screen at ${width}px`,
    ).toBeLessThanOrEqual(width === 390 ? 844 : 1000);
    expect(
      Math.abs(notesBox.y - playBox.y),
      `Scratchpad should stay beside playback at ${width}px`,
    ).toBeLessThan(350);
    await page.setViewportSize({ width, height: 600 });
    await startPractice.evaluate((element) => {
      window.scrollBy({
        top: element.parentElement!.getBoundingClientRect().top + 100,
        behavior: 'instant',
      });
    });
    await expect
      .poll(
        () =>
          startPractice.evaluate((element) => element.parentElement!.getBoundingClientRect().top),
        `Practice controls should stick to the viewport top at ${width}px`,
      )
      .toBe(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expectResponsive(page, 'focused-word-workspace');
  await notes.fill('Keep playback and notes together.');
  await play.tap();
  const audio = page.getByLabel('Practice audio', { exact: true });
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Stop playback', exact: true }).tap();
  await page.getByRole('button', { name: 'Review & save', exact: true }).tap();
  const review = page.getByRole('dialog');
  await expect(review.getByRole('textbox', { name: 'Scratchpad', exact: true })).toHaveValue(
    'Keep playback and notes together.',
  );
  await expect(
    review.getByText('Measured results and practice evidence', { exact: true }),
  ).toBeVisible();
  await expect(review.getByText(/^Measured word listening:/)).toBeHidden();
  await review.getByRole('textbox', { name: /^Notes/ }).fill('A focused student flow.');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await review.evaluate((element) => {
      element.scrollTop = 0;
    });
    const saveBox = (await review
      .getByRole('button', { name: 'Save practice', exact: true })
      .boundingBox())!;
    expect(saveBox.y).toBeGreaterThanOrEqual(0);
    expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(width === 390 ? 844 : 1000);
  }
  await expectResponsive(page, 'concise-practice-review');
  await openDisclosure(review, 'Measured results and practice evidence');
  await expect(review.getByText(/^Measured word listening:/)).toBeVisible();
  await review.getByRole('button', { name: 'Save practice', exact: true }).tap();
  await expect(review).toHaveCount(0);
  await expect(page).toHaveURL(/#overview$/);
  const saved = (await (await context.request.get('/api/entries')).json()).entries;
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    notes: 'A focused student flow.',
    metadata: { scratchpad: 'Keep playback and notes together.' },
  });
  expect(saved[0].minutes).toBeGreaterThan(0);
});
