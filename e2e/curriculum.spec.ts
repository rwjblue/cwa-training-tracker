import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import type { PlannedTask } from '../src/shared/plan';
import type { CourseLevel, PracticeSession, TrainingExport } from '../src/shared/training';
import { expectAccessible, signIn } from './helpers';

const courses = {
  beginner: {
    label: 'Beginner',
    id: 'cwa-beginner-v4.8',
    syllabus: 'https://cwa.cwops.org/wp-content/uploads/Beginner-curriculum-ver-4.8.htm',
  },
  fundamental: {
    label: 'Fundamental',
    id: 'cwa-fundamental-v2.0',
    syllabus:
      'https://cwops.org/wp-content/uploads/2025/04/CW-Academy-Fundamental-Curriculum-v2.0.htm',
  },
  intermediate: {
    label: 'Intermediate',
    id: 'cwa-intermediate-v2.3',
    syllabus:
      'https://cwa.cwops.org/wp-content/uploads/Practice-Instructions-Intermediate-ver.2.3.htm',
  },
  advanced: {
    label: 'Advanced',
    id: 'cwa-advanced-v2.1',
    syllabus:
      'https://cwops.org/wp-content/uploads/2025/05/CW-Academy-Advanced-Curriculum-v2.1.htm',
  },
} satisfies Record<CourseLevel, { label: string; id: string; syllabus: string }>;

async function readPlan(request: APIRequestContext): Promise<PlannedTask[]> {
  return (await (await request.get('/api/plan')).json()).plan;
}

async function readEntries(request: APIRequestContext): Promise<PracticeSession[]> {
  return (await (await request.get('/api/entries')).json()).entries;
}

function taskRow(page: Page, plan: Locator, task: PlannedTask) {
  return plan
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: task.title, exact: true }) })
    .filter({ hasText: `Session ${task.lesson} · Day ${task.curriculum!.day} ·` });
}

async function chooseCourse(page: Page, level: CourseLevel, firstClassDate = '2026-10-08') {
  await page.getByRole('button', { name: 'Academy guide', exact: true }).click();
  await page.getByRole('button', { name: 'Course settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Your course level', exact: true }).selectOption(level);
  await page.getByRole('combobox', { name: 'Practice timezone', exact: true }).selectOption('UTC');
  await page.getByLabel(/^First class date/).fill(firstClassDate);
  const weekdays = page.getByRole('group', { name: 'Class meeting days', exact: true });
  for (const day of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
    await weekdays
      .getByRole('checkbox', { name: day, exact: true })
      .setChecked(day === 'Mon' || day === 'Thu');
  }
  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/settings' && response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  const response = await saved;
  expect(response.ok()).toBe(true);
  expect((await response.json()).settings).toMatchObject({
    level,
    firstClassDate,
    timezone: 'UTC',
    classDays: [1, 4],
  });
  await expect(page.getByRole('button', { name: 'Save preferences', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Academy guide', exact: true }).click();
  const plan = page.getByRole('region', {
    name: `Your ${courses[level].label} course plan.`,
    exact: true,
  });
  await expect(plan).toBeVisible();
  await plan.getByRole('button', { name: 'Whole course', exact: true }).click();
  await expect(plan.getByRole('listitem').first()).toBeVisible();
  return plan;
}

function syntheticRecording() {
  // Four seconds of silence exercises native playback without copying course audio.
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
  return recording;
}

test('all course plans launch their tools and retain progress across levels and changed dates', async ({
  page,
  context,
}) => {
  await signIn(page);
  await page.clock.setFixedTime(new Date('2026-10-06T16:00:00Z'));
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important}',
  });

  for (const level of ['intermediate', 'beginner'] as const) {
    await chooseCourse(page, level);
    const plan = await readPlan(context.request);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.every((task) => task.curriculum?.id === courses[level].id)).toBe(true);
    expect(plan.some((task) => task.lesson === 16)).toBe(true);
  }
  const beginner = (await readPlan(context.request)).find(
    (task) => task.curriculum?.exerciseId === 's1-d1-t1',
  )!;
  expect(beginner.exercise).toMatchObject({
    type: 'external',
    url: 'https://morsecode.world/international/trainer/trainer.html',
  });
  expect(beginner.dueDate).toBe('2026-10-06');
  const beginnerPlan = page.getByRole('region', {
    name: 'Your Beginner course plan.',
    exact: true,
  });
  await taskRow(page, beginnerPlan, beginner)
    .getByRole('button', { name: 'Practice', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Your assigned practice.', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Official instructions', exact: true }),
  ).toHaveAttribute('href', beginner.curriculum!.sourceUrl);
  if (beginner.exercise?.type !== 'external')
    throw new Error('Expected a linked Beginner exercise');
  await context.route(beginner.exercise.url, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>Synthetic exercise tool</title>' }),
  );
  await page.clock.install({ time: new Date('2026-10-06T16:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-06T16:00:01Z'));
  const opened = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Start practice', exact: true }).click();
  const tool = await opened;
  await expect(tool).toHaveURL(beginner.exercise.url);
  await tool.close();
  await page.clock.fastForward(65_000);
  await page.getByRole('button', { name: 'Complete exercise', exact: true }).click();
  await expect(page.getByText('Exercise completed', { exact: true })).toBeVisible();
  const beginnerEntries = await readEntries(context.request);
  expect(beginnerEntries).toHaveLength(1);
  expect(beginnerEntries[0]).toMatchObject({
    kind: 'listening',
    minutes: 65 / 60,
    metadata: { plannedTaskId: beginner.id, elapsedSeconds: 65 },
  });
  await page.clock.resume();
  await page.getByRole('button', { name: 'Back to Today', exact: true }).click();

  const fundamentalPlan = await chooseCourse(page, 'fundamental');
  const fundamentalTasks = await readPlan(context.request);
  expect(fundamentalTasks.every((task) => task.curriculum?.id === courses.fundamental.id)).toBe(
    true,
  );
  expect(fundamentalTasks.every((task) => !task.done)).toBe(true);
  const fundamental = fundamentalTasks.find((task) => task.curriculum?.exerciseId === 's3-d3-t4')!;
  await taskRow(page, fundamentalPlan, fundamental)
    .getByRole('button', { name: 'Practice', exact: true })
    .click();
  const startCopy = page.getByRole('button', { name: 'Start code groups', exact: true });
  const confirmation = page.getByRole('checkbox', {
    name: 'I have selected the characters I want to strengthen for this assignment.',
    exact: true,
  });
  await expect(startCopy).toBeEnabled();
  await expect(confirmation).toHaveCount(0);
  const options = page.getByRole('combobox', { name: 'Assignment option', exact: true });
  const customOption = await options
    .getByRole('option', { name: /· custom ·/ })
    .getAttribute('value');
  expect(customOption).toBeTruthy();
  await options.selectOption(customOption!);
  await expect(confirmation).toBeVisible();
  await expect(startCopy).toBeDisabled();
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Character E', exact: true }).check();
  await confirmation.check();
  await expect(startCopy).toBeEnabled();
  // Completion is a learner action and does not require inventing a copy result.
  await page.getByRole('button', { name: 'Complete exercise', exact: true }).click();
  await expect(page.getByText('Exercise completed', { exact: true })).toBeVisible();
  expect(await readEntries(context.request)).toEqual(beginnerEntries);
  await page.getByRole('button', { name: 'Back to Today', exact: true }).click();

  const advancedPlan = await chooseCourse(page, 'advanced');
  const advancedTasks = await readPlan(context.request);
  expect(advancedTasks.every((task) => task.curriculum?.id === courses.advanced.id)).toBe(true);
  expect(advancedTasks.every((task) => !task.done)).toBe(true);
  const advanced = advancedTasks.find((task) => task.curriculum?.exerciseId === 's1-d1-t2')!;
  if (advanced.exercise?.type !== 'audio' || !advanced.exercise.url)
    throw new Error('Expected an Advanced recording');
  await page.route(advanced.exercise.url, (route) =>
    route.fulfill({ status: 200, contentType: 'audio/wav', body: syntheticRecording() }),
  );
  await taskRow(page, advancedPlan, advanced)
    .getByRole('button', { name: 'Listen & practice', exact: true })
    .click();
  const audio = page.getByLabel('Assigned recording', { exact: true });
  await expect(audio).toHaveAttribute('src', advanced.exercise.url);
  await page.locator('summary').filter({ hasText: 'Exercise instructions' }).click();
  await expect(page.getByText(/20 WPM · at least 2 full plays/)).toBeVisible();
  await audio.evaluate((element: HTMLAudioElement) => element.play());
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(1.2);
  await page.getByRole('button', { name: 'Complete exercise', exact: true }).click();
  await expect(page.getByText('Exercise completed', { exact: true })).toBeVisible();
  expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  const entries = await readEntries(context.request);
  expect(entries).toHaveLength(2);
  const recorded = entries.find((entry) => entry.metadata?.plannedTaskId === advanced.id)!;
  expect(recorded).toMatchObject({
    kind: 'head-copy',
    metadata: {
      plannedTaskId: advanced.id,
      recordings: [{ url: advanced.exercise.url, speedWpm: 20 }],
    },
  });
  expect(recorded.metadata!.elapsedSeconds).toBeGreaterThanOrEqual(1);
  expect(recorded.metadata!.elapsedSeconds).toBeLessThanOrEqual(4);
  await page.getByRole('button', { name: 'Back to Today', exact: true }).click();

  let restoredPlan = await chooseCourse(page, 'beginner');
  await restoredPlan.getByRole('checkbox', { name: 'Show completed', exact: true }).check();
  await expect(taskRow(page, restoredPlan, beginner).getByRole('checkbox')).toBeChecked();
  expect((await readPlan(context.request)).find((task) => task.id === beginner.id)).toMatchObject({
    done: true,
    dueDate: '2026-10-06',
  });
  restoredPlan = await chooseCourse(page, 'beginner', '2026-10-15');
  await restoredPlan.getByRole('checkbox', { name: 'Show completed', exact: true }).check();
  await expect(taskRow(page, restoredPlan, beginner).getByRole('checkbox')).toBeChecked();
  await page.reload();
  await expect(restoredPlan).toBeVisible();
  await restoredPlan.getByRole('button', { name: 'Whole course', exact: true }).click();
  await restoredPlan.getByRole('checkbox', { name: 'Show completed', exact: true }).check();
  await expect(taskRow(page, restoredPlan, beginner).getByRole('checkbox')).toBeChecked();
  expect((await readPlan(context.request)).find((task) => task.id === beginner.id)).toMatchObject({
    done: true,
    dueDate: '2026-10-13',
  });
  expect(await readEntries(context.request)).toEqual(entries);
  const backup = (await (await context.request.get('/api/export')).json()) as TrainingExport;
  for (const task of [beginner, fundamental, advanced]) {
    expect(backup.plan!.find((saved) => saved.id === task.id)).toMatchObject({
      done: true,
      curriculum: { id: task.curriculum!.id, exerciseId: task.curriculum!.exerciseId },
    });
  }
});

test('published course overviews are available without an account at desktop and mobile widths', async ({
  page,
}) => {
  await page.goto('/#course');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  const levels = page.getByRole('group', { name: 'Explore academy levels', exact: true });
  for (const [size, viewport] of [
    ['desktop', { width: 1280, height: 900 }],
    ['mobile', { width: 390, height: 844 }],
  ] as const) {
    await page.setViewportSize(viewport);
    for (const level of ['beginner', 'fundamental', 'intermediate', 'advanced'] as const) {
      const course = courses[level];
      const selection = levels.getByRole('button').filter({
        has: page.getByRole('heading', { name: course.label, exact: true }),
      });
      await selection.click();
      await expect(selection).toHaveAttribute('aria-pressed', 'true');
      const overview = page.getByRole('region', {
        name: `${course.label} curriculum`,
        exact: true,
      });
      await expect(overview).toBeVisible();
      await expect(
        overview.getByText(/16 sessions over eight weeks · \d+ scheduled exercises/),
      ).toBeVisible();
      await expect(
        overview.getByRole('link', { name: `Official ${course.label} syllabus`, exact: true }),
      ).toHaveAttribute('href', course.syllabus);
      await expect(overview.getByText('Starting point', { exact: true })).toBeVisible();
      await expect(overview.getByText('Course goals', { exact: true })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await overview.screenshot({ path: `.tmp/curriculum-${level}-${size}.png` });
    }
    await expectAccessible(page, `curriculum-overviews-${size}`);
  }
});
