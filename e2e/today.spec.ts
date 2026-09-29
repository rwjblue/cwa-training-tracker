import { test, expect } from '@playwright/test';
import { addDays, dateInTimezone } from '../src/shared/training';
import { expectAccessible, signIn } from './helpers';

test('Today brings personal assignments forward and keeps logging separate from completion', async ({
  page,
  context,
}) => {
  await signIn(page);
  const settings = (await (await context.request.get('/api/settings')).json()).settings;
  const today = dateInTimezone(new Date(), settings.timezone);
  const panel = page.getByRole('region', { name: 'What should I do today?' });
  await expect(panel.getByRole('heading', { name: 'Set up your course.' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Restore backup', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Set course dates', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Add an exercise', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Add a practice exercise' })).toBeVisible();
  await expect(page.getByLabel('Practice date (optional)', { exact: true })).toHaveValue(today);
  await page.getByLabel('Exercise title', { exact: true }).fill('Today’s sending warm-up');
  await page.getByRole('combobox', { name: 'Activity', exact: true }).selectOption('sending');
  await page.getByLabel('Suggested minutes', { exact: true }).fill('12');
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

  const future = await context.request.post('/api/plan', {
    headers: { Origin: 'http://localhost:8791' },
    data: {
      task: {
        ...firstTask,
        id: 'tomorrow-exercise',
        title: 'Tomorrow’s listening exercise',
        dueDate: addDays(today, 1),
        done: false,
      },
    },
  });
  expect(future.ok()).toBe(true);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(
    panel.getByRole('heading', { name: 'Today’s sending warm-up', exact: true }),
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
  await page.screenshot({ path: '.tmp/today-desktop.png', fullPage: true });

  await panel.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(page).toHaveURL(/#practice$/);
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important}',
  });
  const now = new Date();
  await page.clock.install({ time: now });
  await page.clock.pauseAt(new Date(now.getTime() + 1000));
  await page.getByRole('button', { name: 'Start timer', exact: true }).click();
  await page.clock.fastForward(420_000);
  await page.getByRole('button', { name: 'Pause timer', exact: true }).click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page).toHaveURL(/#practice$/);
  await page.getByRole('button', { name: 'Review & save 07:00', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Activity', exact: true })).toHaveValue(
    'sending',
  );
  expect(Number(await page.getByLabel(/^Time practiced/).inputValue())).toBe(7);
  await page.getByRole('button', { name: 'Save practice', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.clock.resume();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
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

  await panel
    .getByRole('checkbox', { name: 'Mark Today’s sending warm-up complete', exact: true })
    .click();
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
  expect(afterCompletion).toEqual(entries);

  await page.setViewportSize({ width: 390, height: 844 });
  await panel.locator('summary').filter({ hasText: 'Completed in this plan' }).click();
  await expect(
    panel.getByRole('heading', { name: 'Today’s sending warm-up', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expectAccessible(page, 'today-mobile');
  await page.screenshot({ path: '.tmp/today-mobile.png', fullPage: true });
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

  const plan = (await (await context.request.get('/api/plan')).json()).plan;
  const assigned = plan.find(
    (task: { dueDate?: string; exercise?: { type: string; url?: string } }) =>
      task.dueDate === '2026-10-06' &&
      task.exercise?.type === 'audio' &&
      /WD101[-_]10/i.test(task.exercise.url ?? ''),
  );
  expect(assigned).toBeTruthy();
  await page.screenshot({ path: '.tmp/curriculum-today-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: '.tmp/curriculum-today-mobile.png', fullPage: true });
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
  await row.getByRole('button', { name: 'Listen & practice', exact: true }).click();
  const audio = page.getByLabel('Assigned recording', { exact: true });
  await expect(audio).toHaveAttribute('src', assigned.exercise.url);
  await page.screenshot({ path: '.tmp/assigned-recording-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectAccessible(page, 'assigned-recording-mobile');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: '.tmp/assigned-recording-mobile.png', fullPage: true });
  await page
    .getByRole('textbox', { name: 'Scratchpad', exact: true })
    .fill('Copied ALICE in OH. Revisit the final sentence.');
  // Native controls are enough to begin timing; no separate Start practice click.
  await audio.evaluate((element: HTMLAudioElement) => element.play());
  await expect(page.getByRole('button', { name: 'Pause practice', exact: true })).toBeVisible();
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(1.2);
  await audio.evaluate((element: HTMLAudioElement) => element.pause());
  await expect(page.getByRole('button', { name: 'Resume practice', exact: true })).toBeVisible();
  const listened = await audio.evaluate((element: HTMLAudioElement) => element.currentTime);
  await page.clock.install({ time: new Date('2026-10-06T16:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-06T16:00:01Z'));
  await page.clock.fastForward(65_000);
  await page.getByRole('button', { name: 'Start recall timer', exact: true }).click();
  await page.clock.fastForward(20_000);
  await page.getByRole('button', { name: 'Review & save', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('textbox', { name: 'Scratchpad', exact: true })).toHaveValue(
    'Copied ALICE in OH. Revisit the final sentence.',
  );
  await dialog
    .getByRole('textbox', { name: 'Scratchpad', exact: true })
    .fill('Copied ALICE in OH. Replayed the final sentence.');
  await page.getByRole('button', { name: 'Save practice', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review & save', exact: true })).toBeDisabled();
  await expect(page.getByRole('textbox', { name: 'Scratchpad', exact: true })).toHaveValue('');
  const entries = (await (await context.request.get('/api/entries')).json()).entries;
  expect(entries).toHaveLength(1);
  expect(entries[0].metadata.plannedTaskId).toBe(assigned.id);
  expect(entries[0].metadata.scratchpad).toBe('Copied ALICE in OH. Replayed the final sentence.');
  expect(entries[0].metadata.recallSeconds).toBe(20);
  expect(entries[0].metadata.elapsedSeconds).toBeGreaterThanOrEqual(20 + Math.floor(listened) - 1);
  expect(entries[0].metadata.elapsedSeconds).toBeLessThanOrEqual(20 + Math.ceil(listened));
  expect(entries[0].minutes).toBe(entries[0].metadata.elapsedSeconds / 60);
  expect(entries[0].metadata.recordings[0].url).toBe(assigned.exercise.url);

  const nativeRecording = await audio.elementHandle();
  await audio.evaluate((element: HTMLAudioElement) => element.play());
  await expect(page.getByRole('button', { name: 'Pause practice', exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Back to Today', exact: true }).click();
  expect(await nativeRecording!.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  await expect(page).toHaveURL(/#overview$/);
  await expect(row.getByText('Started', { exact: true })).toBeVisible();
  await row.getByRole('checkbox', { name: `Mark ${assigned.title} complete`, exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect(panel.getByText('1/4 done', { exact: true })).toBeVisible();
  await page.reload();
  const after = (await (await context.request.get('/api/plan')).json()).plan;
  expect(after.find((task: { id: string }) => task.id === assigned.id).done).toBe(true);
  expect(after).toHaveLength(plan.length);
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(1);
  await page.clock.resume();
});
