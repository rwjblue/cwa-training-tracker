import { expect, type Locator } from '@playwright/test';
import { test } from './fixtures';
import type { PlannedTask } from '../src/shared/plan';
import {
  openDisclosure,
  navigateView,
  accountRequest,
  expectAccessible,
  expectResponsive,
  signIn,
} from './helpers';
import { syntheticRecording } from './synthetic-recording';

test.use({ hasTouch: true, actionTimeout: 10_000 });
const url = (wpm: number) => `https://cwa.cwops.org/wp-content/uploads/WD101_${wpm}.mp3`;
const key = (scope: string, taskId: string) =>
  `cwa.recording.choice.v1:${JSON.stringify([scope, taskId])}`;

const width = 390;

test(`remembered native recording choices stay scoped and preserve played facts at ${width}px`, async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await context.setExtraHTTPHeaders({
    'CF-Connecting-IP': '192.0.2.112',
  });
  await page.setViewportSize({ width, height: 844 });
  await page.route(/^https:\/\/(?:[^/]+\.)?cwops\.org\//, syntheticRecording(3.6));
  const activate = async (control: Locator) => {
    await expect(control).toBeEnabled();
    await control.tap();
  };
  const navigate = async (name: string) => {
    const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (await menu.isVisible()) await activate(menu);
    await activate(page.getByRole('button', { name, exact: true }));
  };
  const emailA = `choice-a-${crypto.randomUUID()}@example.test`;
  await signIn(page, { email: emailA });
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
        get: (target, property, receiver) =>
          property === 'now'
            ? () => native.now() + offset
            : Reflect.get(target, property, receiver),
      }),
    );
  }, Date.parse('2026-10-06T16:00:00Z'));
  const configure = async () => {
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
    return plan.find(
      (task: PlannedTask) =>
        task.dueDate === '2026-10-06' &&
        task.exercise?.type === 'audio' &&
        task.exercise.url === url(10),
    ) as PlannedTask;
  };
  const task = await configure();
  expect(task).toBeTruthy();
  const scope = (await (await context.request.get('/api/me')).json()).user.id as string;
  const other = {
    ...task,
    id: 'same-recording-other-task',
    title: 'Independent same recording',
    source: 'manual' as const,
    curriculum: undefined,
  };
  const highest = {
    ...other,
    id: 'highest-recording-task',
    title: 'Highest assigned recording',
    notes: 'Synthetic highest-speed assignment',
    link: url(25),
    exercise: { type: 'audio' as const, url: url(25), characterWpm: 25, minimumPasses: 2 },
  };
  for (const fixture of [other, highest])
    expect((await accountRequest(context, 'POST', '/api/plan', { task: fixture })).status()).toBe(
      201,
    );
  await page.evaluate(
    ({ taskId, assignedUrl, guestUrl }) => {
      localStorage.setItem(
        `cwa.recording.choice.v1:${JSON.stringify(['guest', taskId])}`,
        JSON.stringify({
          version: 1,
          taskId,
          assignedUrl,
          assignedWpm: 10,
          selectedUrl: guestUrl,
        }),
      );
    },
    { taskId: task.id, assignedUrl: url(10), guestUrl: url(25) },
  );
  await page.reload();
  const open = async (selected: PlannedTask) => {
    await navigate('Today');
    await activate(
      page
        .getByRole('listitem')
        .filter({ has: page.getByRole('heading', { name: selected.title, exact: true }) })
        .getByRole('button', { name: 'Listen & practice', exact: true }),
    );
    await openDisclosure(page, 'Choose a recording speed');
  };
  const finish = () => activate(page.getByRole('button', { name: 'Finish practice', exact: true }));
  const audio = page.getByLabel('Assigned recording', { exact: true });
  const speed = page.getByRole('combobox', { name: 'Recording speed', exact: true });
  const defaultSpeed = page.getByRole('combobox', {
    name: 'Recording speed default',
    exact: true,
  });
  const notes = page.getByRole('textbox', { name: 'Scratchpad', exact: true });
  const stored = () => page.evaluate((name) => localStorage.getItem(name), key(scope, task.id));
  const pausedAtZero = async (wpm: number) => {
    await expect(audio).toHaveAttribute('src', url(wpm));
    await expect
      .poll(() =>
        audio.evaluate(
          (el: HTMLAudioElement) => el.paused && el.currentTime === 0 && el.playbackRate === 1,
        ),
      )
      .toBe(true);
  };
  await open(task);
  await pausedAtZero(10); // Guest's 25 WPM choice grants no account choice.
  await notes.fill('Synthetic retained task notes');
  await openDisclosure(page, 'Choose a recording speed');
  await speed.selectOption(url(18));
  await pausedAtZero(18);
  await expect(page.getByText('Remembered for this task: 18 WPM.', { exact: false })).toBeVisible();
  await openDisclosure(page, 'Choose a recording speed');
  await defaultSpeed.selectOption('next');
  await pausedAtZero(18);
  await navigateView(page, 'Today', activate);
  await expect(
    page.getByText('Next visit: 18 WPM remembered on this device', { exact: false }),
  ).toBeVisible();
  await activate(page.getByRole('button', { name: 'Return to practice', exact: true }));
  await pausedAtZero(18);
  await expect(notes).toHaveValue('Synthetic retained task notes');
  await finish();
  await open(task);
  await pausedAtZero(18);
  await finish();
  await open(other);
  await pausedAtZero(13);
  await expect(
    page.getByText('This task uses the recording default on its next visit.', { exact: false }),
  ).toBeVisible();
  await finish();
  await open(highest);
  await pausedAtZero(25); // Next at the highest assigned speed never wraps.
  await finish();
  await open(task);
  await activate(
    page.getByRole('button', { name: 'Use recording default next time', exact: true }),
  );
  await pausedAtZero(18);
  await expect.poll(stored).toBeNull();
  await expect(
    page.getByRole('status').filter({ hasText: 'Current playback stays unchanged.' }),
  ).toBeVisible();
  await finish();
  await open(task);
  await pausedAtZero(13);
  // A refused write changes the current file, never claims durable retention.
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    const remove = Storage.prototype.removeItem;
    Reflect.set(window, 'blockTaskWrites', true);
    Reflect.set(window, 'blockRecordingDefault', false);
    Storage.prototype.setItem = function (name, value) {
      if (
        (name.startsWith('cwa.recording.choice.v1:') && Reflect.get(window, 'blockTaskWrites')) ||
        (name === 'cw-academy.recording-speed.v1' && Reflect.get(window, 'blockRecordingDefault'))
      )
        throw new DOMException('Synthetic quota', 'QuotaExceededError');
      return set.call(this, name, value);
    };
    Storage.prototype.removeItem = function (name) {
      if (name.startsWith('cwa.recording.choice.v1:') && Reflect.get(window, 'blockTaskWrites'))
        return;
      return remove.call(this, name);
    };
  });
  await openDisclosure(page, 'Choose a recording speed');
  await speed.selectOption(url(18));
  await pausedAtZero(18);
  await expect(
    page.getByRole('status').filter({ hasText: 'could not be remembered' }),
  ).toBeVisible();
  expect(await stored()).toBeNull();
  await page.evaluate(() => Reflect.set(window, 'blockTaskWrites', false));
  await activate(page.getByRole('button', { name: 'Retry remembering task choice', exact: true }));
  await expect.poll(stored).not.toBeNull();
  await page.evaluate(() => Reflect.set(window, 'blockTaskWrites', true));
  await activate(
    page.getByRole('button', { name: 'Use recording default next time', exact: true }),
  );
  await expect(page.getByRole('status').filter({ hasText: 'could not be cleared' })).toBeVisible();
  expect(await stored()).not.toBeNull();
  await page.evaluate(() => Reflect.set(window, 'blockTaskWrites', false));
  await activate(page.getByRole('button', { name: 'Retry clearing task choice', exact: true }));
  expect(await stored()).toBeNull();
  await pausedAtZero(18);
  await activate(
    page.getByRole('button', { name: 'Remember current recording for this task', exact: true }),
  );
  await page.evaluate(() => Reflect.set(window, 'blockRecordingDefault', true));
  await openDisclosure(page, 'Choose a recording speed');
  await defaultSpeed.selectOption('assigned');
  await expect(defaultSpeed).toHaveValue('assigned');
  await expect(
    page.getByRole('status').filter({ hasText: 'couldn’t remember the default' }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cw-academy.recording-speed.v1'))).toBe(
    'next',
  );
  await pausedAtZero(18);
  await page.evaluate(() => Reflect.set(window, 'blockRecordingDefault', false));
  await activate(
    page.getByRole('button', { name: 'Retry remembering recording default', exact: true }),
  );
  expect(await page.evaluate(() => localStorage.getItem('cw-academy.recording-speed.v1'))).toBe(
    'assigned',
  );
  await openDisclosure(page, 'Choose a recording speed');
  await defaultSpeed.selectOption('next');
  await expect(defaultSpeed).toHaveValue('next');
  await pausedAtZero(18);
  await expectResponsive(page, `task-choice-${width}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const playPass = async () => {
    await activate(page.getByRole('button', { name: /^(Start|Resume) practice$/, exact: true }));
    await expect
      .poll(() => audio.evaluate((el: HTMLAudioElement) => el.ended), { timeout: 10_000 })
      .toBe(true);
  };
  await playPass();
  await openDisclosure(page, 'Choose a recording speed');
  await speed.selectOption(url(13));
  await pausedAtZero(13);
  await expect(notes).toHaveValue('Synthetic retained task notes');
  await playPass();
  await openDisclosure(page, 'Choose a recording speed');
  await speed.selectOption(url(25)); // Selected, remembered, but never heard.
  await pausedAtZero(25);
  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  const review = page.getByRole('dialog');
  await expect(review).toContainText('18 WPM');
  await expect(review).toContainText('13 WPM');
  await page.keyboard.press('Escape');
  await expect(review).toHaveCount(0);
  await pausedAtZero(25);
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
  const exported = await (await context.request.get('/api/export')).json();
  expect(exported.sessions).toHaveLength(1);
  const saved = exported.sessions[0];
  expect(saved.metadata.plannedTaskId).toBe(task.id);
  expect(saved.metadata.scratchpad).toBe('Synthetic retained task notes');
  const played = saved.metadata.evidence.recordings;
  expect(played.map((item: { url: string }) => item.url)).toEqual([url(18), url(13)]);
  for (const item of played) {
    expect(item.passes.durations).toEqual([{ durationSeconds: 3.6, completedPasses: 1 }]);
    expect(item.seconds).toBeGreaterThan(3.3);
    expect(item.seconds).toBeLessThanOrEqual(3.6);
  }
  expect(saved.metadata.evidence.measurement.seconds).toBeGreaterThan(6.6);
  await open(task);
  await pausedAtZero(25);
  await openDisclosure(page, 'Choose a recording speed');
  await speed.selectOption(url(18));
  await finish();
  await page.evaluate(
    ({ name, taskId, assignedUrl }) => {
      localStorage.setItem(
        name,
        JSON.stringify({
          version: 1,
          taskId,
          assignedUrl,
          assignedWpm: 10,
          selectedUrl: 'https://cwa.cwops.org/wp-content/uploads/WD101_99.mp3',
        }),
      );
    },
    { name: key(scope, task.id), taskId: task.id, assignedUrl: url(10) },
  );
  await page.reload();
  await open(task);
  await pausedAtZero(13);
  await expect(
    page.getByRole('status').filter({ hasText: 'remembered recording is invalid or unavailable' }),
  ).toBeVisible();
  expect(await stored()).toBeNull();
  await openDisclosure(page, 'Choose a recording speed');
  await speed.selectOption(url(18));
  await finish();
  const signOut = async () => {
    await activate(page.getByRole('button', { name: 'Open your account', exact: true }));
    await activate(page.getByRole('button', { name: 'Sign out', exact: true }));
    await expect(page.getByRole('button', { name: 'Open your account', exact: true })).toHaveCount(
      0,
    );
  };
  await signOut();
  expect((await context.request.get('/api/entries')).status()).toBe(401);
  expect(
    JSON.parse((await page.evaluate((name) => localStorage.getItem(name), key('guest', task.id)))!)
      .selectedUrl,
  ).toBe(url(25));
  await navigate('Practice studio');
  await expect(page.getByRole('button', { name: 'Word listening', exact: true })).toBeEnabled();
  await signIn(page, { email: `choice-b-${crypto.randomUUID()}@example.test` });
  const taskB = await configure();
  expect(taskB.id).toBe(task.id); // Same stable curriculum ID, separate account.
  const scopeB = (await (await context.request.get('/api/me')).json()).user.id as string;
  expect(scopeB).not.toBe(scope);
  await open(taskB);
  await pausedAtZero(13);
  await openDisclosure(page, 'Choose a recording speed');
  await speed.selectOption(url(20));
  await finish();
  expect((await (await context.request.get('/api/entries')).json()).entries).toEqual([]);
  await open(taskB);
  await pausedAtZero(20);
  // The other account's remembered choice remains independent of this account.
  expect(JSON.parse((await stored())!).selectedUrl).toBe(url(18));
  const privateChoice = await page.evaluate(
    (name) => localStorage.getItem(name),
    key(scopeB, task.id),
  );
  expect(JSON.parse(privateChoice!).selectedUrl).toBe(url(20));
  await expectAccessible(page, `task-choice-return-${width}`);
});
