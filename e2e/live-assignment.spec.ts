import { expect, type Locator } from '@playwright/test';
import { test } from './fixtures';
import { openDisclosure, accountRequest, expectResponsive, signIn } from './helpers';
import { DEFAULT_PROFILE } from '../src/shared/training';

test.use({ hasTouch: true, timezoneId: 'America/New_York' });
test('assigned CWT opportunities share deadlines across Today, Week and retained Studio', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.121' });
  await signIn(page);
  // Calendar/manual-only: no audio or Runner evidence is manufactured.
  await page.clock.install({ time: new Date('2026-10-07T12:59:59Z') });
  await page.clock.setFixedTime(new Date('2026-10-07T12:59:59Z'));
  const settings = {
    ...DEFAULT_PROFILE,
    timezone: 'Asia/Tokyo',
    firstClassDate: '2026-10-07',
    classDays: [3, 6],
    classSchedule: {
      version: 1,
      timezone: 'UTC',
      exceptions: [],
      ordinary: { startTime: '14:00', endTime: '15:00', endsNextDay: false },
    },
  };
  expect((await accountRequest(context, 'PUT', '/api/settings', { settings })).ok()).toBe(true);
  await page.reload();
  let mobile = false;
  const activate = async (control: Locator) => {
    await expect(control).toBeEnabled();
    if (mobile) await control.tap();
    else {
      await control.focus();
      await expect(control).toBeFocused();
      await page.keyboard.press('Enter');
    }
  };
  const navigate = async (name: string) => {
    const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (await menu.isVisible()) await activate(menu);
    await activate(
      page.getByRole(['Your account', 'This device'].includes(name) ? 'button' : 'link', {
        name,
        exact: true,
      }),
    );
  };
  await navigate('Academy guide');
  await activate(page.getByRole('button', { name: 'Add exercise', exact: true }));
  await page.getByLabel('Exercise title', { exact: true }).fill('My renamed live objective');
  await page.getByRole('combobox', { name: 'Activity', exact: true }).selectOption('on-air');
  await page.getByRole('combobox', { name: 'Live event (optional)', exact: true }).focus();
  await page.keyboard.press('c');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('combobox', { name: 'Live event (optional)', exact: true }),
  ).toHaveValue('cwt');
  await page.getByRole('combobox', { name: 'Class session', exact: true }).selectOption('1');
  await page
    .getByRole('combobox', { name: 'Live practice deadline', exact: true })
    .selectOption('associated-class');
  await page.getByLabel('Practice date (optional)', { exact: true }).fill('2026-10-07');
  await page.getByLabel('Suggested minutes (optional)', { exact: true }).fill('');
  await expectResponsive(page, 'live-task-editor');
  await activate(page.getByRole('button', { name: 'Save exercise', exact: true }));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const rows = (await (await context.request.get('/api/plan')).json()).plan;
  const owned = rows.find((task: { title: string }) => task.title === 'My renamed live objective');
  expect(owned.exercise).toEqual({
    type: 'live-event',
    eventId: 'cwt',
    url: 'https://cwops.org/cwops-tests/',
    deadline: 'associated-class',
  });
  await activate(page.getByRole('button', { name: 'This week', exact: true }));
  const opportunity = page.getByRole('region', { name: 'CWT assignment opportunity', exact: true });
  await expect(opportunity).toContainText('Next eligible CWT window');
  await expect(opportunity).toContainText('Wed, Oct 7, 2026, 22:00');
  await expect(opportunity).toContainText('Wed, Oct 7, 2026, 13:00');
  await expectResponsive(page, 'live-task-upcoming-week');
  await navigate('Today');
  await expect(opportunity).toContainText('Next eligible CWT window');
  await activate(page.getByRole('button', { name: 'Prepare live practice', exact: true }));
  await expect(page.getByRole('button', { name: 'Start practice', exact: true })).toBeDisabled();
  await openDisclosure(page, 'Session options and logging');
  await expect(page.getByRole('button', { name: 'Start timer', exact: true })).toBeDisabled();
  await expect(opportunity).toContainText('Next eligible CWT window');
  await page.clock.setFixedTime(new Date('2026-10-07T13:00:00Z'));
  await page.clock.runFor(1000);
  await expect(opportunity).toContainText('CWT active now');
  await expect(page.getByRole('button', { name: 'Start practice', exact: true })).toBeEnabled();
  await expectResponsive(page, 'live-task-active-studio');
  await context.route('https://cwops.org/cwops-tests/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<title>Synthetic official-link destination</title>',
    }),
  );
  const opened = page.waitForEvent('popup');
  await activate(page.getByRole('button', { name: 'Start practice', exact: true }));
  const popup = await opened;
  await popup.close();
  await page.clock.runFor(2000);
  await activate(page.getByRole('button', { name: 'Pause practice', exact: true }));
  await page.setViewportSize({ width: 390, height: 844 });
  mobile = true;
  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  const workedTime = await page.getByRole('textbox', { name: /^Time practiced/ }).inputValue();
  await activate(page.getByRole('button', { name: 'Cancel', exact: true }));
  await expect(page.getByRole('button', { name: 'Resume practice', exact: true })).toBeEnabled();
  await navigate('Your account');
  await page.getByLabel('Class start time', { exact: true }).fill('13:00');
  await activate(page.getByRole('button', { name: 'Save preferences', exact: true }));
  await expect(page.getByRole('button', { name: 'Save preferences', exact: true })).toBeEnabled();
  await activate(
    page
      .getByRole('region', { name: 'Current practice block', exact: true })
      .getByRole('button', { name: 'Return to practice', exact: true }),
  );
  await expect(opportunity).toContainText('No CWT window remains before the deadline.');
  await expect(opportunity).toContainText('ask your advisor');
  await expect(page.getByRole('button', { name: 'Resume practice', exact: true })).toBeDisabled();
  await openDisclosure(page, 'Session options and logging');
  await expect(page.getByRole('button', { name: 'Resume timer', exact: true })).toBeDisabled();
  await expectResponsive(page, 'live-task-unavailable-retained');
  // Exact end also remains unavailable; paused calendar advancement adds no time.
  await page.clock.setFixedTime(new Date('2026-10-07T14:00:00Z'));
  await page.clock.fastForward(60001);
  await expect(opportunity).toContainText('No CWT window remains before the deadline.');
  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  await expect(page.getByRole('textbox', { name: /^Time practiced/ })).toHaveValue(workedTime);
  await openDisclosure(page, 'Speed, rating and on-air observations');
  await page.getByRole('combobox', { name: /^Performance rating/ }).selectOption('good');
  await page.getByRole('combobox', { name: /^Event observations/ }).selectOption('cwt');
  await page.getByRole('textbox', { name: /^Callsigns heard/ }).fill('W1SYN');
  await page
    .getByRole('textbox', { name: /^CWT comments for the report/ })
    .fill('Assigned monitoring observation');
  const submitted: unknown[] = [];
  await page.route('**/api/entries', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    submitted.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: { error: 'Synthetic live-result upload failure' } });
  });
  await activate(page.getByRole('button', { name: 'Save practice', exact: true }));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const upload = page.getByRole('region', { name: 'Practice upload status', exact: true });
  await expect(upload).toContainText('1 practice result saved on this device.');
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(0);
  await expectResponsive(page, 'live-task-save-retry');
  await page.unroute('**/api/entries');
  const receipt = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/entries') &&
      response.request().method() === 'POST' &&
      response.status() === 201,
  );
  await activate(upload.getByRole('button', { name: 'Retry practice uploads', exact: true }));
  const acknowledged = await receipt;
  expect(acknowledged.request().postDataJSON()).toEqual(submitted[0]);
  await expect(upload).toHaveCount(0);
  const entries = (await (await context.request.get('/api/entries')).json()).entries;
  expect(entries).toHaveLength(1);
  expect(entries[0].minutes * 60).toBeGreaterThanOrEqual(2);
  expect(entries[0].minutes * 60).toBeLessThan(3);
  expect(entries[0].metadata.elapsedSeconds).toBeCloseTo(entries[0].minutes * 60, 8);
  expect(entries[0]).toEqual(submitted[0]);
  expect(entries[0].metadata.plannedTaskId).toBe(owned.id);
  expect(entries[0].qsoCount).toBeUndefined();
  expect(entries[0].metadata.assessment).toEqual({
    version: 1,
    source: 'self-reported',
    performanceRating: 'good',
    cwt: { heardCallsigns: 'W1SYN', comments: 'Assigned monitoring observation' },
  });
  expect(
    (await (await context.request.get('/api/plan')).json()).plan.find(
      (task: { id: string }) => task.id === owned.id,
    ).done,
  ).toBe(false);
  await navigate('Academy guide');
  await expect(opportunity).toContainText('No CWT window remains before the deadline.');
  await activate(
    page.getByRole('checkbox', { name: 'Mark My renamed live objective complete', exact: true }),
  );
  await expect
    .poll(
      async () =>
        (await (await context.request.get('/api/plan')).json()).plan.find(
          (task: { id: string }) => task.id === owned.id,
        ).done,
    )
    .toBe(true);
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(1);
  const exported = await (await context.request.get('/api/export')).json();
  expect(exported.plan.find((task: { id: string }) => task.id === owned.id).exercise).toEqual(
    owned.exercise,
  );
  expect((await context.request.get('/api/live-practice/calendar.ics')).status()).toBe(200);
});

test('retained manual work follows event edits and every timer checks current eligibility', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.122' });
  await signIn(page);
  // Only calendar/manual timing; the original manual result owner stays alive.
  await page.clock.install({ time: new Date('2026-10-07T13:45:00Z') });
  await page.clock.setFixedTime(new Date('2026-10-07T13:45:00Z'));
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
              startTime: '13:30',
              endTime: '14:30',
              endsNextDay: false,
            },
          },
        },
      })
    ).ok(),
  ).toBe(true);
  const task = {
    id: 'live-binding-manual',
    title: 'Retained radio objective',
    kind: 'on-air',
    lesson: 1,
    dueDate: '2026-10-07',
    createdAt: '2026-10-02T00:00:00Z',
    done: false,
    notes: 'Synthetic private preparation',
  };
  expect((await accountRequest(context, 'POST', '/api/plan', { task })).status()).toBe(201);
  await page.reload();
  let mobile = false;
  const activate = async (control: Locator) => {
    await expect(control).toBeEnabled();
    if (mobile) await control.tap();
    else {
      await control.focus();
      await expect(control).toBeFocused();
      await page.keyboard.press('Enter');
    }
  };
  const navigate = async (name: string) => {
    const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (await menu.isVisible()) await activate(menu);
    await activate(
      page.getByRole(['Your account', 'This device'].includes(name) ? 'button' : 'link', {
        name,
        exact: true,
      }),
    );
  };
  await navigate('Academy guide');
  await activate(page.getByRole('button', { name: 'This week', exact: true }));
  const row = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: task.title, exact: true }) });
  await activate(row.getByRole('button', { name: 'Practice', exact: true }));
  await openDisclosure(page, 'Session options and logging');
  await activate(page.getByRole('button', { name: 'Start timer', exact: true }));
  await page.clock.runFor(2200);
  await openDisclosure(page, 'Session options and logging');
  await activate(page.getByRole('button', { name: 'Pause timer', exact: true }));
  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  const workedTime = await page.getByRole('textbox', { name: /^Time practiced/ }).inputValue();
  await activate(page.getByRole('button', { name: 'Cancel', exact: true }));
  const editEvent = async (event: string) => {
    await navigate('Academy guide');
    await activate(page.getByRole('button', { name: `Edit ${task.title}`, exact: true }));
    await page
      .getByRole('combobox', { name: 'Live event (optional)', exact: true })
      .selectOption(event);
    await activate(page.getByRole('button', { name: 'Save exercise', exact: true }));
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await activate(
      page
        .getByRole('region', { name: 'Current practice block', exact: true })
        .getByRole('button', { name: 'Return to practice', exact: true }),
    );
  };
  await editEvent('cwt');
  await expect(
    page.getByRole('region', { name: 'CWT assignment opportunity', exact: true }),
  ).toContainText('CWT active now');
  await expect(page.getByRole('button', { name: 'Resume practice', exact: true })).toBeEnabled();
  await openDisclosure(page, 'Session options and logging');
  await expect(page.getByRole('button', { name: 'Resume timer', exact: true })).toBeEnabled();
  await expectResponsive(page, 'live-binding-added-active');
  await page.setViewportSize({ width: 390, height: 844 });
  mobile = true;
  await editEvent('sst');
  await expect(
    page.getByRole('region', { name: 'SST assignment opportunity', exact: true }),
  ).toContainText('No SST window remains');
  await expect(page.getByRole('button', { name: 'Resume practice', exact: true })).toBeDisabled();
  await openDisclosure(page, 'Session options and logging');
  await expect(page.getByRole('button', { name: 'Resume timer', exact: true })).toBeDisabled();
  await editEvent('');
  await expect(page.getByRole('region', { name: /assignment opportunity/ })).toHaveCount(0);
  await expect(
    page.getByText('Start practice is available during an eligible window', { exact: false }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Resume practice', exact: true })).toBeEnabled();
  await openDisclosure(page, 'Session options and logging');
  await expect(page.getByRole('button', { name: 'Resume timer', exact: true })).toBeEnabled();
  await expectResponsive(page, 'live-binding-cleared-manual');
  await page.clock.setFixedTime(new Date('2026-10-07T12:59:59Z'));
  await editEvent('cwt');
  await expect(
    page.getByRole('region', { name: 'CWT assignment opportunity', exact: true }),
  ).toContainText('Next eligible CWT window');
  await expect(page.getByRole('button', { name: 'Resume practice', exact: true })).toBeDisabled();
  await openDisclosure(page, 'Session options and logging');
  await expect(page.getByRole('button', { name: 'Resume timer', exact: true })).toBeDisabled();
  await page.clock.setFixedTime(new Date('2026-10-07T13:00:00Z'));
  await page.clock.runFor(1000);
  await openDisclosure(page, 'Session options and logging');
  const alternate = page.getByRole('button', { name: 'Resume timer', exact: true });
  await expect(alternate).toBeEnabled();
  // Expire wall time without refreshing the old enabled display first. The
  // activation guard must reject this stale click, not rely only on disabled UI.
  await page.clock.setFixedTime(new Date('2026-10-07T14:00:00Z'));
  await activate(alternate);
  await expect(page.getByRole('alert')).toContainText('not currently eligible');
  await expect(page.getByRole('button', { name: 'Pause timer', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause practice', exact: true })).toHaveCount(0);
  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  await expect(page.getByRole('textbox', { name: /^Time practiced/ })).toHaveValue(workedTime);
  await activate(page.getByRole('button', { name: 'Save practice', exact: true }));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect
    .poll(async () => (await (await context.request.get('/api/entries')).json()).entries.length)
    .toBe(1);
  const entry = (await (await context.request.get('/api/entries')).json()).entries[0];
  expect(entry.metadata.plannedTaskId).toBe(task.id);
  expect(entry.minutes * 60).toBeGreaterThanOrEqual(2.2);
  expect(entry.minutes * 60).toBeLessThan(3);
  expect(entry.qsoCount).toBeUndefined();
});
