import { expect, test, type Locator } from '@playwright/test';
import { accountRequest, expectAccessible, scopedRequest, signIn } from './helpers';

test.use({ hasTouch: true, extraHTTPHeaders: { 'CF-Connecting-IP': '192.0.2.106' } });

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`assigned recording inspection retains one paused owner at ${viewport.width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize(viewport);
    const activate = async (control: Locator) => {
      if (viewport.width < 600) await control.tap();
      else {
        await control.focus();
        await page.keyboard.press('Enter');
      }
    };
    await signIn(page);
    await page.clock.setSystemTime(new Date('2026-10-06T16:00:00Z'));
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
    await page
      .getByRole('textbox', { name: 'Scratchpad', exact: true })
      .fill('Retain this exact block and recording.');
    await activate(page.getByRole('button', { name: 'Start practice', exact: true }));
    await expect
      .poll(() => audio.evaluate((item: HTMLAudioElement) => item.currentTime))
      .toBeGreaterThan(1.2);
    await activate(page.getByRole('button', { name: 'Inspect Today', exact: true }));
    await expect(page).toHaveURL(/#overview$/);
    const position = await element!.evaluate((item: HTMLAudioElement) => item.currentTime);
    expect(await element!.evaluate((item: HTMLAudioElement) => item.paused)).toBe(true);
    const retained = page.getByRole('region', { name: 'Current practice block', exact: true });
    await expect(retained).toContainText(assigned.title);
    await expectAccessible(page, `retained-today-${viewport.width}`);
    await page.screenshot({ path: `.tmp/retained-today-${viewport.width}.png`, fullPage: true });
    await activate(retained.getByRole('button', { name: 'Inspect this week', exact: true }));
    await expect(page).toHaveURL(/#course$/);
    await activate(retained.getByRole('button', { name: 'Inspect report', exact: true }));
    const report = page.getByRole('dialog');
    await expect(report).toBeVisible();
    await expectAccessible(page, `retained-report-${viewport.width}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `.tmp/retained-report-${viewport.width}.png`, fullPage: true });
    await activate(report.getByRole('button', { name: 'Return to practice', exact: true }));
    await expect(audio).toBeVisible();
    expect(await element!.evaluate((item: HTMLAudioElement) => item.isConnected)).toBe(true);
    expect(await audio.evaluate((item: HTMLAudioElement) => item.currentTime)).toBe(position);
    expect(await audio.evaluate((item: HTMLAudioElement) => item.paused)).toBe(true);
    await expect(audio).toHaveAttribute('src', assigned.exercise.url);
    await expect(page.getByRole('textbox', { name: 'Scratchpad', exact: true })).toHaveValue(
      'Retain this exact block and recording.',
    );
    // Editing an unrelated timer result cannot acknowledge/reset this owner.
    await activate(page.getByRole('button', { name: 'Inspect Today', exact: true }));
    if (viewport.width < 600)
      await activate(page.getByRole('button', { name: 'Open navigation', exact: true }));
    await activate(page.getByRole('button', { name: 'Practice log', exact: true }));
    await activate(page.getByRole('button', { name: 'Edit Sending on 2026-09-30', exact: true }));
    await page
      .getByRole('dialog')
      .getByRole('textbox', { name: /^Notes/ })
      .fill('Edited the older result only.');
    await activate(page.getByRole('button', { name: 'Save changes', exact: true }));
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await activate(retained.getByRole('button', { name: 'Return to practice', exact: true }));
    expect(await audio.evaluate((item: HTMLAudioElement) => item.currentTime)).toBe(position);
    await expect(page.getByRole('textbox', { name: 'Scratchpad', exact: true })).toHaveValue(
      'Retain this exact block and recording.',
    );
    await activate(page.getByRole('button', { name: 'Resume practice', exact: true }));
    await expect
      .poll(() => audio.evaluate((item: HTMLAudioElement) => item.currentTime))
      .toBeGreaterThan(position + 0.3);
    await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
    await activate(page.getByRole('button', { name: 'Cancel', exact: true }));
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Resume practice', exact: true })).toBeVisible();
    expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(1);
    await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
    await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1');
    await expectAccessible(page, `retained-review-${viewport.width}`);
    await page.screenshot({ path: `.tmp/retained-review-${viewport.width}.png`, fullPage: true });
    await activate(page.getByRole('button', { name: 'Save practice', exact: true }));
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(retained).toHaveCount(0);
    const exported = await (await context.request.get('/api/export')).json();
    expect(exported.sessions).toHaveLength(2);
    const result = exported.sessions.find((entry: { id: string }) => entry.id !== older.id);
    expect(result.metadata).toMatchObject({
      plannedTaskId: assigned.id,
      practicePurpose: 'assigned',
      scratchpad: 'Retain this exact block and recording.',
      recordings: [{ url: assigned.exercise.url }],
    });
    expect(result.metadata.elapsedSeconds).toBeGreaterThan(1.2);
    expect(result.metadata.elapsedSeconds).toBeLessThanOrEqual(4);
    expect(result.minutes).toBeCloseTo(result.metadata.elapsedSeconds / 60, 8);
    expect(result.metadata.recordings[0].seconds).toBeCloseTo(result.metadata.elapsedSeconds, 8);
    // Leaving this account disposes its block before exposing the guest scope.
    await activate(row.getByRole('button', { name: 'Listen & practice', exact: true }));
    await page
      .getByRole('textbox', { name: 'Scratchpad', exact: true })
      .fill('Private owner notes.');
    await activate(page.getByRole('button', { name: 'Inspect Today', exact: true }));
    await activate(page.getByRole('button', { name: 'Open your account', exact: true }));
    await activate(page.getByRole('button', { name: 'Sign out', exact: true }));
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(retained).toHaveCount(0);
    expect((await context.request.get('/api/entries')).status()).toBe(401);
    if (viewport.width < 600)
      await activate(page.getByRole('button', { name: 'Open navigation', exact: true }));
    await activate(page.getByRole('button', { name: 'Practice studio', exact: true }));
    await expect(audio).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Scratchpad', exact: true })).toHaveValue('');
  });
}
