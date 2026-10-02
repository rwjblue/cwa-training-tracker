import { expect, test, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { accountRequest, expectAccessible, signIn } from './helpers';

test.use({ hasTouch: true });
test('private class times, exceptions, retry and class logging through real controls', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.193' });
  let mobile = false;
  const activate = async (control: Locator) => {
    if (mobile) await control.tap();
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
  const responsive = async (label: string) => {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.evaluate(async () => {
        await Promise.all(
          document
            .getAnimations()
            .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
            .map((animation) => animation.finished.catch(() => {})),
        );
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await expectAccessible(page, `class-schedule-${label}-${width}`);
      await page.screenshot({ path: `.tmp/class-schedule-${label}-${width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: mobile ? 390 : 1440, height: mobile ? 844 : 1000 });
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#course');
  await expect(page.getByRole('link', { name: 'Join class', exact: true })).toHaveCount(0);
  expect((await context.request.get('/api/settings')).status()).toBe(401);
  await signIn(page);
  // Only the calendar/manual logging is under this clock; no native playback credit.
  await page.clock.setFixedTime(new Date('2026-10-01T22:59:59Z'));
  await navigate('Your account');
  await page.getByLabel('First class date', { exact: false }).fill('2026-10-01');
  await page.getByRole('combobox', { name: 'Practice timezone', exact: true }).selectOption('UTC');
  await page
    .getByRole('combobox', { name: 'Meeting timezone', exact: true })
    .selectOption('America/New_York');
  await activate(page.getByRole('checkbox', { name: 'Set ordinary class times', exact: true }));
  await page.getByLabel('Class start time', { exact: true }).fill('19:00');
  await page.getByLabel('Class end time', { exact: true }).fill('20:00');
  const joinUrl =
    'https://meeting.example.test/join?pwd=synthetic-access&token=synthetic-token#room';
  await page.getByLabel('Private join class link', { exact: false }).fill(joinUrl);
  await activate(page.getByRole('button', { name: 'Add class exception', exact: true }));
  await page.getByRole('combobox', { name: 'Class session', exact: true }).selectOption('2');
  await page.getByLabel('Exception date', { exact: true }).fill('2026-10-06');
  await activate(page.getByRole('button', { name: 'Done editing exception', exact: true }));
  await responsive('configuration');
  let failSave = true;
  const bodies: unknown[] = [];
  await page.route('**/api/account-operations', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    bodies.push(route.request().postDataJSON());
    if (failSave)
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Synthetic schedule save unavailable' }),
      });
    return route.continue();
  });
  await activate(page.getByRole('button', { name: 'Save preferences', exact: true }));
  await expect(page.getByRole('button', { name: 'Retry account sync', exact: true })).toBeVisible();
  await expect(page.getByLabel('Class start time', { exact: true })).toHaveValue('19:00');
  expect(
    (await (await context.request.get('/api/settings')).json()).settings.classSchedule,
  ).toBeUndefined();
  failSave = false;
  const acknowledged = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/account-operations') &&
      response.request().method() === 'POST' &&
      response.ok(),
  );
  await activate(page.getByRole('button', { name: 'Retry account sync', exact: true }));
  await acknowledged;
  await expect(page.getByRole('button', { name: 'Retry account sync', exact: true })).toHaveCount(
    0,
  );
  expect(bodies.at(-1)).toEqual(bodies[0]);
  const saved = (await (await context.request.get('/api/settings')).json()).settings;
  expect(saved.classSchedule).toMatchObject({
    version: 1,
    timezone: 'America/New_York',
    ordinary: { startTime: '19:00', endTime: '20:00', endsNextDay: false },
    joinUrl,
    exceptions: [{ session: 2, date: '2026-10-06' }],
  });
  const basePlan = (await (await context.request.get('/api/plan')).json()).plan;
  await navigate('Today');
  const card = page.getByRole('region', { name: 'Your private class schedule', exact: true });
  await expect(
    card.getByRole('heading', { name: 'Next class · Session 1', exact: true }),
  ).toBeVisible();
  await expect(card).toContainText('11:00 PM');
  await expect(card).toContainText('12:00 AM');
  const link = card.getByRole('link', { name: 'Join class', exact: true });
  await expect(link).toHaveAttribute('href', joinUrl);
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await context.route('https://meeting.example.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<p>Synthetic class room</p>' }),
  );
  const opened = page.waitForEvent('popup');
  await link.focus();
  await page.keyboard.press('Enter');
  const popup = await opened;
  await expect(popup).toHaveURL(joinUrl);
  await popup.close();
  await page.clock.setFixedTime(new Date('2026-10-01T23:00:00Z'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(
    card.getByRole('heading', { name: 'Time for class · Session 1', exact: true }),
  ).toBeVisible();
  await responsive('active');
  await page.clock.setFixedTime(new Date('2026-10-02T00:00:00Z'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(
    card.getByRole('heading', { name: 'Session 1 has finished', exact: true }),
  ).toBeVisible();
  await expect(card).toContainText('Next: session 2');
  await expect(card).toContainText('Oct 6');
  await responsive('finished');
  mobile = true;
  await page.setViewportSize({ width: 390, height: 844 });
  await activate(card.getByRole('button', { name: 'Log class time', exact: true }));
  const dialog = page.getByRole('dialog', {
    name: 'A little progress, worth recording.',
    exact: true,
  });
  await expect(dialog.getByRole('combobox', { name: 'Academy session', exact: false })).toHaveValue(
    '1',
  );
  await expect(dialog.getByRole('checkbox', { name: /class/i })).toBeChecked();
  await dialog.getByLabel('Time practiced', { exact: false }).fill('10:00');
  await responsive('class-log');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect((await (await context.request.get('/api/entries')).json()).entries).toEqual([]);
  await activate(card.getByRole('button', { name: 'Log class time', exact: true }));
  await dialog.getByLabel('Time practiced', { exact: false }).fill('10:00');
  await activate(dialog.getByRole('button', { name: 'Save practice', exact: true }));
  await expect(dialog).toHaveCount(0);
  const entries = (await (await context.request.get('/api/entries')).json()).entries;
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    context: 'class',
    lesson: 1,
    date: '2026-10-02',
    minutes: 10,
    source: 'manual',
  });
  expect((await (await context.request.get('/api/plan')).json()).plan).toEqual(basePlan);
  await navigate('Your account');
  await activate(page.getByRole('button', { name: 'Add class exception', exact: true }));
  await expect(page.getByLabel('Exception date', { exact: true })).toBeVisible();
  await activate(page.getByRole('button', { name: 'Cancel meeting edits', exact: true }));
  await expect(page.getByLabel('Exception date', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit session 1', exact: true })).toHaveCount(0);
  await page
    .getByLabel('Private join class link', { exact: false })
    .fill('https://person:secret@meeting.example.test/join');
  await activate(page.getByRole('button', { name: 'Save preferences', exact: true }));
  await expect(
    page.getByRole('alert').filter({ hasText: /without username\/password credentials/ }),
  ).toBeVisible();
  await expect(page.getByLabel('Private join class link', { exact: false })).toHaveValue(
    'https://person:secret@meeting.example.test/join',
  );
  expect((await (await context.request.get('/api/settings')).json()).settings).toEqual(saved);
  await activate(page.getByRole('button', { name: 'Cancel meeting edits', exact: true }));
  await expect(page.getByLabel('Private join class link', { exact: false })).toHaveValue(joinUrl);
  const download = page.waitForEvent('download');
  await activate(page.getByRole('button', { name: 'Export backup', exact: true }));
  const backup = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(backup.profile.classSchedule).toEqual(saved.classSchedule);
  expect(backup.sessions).toEqual(entries);
  await navigate('Practice log');
  await expect(page.getByText('Class', { exact: true })).toBeVisible();
  await navigate('Academy guide');
  await expect(
    card.getByRole('heading', { name: 'Session 1 has finished', exact: true }),
  ).toBeVisible();
  await responsive('guide');
  await navigate('Your account');
  const online = {
    ...saved,
    classSchedule: {
      ...saved.classSchedule,
      ordinary: { startTime: '20:00', endTime: '21:00', endsNextDay: false },
    },
  };
  expect((await accountRequest(context, 'PUT', '/api/settings', { settings: online })).ok()).toBe(
    true,
  );
  await page.getByLabel('Class start time', { exact: true }).fill('19:30');
  await activate(page.getByRole('button', { name: 'Save preferences', exact: true }));
  const comparison = page.getByText(/^Private class meetings: saved online/);
  await expect(comparison).toContainText('ordinary times 20:00–21:00');
  await expect(comparison).toContainText('ordinary times 19:30–20:00');
  await expect(comparison).toContainText('session 2: 2026-10-06');
  await expect(comparison).toContainText(joinUrl);
  await expect(comparison).not.toContainText('[object Object]');
  await responsive('conflict');
  await activate(page.getByRole('button', { name: 'Keep online version', exact: true }));
  await expect(comparison).toHaveCount(0);
  await expect(page.getByLabel('Class start time', { exact: true })).toHaveValue('20:00');
  expect((await (await context.request.get('/api/settings')).json()).settings).toEqual(online);
});
