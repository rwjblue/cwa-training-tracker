import { expect, type Locator } from '@playwright/test';
import { test } from './fixtures';
import { accountRequest, expectResponsive, openDisclosure, signIn } from './helpers';
import { syntheticRecording } from './synthetic-recording';
import type { PlannedTask } from '../src/shared/plan';

test.use({ hasTouch: true, actionTimeout: 10_000 });
const width = 390;
test(`assigned instructions remain directly available with optional scratchpad prompts`, async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({
    'CF-Connecting-IP': '192.0.2.126',
  });
  await page.setViewportSize({ width, height: 844 });
  await page.route(/^https:\/\/(?:[^/]+\.)?cwops\.org\//, syntheticRecording(30));
  const activate = async (control: Locator) => {
    await expect(control).toBeEnabled();
    await control.tap();
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
  await signIn(page);
  for (const [level, exerciseId, prompt] of [
    ['intermediate', 's1-d1-t3', 'Optional: meanings, phrase fragments, or ideas you retained.'],
    ['fundamental', 's11-d1-t6', 'Optional: story ideas, familiar words, or fragments you caught.'],
  ] as const) {
    const { settings } = await (await context.request.get('/api/settings')).json();
    expect(
      (
        await accountRequest(context, 'PUT', '/api/settings', {
          settings: { ...settings, level, firstClassDate: '2026-10-08', timezone: 'UTC' },
        })
      ).ok(),
    ).toBe(true);
    await page.reload();
    const { plan } = await (await context.request.get('/api/plan')).json();
    const task = (plan as PlannedTask[]).find(
      (item) => item.curriculum?.exerciseId === exerciseId,
    )!;
    expect(task.exercise?.type).toBe('audio');
    const before = await (await context.request.get('/api/export')).json();
    await navigate('Academy guide');
    await activate(page.getByRole('button', { name: 'Whole course', exact: true }));
    await activate(
      page
        .getByRole('region', {
          name: `Your ${level === 'fundamental' ? 'Fundamental' : 'Intermediate'} course plan.`,
          exact: true,
        })
        .getByRole('listitem')
        .filter({ has: page.getByRole('heading', { name: task.title, exact: true }) })
        .filter({ hasText: `Session ${task.lesson} · Day ${task.curriculum!.day} ·` })
        .getByRole('button', { name: 'Listen & practice', exact: true }),
    );
    await expect(page.getByText('Exercise details', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('note', { name: 'Listening approach', exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('link', { name: 'Official instructions', exact: true }),
    ).toHaveAttribute('href', task.curriculum!.sourceUrl);
    await openDisclosure(page, 'Exercise instructions');
    await expect(page.getByText(task.notes, { exact: true })).toBeVisible();
    const audio = page.getByLabel('Assigned recording', { exact: true });
    await expect(audio).toHaveAttribute('src', (task.exercise as { url: string }).url);
    if (task.exercise?.type === 'audio' && task.exercise.minimumPasses)
      await expect(
        page.getByText(new RegExp(`${task.exercise.minimumPasses} listening passes assigned\\.`)),
      ).toBeVisible();
    const scratchpad = page.getByRole('textbox', { name: 'Scratchpad', exact: true });
    await expect(scratchpad).toHaveAttribute('placeholder', prompt);
    expect(await scratchpad.evaluate((el: HTMLTextAreaElement) => el.required)).toBe(false);
    await expect(page.getByText(prompt, { exact: true })).toBeVisible();
    const after = await (await context.request.get('/api/export')).json();
    expect(after.sessions).toEqual(before.sessions);
    expect(after.plan).toEqual(before.plan);
    const displayedPlan = await (await context.request.get('/api/plan')).json();
    expect(displayedPlan.plan.find((item: PlannedTask) => item.id === task.id).done).toBe(false);
    await expectResponsive(page, `listening-guidance-${level}`);
  }
});
