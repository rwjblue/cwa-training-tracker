import { expect } from '@playwright/test';
import { test } from './fixtures';
import { expectAccessible, signIn } from './helpers';

test('private homework supports completion, reporting, and deletion without losing practice', async ({
  page,
  context,
}) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Academy guide', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Know what to practice next.' })).toBeVisible();
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click();
  await page.getByLabel('Exercise title', { exact: true }).fill('Practice a clear exchange');
  await page.getByLabel('Suggested minutes (optional)', { exact: true }).fill('12');
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
  await expect(page.getByRole('button', { name: 'Save practice', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/#overview$/);
  await expect(page.getByRole('region', { name: 'What should I do today?' })).toBeVisible();
  const savedEntry = (await (await context.request.get('/api/entries')).json()).entries[0];
  expect(savedEntry.minutes).toBe(12);
  expect(savedEntry.metadata.plannedTaskId).toBeTruthy();
  const pendingTask = (await (await context.request.get('/api/plan')).json()).plan[0];
  expect(pendingTask.done).toBe(false);

  // Completion is server-confirmed and removes this row from the pending view.
  await page.getByRole('button', { name: 'Academy guide', exact: true }).click();
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
