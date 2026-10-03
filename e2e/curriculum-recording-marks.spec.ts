import { expect, type Locator } from '@playwright/test';
import { test } from './fixtures';
import { accountRequest, expectResponsive, signIn } from './helpers';
import { syntheticRecording } from './synthetic-recording';
import type { PlannedTask } from '../src/shared/plan';

test.use({ hasTouch: true, actionTimeout: 10_000 });
const width = 390;

test(`published curriculum files outside variant groups retain private marks at ${width}px`, async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await context.setExtraHTTPHeaders({
    'CF-Connecting-IP': '192.0.2.124',
  });
  await page.setViewportSize({ width, height: 844 });
  await page.route(/^https:\/\/(?:[^/]+\.)?cwops\.org\//, syntheticRecording(4));
  const activate = async (control: Locator) => {
    await control.tap();
  };
  const navigate = async (name: string) => {
    const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (await menu.isVisible()) await activate(menu);
    await activate(page.getByRole('button', { name, exact: true }));
  };
  await signIn(page);
  let currentLevel = '';
  for (const [level, exerciseId, wpm] of [
    ['fundamental', 's3-d1-t6', 7],
    ['fundamental', 's11-d1-t6', 9],
    ['fundamental', 's12-d1-t6', 9],
    ['advanced', 's13-d1-t2', 30],
  ] as const) {
    if (currentLevel !== level) {
      const { settings } = await (await context.request.get('/api/settings')).json();
      expect(
        (
          await accountRequest(context, 'PUT', '/api/settings', {
            settings: { ...settings, level, firstClassDate: '2026-10-08', timezone: 'UTC' },
          })
        ).ok(),
      ).toBe(true);
      await page.reload();
      currentLevel = level;
    }
    const { plan } = await (await context.request.get('/api/plan')).json();
    const task = (plan as PlannedTask[]).find(
      (item) => item.curriculum?.exerciseId === exerciseId,
    )!;
    expect(task.exercise?.type).toBe('audio');
    const url = (task.exercise as { url: string }).url;
    const open = async () => {
      await navigate('Academy guide');
      await activate(page.getByRole('button', { name: 'Whole course', exact: true }));
      const region = page.getByRole('region', {
        name: `Your ${level === 'fundamental' ? 'Fundamental' : 'Advanced'} course plan.`,
        exact: true,
      });
      await activate(
        region
          .getByRole('listitem')
          .filter({ has: page.getByRole('heading', { name: task.title, exact: true }) })
          .filter({ hasText: `Session ${task.lesson} · Day ${task.curriculum!.day} ·` })
          .getByRole('button', { name: 'Listen & practice', exact: true }),
      );
    };
    await open();
    const audio = page.getByLabel('Assigned recording', { exact: true });
    await expect(audio).toHaveAttribute('src', url);
    await expect(audio).toHaveAttribute('data-speed', String(wpm));
    const region = page.getByRole('region', { name: 'Recording review', exact: true });
    const label = `Synthetic ${level} ${wpm} WPM mark`;
    const mark = region.getByRole('button', { name: 'Mark difficult here', exact: true });
    await expect(mark).toBeEnabled();
    await region
      .getByRole('textbox', { name: 'Difficult mark label (optional)', exact: true })
      .fill(label);
    await activate(mark);
    await expect(region).toContainText('Difficult marks saved to your account.');
    await expect(
      region.getByRole('button', {
        name: `Replay difficult mark at 0:00 — ${label}`,
        exact: true,
      }),
    ).toBeEnabled();
    expect(await audio.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
    await expectResponsive(page, `published-file-marks-${width}-${wpm}`);

    await activate(
      region.getByRole('button', {
        name: `Replay difficult mark at 0:00 — ${label}`,
        exact: true,
      }),
    );
    await expect
      .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime), { timeout: 6000 })
      .toBeGreaterThan(1.1);
    await activate(page.getByRole('button', { name: 'Pause practice', exact: true }));
    await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(label);
    const receipt = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/entries') &&
        response.request().method() === 'POST' &&
        [200, 201].includes(response.status()),
    );
    await activate(dialog.getByRole('button', { name: 'Save practice', exact: true }));
    await receipt;
    await expect(dialog).toHaveCount(0);
    const data = await (await context.request.get('/api/export')).json();
    const entry = data.sessions.find(
      (value: { metadata?: { plannedTaskId?: string } }) =>
        value.metadata?.plannedTaskId === task.id,
    );
    const recording = entry.metadata.evidence.recordings[0];
    expect(recording).toMatchObject({
      url,
      speedWpm: wpm,
      marks: { taskId: task.id, url, speedWpm: wpm, marks: [{ label, positionSeconds: 0 }] },
    });
    expect(recording.seconds).toBeGreaterThan(1);
    expect(recording.seconds).toBeLessThan(4);
    expect(recording.passes.durations[0].completedPasses).toBe(0);
    expect(recording).not.toHaveProperty('characterWpm');
    expect(recording).not.toHaveProperty('effectiveWpm');
    await open();
    await expect(
      region.getByRole('button', {
        name: `Replay difficult mark at 0:00 — ${label}`,
        exact: true,
      }),
    ).toBeEnabled();
    await activate(page.getByRole('button', { name: 'Finish practice', exact: true }));
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
