import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { test } from './fixtures';
import { accountRequest, signIn } from './helpers';

test.use({ hasTouch: true, actionTimeout: 10_000 });

test('native MP3 duration estimates retain a full pass through Save and reload', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const durations: number[] = [];
    Reflect.set(window, 'recordingDurations', durations);
    document.addEventListener(
      'durationchange',
      (event) => {
        const audio = event.target;
        if (audio instanceof HTMLAudioElement && audio.dataset.recording === 'true')
          durations.push(audio.duration);
      },
      true,
    );
  });
  await signIn(page);
  await page.addInitScript((fixed) => {
    const nativeDate = Date;
    const offset = fixed - nativeDate.now();
    Reflect.set(
      window,
      'Date',
      new Proxy(nativeDate, {
        apply: () => new nativeDate(nativeDate.now() + offset).toString(),
        construct: (target, args, newTarget) =>
          Reflect.construct(target, args.length ? args : [nativeDate.now() + offset], newTarget),
        get: (target, property, receiver) =>
          property === 'now'
            ? () => nativeDate.now() + offset
            : Reflect.get(target, property, receiver),
      }),
    );
  }, Date.parse('2026-10-06T16:00:00Z'));
  const { settings } = await (await context.request.get('/api/settings')).json();
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        settings: {
          ...settings,
          level: 'intermediate',
          firstClassDate: '2026-10-08',
          timezone: 'UTC',
        },
      })
    ).ok(),
  ).toBe(true);
  await page.reload();
  const { plan } = await (await context.request.get('/api/plan')).json();
  const task = plan.find(
    (item: { dueDate?: string; exercise?: { type: string; url?: string } }) =>
      item.dueDate === '2026-10-06' &&
      item.exercise?.type === 'audio' &&
      /WD101[-_]10/i.test(item.exercise.url ?? ''),
  );
  expect(task).toBeTruthy();
  // Own generated tone, not a course recording. An MP3 without a Xing header
  // makes Chromium refine its native duration as it decodes the real frames.
  // ffmpeg -f lavfi -i sine=frequency=600:duration=4.5 -c:a libmp3lame
  //   -q:a 4 -write_xing 0 duration-estimate.mp3
  const mp3 = await readFile(new URL('./audio-fixtures/duration-estimate.mp3', import.meta.url));
  await page.route(task.exercise.url, (route) => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '');
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), mp3.length - 1) : mp3.length - 1;
    return route.fulfill({
      status: range ? 206 : 200,
      contentType: 'audio/mpeg',
      headers: {
        'Accept-Ranges': 'bytes',
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${mp3.length}` } : {}),
      },
      body: mp3.subarray(start, end + 1),
    });
  });
  const taskItem = () =>
    page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: task.title, exact: true }) });
  await taskItem().getByRole('button', { name: 'Listen & practice', exact: true }).tap();
  const audio = page.getByLabel('Assigned recording', { exact: true });
  const progress = page.getByRole('region', { name: 'Listening passes', exact: true });
  const count = (label: string) =>
    progress
      .locator('dl > div')
      .filter({ has: page.getByText(label, { exact: true }) })
      .locator('dd');
  await page.getByRole('button', { name: 'Start practice', exact: true }).tap();
  await expect(count('This session')).toHaveText('1', { timeout: 10_000 });
  const nativeDuration = await audio.evaluate((item: HTMLAudioElement) => item.duration);
  const revisions: number[] = await page.evaluate(() => Reflect.get(window, 'recordingDurations'));
  expect(new Set(revisions.filter(Number.isFinite)).size).toBeGreaterThan(1);
  await test.info().attach('native-duration-estimates', {
    body: JSON.stringify(revisions),
    contentType: 'application/json',
  });
  await page.getByRole('button', { name: 'Save', exact: true }).tap();
  await page.getByRole('dialog').getByRole('button', { name: 'Save practice', exact: true }).tap();
  await expect(taskItem()).toContainText('1 listening pass saved · 1 minimum remaining');
  await expect(taskItem().getByText('Started', { exact: true })).toBeVisible();
  const { entries } = await (await context.request.get('/api/entries')).json();
  expect(entries).toHaveLength(1);
  expect(entries[0].metadata.evidence.recordings[0]).toMatchObject({
    url: task.exercise.url,
    passes: {
      durations: [{ durationSeconds: nativeDuration, completedPasses: 1 }],
    },
  });
  await page.reload();
  await expect(taskItem()).toContainText('1 listening pass saved · 1 minimum remaining');
  await taskItem().getByRole('button', { name: 'Listen & practice', exact: true }).tap();
  await expect(count('Previously saved')).toHaveText('1');
  await expect(count('This session')).toHaveText('0');

  // A real reload of this same URL is a new source, even if the native duration
  // estimate matches. Hearing its old prefix cannot fill the new source's gap.
  await page.getByRole('button', { name: 'Start practice', exact: true }).tap();
  await expect
    .poll(() => audio.evaluate((item: HTMLAudioElement) => item.currentTime))
    .toBeGreaterThan(1.5);
  const resumeAt = await audio.evaluate((item: HTMLAudioElement) => {
    item.pause();
    const position = item.currentTime - 0.4;
    item.load();
    return position;
  });
  await expect
    .poll(() => audio.evaluate((item: HTMLAudioElement) => item.readyState >= 3))
    .toBe(true);
  await audio.evaluate((item: HTMLAudioElement, position) => {
    item.currentTime = position;
  }, resumeAt);
  await expect
    .poll(() => audio.evaluate((item: HTMLAudioElement) => !item.seeking && item.currentTime > 0.5))
    .toBe(true);
  await audio.evaluate((item: HTMLAudioElement) => item.play());
  await expect.poll(() => audio.evaluate((item: HTMLAudioElement) => item.ended)).toBe(true);
  await expect(count('This session')).toHaveText('0');
  await page.getByRole('button', { name: 'Finish practice', exact: true }).tap();
  await expect(taskItem()).toContainText('1 listening pass saved · 1 minimum remaining');
});
