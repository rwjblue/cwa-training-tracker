import { expect, test, type Locator } from '@playwright/test';
import { accountRequest, expectResponsive, signIn } from './helpers';
import { syntheticRecording } from './synthetic-recording';

test.use({
  hasTouch: true,
  actionTimeout: 10_000,
  extraHTTPHeaders: { 'CF-Connecting-IP': '192.0.2.109' },
});

test.afterEach(async ({ page }, info) => {
  await info.attach('native-recording-events', {
    body: JSON.stringify(await page.evaluate(() => Reflect.get(window, 'passMediaObservations'))),
    contentType: 'application/json',
  });
});

const viewport = { width: 1440, height: 1000 };

test(`actual recording passes retain source evidence and separate learner completion at ${viewport.width}px`, async ({
  page,
  context,
}) => {
  test.setTimeout(100_000);
  await page.setViewportSize(viewport);
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
  await page.addInitScript(() => {
    const observations: unknown[] = [];
    Reflect.set(window, 'passMediaObservations', observations);
    for (const name of [
      'play',
      'playing',
      'pause',
      'timeupdate',
      'seeking',
      'seeked',
      'ended',
      'loadedmetadata',
      'durationchange',
    ])
      document.addEventListener(
        name,
        (event) => {
          const audio = event.target;
          if (audio instanceof HTMLAudioElement && audio.dataset.recording === 'true')
            observations.push({
              event: name,
              at: performance.now(),
              position: audio.currentTime,
              duration: audio.duration,
              paused: audio.paused,
              seeking: audio.seeking,
              ended: audio.ended,
            });
        },
        true,
      );
  });
  await signIn(page);
  // Fix calendar attribution without replacing native performance or timers.
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
  const observedDuration = 3.6;
  const serveRecording = syntheticRecording(observedDuration);
  await page.route(task.exercise.url, serveRecording);
  const taskItem = () =>
    page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: task.title, exact: true }) });
  await activate(taskItem().getByRole('button', { name: 'Listen & practice', exact: true }));
  const audio = page.getByLabel('Assigned recording', { exact: true });
  const progress = page.getByRole('region', { name: 'Listening passes', exact: true });
  const count = (label: string) =>
    progress
      .locator('dl > div')
      .filter({ has: page.getByText(label, { exact: true }) })
      .locator('dd');
  await expect(count('Previously saved')).toHaveText('0');
  await expect(count('This block')).toHaveText('0');
  await expect(count('Minimum remaining')).toHaveText(String(task.exercise.minimumPasses));

  // Actual native playback earns time. A jump over the middle earns no full pass.
  await audio.evaluate((item: HTMLAudioElement) => item.play());
  await expect
    .poll(() => audio.evaluate((item: HTMLAudioElement) => item.currentTime))
    .toBeGreaterThan(1.2);
  await audio.evaluate((item: HTMLAudioElement) => {
    item.pause();
    item.currentTime = item.duration - 0.08;
  });
  await expect
    .poll(() =>
      audio.evaluate(
        (item: HTMLAudioElement) =>
          item.paused &&
          !item.seeking &&
          Math.abs(item.currentTime - (item.duration - 0.08)) < 0.01,
      ),
    )
    .toBe(true);
  await audio.evaluate((item: HTMLAudioElement) => item.play());
  await expect.poll(() => audio.evaluate((item: HTMLAudioElement) => item.ended)).toBe(true);
  await test.info().attach('native-seek-events', {
    body: JSON.stringify(await page.evaluate(() => Reflect.get(window, 'passMediaObservations'))),
    contentType: 'application/json',
  });
  await expect(count('This block')).toHaveText('0');
  await expect(
    page.getByRole('status').filter({ hasText: 'Some material was skipped.' }),
  ).toBeVisible();

  // Rehear overlap in the same pass: extra heard seconds, one coverage union.
  await activate(page.getByRole('button', { name: 'Resume practice', exact: true }));
  await expect
    .poll(() => audio.evaluate((item: HTMLAudioElement) => item.currentTime))
    .toBeGreaterThan(1);
  await audio.evaluate((item: HTMLAudioElement) => {
    item.pause();
    item.currentTime = 0.2;
  });
  await expect
    .poll(() =>
      audio.evaluate(
        (item: HTMLAudioElement) =>
          item.paused && !item.seeking && Math.abs(item.currentTime - 0.2) < 0.01,
      ),
    )
    .toBe(true);
  await audio.evaluate((item: HTMLAudioElement) => item.play());
  await expect(count('This block')).toHaveText('1', { timeout: 10_000 });
  await expect(
    page.getByRole('status').filter({ hasText: 'Full listening pass recorded.' }),
  ).toBeVisible();
  await activate(page.getByRole('button', { name: 'Resume practice', exact: true }));
  await expect
    .poll(() => audio.evaluate((item: HTMLAudioElement) => item.currentTime))
    .toBeGreaterThan(0.7);
  // A queued native pause and post-resume position settling must not discard
  // honestly heard coverage. Operate the actual native control with Space.
  await activate(page.getByRole('button', { name: 'Pause practice', exact: true }));
  expect(await audio.evaluate((item: HTMLAudioElement) => item.paused)).toBe(true);
  await audio.focus();
  await page.keyboard.press('Space');
  await expect.poll(() => audio.evaluate((item: HTMLAudioElement) => !item.paused)).toBe(true);
  await expect(count('This block')).toHaveText('2', { timeout: 10_000 });
  await expect(count('Minimum remaining')).toHaveText('0');
  expect(
    (await (await context.request.get('/api/plan')).json()).plan.find(
      (item: { id: string }) => item.id === task.id,
    ).done,
  ).toBe(false);

  const speed = page.getByRole('combobox', { name: 'Recording speed', exact: true });
  const faster = await speed.getByRole('option', { name: /^13 WPM/ }).getAttribute('value');
  expect(faster).toBeTruthy();
  await page.route(faster!, serveRecording);
  await speed.selectOption(faster!);
  await expect(audio).toHaveAttribute('src', faster!);
  expect(
    await audio.evaluate((item: HTMLAudioElement) => item.paused && item.currentTime === 0),
  ).toBe(true);
  await expect(count('This block')).toHaveText('2');
  await activate(page.getByRole('button', { name: 'Resume practice', exact: true }));
  await expect
    .poll(() => audio.evaluate((item: HTMLAudioElement) => item.currentTime))
    .toBeGreaterThan(0.8);
  await activate(page.getByRole('button', { name: 'Inspect Today', exact: true }));
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(0);
  const inspectedPosition = await audio.evaluate((item: HTMLAudioElement) => item.currentTime);
  expect(inspectedPosition).toBeGreaterThan(0.8);
  await activate(
    page
      .getByRole('region', { name: 'Current practice block' })
      .getByRole('button', { name: 'Return to practice', exact: true }),
  );
  expect(await audio.evaluate((item: HTMLAudioElement) => item.paused)).toBe(true);
  expect(await audio.evaluate((item: HTMLAudioElement) => item.currentTime)).toBeCloseTo(
    inspectedPosition,
    3,
  );
  await expect(count('This block')).toHaveText('2');
  // Rehear overlap after inspection. A native paused position can settle
  // forward on resume beyond this short clip's honest gap allowance. Starting
  // above zero still requires the pre-inspection coverage to complete a pass.
  const overlapStart = inspectedPosition - 0.5;
  expect(overlapStart).toBeGreaterThan(0);
  await audio.evaluate((item: HTMLAudioElement, position) => {
    item.currentTime = position;
  }, overlapStart);
  await expect
    .poll(() =>
      audio.evaluate(
        (item: HTMLAudioElement, position) =>
          item.paused && !item.seeking && Math.abs(item.currentTime - position) < 0.01,
        overlapStart,
      ),
    )
    .toBe(true);
  await activate(page.getByRole('button', { name: 'Resume practice', exact: true }));
  await expect(count('This block')).toHaveText('3', { timeout: 10_000 });
  await expectResponsive(page, `listening-passes-${viewport.width}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'A little progress, worth recording.', exact: true }),
  ).toBeFocused();
  await expect(dialog).toContainText('2 completed passes');
  await expect(dialog).toContainText('1 completed pass');
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Save practice', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(count('This block')).toHaveText('3');
  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  await dialog
    .getByRole('textbox', { name: /^Notes\b/ })
    .fill('Observed passes with two exact speed files.');

  await activate(dialog.getByRole('button', { name: 'Save practice', exact: true }));
  await expect(dialog).toHaveCount(0);
  const { entries } = await (await context.request.get('/api/entries')).json();
  expect(entries).toHaveLength(1);
  const saved = entries[0];
  const recordings = saved.metadata.evidence.recordings;
  expect(recordings).toHaveLength(2);
  expect(recordings.find((item: { url: string }) => item.url === task.exercise.url)).toMatchObject({
    speedWpm: 10,
    passes: {
      method: 'native-1x',
      durations: [{ durationSeconds: observedDuration, completedPasses: 2 }],
    },
  });
  expect(recordings.find((item: { url: string }) => item.url === faster)).toMatchObject({
    speedWpm: 13,
    passes: {
      method: 'native-1x',
      durations: [{ durationSeconds: observedDuration, completedPasses: 1 }],
    },
  });
  expect(saved.metadata.evidence.measurement.seconds).toBeGreaterThan(12);

  await activate(taskItem().getByRole('button', { name: 'Listen & practice', exact: true }));
  await expect(count('Previously saved')).toHaveText('3');
  await expect(count('This block')).toHaveText('0');
  await expect(count('Minimum remaining')).toHaveText('0');
  await activate(page.getByRole('button', { name: 'Complete exercise', exact: true }));
  await expect(page.getByRole('button', { name: 'Reopen exercise', exact: true })).toBeVisible();
  await activate(page.getByRole('button', { name: 'Reopen exercise', exact: true }));
  await expect(page.getByRole('button', { name: 'Complete exercise', exact: true })).toBeVisible();
  expect((await (await context.request.get('/api/entries')).json()).entries).toEqual(entries);
  await activate(page.getByRole('button', { name: 'Finish practice', exact: true }));
  await activate(taskItem().getByRole('button', { name: 'Extra review', exact: true }));
  await expect(count('Previously saved')).toHaveText('3');
  await expect(count('Minimum remaining')).toHaveCount(0);
  await expect(progress).toContainText('without required assignment credit');
  await activate(page.getByRole('button', { name: 'Start practice', exact: true }));
  await expect(count('This block')).toHaveText('1', { timeout: 10_000 });
  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  await activate(dialog.getByRole('button', { name: 'Save practice', exact: true }));
  await expect(dialog).toHaveCount(0);
  const all = (await (await context.request.get('/api/entries')).json()).entries;
  expect(all).toHaveLength(2);
  expect(all.find((item: { id: string }) => item.id !== saved.id).metadata.practicePurpose).toBe(
    'review',
  );
  await expect(taskItem()).toContainText('3 listening passes saved');

  await navigate('Practice log');
  const savedRow = page.getByText(saved.notes, { exact: true }).locator('xpath=../..');
  await activate(
    savedRow.getByRole('button', { name: `Edit Listening on ${saved.date}`, exact: true }),
  );
  await expect(dialog).toContainText('completed pass');
  await page.keyboard.press('Escape');
});
