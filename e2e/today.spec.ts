import { expect } from '@playwright/test';
import { test } from './fixtures';
import { addDays, dateInTimezone } from '../src/shared/training';
import {
  openDisclosure,
  openPracticeTool,
  accountRequest,
  expectAccessible,
  expectResponsive,
  scopedRequest,
  signIn,
} from './helpers';

test('Today brings personal assignments forward and keeps logging separate from completion', async ({
  page,
  context,
}) => {
  await signIn(page);
  const now = new Date('2026-10-06T16:00:00Z');
  await page.clock.setFixedTime(now);
  const settings = (await (await context.request.get('/api/settings')).json()).settings;
  const today = dateInTimezone(now, settings.timezone);
  const panel = page.getByRole('region', { name: 'What should I do today?' });
  await expect(panel.getByRole('heading', { name: 'Set up your course.' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Restore backup', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Set course dates', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Add an exercise', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Add a practice exercise' })).toBeVisible();
  await expect(page.getByLabel('Practice date (optional)', { exact: true })).toHaveValue(today);
  await page.getByLabel('Exercise title', { exact: true }).fill('Today’s sending warm-up');
  await page.getByRole('combobox', { name: 'Activity', exact: true }).selectOption('sending');
  await page.getByLabel('Suggested minutes (optional)', { exact: true }).fill('12');
  await page
    .getByLabel('Exercise link (optional)', { exact: true })
    .fill('https://example.org/today');
  await page
    .getByLabel('Instructions or notes (optional)', { exact: true })
    .fill('Send a familiar exchange with generous word spacing.');
  await page.getByRole('button', { name: 'Save exercise', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Practice', exact: true })).toBeVisible();
  const firstTask = (await (await context.request.get('/api/plan')).json()).plan[0];
  expect(firstTask.dueDate).toBe(today);

  const future = await accountRequest(context, 'POST', '/api/plan', {
    task: {
      ...firstTask,
      id: 'tomorrow-exercise',
      title: 'Tomorrow’s listening exercise',
      dueDate: addDays(today, 1),
      done: false,
    },
  });
  expect(future.ok()).toBe(true);
  await page.reload();
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(
    panel.getByRole('heading', { name: 'Today’s sending warm-up', exact: true, level: 4 }),
  ).toBeVisible();
  await expect(
    panel.getByRole('heading', { name: 'Tomorrow’s listening exercise', exact: true }),
  ).toHaveCount(0);
  await expect(panel.getByRole('link', { name: 'Open exercise', exact: true })).toHaveAttribute(
    'href',
    'https://example.org/today',
  );
  await panel.locator('summary').filter({ hasText: 'Instructions' }).click();
  await expect(
    panel.getByText('Send a familiar exchange with generous word spacing.', { exact: true }),
  ).toBeVisible();
  await expectAccessible(page, 'today-desktop');

  await panel.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(page).toHaveURL(/#practice(?:[/?].*)?$/);
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important}',
  });
  await page.clock.install({ time: now });
  await page.clock.pauseAt(new Date(now.getTime() + 1000));
  await openDisclosure(page, 'Session options and logging');
  await page.getByRole('button', { name: 'Start timer', exact: true }).click();
  await page.clock.fastForward(420_000);
  await page.getByRole('button', { name: 'Pause timer', exact: true }).click();
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(page).toHaveURL(/#overview$/);
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(0);
  await page
    .getByRole('region', { name: 'Current practice block', exact: true })
    .getByRole('button', { name: 'Return to practice', exact: true })
    .click();
  await expect(page).toHaveURL(/#practice(?:[/?].*)?$/);
  await page.getByRole('button', { name: 'Review & save 07:00', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Activity', exact: true })).toHaveValue(
    'sending',
  );
  await expect(page.getByLabel(/^Time practiced/)).toHaveValue('7:00');
  await page.getByRole('button', { name: 'Save practice', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/#overview$/);
  await page.clock.resume();
  await expect(panel.getByText('Started', { exact: true })).toBeVisible();
  await expect(panel.getByText('7 min practiced · 7 today', { exact: true })).toBeVisible();

  const entries = (await (await context.request.get('/api/entries')).json()).entries;
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    minutes: 7,
    kind: 'sending',
    metadata: { plannedTaskId: firstTask.id, elapsedSeconds: 420 },
  });
  expect(
    (await (await context.request.get('/api/plan')).json()).plan.find(
      (task: { id: string }) => task.id === firstTask.id,
    ).done,
  ).toBe(false);

  await expect(panel.getByRole('checkbox')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Practice', exact: true }).click();
  await page.getByRole('button', { name: 'Complete exercise', exact: true }).click();
  await expect(page.getByLabel(/^Time practiced/)).toHaveValue('0:00');
  await page.getByRole('button', { name: 'Save and complete exercise', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/#overview$/);
  await expect(panel.getByRole('heading', { name: 'Today’s plan is complete.' })).toBeVisible();
  await expect
    .poll(
      async () =>
        (await (await context.request.get('/api/plan')).json()).plan.find(
          (task: { id: string }) => task.id === firstTask.id,
        ).done,
    )
    .toBe(true);
  const afterCompletion = (await (await context.request.get('/api/entries')).json()).entries;
  expect(afterCompletion).toHaveLength(2);
  expect(afterCompletion.find((entry: { id: string }) => entry.id === entries[0].id)).toEqual(
    entries[0],
  );
  expect(afterCompletion.find((entry: { id: string }) => entry.id !== entries[0].id)).toMatchObject(
    {
      minutes: 0,
      metadata: { plannedTaskId: firstTask.id, elapsedSeconds: 0 },
    },
  );

  await page.setViewportSize({ width: 390, height: 844 });
  const completedPlan = panel.locator('details').filter({
    has: page.locator('summary').filter({ hasText: 'Completed in this plan' }),
  });
  await completedPlan.locator('summary').filter({ hasText: 'Completed in this plan' }).click();
  await expect(
    completedPlan.getByRole('heading', { name: 'Today’s sending warm-up', exact: true, level: 4 }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expectAccessible(page, 'today-mobile');

  await page.reload();
  await expect(panel.getByRole('heading', { name: 'Today’s plan is complete.' })).toBeVisible();
});

test('course dates populate Today with playable assignments and preserve linked practice', async ({
  page,
  context,
}) => {
  await signIn(page);
  await page.clock.setFixedTime(new Date('2026-10-06T16:00:00Z'));
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important}',
  });
  const panel = page.getByRole('region', { name: 'What should I do today?' });
  await panel.getByRole('button', { name: 'Set course dates', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Your course level', exact: true })
    .selectOption('intermediate');
  await page.getByRole('combobox', { name: 'Practice timezone', exact: true }).selectOption('UTC');
  await page.getByLabel(/^First class date/).fill('2026-10-08');
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await page.getByRole('button', { name: 'View Today', exact: true }).click();
  await expect(panel.getByRole('heading', { name: /Assigned for today/ })).toBeVisible();
  await expect(
    panel.getByRole('link', { name: 'Session 1 syllabus', exact: true }),
  ).toHaveAttribute(
    'href',
    'https://cwa.cwops.org/wp-content/uploads/Practice-Instructions-Intermediate-ver.2.3.htm#_Toc172984024',
  );
  await expect(panel.getByRole('checkbox')).toHaveCount(0);

  const plan = (await (await context.request.get('/api/plan')).json()).plan;
  const assigned = plan.find(
    (task: { dueDate?: string; exercise?: { type: string; url?: string } }) =>
      task.dueDate === '2026-10-06' &&
      task.exercise?.type === 'audio' &&
      /WD101[-_]10/i.test(task.exercise.url ?? ''),
  );
  expect(assigned).toBeTruthy();
  await openDisclosure(panel, 'How this plan works');
  await expect(
    panel.getByText(/Record practice under the session shown on the exercise/),
  ).toBeVisible();
  await page
    .locator('.page-heading')
    .getByRole('button', { name: 'Log practice', exact: true })
    .click();
  const sessionSelect = page.getByRole('combobox', {
    name: 'Academy session optional',
    exact: true,
  });
  await expect(sessionSelect).toHaveValue('');
  await expect(sessionSelect).toHaveAccessibleDescription(/Leave this blank for general practice/);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await page.setViewportSize({ width: 1280, height: 900 });

  // Exercise browser media playback without relying on the remote recording or
  // redistributing course audio: this is a four-second synthetic silent WAV.
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
  const row = panel.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: assigned.title, exact: true }),
  });
  await openPracticeTool(page, 'Free practice');
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await row.getByRole('button', { name: 'Listen & practice', exact: true }).click();
  const audio = page.getByLabel('Assigned recording', { exact: true });
  await expect(page.getByRole('textbox', { name: 'Scratchpad', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'New set', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play Morse', exact: true })).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const audioBox = (await audio.boundingBox())!;
    const notesBox = (await page
      .getByRole('textbox', { name: 'Scratchpad', exact: true })
      .boundingBox())!;
    expect(
      audioBox.y + audioBox.height,
      `Assigned playback should fit the first screen at ${width}px`,
    ).toBeLessThan(width === 390 ? 844 : 1000);
    expect(
      Math.abs(notesBox.y - audioBox.y),
      `Assigned notes should stay beside audio at ${width}px`,
    ).toBeLessThan(350);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(audio).toHaveAttribute('src', assigned.exercise.url);

  await page.setViewportSize({ width: 390, height: 844 });
  await expectAccessible(page, 'assigned-recording-mobile');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await page
    .getByRole('textbox', { name: 'Scratchpad', exact: true })
    .fill('Copied ALICE in OH. Revisit the final sentence.');
  // Native controls are enough to begin timing; no separate Start practice click.
  await audio.evaluate((element: HTMLAudioElement) => element.play());
  await expect(page.getByRole('button', { name: 'Pause practice', exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title))
    .toBe(`Session ${assigned.lesson} · WD101-10`);
  expect(await page.evaluate(() => navigator.mediaSession.metadata?.album)).toBe(
    'CW Academy practice · 10 WPM',
  );
  expect(
    await page.evaluate(() =>
      navigator.mediaSession.metadata?.artwork.map((art) => ({
        path: new URL(art.src).pathname,
        sizes: art.sizes,
        type: art.type,
      })),
    ),
  ).toEqual([
    { path: '/media/cwa-512.png', sizes: '512x512', type: 'image/png' },
    { path: '/media/cwa-192.png', sizes: '192x192', type: 'image/png' },
  ]);
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(1.2);
  await audio.evaluate((element: HTMLAudioElement) => element.pause());
  await expect(page.getByRole('button', { name: 'Resume practice', exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.mediaSession.playbackState)).toBe('paused');
  expect(await page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe(
    `Session ${assigned.lesson} · WD101-10`,
  );
  let listened = await audio.evaluate((element: HTMLAudioElement) => element.currentTime);
  await page.getByRole('button', { name: 'Review & save', exact: true }).click();
  await openDisclosure(page, 'Speed, rating and on-air observations');
  await expect(page.getByLabel('Character WPM', { exact: true })).toHaveValue('25');
  await expect(page.getByLabel('Effective WPM', { exact: true })).toHaveValue('10');
  await expect(page.getByLabel(/^Time practiced/)).toHaveValue(/^\d+:\d{2}$/);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await openDisclosure(page, 'Choose a recording speed');
  const speed = page.getByRole('combobox', { name: 'Recording speed', exact: true });
  const fasterUrl = await speed.getByRole('option', { name: /^13 WPM/ }).getAttribute('value');
  expect(fasterUrl).toBeTruthy();
  await page.route(fasterUrl!, (route) =>
    route.fulfill({ status: 200, contentType: 'audio/wav', body: recording }),
  );
  await speed.selectOption(fasterUrl!);
  await expect(audio).toHaveAttribute('src', fasterUrl!);
  expect(await page.evaluate(() => navigator.mediaSession.metadata)).toBeNull();
  expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  expect(await audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBe(0);
  await expect(page.getByRole('textbox', { name: 'Scratchpad', exact: true })).toHaveValue(
    'Copied ALICE in OH. Revisit the final sentence.',
  );
  await page
    .getByRole('combobox', { name: 'Recording speed default', exact: true })
    .selectOption('next');
  await expect(audio).toHaveAttribute('src', fasterUrl!);
  await audio.evaluate((element: HTMLAudioElement) => element.play());
  await expect
    .poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title))
    .toBe(`Session ${assigned.lesson} · WD101-13`);
  expect(await page.evaluate(() => navigator.mediaSession.metadata?.album)).toBe(
    'CW Academy practice · 13 WPM',
  );
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(1.2);
  await audio.evaluate((element: HTMLAudioElement) => element.pause());
  listened += await audio.evaluate((element: HTMLAudioElement) => element.currentTime);

  await page.clock.install({ time: new Date('2026-10-06T16:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-06T16:00:01Z'));
  await page.clock.fastForward(65_000);
  await page.getByRole('button', { name: 'Start recall timer', exact: true }).click();
  await page.clock.runFor(2_000);
  await page.getByRole('button', { name: 'Review & save', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Save practice', exact: true })).toBeFocused();
  await expect(dialog.getByLabel('Character WPM', { exact: true })).toHaveValue('25');
  await expect(dialog.getByLabel('Effective WPM', { exact: true })).toHaveValue('');

  await expect(dialog.getByRole('textbox', { name: 'Scratchpad', exact: true })).toHaveValue(
    'Copied ALICE in OH. Revisit the final sentence.',
  );
  await dialog
    .getByRole('textbox', { name: 'Scratchpad', exact: true })
    .fill('Copied ALICE in OH. Replayed the final sentence.');
  await page.getByRole('button', { name: 'Save practice', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/#overview$/);
  await expect(row.getByText('Started', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await row.getByRole('button', { name: 'Listen & practice', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review & save', exact: true })).toBeDisabled();
  await expect(page.getByRole('textbox', { name: 'Scratchpad', exact: true })).toHaveValue('');
  const entries = (await (await context.request.get('/api/entries')).json()).entries;
  expect(entries).toHaveLength(1);
  expect(entries[0].metadata.plannedTaskId).toBe(assigned.id);
  expect(entries[0].metadata.scratchpad).toBe('Copied ALICE in OH. Replayed the final sentence.');
  expect(entries[0].metadata.recallSeconds).toBe(2);
  expect(entries[0].metadata.elapsedSeconds).toBeGreaterThanOrEqual(2 + Math.floor(listened) - 1);
  expect(entries[0].metadata.elapsedSeconds).toBeLessThanOrEqual(2 + Math.ceil(listened));
  expect(entries[0].minutes).toBe(entries[0].metadata.elapsedSeconds / 60);
  expect(entries[0].metadata.recordings).toHaveLength(2);
  expect(entries[0].metadata.recordings[0]).toMatchObject({
    url: assigned.exercise.url,
    speedWpm: 10,
    characterWpm: 25,
    effectiveWpm: 10,
  });
  expect(entries[0].metadata.recordings[1]).toMatchObject({
    url: fasterUrl,
    speedWpm: 13,
    characterWpm: 25,
    effectiveWpm: 13,
  });
  expect(entries[0].metadata.assignedCharacterWpm).toBe(25);
  expect(entries[0].metadata.assignedEffectiveWpm).toBe(10);
  expect(entries[0].characterWpm).toBe(25);
  expect(entries[0].effectiveWpm).toBeUndefined(); // effective speeds differ across files

  const nativeRecording = await audio.elementHandle();
  await audio.evaluate((element: HTMLAudioElement) => element.play());
  await expect(page.getByRole('button', { name: 'Pause practice', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Today', exact: true }).click();
  expect(await nativeRecording!.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  expect(await page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe(
    `Session ${assigned.lesson} · WD101-13`,
  );
  expect(await page.evaluate(() => navigator.mediaSession.playbackState)).toBe('paused');
  await expect(page).toHaveURL(/#overview$/);
  await expect(row.getByText('Started', { exact: true })).toBeVisible();
  await page
    .getByRole('region', { name: 'Current practice block', exact: true })
    .getByRole('button', { name: 'Return to practice', exact: true })
    .click();
  expect(await nativeRecording!.evaluate((element: HTMLAudioElement) => element.isConnected)).toBe(
    true,
  );
  await expect(audio).toHaveAttribute('src', fasterUrl!); // remembered next-faster default
  await page.clock.resume();
  const retainedPosition = await audio.evaluate((element: HTMLAudioElement) => element.currentTime);
  await audio.evaluate((element: HTMLAudioElement) => element.play());
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(retainedPosition + 1.2);
  await page.route('**/api/account-operations', (route) => {
    if (route.request().postDataJSON().change.type !== 'task-status') return route.continue();
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Completion temporarily unavailable.' }),
    });
  });
  await page.getByRole('button', { name: 'Complete exercise', exact: true }).click();
  expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  await page.getByRole('button', { name: 'Save and complete exercise', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/#overview$/);
  await expect(
    page.getByRole('region', { name: 'Account sync status', exact: true }),
  ).toContainText('Waiting to sync.');
  const savedBeforeCompletion = (await (await context.request.get('/api/entries')).json()).entries;
  expect(savedBeforeCompletion).toHaveLength(2);
  const recent = savedBeforeCompletion.find((entry: { id: string }) => entry.id !== entries[0].id);
  expect(recent.metadata.plannedTaskId).toBe(assigned.id);
  expect(recent.metadata.elapsedSeconds).toBeGreaterThanOrEqual(1);
  expect(recent.metadata.elapsedSeconds).toBeLessThanOrEqual(4);
  expect(
    (await (await context.request.get('/api/plan')).json()).plan.find(
      (task: { id: string }) => task.id === assigned.id,
    ).done,
  ).toBe(false);
  await page.unroute('**/api/account-operations');
  await page.getByRole('button', { name: 'Retry account sync', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Account sync status', exact: true })).toHaveCount(
    0,
  );
  await expect(row).toHaveCount(0);
  await expect(panel.getByText('1/4 done', { exact: true })).toBeVisible();
  await page.reload();
  const after = (await (await context.request.get('/api/plan')).json()).plan;
  expect(after.find((task: { id: string }) => task.id === assigned.id).done).toBe(true);
  expect(after).toHaveLength(plan.length);
  expect((await (await context.request.get('/api/entries')).json()).entries).toEqual(
    savedBeforeCompletion,
  );

  // The next class can advance while review still belongs to the earlier exercise.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.setFixedTime(new Date('2026-10-09T16:00:00Z'));
  await page.reload();
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important}',
  });
  await expect(panel.getByText(/Next class/)).toContainText('Session 2');
  await panel.locator('summary').filter({ hasText: 'Earlier unfinished work' }).click();
  const earlier = plan.find(
    (task: { id: string; lesson?: number }) => task.lesson === 1 && task.id !== assigned.id,
  );
  const earlierRow = panel
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: earlier.title, exact: true }) })
    .filter({ hasText: `Session 1 · Day ${earlier.curriculum.day}` });
  await earlierRow.getByRole('button', { name: 'Log practice', exact: true }).click();
  await expect(sessionSelect).toHaveValue('1');
  await expect(sessionSelect).toHaveAccessibleDescription(/earlier session for review/);
  await expectAccessible(page, 'practice-session-desktop');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sessionSelect).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expectAccessible(page, 'practice-session-mobile');

  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
});

test('an exercise without a time target completes through a zero-time review and reopens without adding time', async ({
  page,
  context,
}) => {
  await signIn(page);
  const panel = page.getByRole('region', { name: 'What should I do today?' });
  await panel.getByRole('button', { name: 'Add an exercise', exact: true }).click();
  await page.getByLabel('Exercise title', { exact: true }).fill('Review the exchange structure');
  await expect(page.getByLabel('Suggested minutes (optional)', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Save exercise', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const original = (await (await context.request.get('/api/plan')).json()).plan[0];
  expect(original.targetMinutes).toBeUndefined();
  await page.getByRole('button', { name: 'Log practice', exact: true }).click();
  await expect(page.getByLabel(/^Time practiced/)).toHaveValue('');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  let entryWrites = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/entries' && request.method() === 'POST')
      entryWrites += 1;
  });
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(panel.getByRole('checkbox')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Practice', exact: true }).click();
  await openDisclosure(page, 'Session options and logging');
  await expect(page.getByRole('button', { name: 'Start timer', exact: true })).toBeVisible();
  await expect(page.getByText('15:00', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/15 min target/)).toHaveCount(0);
  await expectAccessible(page, 'exercise-no-target-desktop');

  let releaseCompletion!: () => void;
  const heldCompletion = new Promise<void>((resolve) => {
    releaseCompletion = resolve;
  });
  const statusBodies: unknown[] = [];
  const failedCompletion = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/account-operations' &&
      response.request().postDataJSON().change.type === 'task-status' &&
      response.status() === 503,
  );
  await page.route('**/api/account-operations', async (route) => {
    if (route.request().postDataJSON().change.type !== 'task-status') return route.continue();
    statusBodies.push(route.request().postDataJSON());
    await heldCompletion;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Completion temporarily unavailable.' }),
    });
  });
  await page.getByRole('button', { name: 'Complete exercise', exact: true }).click();
  await expect(page.getByLabel(/^Time practiced/)).toHaveValue('0:00');
  await page.getByRole('button', { name: 'Save and complete exercise', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Account sync status', exact: true }),
  ).toContainText('Waiting to sync.');
  await expect(page).toHaveURL(/#overview$/);
  releaseCompletion();
  await failedCompletion;
  await expect(
    page.getByRole('region', { name: 'Account sync status', exact: true }),
  ).toContainText('Upload failed');
  expect((await (await context.request.get('/api/plan')).json()).plan[0].done).toBe(false);
  const zeroTimeEntries = (await (await context.request.get('/api/entries')).json()).entries;
  expect(zeroTimeEntries).toHaveLength(1);
  expect(zeroTimeEntries[0]).toMatchObject({
    minutes: 0,
    metadata: { plannedTaskId: original.id, elapsedSeconds: 0 },
  });
  await page.unroute('**/api/account-operations');
  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname === '/api/account-operations' &&
      request.method() === 'POST' &&
      request.postDataJSON().change.type === 'task-status'
    )
      statusBodies.push(request.postDataJSON());
  });
  await page.getByRole('button', { name: 'Retry account sync', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Account sync status', exact: true })).toHaveCount(
    0,
  );
  expect(statusBodies).toHaveLength(2);
  expect(statusBodies[1]).toEqual(statusBodies[0]);
  expect((await (await context.request.get('/api/plan')).json()).plan[0]).toMatchObject({
    id: original.id,
    done: true,
  });
  expect((await (await context.request.get('/api/entries')).json()).entries).toEqual(
    zeroTimeEntries,
  );
  await page.reload();
  await expect(panel.getByRole('heading', { name: 'Today’s plan is complete.' })).toBeVisible();
  await panel.locator('summary').filter({ hasText: 'Completed in this plan' }).click();
  await panel.getByRole('button', { name: 'Extra review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reopen exercise', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expectAccessible(page, 'exercise-completed-mobile');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await page.getByRole('button', { name: 'Reopen exercise', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Complete exercise', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Today', exact: true }).click();
  await page.reload();
  await expect(panel.getByRole('button', { name: 'Practice', exact: true })).toBeVisible();
  expect((await (await context.request.get('/api/plan')).json()).plan[0]).toMatchObject({
    id: original.id,
    done: false,
  });
  expect((await (await context.request.get('/api/entries')).json()).entries).toEqual(
    zeroTimeEntries,
  );
  expect(entryWrites).toBe(1);
});

test.describe('earlier work dismissal', () => {
  test.use({ hasTouch: true });

  test('earlier work can be dismissed individually or in bulk and restored without changing practice', async ({
    page,
    context,
  }) => {
    await signIn(page);
    const now = new Date('2026-10-08T16:00:00Z');
    await page.clock.setFixedTime(now);
    const settings = (await (await context.request.get('/api/settings')).json()).settings;
    const today = dateInTimezone(now, settings.timezone);
    const fixtures = [
      {
        id: 'earlier-started',
        title: 'Earlier sending practice',
        dueDate: addDays(today, -2),
        done: false,
      },
      {
        id: 'earlier-ready',
        title: 'Earlier listening practice',
        dueDate: addDays(today, -1),
        done: false,
      },
      {
        id: 'earlier-other',
        title: 'Earlier exchange review',
        dueDate: addDays(today, -1),
        done: false,
      },
      { id: 'today-ready', title: 'Today’s planned exchange', dueDate: today, done: false },
      {
        id: 'future-ready',
        title: 'Future exchange practice',
        dueDate: addDays(today, 1),
        done: false,
      },
      {
        id: 'earlier-done',
        title: 'Previously completed practice',
        dueDate: addDays(today, -3),
        done: true,
      },
    ];
    for (const task of fixtures) {
      const response = await accountRequest(context, 'POST', '/api/plan', {
        task: { ...task, kind: 'sending', notes: '', createdAt: new Date().toISOString() },
      });
      expect(response.status()).toBe(201);
    }
    const saved = await scopedRequest(context, 'POST', '/api/entries', {
      date: addDays(today, -2),
      kind: 'sending',
      minutes: 2,
      notes: 'Previously recorded practice stays intact.',
      source: 'manual',
      metadata: { plannedTaskId: 'earlier-started' },
    });
    expect(saved.status()).toBe(201);
    const entries = (await (await context.request.get('/api/entries')).json()).entries;
    const originalPlan = (await (await context.request.get('/api/plan')).json()).plan;
    await page.reload();
    const panel = page.getByRole('region', { name: 'What should I do today?' });
    await panel.locator('summary').filter({ hasText: 'Earlier unfinished work' }).click();
    await expect(
      panel.getByRole('heading', { name: 'Earlier sending practice', exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole('heading', { name: 'Earlier listening practice', exact: true }),
    ).toBeVisible();
    const updates: unknown[] = [];
    page.on('request', (request) => {
      if (
        new URL(request.url()).pathname === '/api/account-operations' &&
        request.method() === 'POST' &&
        request.postDataJSON().change.type === 'task-status'
      )
        updates.push(request.postDataJSON().change);
    });
    const dismiss = panel.getByRole('button', {
      name: 'Dismiss Earlier sending practice',
      exact: true,
    });
    await expect(dismiss).toHaveText('Dismiss');
    await expect(dismiss).toBeEnabled();
    await expect(
      panel
        .getByRole('listitem')
        .filter({
          has: page.getByRole('heading', { name: 'Today’s planned exchange', exact: true }),
        })
        .getByRole('button', { name: /^Dismiss/ }),
    ).toHaveCount(0);
    await expectResponsive(page, 'earlier-dismiss-controls');
    await dismiss.focus();
    await expect(dismiss).toBeFocused();
    const singleDismissed = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/account-operations' &&
        response.request().postDataJSON().change.type === 'task-status' &&
        response.ok(),
    );
    await page.keyboard.press('Enter');
    await singleDismissed;
    await expect(
      panel.getByRole('heading', { name: 'What should I do today?', exact: true }),
    ).toBeFocused();
    await expect(
      panel.getByRole('heading', { name: 'Earlier sending practice', exact: true }),
    ).toHaveCount(0);
    await expect(
      panel.getByRole('heading', { name: 'Earlier listening practice', exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole('heading', { name: 'Earlier exchange review', exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByText(/1 earlier exercise is hidden from Today and still unfinished/),
    ).toBeVisible();
    expect(updates).toEqual([
      { type: 'task-status', ids: ['earlier-started'], dismissedFromToday: true },
    ]);
    expect((await (await context.request.get('/api/plan')).json()).plan).toEqual(
      originalPlan.map((task: { id: string }) =>
        task.id === 'earlier-started' ? { ...task, dismissedFromToday: true } : task,
      ),
    );
    expect((await (await context.request.get('/api/entries')).json()).entries).toEqual(entries);

    await page.reload();
    await panel.locator('summary').filter({ hasText: 'Earlier unfinished work' }).click();
    await expect(
      panel.getByRole('heading', { name: 'Earlier sending practice', exact: true }),
    ).toHaveCount(0);
    await expect(
      panel.getByRole('heading', { name: 'Earlier listening practice', exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      panel.getByRole('button', { name: 'Dismiss Earlier listening practice', exact: true }),
    ).toBeEnabled();
    const bulkDismiss = panel.getByRole('button', { name: 'Dismiss earlier work', exact: true });
    await expect(bulkDismiss).toBeEnabled();
    const bulkDismissed = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/account-operations' &&
        response.request().postDataJSON().change.type === 'task-status' &&
        response.ok(),
    );
    await bulkDismiss.tap();
    await bulkDismissed;
    await expect(
      panel.getByText(/2 earlier exercises are hidden from Today and still unfinished/),
    ).toBeVisible();
    expect(updates).toEqual([
      { type: 'task-status', ids: ['earlier-started'], dismissedFromToday: true },
      { type: 'task-status', ids: ['earlier-ready', 'earlier-other'], dismissedFromToday: true },
    ]);
    const dismissed = (await (await context.request.get('/api/plan')).json()).plan;
    expect(dismissed).toEqual(
      originalPlan.map((task: { id: string }) =>
        ['earlier-started', 'earlier-ready', 'earlier-other'].includes(task.id)
          ? { ...task, dismissedFromToday: true }
          : task,
      ),
    );
    expect((await (await context.request.get('/api/entries')).json()).entries).toEqual(entries);
    await expect(
      panel.getByRole('heading', { name: 'Today’s planned exchange', exact: true, level: 4 }),
    ).toBeVisible();

    await page.reload();
    await expect(
      panel.locator('summary').filter({ hasText: 'Earlier unfinished work' }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Open navigation', exact: true }).tap();
    await page.getByRole('link', { name: 'Academy guide', exact: true }).click();
    const oldRow = page.getByRole('listitem').filter({
      has: page.getByRole('heading', { name: 'Earlier sending practice', exact: true }),
    });
    await expect(oldRow.getByText('Dismissed from Today', { exact: true })).toBeVisible();
    await expect(oldRow.getByRole('checkbox')).not.toBeChecked();
    await expectAccessible(page, 'earlier-restore-mobile');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    await oldRow.getByRole('button', { name: 'Restore to Today', exact: true }).tap();
    await expect(oldRow.getByText('Dismissed from Today', { exact: true })).toHaveCount(0);
    await expect(oldRow.getByRole('checkbox')).not.toBeChecked();
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page.getByRole('link', { name: 'Today', exact: true }).click();
    await page.reload();
    await panel.locator('summary').filter({ hasText: 'Earlier unfinished work' }).click();
    await expect(
      panel.getByRole('heading', { name: 'Earlier sending practice', exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole('heading', { name: 'Earlier listening practice', exact: true }),
    ).toHaveCount(0);
    const restored = (await (await context.request.get('/api/plan')).json()).plan;
    expect(restored).toEqual(
      dismissed.map((task: { id: string }) =>
        task.id === 'earlier-started' ? { ...task, dismissedFromToday: false } : task,
      ),
    );
    expect((await (await context.request.get('/api/entries')).json()).entries).toEqual(entries);
  });
});

test('completion retries a failed measured sending save without discarding time or duplicating credit', async ({
  page,
  context,
}) => {
  await signIn(page);
  const settings = (await (await context.request.get('/api/settings')).json()).settings;
  const task = {
    id: 'sending-completion-retry',
    title: 'Send one familiar exchange',
    kind: 'sending',
    dueDate: dateInTimezone(new Date(), settings.timezone),
    done: false,
    notes: '',
    createdAt: new Date().toISOString(),
  };
  expect((await accountRequest(context, 'POST', '/api/plan', { task })).status()).toBe(201);
  await page.reload();
  await page
    .getByRole('region', { name: 'What should I do today?' })
    .getByRole('button', { name: 'Practice', exact: true })
    .click();
  const now = new Date();
  await page.clock.install({ time: now });
  await page.clock.pauseAt(new Date(now.getTime() + 1000));
  await openDisclosure(page, 'Session options and logging');
  await page.getByRole('button', { name: 'Start timer', exact: true }).click();
  await page.clock.fastForward(4_000);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    document.documentElement.dataset.blockPracticeSave = 'true';
    Storage.prototype.setItem = function (key, value) {
      if (
        key.startsWith('cwa:practice:pending:') &&
        document.documentElement.dataset.blockPracticeSave === 'true'
      )
        throw new DOMException('Test storage unavailable', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  const bodies: unknown[] = [];
  const dialogs: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/entries' && request.method() === 'POST')
      bodies.push(request.postDataJSON());
  });
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await page.route('**/api/entries', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Practice storage temporarily unavailable.' }),
    }),
  );
  await page.getByRole('button', { name: 'Complete exercise', exact: true }).click();
  await expect(page.getByLabel(/^Time practiced/)).toHaveValue('0:04');
  await page.getByRole('button', { name: 'Save and complete exercise', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Practice storage temporarily unavailable.');
  await expect(page.getByLabel(/^Time practiced/)).toHaveValue('0:04');
  expect((await (await context.request.get('/api/entries')).json()).entries).toEqual([]);
  expect((await (await context.request.get('/api/plan')).json()).plan[0].done).toBe(false);
  await page.unroute('**/api/entries');
  await page.evaluate(() => {
    document.documentElement.dataset.blockPracticeSave = 'false';
  });
  await page.getByRole('button', { name: 'Save and complete exercise', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const entries = (await (await context.request.get('/api/entries')).json()).entries;
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    kind: 'sending',
    minutes: 4 / 60,
    metadata: { plannedTaskId: task.id, elapsedSeconds: 4 },
  });
  expect((await (await context.request.get('/api/plan')).json()).plan[0].done).toBe(true);
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
  expect(dialogs).toEqual([]);
  await expect(page).toHaveURL(/#overview$/);
  await page.clock.resume();
});
