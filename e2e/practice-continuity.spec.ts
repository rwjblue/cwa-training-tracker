import { expect, type Locator } from '@playwright/test';
import { test } from './fixtures';
import {
  openDisclosure,
  navigateView,
  openPracticeTool,
  accountRequest,
  expectAccessible,
  expectResponsive,
  scopedRequest,
  signIn,
} from './helpers';

test.use({ hasTouch: true, extraHTTPHeaders: { 'CF-Connecting-IP': '192.0.2.106' } });

const viewport = { width: 1440, height: 1000 };

test(`assigned recording inspection retains one paused owner at ${viewport.width}px`, async ({
  page,
  context,
}) => {
  await page.setViewportSize(viewport);
  const activate = async (control: Locator) => {
    await expect(control).toBeEnabled();

    await control.focus();
    await page.keyboard.press('Enter');
  };
  await signIn(page);
  await page.clock.setSystemTime(new Date('2026-10-06T16:00:00Z'));
  const { user } = await (await context.request.get('/api/me')).json();
  const settings = (await (await context.request.get('/api/settings')).json()).settings;
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
  const older = {
    id: 'synthetic-older-timer',
    date: '2026-09-30',
    kind: 'sending',
    source: 'timer',
    minutes: 90.25 / 60,
    notes: 'An unrelated earlier result',
    createdAt: '2026-09-30T12:00:00Z',
    metadata: { elapsedSeconds: 90.25, recallSeconds: 10, practiceTool: 'sending' },
  };
  expect((await scopedRequest(context, 'POST', '/api/entries', older)).status()).toBe(201);
  await page.reload();
  const plan = (await (await context.request.get('/api/plan')).json()).plan;
  const assigned = plan.find(
    (task: { dueDate?: string; exercise?: { type: string; url?: string } }) =>
      task.dueDate === '2026-10-06' &&
      task.exercise?.type === 'audio' &&
      /WD101[-_]10/i.test(task.exercise.url ?? ''),
  );
  expect(assigned).toBeTruthy();
  // Actual four-second synthetic WAV; native media movement establishes credit.
  const recording = Buffer.alloc(44 + 64000);
  recording.write('RIFF', 0);
  recording.writeUInt32LE(recording.length - 8, 4);
  recording.write('WAVEfmt ', 8);
  recording.writeUInt32LE(16, 16);
  recording.writeUInt16LE(1, 20);
  recording.writeUInt16LE(1, 22);
  recording.writeUInt32LE(8000, 24);
  recording.writeUInt32LE(16000, 28);
  recording.writeUInt16LE(2, 32);
  recording.writeUInt16LE(16, 34);
  recording.write('data', 36);
  recording.writeUInt32LE(64000, 40);
  await page.route(assigned.exercise.url, (route) =>
    route.fulfill({ status: 200, contentType: 'audio/wav', body: recording }),
  );
  const row = page
    .getByRole('region', { name: 'What should I do today?' })
    .getByRole('listitem')
    .filter({
      has: page.getByRole('heading', { name: assigned.title, exact: true }),
    });
  await activate(row.getByRole('button', { name: 'Listen & practice', exact: true }));
  const audio = page.getByLabel('Assigned recording', { exact: true });
  const element = await audio.elementHandle();
  const notes = 'Retain this exact block and recording.';
  const scratchpad = page.getByRole('textbox', { name: 'Scratchpad', exact: true });
  const readNotes = () =>
    page.evaluate(
      ({ scope, taskId }) =>
        localStorage.getItem(`cwa.studio.scratchpad.v1:${JSON.stringify([scope, taskId])}`),
      { scope: user.id, taskId: assigned.id },
    );
  await scratchpad.fill(notes);
  await activate(page.getByRole('button', { name: 'Start practice', exact: true }));
  await expect
    .poll(() => audio.evaluate((item: HTMLAudioElement) => item.currentTime))
    .toBeGreaterThan(1.2);
  await navigateView(page, 'Today', activate);
  await expect(page).toHaveURL(/#overview$/);
  const position = await element!.evaluate((item: HTMLAudioElement) => item.currentTime);
  expect(await element!.evaluate((item: HTMLAudioElement) => item.paused)).toBe(true);
  const retained = page.getByRole('region', { name: 'Current practice block', exact: true });
  await expect(retained).toContainText(assigned.title);
  // A separate manual log shares the task, but does not own the paused Studio.
  await activate(retained.getByRole('button', { name: 'Return to practice', exact: true }));
  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  const reviewedDuration = await page.getByLabel(/^Time practiced/).inputValue();
  const reviewedMeasurement = await page
    .getByRole('dialog')
    .getByText(/^Measured \d+\.\d{2} seconds/)
    .textContent();
  const reviewedSource = await page
    .getByRole('dialog')
    .getByText(/^\d+\.\d{2} seconds listened/)
    .textContent();
  await activate(page.getByRole('button', { name: 'Cancel', exact: true }));
  await navigateView(page, 'Today', activate);
  // Stored notes matter here: the mounted textarea can mask a deleted value.
  await expect.poll(readNotes).toBe(notes);
  await activate(row.getByRole('button', { name: 'Log practice', exact: true }));
  await page.getByLabel(/^Time practiced/).fill('1:00');
  const independentNotes = 'Separate manual history for the same assignment.';
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: /^Notes/ })
    .fill(independentNotes);
  await activate(page.getByRole('button', { name: 'Save practice', exact: true }));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(retained).toContainText(assigned.title);
  await expect.poll(readNotes).toBe(notes);
  const afterIndependentSave = (await (await context.request.get('/api/entries')).json()).entries;
  expect(afterIndependentSave).toHaveLength(2);
  const independent = afterIndependentSave.find(
    (entry: { notes: string }) => entry.notes === independentNotes,
  );
  expect(independent).toMatchObject({
    source: 'manual',
    minutes: 1,
    metadata: { plannedTaskId: assigned.id },
  });
  expect(independent.metadata.scratchpad).toBe('');
  expect(await element!.evaluate((item: HTMLAudioElement) => item.isConnected && item.paused)).toBe(
    true,
  );
  expect(await element!.evaluate((item: HTMLAudioElement) => item.currentTime)).toBe(position);
  await activate(retained.getByRole('button', { name: 'Return to practice', exact: true }));
  await expect(audio).toHaveAttribute('src', assigned.exercise.url);
  await expect(scratchpad).toHaveValue(notes);
  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  await expect(page.getByLabel(/^Time practiced/)).toHaveValue(reviewedDuration);
  await expect(page.getByRole('dialog').getByText(/^Measured \d+\.\d{2} seconds/)).toHaveText(
    reviewedMeasurement!,
  );
  await expect(page.getByRole('dialog').getByText(/^\d+\.\d{2} seconds listened/)).toHaveText(
    reviewedSource!,
  );
  await activate(page.getByRole('button', { name: 'Cancel', exact: true }));
  await navigateView(page, 'Today', activate);
  await expectResponsive(page, `retained-today-${viewport.width}`);

  await activate(retained.getByRole('button', { name: 'Inspect this week', exact: true }));
  await expect(page).toHaveURL(/#course$/);
  await activate(retained.getByRole('button', { name: 'Inspect report', exact: true }));
  const report = page.getByRole('dialog');
  await expect(report).toBeVisible();
  await expectAccessible(page, `retained-report-${viewport.width}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await activate(report.getByRole('button', { name: 'Return to practice', exact: true }));
  await expect(audio).toBeVisible();
  expect(await element!.evaluate((item: HTMLAudioElement) => item.isConnected)).toBe(true);
  expect(await audio.evaluate((item: HTMLAudioElement) => item.currentTime)).toBe(position);
  expect(await audio.evaluate((item: HTMLAudioElement) => item.paused)).toBe(true);
  await expect(audio).toHaveAttribute('src', assigned.exercise.url);
  await expect(scratchpad).toHaveValue(notes);
  // Editing an unrelated timer result cannot acknowledge/reset this owner.
  await navigateView(page, 'Today', activate);

  await activate(page.getByRole('link', { name: 'Practice log', exact: true }));
  await activate(page.getByRole('button', { name: 'Edit Sending on 2026-09-30', exact: true }));
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: /^Notes/ })
    .fill('Edited the older result only.');
  await activate(page.getByRole('button', { name: 'Save changes', exact: true }));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await activate(retained.getByRole('button', { name: 'Return to practice', exact: true }));
  expect(await audio.evaluate((item: HTMLAudioElement) => item.currentTime)).toBe(position);
  await expect(scratchpad).toHaveValue(notes);
  await activate(page.getByRole('button', { name: 'Resume practice', exact: true }));
  await expect
    .poll(() => audio.evaluate((item: HTMLAudioElement) => item.currentTime))
    .toBeGreaterThan(position + 0.3);
  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  await activate(page.getByRole('button', { name: 'Cancel', exact: true }));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Resume practice', exact: true })).toBeVisible();
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(2);
  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1');
  await expectAccessible(page, `retained-review-${viewport.width}`);

  await activate(page.getByRole('button', { name: 'Save practice', exact: true }));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(retained).toHaveCount(0);
  await expect.poll(readNotes).toBeNull();
  const exported = await (await context.request.get('/api/export')).json();
  expect(exported.sessions).toHaveLength(3);
  const result = exported.sessions.find(
    (entry: { id: string; source: string }) => entry.id !== older.id && entry.source !== 'manual',
  );
  expect(result.metadata).toMatchObject({
    plannedTaskId: assigned.id,
    practicePurpose: 'assigned',
    scratchpad: notes,
    recordings: [{ url: assigned.exercise.url }],
  });
  expect(result.metadata.elapsedSeconds).toBeGreaterThan(1.2);
  expect(result.metadata.elapsedSeconds).toBeLessThanOrEqual(4);
  expect(result.minutes).toBeCloseTo(result.metadata.elapsedSeconds / 60, 8);
  expect(result.metadata.recordings[0].seconds).toBeCloseTo(result.metadata.elapsedSeconds, 8);
  // Leaving this account disposes its block before exposing the guest scope.
  await activate(row.getByRole('button', { name: 'Listen & practice', exact: true }));
  await expect(scratchpad).toHaveValue('');
  await scratchpad.fill('Private owner notes.');
  await navigateView(page, 'Today', activate);
  await activate(page.getByRole('button', { name: 'Open your account', exact: true }));
  await activate(page.getByRole('button', { name: 'Sign out', exact: true }));
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(retained).toHaveCount(0);
  expect((await context.request.get('/api/entries')).status()).toBe(401);

  await openPracticeTool(page, 'Word listening', activate);
  await expect(audio).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Scratchpad', exact: true })).toHaveValue('');
});

test(`assigned external Finish retains measured time and clears saved scratchpad at ${viewport.width}px`, async ({
  page,
  context,
}) => {
  await page.setViewportSize(viewport);
  const activate = async (control: Locator) => {
    await expect(control).toBeEnabled();

    await control.focus();
    await page.keyboard.press('Enter');
  };
  await signIn(page);
  const time = new Date('2026-10-06T16:00:00Z');
  await page.clock.setSystemTime(time);
  const { settings } = await (await context.request.get('/api/settings')).json();
  const { user } = await (await context.request.get('/api/me')).json();
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        settings: { ...settings, timezone: 'UTC' },
      })
    ).ok(),
  ).toBe(true);
  const task = {
    id: crypto.randomUUID(),
    title: 'Synthetic assigned external key practice',
    kind: 'sending',
    done: false,
    dueDate: '2026-10-06',
    notes: '',
    createdAt: time.toISOString(),
    exercise: { type: 'external', url: 'https://example.test/retained-key-practice' },
  };
  expect((await accountRequest(context, 'POST', '/api/plan', { task })).ok()).toBe(true);
  await context.route(task.exercise.url, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<p>Synthetic key practice</p>',
    }),
  );
  await page.reload();
  const row = page
    .getByRole('region', { name: 'What should I do today?' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: task.title, exact: true }) });
  await activate(row.getByRole('button', { name: 'Practice', exact: true }));
  const scratchpad = page.getByRole('textbox', { name: 'Scratchpad', exact: true });
  const original = await scratchpad.elementHandle();
  const notes = 'Retain these notes with the deliberately finished timer.';
  const readNotes = () =>
    page.evaluate(
      ({ scope, taskId }) =>
        localStorage.getItem(`cwa.studio.scratchpad.v1:${JSON.stringify([scope, taskId])}`),
      { scope: user.id, taskId: task.id },
    );
  await scratchpad.fill(notes);
  // Keep animation actionability independent of the paused manual-practice clock.
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important}',
  });
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.getTime() + 1000));
  const opened = context.waitForEvent('page');
  await activate(page.getByRole('button', { name: 'Start practice', exact: true }));
  const external = await opened;
  await expect(external).toHaveURL(task.exercise.url);
  await external.close();
  await page.clock.fastForward(12_000);
  await openDisclosure(page, 'Browse other views');
  await activate(page.getByRole('button', { name: 'Inspect Today', exact: true }));
  const retained = page.getByRole('region', { name: 'Current practice block', exact: true });
  await expect(retained).toContainText(task.title);
  await page.clock.fastForward(300_000);
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(0);
  await activate(retained.getByRole('button', { name: 'Return to practice', exact: true }));
  await expect(page.getByRole('button', { name: 'Resume practice', exact: true })).toBeVisible();
  await expect(scratchpad).toHaveValue(notes);
  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  await expect(page.getByLabel(/^Time practiced/)).toHaveValue('0:12');
  await openDisclosure(page, 'External results and exact timing');
  await page.getByRole('combobox', { name: 'External result', exact: true }).selectOption('words');
  await expect(
    page.getByRole('textbox', { name: 'Actual local completion', exact: true }),
  ).toHaveCount(0);
  await page.getByLabel(/^Actual trainer speed/).fill('25');
  await page.getByLabel(/^LCWO score/).fill('0');
  await activate(page.getByRole('button', { name: 'Cancel', exact: true }));
  await openDisclosure(page, 'Browse other views');
  await activate(page.getByRole('button', { name: 'Inspect Today', exact: true }));
  await page.clock.resume();
  await expectAccessible(page, `retained-manual-${viewport.width}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const receipt = page.waitForResponse(
    (response) => response.url().endsWith('/api/entries') && response.request().method() === 'POST',
  );
  await activate(retained.getByRole('button', { name: 'Finish practice', exact: true }));
  expect((await receipt).status()).toBe(201);
  await expect(retained).toHaveCount(0);
  expect(await original!.evaluate((element) => element.isConnected)).toBe(false);
  await page.clock.resume();
  const historyMenu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await historyMenu.isVisible()) await activate(historyMenu);
  await activate(page.getByRole('link', { name: 'Practice log', exact: true }));
  await activate(page.getByRole('button', { name: 'Edit Sending on 2026-10-06', exact: true }));
  await openDisclosure(page, 'External results and exact timing');
  await page.getByRole('combobox', { name: 'External result', exact: true }).selectOption('words');
  await page.getByLabel(/^Actual trainer speed/).fill('25');
  await page.getByLabel(/^LCWO score/).fill('0');
  await page.getByLabel(/^Number of errors/).fill('0');
  await page.getByRole('button', { name: 'Save changes', exact: true }).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByText('Practice evidence', { exact: true }).press('Enter');
  await expect(page.getByText('LCWO score: 0', { exact: true })).toBeVisible();
  await expectAccessible(page, `external-measured-score-${viewport.width}`);

  const { entries } = await (await context.request.get('/api/entries')).json();
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    minutes: 12 / 60,
    source: 'timer',
    metadata: {
      elapsedSeconds: 12,
      scratchpad: notes,
      plannedTaskId: task.id,
      practicePurpose: 'assigned',
    },
  });
  await expect.poll(readNotes).toBe(null);
  const { plan } = await (await context.request.get('/api/plan')).json();
  expect(plan.find((item: { id: string }) => item.id === task.id).done).toBe(false);
  await activate(page.getByRole('link', { name: 'Today', exact: true }));
  await activate(row.getByRole('button', { name: 'Practice', exact: true }));
  await expect(page.getByRole('button', { name: 'Start practice', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review & save', exact: true })).toBeDisabled();
  await expect(page.getByText('00:00 elapsed', { exact: true })).toBeVisible();
  await expect(scratchpad).toHaveValue('');
});
