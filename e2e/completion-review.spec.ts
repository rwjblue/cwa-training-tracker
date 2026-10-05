import { expect } from '@playwright/test';
import { test } from './fixtures';
import { accountRequest, expectResponsive, openDisclosure, signIn } from './helpers';

test('completion reviews ratings, retains a rejected save and retries completion without saving twice', async ({
  page,
  context,
}) => {
  await signIn(page);
  const now = new Date('2026-10-05T16:00:00Z');
  const task = {
    id: 'completion-review',
    title: 'Reviewed sending practice',
    kind: 'sending',
    done: false,
    notes: '',
    dueDate: '2026-10-05',
    createdAt: now.toISOString(),
    exercise: { type: 'sending', url: 'https://cwops.org/cw-academy/', sections: ['drill'] },
  };
  expect((await accountRequest(context, 'POST', '/api/plan', { task })).ok()).toBe(true);
  await page.clock.install({ time: now });
  await page.reload();
  const row = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: task.title, exact: true }) });
  await row.getByRole('button', { name: 'Practice', exact: true }).click();
  await page.getByRole('button', { name: 'Start practice', exact: true }).click();
  await page.clock.runFor(2000);
  await page.getByRole('button', { name: 'Complete exercise', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Save practice', exact: true });
  await expect(review).toBeVisible();
  await openDisclosure(review, 'Speed, rating and on-air observations');
  await review.getByRole('combobox', { name: /^Performance rating/ }).selectOption('good');
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  const plan = async () => (await (await context.request.get('/api/plan')).json()).plan;
  const entries = async () => (await (await context.request.get('/api/entries')).json()).entries;
  expect((await plan()).find((item: { id: string }) => item.id === task.id).done).toBe(false);
  expect(await entries()).toHaveLength(0);
  await page.getByRole('button', { name: 'Complete exercise', exact: true }).click();
  await openDisclosure(review, 'Speed, rating and on-air observations');
  await review.getByRole('combobox', { name: /^Performance rating/ }).selectOption('good');
  await page.evaluate(() => {
    const native = Storage.prototype.setItem;
    Object.assign(window, { failPracticeStorage: true, failCompletionStorage: true });
    Storage.prototype.setItem = function (key: string, value: string) {
      const faults = window as unknown as {
        failPracticeStorage: boolean;
        failCompletionStorage: boolean;
      };
      if (
        (faults.failPracticeStorage && key.startsWith('cwa:practice:pending:')) ||
        (faults.failCompletionStorage && key.startsWith('cwa:account:operation:'))
      )
        throw new DOMException('Synthetic storage unavailable', 'QuotaExceededError');
      return native.call(this, key, value);
    };
  });
  const writes: unknown[] = [];
  let rejectSave = true;
  await page.route('**/api/entries', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    writes.push(route.request().postDataJSON());
    if (rejectSave)
      return route.fulfill({ status: 503, json: { error: 'Synthetic practice save unavailable' } });
    return route.continue();
  });
  await review.getByRole('button', { name: 'Save and complete exercise', exact: true }).click();
  await expect(review.getByRole('alert')).toContainText('Synthetic practice save unavailable');
  expect((await plan()).find((item: { id: string }) => item.id === task.id).done).toBe(false);
  expect(await entries()).toHaveLength(0);
  rejectSave = false;
  await page.evaluate(() => Object.assign(window, { failPracticeStorage: false }));
  await review.getByRole('button', { name: 'Save and complete exercise', exact: true }).click();
  await expect(review.getByRole('alert')).toContainText('Practice is saved.');
  await expect(
    review.getByRole('button', { name: 'Retry completing exercise', exact: true }),
  ).toBeVisible();
  const saved = await entries();
  expect(saved).toHaveLength(1);
  expect(saved[0].metadata.assessment.performanceRating).toBe('good');
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect((await plan()).find((item: { id: string }) => item.id === task.id).done).toBe(false);
  await expectResponsive(page, 'completion-review-retry');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => Object.assign(window, { failCompletionStorage: false }));
  await review.getByRole('button', { name: 'Retry completing exercise', exact: true }).click();
  await expect(review).toHaveCount(0);
  await expect
    .poll(async () => (await plan()).find((item: { id: string }) => item.id === task.id).done)
    .toBe(true);
  expect(await entries()).toEqual(saved);
  expect(writes).toHaveLength(2);
});

test('canceling a failed completion keeps saved work and starts a fresh timed block', async ({
  page,
  context,
}) => {
  await signIn(page);
  const now = new Date('2026-10-05T16:00:00Z');
  const task = {
    id: 'completion-cancel',
    title: 'Saved sending block',
    kind: 'sending',
    done: false,
    notes: '',
    dueDate: '2026-10-05',
    createdAt: now.toISOString(),
    exercise: { type: 'sending', url: 'https://cwops.org/cw-academy/', sections: ['drill'] },
  };
  expect((await accountRequest(context, 'POST', '/api/plan', { task })).ok()).toBe(true);
  await page.clock.install({ time: now });
  await page.reload();
  await page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: task.title, exact: true }) })
    .getByRole('button', { name: 'Practice', exact: true })
    .click();
  await page.getByRole('button', { name: 'Start practice', exact: true }).click();
  await page.clock.runFor(2000);
  await page.evaluate(() => {
    const native = Storage.prototype.setItem;
    Object.assign(window, { failCompletionStorage: true });
    Storage.prototype.setItem = function (key: string, value: string) {
      if (
        (window as unknown as { failCompletionStorage: boolean }).failCompletionStorage &&
        key.startsWith('cwa:account:operation:')
      )
        throw new DOMException('Synthetic storage unavailable', 'QuotaExceededError');
      return native.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Complete exercise', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Save practice', exact: true });
  await review.getByRole('button', { name: 'Save and complete exercise', exact: true }).click();
  await expect(review.getByRole('alert')).toContainText('Practice is saved.');
  const entries = async () => (await (await context.request.get('/api/entries')).json()).entries;
  const first = await entries();
  expect(first).toHaveLength(1);
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start practice', exact: true })).toBeVisible();
  expect(await entries()).toEqual(first);
  await page.evaluate(() => Object.assign(window, { failCompletionStorage: false }));
  await page.getByRole('button', { name: 'Start practice', exact: true }).click();
  await page.clock.runFor(1000);
  await page.getByRole('button', { name: 'Complete exercise', exact: true }).click();
  await review.getByRole('button', { name: 'Save and complete exercise', exact: true }).click();
  await expect(review).toHaveCount(0);
  const saved = await entries();
  expect(saved).toHaveLength(2);
  expect(new Set(saved.map((entry: { id: string }) => entry.id)).size).toBe(2);
  expect(saved.find((entry: { id: string }) => entry.id === first[0].id)).toEqual(first[0]);
  expect(
    (await (await context.request.get('/api/plan')).json()).plan.find(
      (item: { id: string }) => item.id === task.id,
    ).done,
  ).toBe(true);
});
