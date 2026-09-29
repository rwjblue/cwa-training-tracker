import { test, expect } from '@playwright/test';
import { addDays, dateInTimezone } from '../src/shared/training';
import { expectAccessible, signIn } from './helpers';

test('Today brings personal assignments forward and keeps logging separate from completion', async ({
  page,
  context,
}) => {
  await signIn(page);
  const settings = (await (await context.request.get('/api/settings')).json()).settings;
  const today = dateInTimezone(new Date(), settings.timezone);
  const panel = page.getByRole('region', { name: 'What should I do today?' });
  await expect(
    panel.getByRole('heading', { name: 'Bring your homework into today.' }),
  ).toBeVisible();
  await expect(
    panel.getByText('The Academy guide offers original planning prompts.', { exact: false }),
  ).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Restore backup', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Set course dates', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Add an exercise', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Add a practice exercise' })).toBeVisible();
  await expect(page.getByLabel('Practice date (optional)', { exact: true })).toHaveValue(today);
  await page.getByLabel('Exercise title', { exact: true }).fill('Today’s sending warm-up');
  await page.getByRole('combobox', { name: 'Activity', exact: true }).selectOption('sending');
  await page.getByLabel('Suggested minutes', { exact: true }).fill('12');
  await page
    .getByLabel('Exercise link (optional)', { exact: true })
    .fill('https://example.org/today');
  await page
    .getByLabel('Instructions or notes (optional)', { exact: true })
    .fill('Send a familiar exchange with generous word spacing.');
  await page.getByRole('button', { name: 'Save exercise', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Practice', exact: true })).toBeVisible();
  const firstTask = (await (await context.request.get('/api/plan')).json()).plan[0];
  expect(firstTask.dueDate).toBe(today);

  const future = await context.request.post('/api/plan', {
    headers: { Origin: 'http://localhost:8791' },
    data: {
      task: {
        ...firstTask,
        id: 'tomorrow-exercise',
        title: 'Tomorrow’s listening exercise',
        dueDate: addDays(today, 1),
        done: false,
      },
    },
  });
  expect(future.ok()).toBe(true);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(
    panel.getByRole('heading', { name: 'Today’s sending warm-up', exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole('heading', { name: 'Tomorrow’s listening exercise', exact: true }),
  ).toHaveCount(0);
  await expect(panel.getByRole('link', { name: 'Open exercise', exact: true })).toHaveAttribute(
    'href',
    'https://example.org/today',
  );
  await panel.locator('summary').filter({ hasText: 'Instructions' }).click();
  await expect(
    panel.getByText('Send a familiar exchange with generous word spacing.', { exact: true }),
  ).toBeVisible();
  await expectAccessible(page, 'today-desktop');
  await page.screenshot({ path: '.tmp/today-desktop.png', fullPage: true });

  await panel.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(page).toHaveURL(/#practice$/);
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important}',
  });
  const now = new Date();
  await page.clock.install({ time: now });
  await page.clock.pauseAt(new Date(now.getTime() + 1000));
  await page.getByRole('button', { name: 'Start timer', exact: true }).click();
  await page.clock.fastForward(420_000);
  await page.getByRole('button', { name: 'Pause timer', exact: true }).click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page).toHaveURL(/#practice$/);
  await page.getByRole('button', { name: 'Review & save 07:00', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Activity', exact: true })).toHaveValue(
    'sending',
  );
  expect(Number(await page.getByLabel(/^Time practiced/).inputValue())).toBe(7);
  await page.getByRole('button', { name: 'Save practice', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.clock.resume();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(panel.getByText('Started', { exact: true })).toBeVisible();
  await expect(panel.getByText('7 min practiced · 7 today', { exact: true })).toBeVisible();
  const entries = (await (await context.request.get('/api/entries')).json()).entries;
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    minutes: 7,
    kind: 'sending',
    metadata: { plannedTaskId: firstTask.id, elapsedSeconds: 420 },
  });
  expect(
    (await (await context.request.get('/api/plan')).json()).plan.find(
      (task: { id: string }) => task.id === firstTask.id,
    ).done,
  ).toBe(false);

  await panel
    .getByRole('checkbox', { name: 'Mark Today’s sending warm-up complete', exact: true })
    .click();
  await expect(panel.getByRole('heading', { name: 'Today’s plan is complete.' })).toBeVisible();
  await expect
    .poll(
      async () =>
        (await (await context.request.get('/api/plan')).json()).plan.find(
          (task: { id: string }) => task.id === firstTask.id,
        ).done,
    )
    .toBe(true);
  const afterCompletion = (await (await context.request.get('/api/entries')).json()).entries;
  expect(afterCompletion).toEqual(entries);

  await page.setViewportSize({ width: 390, height: 844 });
  await panel.locator('summary').filter({ hasText: 'Completed in this plan' }).click();
  await expect(
    panel.getByRole('heading', { name: 'Today’s sending warm-up', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expectAccessible(page, 'today-mobile');
  await page.screenshot({ path: '.tmp/today-mobile.png', fullPage: true });
  await page.reload();
  await expect(panel.getByRole('heading', { name: 'Today’s plan is complete.' })).toBeVisible();
});
