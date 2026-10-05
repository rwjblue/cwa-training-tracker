import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { test } from './fixtures';
import { readFile } from 'node:fs/promises';
import { accountRequest, expectResponsive, openDisclosure, signIn } from './helpers';

test.use({ hasTouch: true });

async function activate(page: Page, control: Locator, mobile: boolean) {
  await expect(control).toBeEnabled();
  if (mobile) await control.tap();
  else {
    await control.focus();
    await page.keyboard.press('Enter');
  }
}

async function navigate(page: Page, name: string, mobile: boolean) {
  if (mobile) await page.getByRole('button', { name: 'Open navigation', exact: true }).tap();
  await activate(page, page.getByRole('button', { name, exact: true }), mobile);
}

async function inspect(page: Page, label: string) {
  // Axe schedules its analysis with browser timers; elapsed practice is already paused.
  await page.clock.resume();
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.playState === 'running' &&
            animation.effect?.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expectResponsive(page, label);
}

async function entries(context: BrowserContext) {
  const response = await context.request.get('/api/entries');
  expect(response.ok()).toBe(true);
  return (await response.json()).entries;
}

async function plan(context: BrowserContext) {
  const response = await context.request.get('/api/plan');
  expect(response.ok()).toBe(true);
  return (await response.json()).plan;
}

async function minute(page: Page, mobile: boolean) {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 1000));
  await openDisclosure(page, 'Session options and logging');
  await activate(page, page.getByRole('button', { name: 'Start timer', exact: true }), mobile);
  await page.clock.fastForward(60_000);
  await activate(page, page.getByRole('button', { name: 'Pause timer', exact: true }), mobile);
  await expect(
    page.getByRole('button', { name: 'Review & save 01:00', exact: true }),
  ).toBeEnabled();
}

const mobile = false;

test(`extra review retains purpose without required credit (desktop)`, async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  const label = `review-purpose-desktop`;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await context.setExtraHTTPHeaders({
    'CF-Connecting-IP': '192.0.2.150',
  });
  await signIn(page);
  const time = new Date('2026-10-07T16:00:00Z');
  await page.clock.setFixedTime(time);
  const settings = (await (await context.request.get('/api/settings')).json()).settings;
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        settings: { ...settings, timezone: 'UTC' },
      })
    ).ok(),
  ).toBe(true);
  const task = {
    id: 'review-purpose-current',
    title: 'Send a familiar exchange with generous spacing',
    kind: 'sending',
    targetMinutes: 2,
    dueDate: '2026-10-07',
    notes: 'Keep assignment progress separate from deliberate extra review.',
    done: false,
    createdAt: time.toISOString(),
  };
  const older = {
    ...task,
    id: 'review-purpose-older',
    title: 'An earlier completed sending exercise',
    targetMinutes: undefined,
    dueDate: '2026-09-30',
    done: true,
  };
  for (const fixture of [task, older])
    expect((await accountRequest(context, 'POST', '/api/plan', { task: fixture })).ok()).toBe(true);
  await page.reload();
  const today = page.getByRole('region', { name: 'What should I do today?' });
  const row = today
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: task.title, exact: true }) });
  const daily = page.getByRole('region', { name: 'Today’s practice time', exact: true });
  const expectDaily = async (time: string) => {
    const independent = daily.getByLabel('Independent practice', { exact: true });
    for (const [label, value] of [
      ['Saved', time],
      ['Current', '0:00'],
      ['Total', time],
    ])
      await expect(
        independent
          .locator('div')
          .filter({ hasText: new RegExp(`^${label}`) })
          .locator('dd'),
      ).toHaveText(value);
    await expect(daily).toContainText('Required goal: 60 min');
    await expect(daily).toContainText('Optional personal target: 60 min');
  };
  await expect(row.getByRole('button', { name: 'Extra review', exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Practice', exact: true })).toBeVisible();
  await activate(page, row.getByRole('button', { name: 'Extra review', exact: true }), mobile);
  await expect(page.getByRole('heading', { name: 'Lesson practice', exact: true })).toBeVisible();
  await expect(page.getByText('EXTRA REVIEW', { exact: true })).toBeVisible();
  await inspect(page, `${label}-studio`);
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important}',
  });
  await page.clock.install({ time });
  await minute(page, mobile);
  await page
    .getByRole('textbox', { name: 'Scratchpad', exact: true })
    .fill('Review notes remain with this minute.');
  const review = page.getByRole('dialog', {
    name: 'Save practice',
    exact: true,
  });
  await activate(
    page,
    page.getByRole('button', { name: 'Review & save 01:00', exact: true }),
    mobile,
  );
  await expect(review).toContainText('Extra review.');
  await expect(review).toContainText('does not add to the assignment’s required practice');
  await expect(review.getByLabel(/^Time practiced/)).toHaveValue('1:00');
  const classPlacement = review.getByRole('checkbox', { name: /^This was a class meeting/ });

  await classPlacement.focus();
  await page.keyboard.press('Space');

  await expect(classPlacement).toBeChecked();
  await expect(review).toContainText(
    'This is class time, kept separate from your daily practice total.',
  );
  await expect(review).not.toContainText('This practice counts toward your daily total.');
  await inspect(page, `${label}-class-placement`);

  await classPlacement.focus();
  await page.keyboard.press('Space');

  await expect(classPlacement).not.toBeChecked();
  await expect(review).toContainText('This practice counts toward your daily total.');
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press(index % 2 ? 'Shift+Tab' : 'Tab');
    expect(await review.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await inspect(page, `${label}-save-review`);
  await page.keyboard.press('Escape');
  await expect(review).toHaveCount(0);
  await expect(page.getByText('EXTRA REVIEW', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Scratchpad', exact: true })).toHaveValue(
    'Review notes remain with this minute.',
  );
  await activate(
    page,
    page.getByRole('button', { name: 'Review & save 01:00', exact: true }),
    mobile,
  );

  const bodies: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/entries' && request.method() === 'POST')
      bodies.push(request.postData()!);
  });
  let releaseUnavailable!: () => void;
  const unavailableGate = new Promise<void>((resolve) => {
    releaseUnavailable = resolve;
  });
  await page.route(
    '**/api/entries',
    async (route) => {
      await unavailableGate;
      await route.fulfill({ status: 503, json: { error: 'Retry this captured review.' } });
    },
    { times: 1 },
  );
  const firstRequest = page.waitForRequest(
    (request) => new URL(request.url()).pathname === '/api/entries' && request.method() === 'POST',
  );
  // Pause before starting Save; allow the evaluation/RPC to finish before the
  // requested instant. The measured practice is already paused and captured.
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 1000));
  await activate(page, review.getByRole('button', { name: 'Save practice', exact: true }), mobile);
  await firstRequest;
  await expect(review.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
  await expect(review.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await review.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(review).toBeVisible();
  releaseUnavailable();
  await page.clock.resume();
  await expect(review).toHaveCount(0);
  await expect(page).toHaveURL(/#overview$/);
  await expectDaily('1:00');
  await expect(row.getByText('Started', { exact: true })).toHaveCount(0);
  await expect(row).not.toContainText('min practiced');
  expect((await plan(context)).find((item: { id: string }) => item.id === task.id).done).toBe(
    false,
  );
  expect(await entries(context)).toHaveLength(0);
  expect(JSON.parse(bodies[0])).toMatchObject({
    minutes: 1,
    metadata: { plannedTaskId: task.id, practicePurpose: 'review', elapsedSeconds: 60 },
  });

  await navigate(page, 'Practice log', mobile);
  await expect(page.getByText('Waiting to upload', { exact: true })).toBeVisible();
  await expect(page.getByText('Extra review', { exact: true })).toBeVisible();
  await inspect(page, `${label}-waiting-history`);
  let releaseSave!: () => void;
  let committed!: () => void;
  const saveGate = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  const stored = new Promise<void>((resolve) => {
    committed = resolve;
  });
  await page.route(
    '**/api/entries',
    async (route) => {
      const response = await route.fetch();
      committed();
      await saveGate;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await stored;
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toBe(bodies[0]);
  expect(await entries(context)).toHaveLength(1);
  const acknowledged = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/entries' &&
      response.request().method() === 'POST' &&
      response.status() === 201,
  );
  releaseSave();
  await acknowledged;
  await expect(page.getByText('Waiting to upload', { exact: true })).toHaveCount(0);
  await navigate(page, 'Today', mobile);
  await expectDaily('1:00');
  await expect(row).not.toContainText('min practiced');

  await activate(page, row.getByRole('button', { name: 'Practice', exact: true }), mobile);
  await expect(page.getByRole('heading', { name: 'Lesson practice', exact: true })).toBeVisible();
  await minute(page, mobile);
  await activate(
    page,
    page.getByRole('button', { name: 'Review & save 01:00', exact: true }),
    mobile,
  );
  await expect(review.getByText('Extra review.', { exact: true })).toHaveCount(0);
  await activate(page, review.getByRole('button', { name: 'Save practice', exact: true }), mobile);
  await expect(review).toHaveCount(0);
  await page.clock.resume();
  await expect(row.getByText('1 min practiced · 1 today', { exact: true })).toBeVisible();
  await expect(row.getByText('Started', { exact: true })).toBeVisible();
  await expectDaily('2:00');
  const assigned = (await entries(context)).find(
    (entry: { metadata: { practicePurpose: string } }) =>
      entry.metadata.practicePurpose === 'assigned',
  );
  expect(assigned).toMatchObject({
    minutes: 1,
    metadata: { plannedTaskId: task.id, elapsedSeconds: 60 },
  });

  await activate(page, row.getByRole('button', { name: 'Practice', exact: true }), mobile);
  await activate(
    page,
    page.getByRole('button', { name: 'Complete exercise', exact: true }),
    mobile,
  );
  await expect(page.getByRole('button', { name: 'Reopen exercise', exact: true })).toBeVisible();
  expect(await entries(context)).toHaveLength(2);
  await activate(page, page.getByRole('button', { name: 'Back to Today', exact: true }), mobile);
  await today.locator('summary').filter({ hasText: 'Completed in this plan' }).click();
  await activate(page, row.getByRole('button', { name: 'Extra review', exact: true }), mobile);
  await minute(page, mobile);
  await activate(
    page,
    page.getByRole('button', { name: 'Review & save 01:00', exact: true }),
    mobile,
  );
  await expect(review).toContainText('Extra review.');
  await activate(page, review.getByRole('button', { name: 'Save practice', exact: true }), mobile);
  await expect(review).toHaveCount(0);
  await page.clock.resume();
  expect((await plan(context)).find((item: { id: string }) => item.id === task.id).done).toBe(true);
  await today.locator('summary').filter({ hasText: 'Completed in this plan' }).click();
  await expect(row.getByText('1 min practiced · 1 today', { exact: true })).toBeVisible();
  await expectDaily('3:00');
  await activate(page, row.getByRole('button', { name: 'Extra review', exact: true }), mobile);
  await activate(page, page.getByRole('button', { name: 'Reopen exercise', exact: true }), mobile);
  await expect(page.getByText('EXTRA REVIEW', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Complete exercise', exact: true })).toBeVisible();
  expect(await entries(context)).toHaveLength(3);
  await activate(page, page.getByRole('button', { name: 'Back to Today', exact: true }), mobile);

  await navigate(page, 'Academy guide', mobile);
  await activate(page, page.getByRole('button', { name: 'Whole course', exact: true }), mobile);
  await page.getByRole('checkbox', { name: 'Show completed', exact: true }).check();
  const olderRow = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: older.title, exact: true }) });
  await expect(olderRow.getByRole('button', { name: 'Practice', exact: true })).toHaveCount(0);
  await inspect(page, `${label}-full-plan`);
  await activate(page, olderRow.getByRole('button', { name: 'Extra review', exact: true }), mobile);
  await expect(page.getByRole('heading', { name: 'Lesson practice', exact: true })).toBeVisible();
  await openDisclosure(page, 'Session options and logging');
  await activate(
    page,
    page.getByRole('button', { name: 'Log practice manually', exact: true }),
    mobile,
  );
  await expect(review.getByLabel(/^Time practiced/)).toHaveValue('');
  await review.getByLabel(/^Time practiced/).fill('0:47');
  await activate(page, review.getByRole('button', { name: 'Save practice', exact: true }), mobile);
  await expect(review).toHaveCount(0);
  const saved = await entries(context);
  expect(saved).toHaveLength(4);
  expect(
    saved.filter(
      (entry: { metadata: { practicePurpose: string } }) =>
        entry.metadata.practicePurpose === 'review',
    ),
  ).toHaveLength(3);
  expect(
    saved.find(
      (entry: { metadata: { plannedTaskId: string } }) => entry.metadata.plannedTaskId === older.id,
    ),
  ).toMatchObject({ minutes: 47 / 60, metadata: { practicePurpose: 'review' } });
  expect((await plan(context)).find((item: { id: string }) => item.id === older.id).done).toBe(
    true,
  );
  await expectDaily('3:47');
  await expect(row.getByText('1 min practiced · 1 today', { exact: true })).toBeVisible();

  await navigate(page, 'Academy guide', mobile);
  await activate(page, page.getByRole('button', { name: 'Practice report', exact: true }), mobile);
  const report = page.getByRole('dialog', { name: 'Your practice report', exact: true });
  await report.getByLabel('From', { exact: true }).fill('2026-10-07');
  await report.getByLabel('Through', { exact: true }).fill('2026-10-07');
  await expect(report).toContainText('3.78 independent-practice minutes');
  await expect(report).toContainText('extra review');
  await inspect(page, `${label}-report`);
  await page.keyboard.press('Escape');
  await navigate(page, 'Your account', mobile);
  const downloaded = page.waitForEvent('download');
  await activate(page, page.getByRole('button', { name: 'Export backup', exact: true }), mobile);
  const file = await downloaded;
  const path = await file.path();
  expect(path).toBeTruthy();
  const backup = JSON.parse(await readFile(path!, 'utf8'));
  expect(backup.sessions).toHaveLength(4);
  expect(
    backup.sessions.map((entry: { id: string; metadata: unknown }) => ({
      id: entry.id,
      metadata: entry.metadata,
    })),
  ).toEqual(
    saved.map((entry: { id: string; metadata: unknown }) => ({
      id: entry.id,
      metadata: entry.metadata,
    })),
  );
  const chooser = page.waitForEvent('filechooser');
  await activate(page, page.getByRole('button', { name: 'Import backup', exact: true }), mobile);
  await (await chooser).setFiles(path!);
  const importing = page.getByRole('dialog', { name: 'Bring your practice along.', exact: true });
  await importing.getByRole('radio', { name: /^Merge with my practice log/ }).check();
  await activate(
    page,
    importing.getByRole('button', { name: 'Import sessions', exact: true }),
    mobile,
  );
  await expect(importing).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: '4 duplicates skipped' })).toBeVisible();
  expect(await entries(context)).toEqual(saved);
  await navigate(page, 'Practice log', mobile);
  await expect(page.getByText('Extra review', { exact: true })).toHaveCount(3);
  await inspect(page, `${label}-saved-history`);
});
