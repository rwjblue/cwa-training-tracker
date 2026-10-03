import { dateInTimezone } from '../src/shared/training';
import { expect, type Locator } from '@playwright/test';
import { test } from './fixtures';
import { openDisclosure, accountRequest, expectResponsive, signIn } from './helpers';
import { syntheticRecording } from './synthetic-recording';
import type { PlannedTask } from '../src/shared/plan';

test.use({ hasTouch: true, actionTimeout: 10_000 });
const url = (wpm: number) => `https://cwa.cwops.org/wp-content/uploads/WD101_${wpm}.mp3`;
const width = 1440;

test(`private difficult marks and deliberate replay preserve actual listening at ${width}px`, async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await context.setExtraHTTPHeaders({
    'CF-Connecting-IP': '192.0.2.121',
  });
  await page.setViewportSize({ width, height: 1000 });
  await page.route(/^https:\/\/(?:[^/]+\.)?cwops\.org\//, syntheticRecording(30));
  const activate = async (control: Locator) => {
    await expect(control).toBeEnabled();

    await control.focus();
    await page.keyboard.press('Enter');
  };
  const navigate = async (name: string) => {
    const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (await menu.isVisible()) await activate(menu);
    await activate(page.getByRole('button', { name, exact: true }));
  };
  await signIn(page);
  const { settings } = await (await context.request.get('/api/settings')).json();
  const task: PlannedTask = {
    id: `mark-task-${width}`,
    title: 'Synthetic difficult recording',
    kind: 'listening',
    notes: 'Synthetic instructions',
    source: 'manual',
    done: false,
    createdAt: '2026-09-30T12:00:00Z',
    dueDate: dateInTimezone(new Date(), settings.timezone),
    link: url(10),
    exercise: { type: 'audio', url: url(10), characterWpm: 10 },
  };
  expect((await accountRequest(context, 'POST', '/api/plan', { task })).status()).toBe(201);
  await page.reload();
  const open = async () => {
    await navigate('Today');
    await activate(
      page
        .getByRole('listitem')
        .filter({ has: page.getByRole('heading', { name: task.title, exact: true }) })
        .getByRole('button', { name: 'Listen & practice', exact: true }),
    );
  };
  await open();
  await openDisclosure(page, 'Recording options · marks and replay');
  const audio = page.getByLabel('Assigned recording', { exact: true });
  await openDisclosure(page, 'Recording options · marks and replay');
  const review = page.getByRole('region', { name: 'Recording review', exact: true });
  const label = review.getByRole('textbox', {
    name: 'Difficult mark label (optional)',
    exact: true,
  });
  const mark = review.getByRole('button', { name: 'Mark difficult here', exact: true });
  const speed = page.getByRole('combobox', { name: 'Recording speed', exact: true });
  const pausedAt = async (seconds: number) => {
    // Arrange a paused native timeline position; no played audio or fake elapsed time.
    await audio.evaluate((el: HTMLAudioElement, seconds) => {
      el.pause();
      el.currentTime = seconds;
    }, seconds);
    await expect
      .poll(() =>
        audio.evaluate(
          (el: HTMLAudioElement, target) =>
            !el.seeking && el.paused && Math.abs(el.currentTime - target) < 0.01,
          seconds,
        ),
      )
      .toBe(true);
    await expect(review).toContainText(`Current position: 0:${String(seconds).padStart(2, '0')}`);
  };
  await expect(mark).toBeEnabled();
  await pausedAt(3);
  await label.fill('Synthetic paused mark');
  await activate(mark);
  await expect(review).toContainText('Difficult marks saved to your account.');
  expect((await (await context.request.get('/api/export')).json()).sessions).toHaveLength(0);
  expect(await audio.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
  const nativeReplay = async (seconds: number, expected: number) => {
    await pausedAt(seconds);
    await audio.evaluate((el: HTMLAudioElement) => {
      el.addEventListener('seeking', () => Reflect.set(window, 'replayTarget', el.currentTime), {
        once: true,
      });
      Reflect.set(window, 'replayTarget', undefined);
    });
    await activate(review.getByRole('button', { name: 'Replay 8 sec', exact: true }));
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, 'replayTarget')))
      .toBeCloseTo(expected, 1);
    await expect
      .poll(() => audio.evaluate((el: HTMLAudioElement) => !el.paused && el.currentTime > 0))
      .toBe(true);
    await expect(review).toContainText(`Replaying from 0:${String(expected).padStart(2, '0')}`);
    await expect
      .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime), { timeout: 5000 })
      .toBeGreaterThan(expected + 1);
    await activate(page.getByRole('button', { name: 'Pause practice', exact: true }));
  };
  await nativeReplay(3, 0);
  await nativeReplay(20, 12);
  await activate(
    review.getByRole('button', {
      name: 'Replay difficult mark at 0:03 — Synthetic paused mark',
      exact: true,
    }),
  );
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => !el.paused && el.currentTime > 3.3))
    .toBe(true);
  await label.fill('Synthetic playing mark');
  await activate(mark);
  await expect(review).toContainText('Difficult marks saved to your account.');
  expect(await audio.evaluate((el: HTMLAudioElement) => el.paused)).toBe(false);
  await activate(page.getByRole('button', { name: 'Pause practice', exact: true }));
  await expect(
    review.getByRole('list', { name: 'Difficult recording marks' }).getByRole('listitem'),
  ).toHaveCount(2);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (Reflect.get(window, 'blockMarks') && key.startsWith('cwa:account:operation:v1:'))
        throw new Error('Synthetic mark storage refusal');
      return set.call(this, key, value);
    };
    Reflect.set(window, 'blockMarks', true);
  });
  await label.fill('Synthetic canceled mark');
  await activate(mark);
  await expect(review.getByRole('alert')).toContainText('could not be saved');

  await openDisclosure(page, 'Choose a recording speed');
  await speed.selectOption(url(18));
  await expect(
    review.getByRole('button', { name: 'Retry saving difficult marks', exact: true }),
  ).toHaveCount(0);
  await expect(label).toHaveValue('');
  await openDisclosure(page, 'Choose a recording speed');
  await speed.selectOption(url(10));
  await expect(label).toHaveValue('Synthetic canceled mark');
  await expect(
    review.getByRole('button', { name: 'Retry saving difficult marks', exact: true }),
  ).toBeVisible();
  page.once('dialog', (dialog) => dialog.dismiss());
  await activate(page.getByRole('button', { name: 'Finish practice', exact: true }));
  await expect(
    review.getByRole('button', { name: 'Retry saving difficult marks', exact: true }),
  ).toBeVisible();
  await activate(review.getByRole('button', { name: 'Cancel mark edit', exact: true }));
  await expect(review.getByRole('listitem')).toHaveCount(2);
  await label.fill('Synthetic retried mark');
  await activate(mark);
  await expect(
    review.getByRole('button', { name: 'Retry saving difficult marks', exact: true }),
  ).toBeVisible();

  await openDisclosure(page, 'Choose a recording speed');
  await speed.selectOption(url(18));
  await label.fill('Synthetic other-file draft');
  await openDisclosure(page, 'Choose a recording speed');
  await speed.selectOption(url(10));
  await expect(label).toHaveValue('Synthetic retried mark');
  await navigate('Practice log');
  await navigate('Practice studio');
  await expect(label).toHaveValue('Synthetic retried mark');
  await page.evaluate(() => Reflect.set(window, 'blockMarks', false));
  await activate(review.getByRole('button', { name: 'Retry saving difficult marks', exact: true }));
  await expect(review).toContainText('Difficult marks saved to your account.');
  await expect(review.getByRole('listitem')).toHaveCount(3);
  // Server refusal has a truthful durable device receipt and uses the existing account retry.
  let reject = true;
  await page.route('**/api/account-operations', (route) =>
    reject
      ? route.fulfill({ status: 503, json: { error: 'Synthetic mark sync unavailable' } })
      : route.continue(),
  );
  await label.fill('Synthetic queued mark');
  await activate(mark);
  await expect(review).toContainText('saved on this device, waiting to sync');
  reject = false;
  await activate(page.getByRole('button', { name: 'Retry account sync', exact: true }));
  await expect
    .poll(
      async () =>
        ((await (await context.request.get('/api/export')).json()).plan as PlannedTask[]).find(
          (item) => item.id === task.id,
        )?.recordingMarks?.[0].marks.length,
    )
    .toBe(4);
  await page.unroute('**/api/account-operations');
  await openDisclosure(page, 'Choose a recording speed');
  await speed.selectOption(url(18));
  await expect(audio).toHaveAttribute('src', url(18));
  await expect(mark).toBeEnabled();
  await expect(label).toHaveValue('Synthetic other-file draft');
  await expect(review.getByRole('list')).toHaveCount(0);
  await label.fill('Synthetic selected unplayed file');
  await activate(mark);
  await expect(review).toContainText('Difficult marks saved to your account.');
  await openDisclosure(page, 'Choose a recording speed');
  await speed.selectOption(url(10));
  await openDisclosure(page, 'Recording options · marks and replay');
  await expect(review.getByRole('listitem')).toHaveCount(4);
  await navigate('Practice log');
  await navigate('Practice studio');
  await openDisclosure(page, 'Recording options · marks and replay');
  await expect(review.getByRole('listitem')).toHaveCount(4);
  expect(await label.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(
    44,
  );

  await expectResponsive(page, `recording-marks-${width}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Synthetic paused mark');
  await page.keyboard.press('Escape');
  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  const receipt = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/entries') &&
      response.request().method() === 'POST' &&
      [200, 201].includes(response.status()),
  );
  await activate(dialog.getByRole('button', { name: 'Save practice', exact: true }));
  await receipt;
  await expect(dialog).toHaveCount(0);
  const data = await (await context.request.get('/api/export')).json();
  expect(data.sessions).toHaveLength(1);
  const recordings = data.sessions[0].metadata.evidence.recordings;
  expect(recordings).toHaveLength(1);
  expect(recordings[0].url).toBe(url(10));
  expect(recordings[0].marks.marks).toHaveLength(4);
  expect(recordings[0].seconds).toBeGreaterThan(2);
  expect(recordings[0].seconds).toBeLessThan(12);
  expect(recordings[0].passes.durations[0].completedPasses).toBe(0);
  await open();
  await openDisclosure(page, 'Recording options · marks and replay');
  await activate(
    review.getByRole('button', {
      name: 'Remove difficult mark at 0:03 — Synthetic paused mark',
      exact: true,
    }),
  );
  await expect(review).toContainText('Difficult marks saved to your account.');
  expect((await (await context.request.get('/api/export')).json()).sessions).toEqual(data.sessions);
  await navigate('Practice log');
  await activate(page.getByText('Practice evidence', { exact: true }));
  await expect(page.getByRole('main')).toContainText('Synthetic paused mark');
  await navigate('Academy guide');
  await activate(page.getByRole('button', { name: 'Practice report', exact: true }));
  await expect(page.getByRole('dialog')).toContainText('Synthetic paused mark');
  await page.keyboard.press('Escape');
  await navigate('Your account');
  await activate(page.getByRole('button', { name: 'Sign out', exact: true }));
  await expect(page.getByRole('main')).not.toContainText('Synthetic paused mark');
  expect((await context.request.get('/api/export')).status()).toBe(401);
  await signIn(page);
  await navigate('Practice log');
  await expect(page.getByRole('main')).not.toContainText('Synthetic paused mark');
  expect((await (await context.request.get('/api/export')).json()).sessions).toHaveLength(0);
});
