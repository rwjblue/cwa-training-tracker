import { expect, test, type Locator, type BrowserContext } from '@playwright/test';
import { accountRequest, expectResponsive, signIn } from './helpers';
import { syntheticRecording } from './synthetic-recording';
import { DEFAULT_PROFILE, addDays } from '../src/shared/training';
import { defaultCopyRecipe } from '../src/shared/copy-practice';
import type { AccountSnapshot } from '../src/shared/account-sync';

test.use({ hasTouch: true });

async function finishFixtureCatalog(context: BrowserContext) {
  const { state }: { state: AccountSnapshot } = await (
    await context.request.get('/api/account-state')
  ).json();
  if (!state.plan.length) return;
  expect(
    (
      await accountRequest(context, 'POST', '/api/account-operations', {
        version: 1,
        id: crypto.randomUUID(),
        accountId: state.accountId,
        baseRevision: state.revision,
        generation: state.generation,
        createdAt: new Date().toISOString(),
        change: { type: 'task-status', ids: state.plan.map((task) => task.id), done: true },
      })
    ).ok(),
  ).toBe(true);
}

test('next assignment preserves native work through inspection and exact retry before another deliberate block', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.123' });
  await signIn(page);
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        settings: { ...DEFAULT_PROFILE, timezone: 'UTC' },
      })
    ).ok(),
  ).toBe(true);
  await finishFixtureCatalog(context);
  // Actual wall/calendar/media clocks. No fake elapsed listening credit.
  const today = new Date().toISOString().slice(0, 10);
  const base = {
    kind: 'listening',
    dueDate: today,
    done: false,
    notes: '',
    createdAt: new Date().toISOString(),
  };
  const audioTask = {
    ...base,
    id: 'next-audio',
    title: 'Next synthetic recording',
    exercise: { type: 'audio', url: 'https://cwa.cwops.org/synthetic/next.wav' },
  };
  const tasks = [
    audioTask,
    { ...base, id: 'next-manual', title: 'Next manual exercise', kind: 'sending' },
    { ...base, id: 'older-objective', title: 'Older objective', dueDate: addDays(today, -1) },
    { ...base, id: 'future-objective', title: 'Future objective', dueDate: addDays(today, 1) },
  ];
  for (const task of tasks)
    expect((await accountRequest(context, 'POST', '/api/plan', { task })).status()).toBe(201);
  await page.route(audioTask.exercise.url, syntheticRecording(6));
  await page.reload();
  let mobile = false;
  const activate = async (control: Locator) => {
    if (mobile) await control.tap();
    else {
      await control.focus();
      await page.keyboard.press('Enter');
    }
  };
  const next = page.getByRole('region', { name: 'Your next practice', exact: true });
  await expect(next).toContainText(audioTask.title);
  await expectResponsive(page, 'next-assignment-ready');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await next.screenshot({ path: '.tmp/parity-queue/issue-22-ready-desktop.png' });
  await activate(next.getByRole('button', { name: 'Start next block', exact: true }));
  const audio = page.getByLabel('Assigned recording', { exact: true });
  const owner = await audio.elementHandle();
  await page
    .getByRole('textbox', { name: 'Scratchpad', exact: true })
    .fill('Retained next-block notes');
  await activate(page.getByRole('button', { name: 'Start practice', exact: true }));
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(1.2);
  await activate(page.getByRole('button', { name: 'Inspect Today', exact: true }));
  const position = await owner!.evaluate((element: HTMLAudioElement) => element.currentTime);
  expect(await owner!.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  const retained = page.getByRole('region', { name: 'Current practice block', exact: true });
  await expect(retained).toContainText(audioTask.title);
  await expect(next).toHaveCount(0);
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(0);
  await activate(retained.getByRole('button', { name: 'Inspect this week', exact: true }));
  await activate(retained.getByRole('button', { name: 'Inspect report', exact: true }));
  const report = page.getByRole('dialog');
  await expect(report).toBeVisible();
  await expectResponsive(page, 'next-retained-report');
  await page.setViewportSize({ width: 390, height: 844 });
  mobile = true;
  await activate(report.getByRole('button', { name: 'Return to practice', exact: true }));
  expect(
    await owner!.evaluate(
      (element: HTMLAudioElement) =>
        element === document.querySelector('audio[aria-label="Assigned recording"]'),
    ),
  ).toBe(true);
  expect(await audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBe(position);
  expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  await expect(page.getByRole('textbox', { name: 'Scratchpad', exact: true })).toHaveValue(
    'Retained next-block notes',
  );
  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  await activate(page.getByRole('button', { name: 'Cancel', exact: true }));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(0);
  let refuse = true;
  const bodies: unknown[] = [];
  await page.route('**/api/entries', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    bodies.push(route.request().postDataJSON());
    if (refuse)
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Synthetic retry boundary' }),
      });
    return route.continue();
  });
  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  await activate(page.getByRole('button', { name: 'Save practice', exact: true }));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/#overview$/);
  await expect(next).toContainText(audioTask.title);
  await expect(next).toContainText('Started');
  await expectResponsive(page, 'next-after-retained-save');
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(0);
  refuse = false;
  await activate(page.getByRole('button', { name: 'Retry practice uploads', exact: true }));
  await expect
    .poll(async () => (await (await context.request.get('/api/entries')).json()).entries.length)
    .toBe(1);
  expect(bodies.length).toBeGreaterThanOrEqual(2);
  for (const body of bodies) expect(body).toEqual(bodies[0]);
  const saved = (await (await context.request.get('/api/entries')).json()).entries[0];
  expect(saved.metadata.plannedTaskId).toBe(audioTask.id);
  expect(saved.minutes * 60).toBeGreaterThanOrEqual(1.2);
  expect(saved.minutes * 60).toBeLessThan(6);
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  await activate(menu);
  await activate(page.getByRole('button', { name: 'Academy guide', exact: true }));
  await activate(page.getByRole('button', { name: 'This week', exact: true }));
  await activate(
    page.getByRole('checkbox', { name: `Mark ${audioTask.title} complete`, exact: true }),
  );
  await expect
    .poll(
      async () =>
        (await (await context.request.get('/api/plan')).json()).plan.find(
          (task: { id: string; done: boolean }) => task.id === audioTask.id,
        )?.done,
    )
    .toBe(true);
  await activate(menu);
  await activate(page.getByRole('button', { name: 'Today', exact: true }));
  await expect(next).toContainText('Next manual exercise');
  await activate(next.getByRole('button', { name: 'Start next block', exact: true }));
  await expect(
    page
      .getByRole('region', { name: 'Current practice studio', exact: true })
      .getByText('Next manual exercise', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start practice', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Assigned recording', { exact: true })).toHaveCount(0);
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(1);
  await expectResponsive(page, 'next-prepared-manual');
});

test('blocked resources, live preparation, class phase and all-complete states stay useful without inferred work', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.124' });
  await signIn(page);
  await page.clock.install({ time: new Date('2026-10-07T12:00:00Z') });
  await page.clock.setFixedTime(new Date('2026-10-07T12:00:00Z'));
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        settings: {
          ...DEFAULT_PROFILE,
          timezone: 'UTC',
          firstClassDate: '2026-10-07',
          classDays: [3, 6],
          classSchedule: {
            version: 1,
            timezone: 'UTC',
            exceptions: [],
            ordinary: {
              startTime: '15:00',
              endTime: '16:00',
              endsNextDay: false,
            },
          },
        },
      })
    ).ok(),
  ).toBe(true);
  await finishFixtureCatalog(context);
  const base = {
    dueDate: '2026-10-07',
    lesson: 1,
    done: false,
    notes: '',
    createdAt: '2026-10-02T00:00:00Z',
  };
  const missing = {
    ...base,
    id: 'blocked-audio',
    title: 'Check synthetic audio',
    kind: 'listening',
    link: 'https://cwops.org/cw-academy/',
    exercise: { type: 'audio', unresolved: 'Ask your advisor for the recording.' },
  };
  const live = {
    ...base,
    id: 'blocked-live',
    title: 'Prepare synthetic CWT',
    kind: 'on-air',
    exercise: {
      type: 'live-event',
      eventId: 'cwt',
      deadline: 'associated-class',
      url: 'https://cwops.org/cwops-tests/',
    },
  };
  for (const task of [missing, live])
    expect((await accountRequest(context, 'POST', '/api/plan', { task })).status()).toBe(201);
  await context.route(missing.link, (route) =>
    route.fulfill({ contentType: 'text/html', body: 'Synthetic public instructions' }),
  );
  await page.reload();
  await page.setViewportSize({ width: 1440, height: 1000 });
  let mobile = false;
  const activate = async (control: Locator) => {
    if (mobile) await control.tap();
    else {
      await control.focus();
      await page.keyboard.press('Enter');
    }
  };
  const navigate = async (name: string) => {
    const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (await menu.isVisible()) await activate(menu);
    await activate(page.getByRole('button', { name, exact: true }));
  };
  const next = page.getByRole('region', { name: 'Your next practice', exact: true });
  await expect(next).toContainText('Ask your advisor for the recording');
  await expect(next.getByRole('button', { name: 'Start next block', exact: true })).toHaveCount(0);
  await expectResponsive(page, 'next-blocked-recording');
  const opened = page.waitForEvent('popup');
  await activate(next.getByRole('link', { name: 'Open exercise instructions', exact: true }));
  const popup = await opened;
  expect(popup.url()).toBe(missing.link);
  await popup.close();
  await activate(next.getByRole('button', { name: 'Inspect your plan', exact: true }));
  await activate(page.getByRole('button', { name: 'This week', exact: true }));
  await page.getByRole('checkbox', { name: `Mark ${missing.title} complete`, exact: true }).focus();
  await page.keyboard.press('Space');
  await expect
    .poll(
      async () =>
        (await (await context.request.get('/api/plan')).json()).plan.find(
          (task: { id: string; done: boolean }) => task.id === missing.id,
        )?.done,
    )
    .toBe(true);
  await navigate('Today');
  await expect(next).toContainText('A live window is coming up');
  await expectResponsive(page, 'next-blocked-live');
  await page.setViewportSize({ width: 390, height: 844 });
  mobile = true;
  await next.screenshot({ path: '.tmp/parity-queue/issue-22-live-preparation-mobile.png' });
  await activate(next.getByRole('button', { name: 'Prepare live exercise', exact: true }));
  await expect(page.getByRole('button', { name: 'Start practice', exact: true })).toBeDisabled();
  await expect(
    page.getByRole('region', { name: 'CWT assignment opportunity', exact: true }),
  ).toContainText('Next eligible CWT window');
  await activate(page.getByRole('button', { name: 'Inspect Today', exact: true }));
  const retained = page.getByRole('region', { name: 'Current practice block', exact: true });
  await expect(next).toHaveCount(0);
  await activate(retained.getByRole('button', { name: 'Finish practice', exact: true }));
  await page.clock.setFixedTime(new Date('2026-10-07T14:59:59Z'));
  await page.clock.runFor(60_001);
  await expect(next).toContainText('No eligible live window remains');
  await page.clock.setFixedTime(new Date('2026-10-07T15:00:00Z'));
  await page.clock.runFor(1000);
  await expect(next).toContainText('Class is in progress');
  await expect(next.getByRole('button', { name: 'Start next block', exact: true })).toHaveCount(0);
  await expectResponsive(page, 'next-private-class-phase');
  await navigate('Academy guide');
  await activate(page.getByRole('button', { name: 'This week', exact: true }));
  await activate(page.getByRole('checkbox', { name: `Mark ${live.title} complete`, exact: true }));
  await navigate('Today');
  await page.clock.setFixedTime(new Date('2026-10-07T16:00:00Z'));
  await page.clock.runFor(60_001);
  await expect(next).toContainText('Your required exercises are complete');
  await expect(next.getByRole('button', { name: 'Start next block', exact: true })).toHaveCount(0);
  await expectResponsive(page, 'next-all-complete');
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(0);
  const plan = (await (await context.request.get('/api/plan')).json()).plan;
  expect(plan.every((task: { done: boolean }) => task.done)).toBe(true);
});

test('next activation rechecks a class boundary after finishing without replacing the current owner or crediting twice', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.125' });
  await signIn(page);
  await page.clock.install({ time: new Date('2026-10-07T12:59:59Z') });
  await page.clock.setFixedTime(new Date('2026-10-07T12:59:59Z'));
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        settings: {
          ...DEFAULT_PROFILE,
          timezone: 'UTC',
          firstClassDate: '2026-10-07',
          classDays: [3, 6],
          classSchedule: {
            version: 1,
            timezone: 'UTC',
            exceptions: [],
            ordinary: {
              startTime: '13:00',
              endTime: '14:00',
              endsNextDay: false,
            },
          },
        },
      })
    ).ok(),
  ).toBe(true);
  await finishFixtureCatalog(context);
  const earlier = {
    id: 'race-earlier',
    title: 'Retained earlier manual work',
    kind: 'on-air',
    dueDate: '2026-10-06',
    done: false,
    notes: '',
    createdAt: '2026-10-02T00:00:00Z',
  };
  const today = {
    ...earlier,
    id: 'race-today',
    title: 'Next required objective',
    dueDate: '2026-10-07',
  };
  for (const task of [earlier, today])
    expect((await accountRequest(context, 'POST', '/api/plan', { task })).status()).toBe(201);
  await page.reload();
  const activate = async (control: Locator) => {
    await control.focus();
    await page.keyboard.press('Enter');
  };
  await activate(page.getByText('Earlier unfinished work', { exact: false }));
  await activate(
    page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: earlier.title, exact: true }) })
      .getByRole('button', { name: 'Practice', exact: true }),
  );
  await activate(page.getByRole('button', { name: 'Start timer', exact: true }));
  await page.clock.runFor(1500);
  await activate(page.getByRole('button', { name: 'Pause timer', exact: true }));
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let submitted!: (value: unknown) => void;
  const received = new Promise<unknown>((resolve) => {
    submitted = resolve;
  });
  await page.route('**/api/entries', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    submitted(route.request().postDataJSON());
    await held;
    return route.continue();
  });
  const next = page.getByRole('region', { name: 'Your next practice', exact: true });
  await expect(next).toContainText(today.title);
  await activate(next.getByRole('button', { name: 'Finish & start next block', exact: true }));
  const body = await received;
  await page.clock.setFixedTime(new Date('2026-10-07T13:00:00Z'));
  await page.clock.runFor(1000);
  release();
  await expect
    .poll(async () => (await (await context.request.get('/api/entries')).json()).entries.length)
    .toBe(1);
  await expect(
    page.getByText(
      'The next block is no longer eligible. Your current context remains available.',
      { exact: true },
    ),
  ).toBeVisible();
  const studio = page.getByRole('region', { name: 'Current practice studio', exact: true });
  await expect(studio.getByText(earlier.title, { exact: true })).toBeVisible();
  await expect(next).toContainText('Class is in progress');
  const saved = (await (await context.request.get('/api/entries')).json()).entries[0];
  expect(saved.metadata.plannedTaskId).toBe(earlier.id);
  expect(saved.minutes * 60).toBeGreaterThanOrEqual(1.5);
  expect(saved.minutes * 60).toBeLessThan(2);
  expect(body).toEqual(saved);
  await page.clock.setFixedTime(new Date('2026-10-07T14:00:00Z'));
  await page.clock.runFor(60_001);
  await expect(next).toContainText(today.title);
  await activate(next.getByRole('button', { name: 'Start next block', exact: true }));
  await expect(studio.getByText(today.title, { exact: true })).toBeVisible();
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(1);
});


test('saved Copy review opens the same required objective with a fresh assigned purpose', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.126' });
  await signIn(page);
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        settings: { ...DEFAULT_PROFILE, timezone: 'UTC' },
      })
    ).ok(),
  ).toBe(true);
  const task = {
    id: 'next-copy-purpose',
    title: 'Required custom Copy objective',
    kind: 'head-copy',
    dueDate: new Date().toISOString().slice(0, 10),
    done: false,
    notes: '',
    createdAt: new Date().toISOString(),
    exercise: {
      type: 'copy',
      recipe: {
        ...defaultCopyRecipe(),
        groupKind: 'custom',
        customCharacters: 'E',
        groupLength: 1,
        lengthMode: 'duration',
        durationSeconds: 10,
        effectiveWpm: 25,
        startDelaySeconds: 0,
      },
    },
  };
  expect((await accountRequest(context, 'POST', '/api/plan', { task })).status()).toBe(201);
  await page.reload();
  const key = async (control: Locator) => {
    await expect(control).toBeEnabled();
    await control.focus();
    await expect(control).toBeFocused();
    await page.keyboard.press('Enter');
  };
  const row = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: task.title, exact: true }) });
  await key(row.getByRole('button', { name: 'Extra review', exact: true }));
  await expect(page.getByRole('heading', { name: 'Your extra review.', exact: true })).toBeVisible();
  const audio = page.getByLabel('Copy practice audio', { exact: true });
  const finishNative = async () => {
    await expect
      .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
      .toBeGreaterThan(1.2);
    page.once('dialog', (dialog) => dialog.accept());
    await key(page.getByRole('button', { name: 'Finish early', exact: true }));
  };
  await key(page.getByRole('button', { name: 'Start code groups', exact: true }));
  await finishNative();
  await expect
    .poll(async () => (await (await context.request.get('/api/entries')).json()).entries.length)
    .toBe(1);
  const reviewed = (await (await context.request.get('/api/entries')).json()).entries[0];
  expect(reviewed.metadata).toMatchObject({
    plannedTaskId: task.id,
    practicePurpose: 'review',
  });
  await expect(page.getByRole('button', { name: 'Start next round', exact: true })).toBeVisible();
  const next = page.getByRole('region', { name: 'Your next practice', exact: true });
  await expect(next.getByRole('button', { name: 'Start next block', exact: true })).toBeEnabled();
  await expectResponsive(page, 'next-saved-copy-review');
  await page.setViewportSize({ width: 390, height: 844 });
  await next.getByRole('button', { name: 'Start next block', exact: true }).tap();
  await expect(
    page.getByRole('heading', { name: 'Your assigned practice.', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Current practice studio', exact: true }),
  ).toContainText(task.title);
  expect((await (await context.request.get('/api/entries')).json()).entries).toEqual([reviewed]);
  await expectResponsive(page, 'next-copy-assigned-purpose');
  await page.getByRole('button', { name: 'Start code groups', exact: true }).tap();
  await finishNative();
  await expect
    .poll(async () => (await (await context.request.get('/api/entries')).json()).entries.length)
    .toBe(2);
  const entries = (await (await context.request.get('/api/entries')).json()).entries;
  expect(entries.find((entry: { id: string }) => entry.id === reviewed.id)).toEqual(reviewed);
  const assigned = entries.find((entry: { id: string }) => entry.id !== reviewed.id);
  expect(assigned.metadata).toMatchObject({
    plannedTaskId: task.id,
    practicePurpose: 'assigned',
  });
  expect(assigned.minutes * 60).toBeGreaterThanOrEqual(1);
  expect(
    (await (await context.request.get('/api/plan')).json()).plan.find(
      (item: { id: string }) => item.id === task.id,
    ).done,
  ).toBe(false);
});
