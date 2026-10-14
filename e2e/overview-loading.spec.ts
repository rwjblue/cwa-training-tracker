import { expect } from '@playwright/test';
import { test } from './fixtures';
import { expectResponsive, navigateView, scopedRequest, signIn } from './helpers';

test('overview shares its account refresh and starts history before account state returns', async ({
  page,
  context,
}) => {
  await signIn(page);
  expect(
    (
      await scopedRequest(context, 'POST', '/api/entries', {
        id: 'overview-history',
        date: '2026-10-14',
        kind: 'other',
        minutes: 3,
        notes: 'History loaded alongside account state',
        source: 'manual',
        createdAt: '2026-10-14T12:00:00.000Z',
      })
    ).ok(),
  ).toBe(true);
  // Keep the authenticated session, but reopen without a device snapshot so
  // startup has to fetch current authority before it can request LCWO data.
  await page.evaluate(() => localStorage.clear());
  const requests = { account: 0, entries: 0, lcwo: 0 };
  let release!: () => void;
  const accountGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/account-state', async (route) => {
    requests.account++;
    const response = await route.fetch();
    await accountGate;
    await route.fulfill({ response });
  });
  await page.route('**/api/entries', async (route) => {
    requests.entries++;
    await route.continue();
  });
  await page.route('**/api/lcwo*', async (route) => {
    requests.lcwo++;
    await route.continue();
  });
  const historyResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/entries',
  );
  const lcwoResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/lcwo',
  );
  try {
    await page.reload();
    // No elapsed-time threshold: a held account response proves these reads
    // overlap, even on a slow test host or a remote database.
    await expect.poll(() => requests.entries).toBe(1);
    expect((await historyResponse).ok()).toBe(true);
    expect(requests.account).toBe(1);
    expect(requests.lcwo).toBe(0);
    await expect(page.getByText('Tuning in to your workspace…', { exact: true })).toBeVisible();
  } finally {
    release();
  }
  expect((await lcwoResponse).ok()).toBe(true);
  await expect(page.getByText('Tuning in to your workspace…', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'What should I do today?' })).toBeVisible();
  expect(requests).toEqual({ account: 1, entries: 1, lcwo: 1 });
  // Existing Today and summary journeys own overview accessibility.
  await expectResponsive(page, 'overview-concurrent-load', { accessibility: false });
  await navigateView(page, 'Practice log');
  await expect(
    page.getByText('History loaded alongside account state', { exact: true }),
  ).toBeVisible();
});

test('a delayed startup history read retains a practice result uploaded during loading', async ({
  page,
  context,
}) => {
  await signIn(page);
  await navigateView(page, 'Practice log');
  await page.route('**/api/entries', (route) =>
    route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue(),
  );
  await page.getByRole('button', { name: 'Log practice', exact: true }).click();
  await page.getByLabel(/^Time practiced/).fill('3:00');
  await page.getByLabel(/^Notes/).fill('Practice uploaded while history was loading');
  await page.getByRole('button', { name: 'Save practice', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Practice upload status' })).toContainText(
    '1 practice result saved on this device.',
  );
  await page.unroute('**/api/entries');

  let release!: () => void;
  let captured!: () => void;
  const historyGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const historyCaptured = new Promise<void>((resolve) => {
    captured = resolve;
  });
  let reads = 0;
  await page.route('**/api/entries', async (route) => {
    if (route.request().method() === 'POST') {
      // Commit the queued result only after the first read has captured the
      // earlier server snapshot, then let its acknowledgement reach the app.
      await historyCaptured;
      await route.continue();
    } else if (++reads === 1) {
      const response = await route.fetch();
      expect((await response.json()).entries).toEqual([]);
      captured();
      await historyGate;
      await route.fulfill({ response });
    } else await route.continue();
  });
  const uploaded = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/entries' && response.request().method() === 'POST',
  );
  try {
    await page.reload();
    expect((await uploaded).ok()).toBe(true);
    // The server result has been acknowledged and removed from the durable
    // local queue; the stale initial read must not erase its in-memory merge.
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.keys(localStorage).filter((key) => key.startsWith('cwa:practice:pending:v1:')),
        ),
      )
      .toEqual([]);
    expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(1);
  } finally {
    captured();
    release();
  }
  await expect(page.getByText('Tuning in to your workspace…', { exact: true })).toHaveCount(0);
  await expect(
    page.getByText('Practice uploaded while history was loading', { exact: true }),
  ).toBeVisible();
});
