import { expect, type Locator } from '@playwright/test';
import { test } from './fixtures';
import { accountRequest, expectResponsive, signIn } from './helpers';
import { syntheticRecording } from './synthetic-recording';

test.use({
  hasTouch: true,
  actionTimeout: 10_000,
  extraHTTPHeaders: { 'CF-Connecting-IP': '192.0.2.110' },
});

const width = 390;

test(`course replay uses observed passes and cancels obsolete native Play at ${width}px`, async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width, height: 844 });
  const activate = async (control: Locator) => {
    await expect(control).toBeEnabled();
    await control.tap();
  };
  const toggle = async (control: Locator) => {
    await control.tap();
  };
  const navigate = async (name: string) => {
    const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (await menu.isVisible()) await activate(menu);
    await activate(page.getByRole('button', { name, exact: true }));
  };
  await signIn(page);
  await page.addInitScript((fixed) => {
    const native = Date;
    const offset = fixed - native.now();
    Reflect.set(
      window,
      'Date',
      new Proxy(native, {
        apply: () => new native(native.now() + offset).toString(),
        construct: (target, args, newTarget) =>
          Reflect.construct(target, args.length ? args : [native.now() + offset], newTarget),
        get: (target, key, receiver) =>
          key === 'now' ? () => native.now() + offset : Reflect.get(target, key, receiver),
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
    (item: { dueDate: string; exercise?: { url?: string } }) =>
      item.dueDate === '2026-10-06' && /WD101[-_]10/i.test(item.exercise?.url ?? ''),
  );
  expect(task.exercise.minimumPasses).toBe(2);
  // Ten seconds reaches the native clock’s 100ms jitter allowance without
  // changing whole-pass coverage checks or inventing listened time.
  await page.route(/^https:\/\/(?:[^/]+\.)?cwops\.org\//, syntheticRecording(10));
  await activate(
    page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: task.title, exact: true }) })
      .getByRole('button', { name: 'Listen & practice', exact: true }),
  );
  const audio = page.getByLabel('Assigned recording', { exact: true });
  const replay = page.getByRole('checkbox', {
    name: 'Automatically replay required course passes',
  });
  const count = page
    .getByRole('region', { name: 'Listening passes', exact: true })
    .locator('dl > div')
    .filter({ has: page.getByText('This block', { exact: true }) })
    .locator('dd');
  const paused = () => audio.evaluate((el: HTMLAudioElement) => el.paused);
  const start = () =>
    activate(page.getByRole('button', { name: /^(Start|Resume) practice$/, exact: true }));
  const reset = async () => {
    await activate(page.getByRole('button', { name: 'Reset session', exact: true }));
    const discard = page.getByRole('button', { name: 'Discard & reset', exact: true });
    if (await discard.isVisible()) await activate(discard);
    await expect(count).toHaveText('0');
    await expect.poll(paused).toBe(true);
    await audio.evaluate((el: HTMLAudioElement) => {
      el.currentTime = 0;
    });
    await expect
      .poll(() => audio.evaluate((el: HTMLAudioElement) => !el.seeking && el.currentTime < 0.01))
      .toBe(true);
  };
  await expect(replay).not.toBeChecked();
  const originalGenerated = await page.evaluate(() =>
    localStorage.getItem('cwa.practice.preferences.v1'),
  );
  expect(originalGenerated).not.toBeNull();
  await start();
  await expect(count).toHaveText('1', { timeout: 15_000 });
  await expect.poll(paused).toBe(true);
  await expect(page.getByRole('group', { name: 'End of pass choices' })).toBeVisible();

  await expect(page.getByRole('button', { name: 'Start recall timer', exact: true })).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Full listening pass recorded.' }),
  ).toBeVisible();
  await reset();
  await toggle(replay);
  await expect(replay).toBeChecked();
  await audio.evaluate((el: HTMLAudioElement) => {
    el.currentTime = el.duration - 0.1;
  });
  await expect
    .poll(() =>
      audio.evaluate((el: HTMLAudioElement) => !el.seeking && el.currentTime > el.duration - 0.2),
    )
    .toBe(true);
  await start();
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.ended)).toBe(true);
  await expect(count).toHaveText('0');
  await expect(
    page.getByRole('status').filter({ hasText: 'Some material was skipped.' }),
  ).toBeVisible();
  await expect.poll(paused).toBe(true);

  // Delay only the pending Play call. Earlier pass credit is real native media.
  await page.evaluate(() => {
    const native = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      const control = Reflect.get(window, 'nextReplay');
      if (
        this instanceof HTMLAudioElement &&
        this.dataset.recording === 'true' &&
        this.ended &&
        control
      ) {
        Reflect.set(window, 'nextReplay', undefined);
        if (control === 'reject')
          return Promise.reject(new DOMException('Synthetic autoplay denied', 'NotAllowedError'));
        return new Promise<void>((resolve, reject) => {
          Reflect.set(window, 'releaseReplay', () => native.call(this).then(resolve, reject));
        });
      }
      return native.call(this);
    };
  });
  // The playback controller covers stale requests and source replacement.
  // Keep the course checkbox's pending automatic continuation wiring native.
  {
    await reset();
    await page.evaluate(() => Reflect.set(window, 'nextReplay', 'hold'));
    await start();
    await expect(count).toHaveText('1', { timeout: 15_000 });
    await expect(page.getByRole('status').filter({ hasText: 'Starting listening…' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pause practice', exact: true })).toBeVisible();
    const old = await audio.elementHandle();
    await toggle(replay);
    await page.evaluate(() => Reflect.get(window, 'releaseReplay')());
    await expect.poll(() => old!.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
    await toggle(replay);
    await expect(count).toHaveText('1');
    await expect.poll(paused).toBe(true);
  }
  await reset();
  await page.evaluate(() => Reflect.set(window, 'nextReplay', 'reject'));
  await start();
  await expect(count).toHaveText('1', { timeout: 15_000 });
  await expect(
    page.getByRole('alert').filter({ hasText: 'Automatic replay could not start.' }),
  ).toBeVisible();
  await expect.poll(paused).toBe(true);
  await activate(page.getByRole('button', { name: 'Play another pass', exact: true }));
  await expect(count).toHaveText('2', { timeout: 15_000 });
  await expect.poll(paused).toBe(true);
  // Turning the choice off leaves an already audible pass playing.
  await activate(page.getByRole('button', { name: 'Play another pass', exact: true }));
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime))
    .toBeGreaterThan(0.5);
  await toggle(replay);
  await expect.poll(paused).toBe(false);
  await activate(page.getByRole('button', { name: 'Pause practice', exact: true }));
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Reflect.set(window, 'restoreReplayStorage', () => {
      Storage.prototype.setItem = original;
    });
    Storage.prototype.setItem = function (key, value) {
      if (key === 'cwa.recording.course-replay.v1')
        throw new DOMException('Synthetic quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await toggle(replay);
  await expect(replay).toBeChecked();
  await expect(
    page.getByRole('status').filter({ hasText: 'could not be remembered on this device' }),
  ).toBeVisible();
  await page.evaluate(() => Reflect.get(window, 'restoreReplayStorage')());
  await activate(page.getByRole('button', { name: 'Retry remembering replay choice' }));
  await expect(page.getByRole('button', { name: 'Retry remembering replay choice' })).toHaveCount(
    0,
  );
  const preferences = await page.evaluate(() => ({
    course: localStorage.getItem('cwa.recording.course-replay.v1'),
    generated: localStorage.getItem('cwa.practice.preferences.v1'),
  }));
  expect(preferences.course).toBe('true');
  expect(preferences.generated).toBe(originalGenerated);
  await expectResponsive(page, `course-replay-${width}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  expect((await (await context.request.get('/api/entries')).json()).entries).toEqual([]);
  await reset();
  await page.reload();
  // Cold account/Studio initialization completes before keyboard navigation.
  await expect(
    page.getByRole('heading', { name: 'Your practice studio.', exact: true }),
  ).toBeVisible();
  await navigate('Today');
  await activate(
    page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: task.title, exact: true }) })
      .getByRole('button', { name: 'Listen & practice', exact: true }),
  );
  await expect(replay).toBeChecked();
  await expect.poll(paused).toBe(true);
  await expect(count).toHaveText('0');
  await start();
  await expect(count).toHaveText('1', { timeout: 15_000 });
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => !el.paused && el.currentTime < 2))
    .toBe(true);
  expect(await audio.evaluate((el: HTMLAudioElement) => el.playbackRate)).toBe(1);
  expect(await page.evaluate(() => navigator.mediaSession.playbackState)).toBe('playing');
  await expect(count).toHaveText('2', { timeout: 15_000 });
  await expect(page.getByText('The minimum is met.', { exact: false })).toBeVisible();
  await expect.poll(paused).toBe(true);
  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  const review = page.getByRole('dialog');
  await expect(review).toContainText('2 completed passes');
  await page.keyboard.press('Escape');
  await expect(count).toHaveText('2');
  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  const receipt = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/entries') &&
      response.request().method() === 'POST' &&
      [200, 201].includes(response.status()),
  );
  await activate(review.getByRole('button', { name: 'Save practice', exact: true }));
  await receipt;
  await expect(review).toHaveCount(0);
  const saved = (await (await context.request.get('/api/entries')).json()).entries;
  expect(saved).toHaveLength(1);
  expect(saved[0].metadata.evidence.recordings[0].passes.durations).toEqual([
    { durationSeconds: 10, completedPasses: 2 },
  ]);
  expect(saved[0].metadata.evidence.measurement.seconds).toBeGreaterThan(19.5);
  await activate(
    page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: task.title, exact: true }) })
      .getByRole('button', { name: 'Listen & practice', exact: true }),
  );
  await start();
  await expect(count).toHaveText('1', { timeout: 15_000 });
  await expect.poll(paused).toBe(true);
});
