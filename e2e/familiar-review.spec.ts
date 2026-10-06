import { expect, type Locator } from '@playwright/test';
import { test } from './fixtures';
import { accountRequest, expectResponsive, signIn } from './helpers';
import { syntheticRecording } from './synthetic-recording';
import { DEFAULT_PROFILE, addDays, type PracticeSession } from '../src/shared/training';
import { savedTaskProgress } from '../src/shared/plan';
import { defaultCopyRecipe } from '../src/shared/copy-practice';
test.use({ hasTouch: true });

test('familiar review rotates native material and saves exact private evidence without required credit', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.128' });
  await page.goto('/#overview');
  await expect(
    page.getByRole('region', { name: 'Optional familiar review', exact: true }),
  ).toHaveCount(0);
  await signIn(page);
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        settings: { ...DEFAULT_PROFILE, timezone: 'UTC' },
      })
    ).ok(),
  ).toBe(true);
  const today = new Date().toISOString().slice(0, 10);
  const base = {
    dueDate: addDays(today, -1),
    done: false,
    dismissedFromToday: true,
    notes: 'Private original directions',
    createdAt: new Date().toISOString(),
  };
  const audioTask = {
    ...base,
    id: 'review-audio',
    title: 'Familiar synthetic recording',
    kind: 'listening',
    exercise: {
      type: 'audio',
      url: 'https://cwa.cwops.org/synthetic/familiar-review.wav',
      minimumPasses: 2,
    },
  };
  const icrTask = {
    ...base,
    id: 'review-icr',
    title: 'Current familiar ICR',
    kind: 'icr',
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
  const runnerTask = {
    ...base,
    id: 'review-runner',
    title: 'Current familiar Runner',
    kind: 'simulator',
    exercise: {
      type: 'morse-runner',
      url: 'https://fritzsche.github.io/WebMorseRunner/',
      settings: {
        mode: 'SingleCall',
        wpm: 23,
        durationSeconds: 60,
        activity: 1,
        conditions: { qrm: false, qrn: false, qsb: false, flutter: false, lids: false },
      },
    },
  };
  const tasks = [
    audioTask,
    icrTask,
    runnerTask,
    {
      ...audioTask,
      id: 'review-audio-duplicate',
      title: 'Same recording on another day',
      dueDate: addDays(today, -2),
    },
    {
      ...icrTask,
      id: 'future-icr',
      title: 'Future ICR recipe',
      dueDate: addDays(today, 1),
      dismissedFromToday: false,
    },
  ];
  for (const task of tasks)
    expect((await accountRequest(context, 'POST', '/api/plan', { task })).status()).toBe(201);
  const originalPlan = (await (await context.request.get('/api/plan')).json()).plan;
  await page.route(audioTask.exercise.url, syntheticRecording(6));
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
  const reviews = page.getByRole('region', { name: 'Optional familiar review', exact: true });
  const titles = () => reviews.getByRole('heading', { level: 4 }).allTextContents();
  await expect(reviews).toBeVisible();
  expect(await titles()).toEqual([audioTask.title, icrTask.title, runnerTask.title]);
  await expect(reviews).not.toContainText('Future ICR recipe');
  await expect(reviews).not.toContainText('Same recording on another day');
  await expectResponsive(page, 'familiar-review-ready');
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.setViewportSize({ width: 390, height: 844 });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await activate(reviews.getByRole('button', { name: `Review ${audioTask.title}`, exact: true }));
  await expect(page.getByRole('heading', { name: 'Lesson practice', exact: true })).toBeVisible();
  await expect(page.locator('#current-practice')).toBeFocused();
  const audio = page.getByLabel('Assigned recording', { exact: true });
  await activate(page.getByRole('button', { name: 'Start practice', exact: true }));
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(1.2);
  await activate(page.getByRole('button', { name: 'Pause practice', exact: true }));
  await activate(page.getByRole('button', { name: 'Save', exact: true }));
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Extra review.');
  await dialog.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished),
    );
  });
  await expectResponsive(page, 'familiar-review-save');
  await activate(dialog.getByRole('button', { name: 'Cancel', exact: true }));
  expect((await (await context.request.get('/api/entries')).json()).entries).toEqual([]);
  let refuse = true;
  const bodies: unknown[] = [];
  await page.route('**/api/entries', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    bodies.push(route.request().postDataJSON());
    if (refuse)
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Synthetic familiar review retry' }),
      });
    return route.continue();
  });
  await page.setViewportSize({ width: 390, height: 844 });
  mobile = true;
  await activate(page.getByRole('button', { name: 'Save', exact: true }));
  await activate(dialog.getByRole('button', { name: 'Save practice', exact: true }));
  await expect(page).toHaveURL(/#overview$/);
  await expect(
    page.getByRole('button', { name: 'Retry practice uploads', exact: true }),
  ).toBeVisible();
  await expect.poll(titles).toEqual([icrTask.title, runnerTask.title, audioTask.title]);

  expect((await (await context.request.get('/api/entries')).json()).entries).toEqual([]);
  refuse = false;
  await activate(page.getByRole('button', { name: 'Retry practice uploads', exact: true }));
  await expect
    .poll(async () => (await (await context.request.get('/api/entries')).json()).entries.length)
    .toBe(1);
  for (const body of bodies) expect(body).toEqual(bodies[0]);
  const recording = (await (await context.request.get('/api/entries')).json()).entries[0];
  expect(recording.metadata).toMatchObject({
    plannedTaskId: audioTask.id,
    practicePurpose: 'review',
    evidence: { type: 'timed', recordings: [{ url: audioTask.exercise.url }] },
  });
  expect(recording.minutes * 60).toBeGreaterThanOrEqual(1.2);
  expect(recording.minutes * 60).toBeLessThan(6);
  await activate(reviews.getByRole('button', { name: `Review ${icrTask.title}`, exact: true }));
  const copyAudio = page.getByLabel('Copy practice audio', { exact: true });
  await activate(page.getByRole('button', { name: 'Start code groups', exact: true }));
  await expect
    .poll(() => copyAudio.evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(1.2);
  page.once('dialog', (dialog) => dialog.accept());
  await activate(page.getByRole('button', { name: 'Finish early', exact: true }));
  await expect
    .poll(async () => (await (await context.request.get('/api/entries')).json()).entries.length)
    .toBe(2);

  const next = page.getByRole('region', { name: 'Your next practice', exact: true });
  await expect(next).toContainText('Optional familiar review');
  await activate(reviews.getByRole('button', { name: `Review ${runnerTask.title}`, exact: true }));
  const frame = page.frameLocator('iframe[title="Web Morse Runner practice simulator"]');
  await expect(frame.getByLabel('CW Speed', { exact: true })).toHaveValue('23');
  await expect(frame.getByLabel('Activity', { exact: true })).toHaveValue('1');
  await expect(frame.getByRole('combobox', { name: 'Mode', exact: true })).toHaveValue('single');
  await activate(frame.getByRole('button', { name: /Run$/ }));
  await expect.poll(() => frame.locator('#clock').textContent()).toMatch(/00:00:0[2-9]/);
  await activate(page.getByRole('button', { name: 'Stop run', exact: true }));
  await activate(page.getByRole('button', { name: 'Review & save run', exact: true }));
  await expect(dialog).toContainText('Extra review.');
  await activate(dialog.getByRole('button', { name: 'Save practice', exact: true }));
  await expect
    .poll(async () => (await (await context.request.get('/api/entries')).json()).entries.length)
    .toBe(3);
  const entries: PracticeSession[] = (await (await context.request.get('/api/entries')).json())
    .entries;
  for (const task of [audioTask, icrTask, runnerTask]) {
    const saved = entries.find((entry) => entry.metadata?.plannedTaskId === task.id)!;
    expect(saved.metadata?.practicePurpose).toBe('review');
    expect(saved.minutes).toBeGreaterThan(0);
    expect(savedTaskProgress(originalPlan, entries, today).get(task.id)?.loggedMinutes).toBe(0);
  }
  expect(
    entries.find((entry) => entry.metadata?.plannedTaskId === runnerTask.id)?.metadata?.evidence,
  ).toMatchObject({ type: 'runner', run: { settings: runnerTask.exercise.settings } });
  expect(
    entries.find((entry) => entry.metadata?.plannedTaskId === icrTask.id)?.metadata?.copyAttempt,
  ).toMatchObject({
    recipe: {
      mode: 'groups',
      groupKind: 'custom',
      customCharacters: 'E',
      groupLength: 1,
      effectiveWpm: 25,
      durationSeconds: 10,
      startDelaySeconds: 0,
    },
  });
  expect((await (await context.request.get('/api/plan')).json()).plan).toEqual(originalPlan);

  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await activate(menu);
  await activate(page.getByRole('link', { name: 'Practice log', exact: true }));
  await expect(page.getByText('Extra review', { exact: true })).toHaveCount(3);
  await expectResponsive(page, 'familiar-review-history');
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.setViewportSize({ width: 390, height: 844 });
});
