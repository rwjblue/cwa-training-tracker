import { dateInTimezone } from '../src/shared/training';
import { expect, type Locator } from '@playwright/test';
import { test } from './fixtures';
import { accountRequest, expectResponsive, signIn } from './helpers';
import { syntheticRecording } from './synthetic-recording';
import type { PlannedTask } from '../src/shared/plan';

test('compact recording rewind clamps early positions and saves only actual rehearing', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route(/^https:\/\/(?:[^/]+\.)?cwops\.org\//, syntheticRecording(30));
  const activate = async (control: Locator) => {
    await expect(control).toBeEnabled();
    await control.focus();
    await page.keyboard.press('Enter');
  };
  await signIn(page);
  const { settings } = await (await context.request.get('/api/settings')).json();
  const url = 'https://cwa.cwops.org/wp-content/uploads/WD101_10.mp3';
  const task: PlannedTask = {
    id: 'rewind-task',
    title: 'Synthetic rewind recording',
    kind: 'listening',
    notes: 'Synthetic instructions',
    source: 'manual',
    done: false,
    createdAt: '2026-09-30T12:00:00Z',
    dueDate: dateInTimezone(new Date(), settings.timezone),
    link: url,
    exercise: { type: 'audio', url, characterWpm: 10 },
  };
  expect((await accountRequest(context, 'POST', '/api/plan', { task })).status()).toBe(201);
  await page.reload();
  await activate(
    page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: task.title, exact: true }) })
      .getByRole('button', { name: 'Listen & practice', exact: true }),
  );
  const audio = page.getByLabel('Assigned recording', { exact: true });
  const rewind = page.getByRole('button', { name: 'Replay 8 sec', exact: true });
  await expect(audio).toHaveAttribute('src', url);
  await expect
    .poll(() =>
      audio.evaluate((el: HTMLAudioElement) => el.readyState === HTMLMediaElement.HAVE_ENOUGH_DATA),
    )
    .toBe(true);
  await expect(rewind).toBeVisible();
  await expect(page.getByText('Recording options · marks and replay', { exact: true })).toHaveCount(
    0,
  );

  for (const [position, expected] of [
    [3, 0],
    [20, 12],
  ]) {
    // Arrange a paused native position. Seeking supplies no heard time or pass credit.
    await audio.evaluate((el: HTMLAudioElement, seconds) => {
      el.pause();
      el.currentTime = seconds;
    }, position);
    await expect
      .poll(() =>
        audio.evaluate(
          (el: HTMLAudioElement, target) =>
            !el.seeking && el.paused && Math.abs(el.currentTime - target) < 0.01,
          position,
        ),
      )
      .toBe(true);
    await audio.evaluate((el: HTMLAudioElement) => {
      Reflect.set(window, 'rewindTarget', undefined);
      el.addEventListener('seeking', () => Reflect.set(window, 'rewindTarget', el.currentTime), {
        once: true,
      });
    });
    await activate(rewind);
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, 'rewindTarget')))
      .toBeCloseTo(expected, 1);
    await expect
      .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime))
      .toBeGreaterThan(expected + 1.1);
    await activate(page.getByRole('button', { name: 'Pause practice', exact: true }));
    expect(await audio.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
  }

  await expectResponsive(page, 'recording-rewind');
  expect((await (await context.request.get('/api/entries')).json()).entries).toEqual([]);
  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  const dialog = page.getByRole('dialog');
  const receipt = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/entries') &&
      response.request().method() === 'POST' &&
      [200, 201].includes(response.status()),
  );
  await activate(dialog.getByRole('button', { name: 'Save practice', exact: true }));
  await receipt;
  await expect(dialog).toHaveCount(0);
  const { entries } = await (await context.request.get('/api/entries')).json();
  expect(entries).toHaveLength(1);
  const recordings = entries[0].metadata.evidence.recordings;
  expect(recordings).toHaveLength(1);
  expect(recordings[0].url).toBe(url);
  expect(recordings[0].seconds).toBeGreaterThan(2);
  expect(recordings[0].seconds).toBeLessThan(8);
  expect(recordings[0].passes.durations).toEqual([{ durationSeconds: 30, completedPasses: 0 }]);
});
