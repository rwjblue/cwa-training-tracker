import { test, expect } from '@playwright/test';
import { expectAccessible, signIn } from './helpers';

test('private homework supports daily use, reporting, backups, and repeatable restoration', async ({
  page,
  context,
}) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Academy guide', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Know what to practice next.' })).toBeVisible();
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click();
  await page.getByLabel('Exercise title', { exact: true }).fill('Practice a clear exchange');
  await page.getByLabel('Suggested minutes', { exact: true }).fill('12');
  await page
    .getByLabel('Exercise link (optional)', { exact: true })
    .fill('https://example.org/practice');
  await page
    .getByLabel('Instructions or notes (optional)', { exact: true })
    .fill('Leave clear space between words.');
  await expectAccessible(page, 'plan-editor');
  await page.getByRole('button', { name: 'Save exercise', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Practice a clear exchange', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Log practice', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Save practice', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const savedEntry = (await (await context.request.get('/api/entries')).json()).entries[0];
  expect(savedEntry.minutes).toBe(12);
  expect(savedEntry.metadata.plannedTaskId).toBeTruthy();
  const pendingTask = (await (await context.request.get('/api/plan')).json()).plan[0];
  expect(pendingTask.done).toBe(false);

  // Completion is server-confirmed and removes this row from the pending view.
  await page
    .getByRole('checkbox', { name: 'Mark Practice a clear exchange complete', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Practice a clear exchange', exact: true }),
  ).toHaveCount(0);
  await page.getByLabel('Show completed', { exact: true }).check();
  await expect(
    page.getByRole('heading', { name: 'Practice a clear exchange', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Practice report', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('12 independent-practice minutes');
  await expect(page.getByRole('dialog')).toContainText('Practice a clear exchange');
  await expectAccessible(page, 'plan-report');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expectAccessible(page, 'plan-mobile');
  await page.screenshot({ path: '.tmp/plan-mobile.png', fullPage: true });

  const headers = { Origin: 'http://localhost:8791' };
  const backup = await (await context.request.get('/api/export')).json();
  expect(backup.plan).toHaveLength(1);
  expect(backup.plan[0].done).toBe(true);
  await context.request.post('/api/reset', { data: { confirmation: 'RESET' }, headers });
  expect((await (await context.request.get('/api/plan')).json()).plan).toHaveLength(0);
  const restored = await context.request.post('/api/import', {
    data: { mode: 'replace', data: backup },
    headers,
  });
  expect(restored.ok()).toBe(true);
  const merged = await context.request.post('/api/import', {
    data: { mode: 'merge', data: backup },
    headers,
  });
  expect(merged.ok()).toBe(true);
  expect((await (await context.request.get('/api/plan')).json()).plan).toHaveLength(1);
  await page.reload();
  await page.getByLabel('Show completed', { exact: true }).check();
  await expect(
    page.getByRole('heading', { name: 'Practice a clear exchange', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Delete Practice a clear exchange', exact: true }).click();
  await page.getByRole('button', { name: 'Delete exercise', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await (await context.request.get('/api/plan')).json()).plan).toHaveLength(0);
  expect((await (await context.request.get('/api/entries')).json()).entries[0].id).toBe(
    savedEntry.id,
  );
});
