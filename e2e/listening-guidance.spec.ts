import { expect, test, type Locator } from '@playwright/test';
import { accountRequest, expectAccessible, signIn } from './helpers';
import { syntheticRecording } from './synthetic-recording';
import type { PlannedTask } from '../src/shared/plan';

test.use({ hasTouch: true, actionTimeout: 10_000 });
for (const width of [1440, 390]) {
  test(`assigned guidance supplements instructions and preserves optional notes at ${width}px`, async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await context.setExtraHTTPHeaders({
      'CF-Connecting-IP': width < 600 ? '192.0.2.126' : '192.0.2.125',
    });
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await page.route(/^https:\/\/(?:[^/]+\.)?cwops\.org\//, syntheticRecording(30));
    const activate = async (control: Locator) => {
      if (width < 600) await control.tap();
      else {
        await control.focus();
        await page.keyboard.press('Space');
      }
    };
    const navigate = async (name: string) => {
      const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
      if (await menu.isVisible()) await activate(menu);
      await activate(page.getByRole('button', { name, exact: true }));
    };
    await signIn(page);
    for (const [level, exerciseId, title, prompt] of [
      [
        'intermediate',
        's1-d1-t3',
        'Phrase meaning',
        'Optional: meanings, phrase fragments, or ideas you retained.',
      ],
      [
        'fundamental',
        's11-d1-t6',
        'Story meaning and fragments',
        'Optional: story ideas, familiar words, or fragments you caught.',
      ],
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
      const guidance = page.getByRole('note', { name: 'Listening approach', exact: true });
      await expect(guidance).toContainText(title);
      await expect(guidance).toContainText(/meaning.*fragment/);
      await expect(guidance).toContainText(
        'Follow the original instructions and your advisor’s requirements.',
      );
      await expect(
        page.getByRole('link', { name: 'Official instructions', exact: true }),
      ).toHaveAttribute('href', task.curriculum!.sourceUrl);
      await activate(page.getByText('Exercise instructions', { exact: true }));
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
      expect((await guidance.boundingBox())!.height).toBeLessThan(width < 600 ? 190 : 130);
      const after = await (await context.request.get('/api/export')).json();
      expect(after.sessions).toEqual(before.sessions);
      expect(after.plan).toEqual(before.plan);
      const displayedPlan = await (await context.request.get('/api/plan')).json();
      expect(displayedPlan.plan.find((item: PlannedTask) => item.id === task.id).done).toBe(false);
      const notes = `Synthetic ${level} recalled fragment, optional private notes.`;
      await scratchpad.fill(notes);
      await activate(page.getByRole('button', { name: 'Start practice', exact: true }));
      await expect
        .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime))
        .toBeGreaterThan(1.1);
      await activate(page.getByRole('button', { name: 'Inspect Today', exact: true }));
      await activate(
        page
          .getByRole('region', { name: 'Current practice block', exact: true })
          .getByRole('button', { name: 'Return to practice', exact: true }),
      );
      await expect(scratchpad).toHaveValue(notes);
      await expect(guidance).toContainText(title);
      expect(await audio.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
      await expectAccessible(page, `listening-guidance-${width}-${level}`);
      await guidance.screenshot({ path: `.tmp/listening-guidance-${width}-${level}.png` });
      await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
      await page.keyboard.press('Escape');
      await expect(scratchpad).toHaveValue(notes);
      await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
      const dialog = page.getByRole('dialog');
      const bodies: unknown[] = [];
      if (level === 'intermediate') {
        await page.route('**/api/entries', async (route) => {
          if (route.request().method() !== 'POST') return route.continue();
          bodies.push(route.request().postDataJSON());
          return route.fulfill({
            status: 503,
            json: { error: 'Synthetic guidance save unavailable.' },
          });
        });
        await page.evaluate(() => {
          const original = Storage.prototype.setItem;
          Reflect.set(window, 'restoreGuidanceStorage', () => {
            Storage.prototype.setItem = original;
          });
          Storage.prototype.setItem = function (key, value) {
            if (key.startsWith('cwa:practice:pending:v1:'))
              throw new DOMException('Synthetic storage full', 'QuotaExceededError');
            return original.call(this, key, value);
          };
        });
        await activate(dialog.getByRole('button', { name: 'Save practice', exact: true }));
        await expect(dialog.getByRole('alert')).toContainText('retained for an exact retry');
        await page.unroute('**/api/entries');
        await page.evaluate(() =>
          (window as unknown as { restoreGuidanceStorage: () => void }).restoreGuidanceStorage(),
        );
      }
      const receipt = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/entries') &&
          response.request().method() === 'POST' &&
          [200, 201].includes(response.status()),
      );
      await activate(dialog.getByRole('button', { name: 'Save practice', exact: true }));
      const savedResponse = await receipt;
      if (bodies.length) expect(savedResponse.request().postDataJSON()).toEqual(bodies[0]);
      await expect(dialog).toHaveCount(0);
      const data = await (await context.request.get('/api/export')).json();
      const entry = data.sessions.find(
        (item: { metadata?: { plannedTaskId?: string } }) =>
          item.metadata?.plannedTaskId === task.id,
      );
      expect(entry.metadata.scratchpad).toBe(notes);
      expect(entry.metadata.evidence.recordings[0].seconds).toBeGreaterThan(1);
      expect(entry.metadata.evidence.recordings[0].passes.durations[0].completedPasses).toBe(0);
      expect(entry.metadata).not.toHaveProperty('guidance');
      const savedPlan = await (await context.request.get('/api/plan')).json();
      expect(savedPlan.plan.find((item: PlannedTask) => item.id === task.id).done).toBe(false);
      await navigate('Practice log');
      await expect(page.getByRole('main')).toContainText(notes);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  });
}
