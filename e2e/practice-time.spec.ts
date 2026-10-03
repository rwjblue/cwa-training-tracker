import { expect, type Locator } from '@playwright/test';
import { test } from './fixtures';
import { openDisclosure, accountRequest, scopedRequest, expectResponsive, signIn } from './helpers';

test.use({ hasTouch: true });
test('daily time moves once through inspection, queued save, retry and local midnight', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.194' });
  await signIn(page);
  const profile = (await (await context.request.get('/api/settings')).json()).settings;
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        settings: {
          ...profile,
          timezone: 'Pacific/Honolulu',
          dailyGoalMinutes: 45,
          firstClassDate: '',
        },
      })
    ).ok(),
  ).toBe(true);
  const date = '2026-10-01';
  const task = {
    id: 'summary-task',
    title: 'Synthetic timed practice',
    kind: 'sending',
    done: false,
    notes: '',
    createdAt: `${date}T12:00:00Z`,
    dueDate: date,
    exercise: { type: 'sending', url: 'https://cwops.org/cw-academy/', sections: ['drill'] },
  };
  expect((await accountRequest(context, 'POST', '/api/plan', { task })).ok()).toBe(true);
  for (const entry of [
    { id: 'ordinary', minutes: 3 },
    { id: 'estimate', minutes: 1, source: 'legacy', metadata: { legacyEstimated: true } },
    {
      id: 'recall',
      minutes: 1,
      source: 'timer',
      metadata: { elapsedSeconds: 60, recallSeconds: 15 },
    },
    { id: 'class', minutes: 20, context: 'class' },
  ])
    expect(
      (
        await scopedRequest(context, 'POST', '/api/entries', {
          entry: {
            date,
            kind: 'listening',
            notes: 'Synthetic summary fixture',
            createdAt: `${date}T12:00:00Z`,
            ...entry,
          },
        })
      ).ok(),
    ).toBe(true);
  await page.goto('/#overview');
  await page.reload();
  // This journey uses only manual sending time. No fake clock supplies native media credit.
  await page.clock.install({ time: new Date('2026-10-01T22:00:00Z') });
  let mobile = false;
  const activate = async (control: Locator) => {
    if (mobile) await control.tap();
    else {
      await control.focus();
      await page.keyboard.press('Enter');
    }
  };
  const summary = page.getByRole('region', { name: 'Today’s practice time', exact: true });
  const assertTime = async (saved: string, current: string, total: string) => {
    const independent = summary.getByLabel('Independent practice', { exact: true });
    for (const [label, value] of [
      ['Saved', saved],
      ['Current', current],
      ['Total', total],
    ])
      await expect(
        independent
          .locator('div')
          .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
          .locator('dd'),
      ).toHaveText(value);
  };
  await assertTime('5:00', '0:00', '5:00');
  await expect(summary).toContainText('Required goal: 45 min');
  await expect(summary).toContainText('Recall included: 0:15');
  await expect(summary.getByLabel('Class time', { exact: true })).toContainText('20:00');
  await expectResponsive(page, 'practice-time-today');
  const row = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: task.title, exact: true }) });
  await activate(row.getByRole('button', { name: 'Practice', exact: true }));
  await activate(page.getByRole('button', { name: 'Start practice', exact: true }));
  await page.clock.runFor(2000);
  await openDisclosure(page, 'Browse other views');
  await activate(page.getByRole('button', { name: 'Inspect Today', exact: true }));
  await assertTime('5:00', '0:02', '5:02');
  await page.clock.runFor(1000);
  await assertTime('5:00', '0:02', '5:02');

  await activate(page.getByRole('button', { name: 'Return to practice', exact: true }));
  await assertTime('5:00', '0:02', '5:02');
  await activate(page.getByRole('button', { name: /Review & save/ }));
  await activate(page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }));
  await assertTime('5:00', '0:02', '5:02');
  mobile = true;
  await page.setViewportSize({ width: 390, height: 844 });
  let fail = true;
  const bodies: unknown[] = [];
  await page.route('**/api/entries', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    bodies.push(route.request().postDataJSON());
    if (fail)
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Synthetic upload unavailable' }),
      });
    return route.continue();
  });
  await activate(page.getByRole('button', { name: /Review & save/ }));
  await activate(
    page.getByRole('dialog').getByRole('button', { name: 'Save practice', exact: true }),
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Retry practice uploads', exact: true }),
  ).toBeVisible();
  await assertTime('5:02', '0:00', '5:02');

  fail = false;
  const uploaded = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/entries') &&
      response.request().method() === 'POST' &&
      response.ok(),
  );
  await activate(page.getByRole('button', { name: 'Retry practice uploads', exact: true }));
  await uploaded;
  expect(bodies.at(-1)).toEqual(bodies[0]);
  await assertTime('5:02', '0:00', '5:02');
  // A second block starts on Oct 1 in Honolulu, runs across midnight, and keeps its date.
  await page.clock.pauseAt(new Date('2026-10-02T09:59:55Z'));
  await page.clock.resume();
  await activate(row.getByRole('button', { name: 'Practice', exact: true }));
  await activate(page.getByRole('button', { name: 'Start practice', exact: true }));
  await page.clock.runFor(6000);
  await openDisclosure(page, 'Browse other views');
  await activate(page.getByRole('button', { name: 'Inspect Today', exact: true }));
  await expect(summary).toContainText('2026-10-02');
  await expect(summary).toContainText('Required goal: 0 min');
  await expect(summary).toContainText('Rest day');
  await expect(summary).toContainText('Optional personal target: 45 min');
  await expect(summary).toContainText('Retained block: 0:06 on 2026-10-01');
  await assertTime('0:00', '0:00', '0:00');
  await expectResponsive(page, 'practice-time-midnight');
  await page.setViewportSize({ width: 390, height: 844 });
  await activate(page.getByRole('button', { name: 'Return to practice', exact: true }));
  await expect(summary).toContainText('Retained block: 0:06 on 2026-10-01');
  await activate(page.getByRole('button', { name: /Review & save/ }));
  await expect(page.getByRole('dialog').getByLabel('Practice date', { exact: true })).toHaveValue(
    date,
  );
  await activate(
    page.getByRole('dialog').getByRole('button', { name: 'Save practice', exact: true }),
  );
  await assertTime('0:00', '0:00', '0:00');
  const entries = (await (await context.request.get('/api/entries')).json()).entries;
  const measured = entries.filter((entry: { id: string }) => entry.id.startsWith('studio:'));
  expect(measured).toHaveLength(2);
  expect(measured.every((entry: { date: string }) => entry.date === date)).toBe(true);
  expect(
    measured.map((entry: { minutes: number }) => Math.floor(entry.minutes * 60)).sort(),
  ).toEqual([2, 6]);
});
