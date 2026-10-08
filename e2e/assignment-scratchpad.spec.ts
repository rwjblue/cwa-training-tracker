import { expect } from '@playwright/test';
import { test } from './fixtures';
import { accountRequest, expectResponsive, signIn } from './helpers';
import { syntheticRecording } from './synthetic-recording';
import type { PracticeSession } from '../src/shared/training';

test.use({ hasTouch: true });

test('recording scratchpads survive saved listens and stay scoped to one assignment', async ({
  page,
  context,
}) => {
  await signIn(page);
  const { settings } = await (await context.request.get('/api/settings')).json();
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        settings: { ...settings, timezone: 'UTC' },
      })
    ).ok(),
  ).toBe(true);
  const exercise = {
    type: 'audio',
    url: 'https://cwa.cwops.org/wp-content/uploads/WD101_10.mp3',
    characterWpm: 10,
    minimumPasses: 2,
  };
  const first = {
    id: 'scratchpad-first-assignment',
    title: 'First assignment of the recording',
    kind: 'listening',
    done: false,
    dueDate: new Date().toISOString().slice(0, 10),
    notes: '',
    createdAt: new Date().toISOString(),
    exercise,
  };
  const second = {
    ...first,
    id: 'scratchpad-second-assignment',
    title: 'Repeat recording assignment',
  };
  for (const task of [first, second])
    expect((await accountRequest(context, 'POST', '/api/plan', { task })).ok()).toBe(true);
  await page.route(exercise.url, syntheticRecording(4));
  await page.reload();

  const openAssignment = async (title: string) => {
    await page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
      .getByRole('button', { name: 'Listen & practice', exact: true })
      .tap();
  };
  const scratchpad = page.getByRole('textbox', { name: 'Scratchpad', exact: true });
  const progress = page.getByRole('region', { name: 'Listening passes', exact: true });
  const count = (label: string) =>
    progress
      .locator('dl > div')
      .filter({ has: page.getByText(label, { exact: true }) })
      .locator('dd');
  const entries = async (): Promise<PracticeSession[]> =>
    (await (await context.request.get('/api/entries')).json()).entries;

  await openAssignment(first.title);
  await scratchpad.fill('What I caught on the first listen.');
  await page.getByRole('button', { name: 'Start practice', exact: true }).tap();
  await expect(count('This block')).toHaveText('1', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Save', exact: true }).tap();
  const dialog = page.getByRole('dialog');
  const reviewed = 'First listen, with a correction made while saving.';
  await dialog.getByRole('textbox', { name: 'Scratchpad', exact: true }).fill(reviewed);
  await dialog.getByRole('button', { name: 'Save practice', exact: true }).tap();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/#overview$/);
  await page.reload();

  await openAssignment(first.title);
  await expect(scratchpad).toHaveValue(reviewed);
  await expect(page.getByRole('button', { name: 'Save notes', exact: true })).toBeDisabled();
  await expect(count('Previously saved')).toHaveText('1');
  await expect(count('This block')).toHaveText('0');
  await expect(count('Minimum remaining')).toHaveText('1');
  await expectResponsive(page, 'assignment-scratchpad');
  await page.setViewportSize({ width: 390, height: 844 });
  const accumulated = `${reviewed}\nMore details from the second listen.`;
  await scratchpad.fill(accumulated);
  await page.getByRole('button', { name: 'Start practice', exact: true }).tap();
  await expect(count('This block')).toHaveText('1', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Finish practice', exact: true }).tap();
  await expect(page).toHaveURL(/#overview$/);
  await page.reload();

  await openAssignment(second.title);
  await expect(scratchpad).toHaveValue('');
  await expect(count('Previously saved')).toHaveText('0');
  await page.getByRole('button', { name: 'Finish practice', exact: true }).tap();
  await expect(page).toHaveURL(/#overview$/);
  await openAssignment(first.title);
  await expect(scratchpad).toHaveValue(accumulated);
  await expect(count('Previously saved')).toHaveText('2');
  const notesOnly = `${accumulated}\nQuestion to revisit next time.`;
  await scratchpad.fill(notesOnly);
  await page.getByRole('button', { name: 'Save notes', exact: true }).tap();
  await expect.poll(async () => (await entries()).length).toBe(3);
  await expect(scratchpad).toHaveValue(notesOnly);
  await expect(page.getByRole('button', { name: 'Save notes', exact: true })).toBeDisabled();
  await page.goto('/#overview');
  await openAssignment(first.title);
  await expect(scratchpad).toHaveValue(notesOnly);
  await expect(page.getByRole('button', { name: 'Save notes', exact: true })).toBeDisabled();
  await expect(count('Previously saved')).toHaveText('2');
  const saved = await entries();
  expect(saved.every((entry) => entry.metadata?.plannedTaskId === first.id)).toBe(true);
  expect(saved.map((entry) => entry.metadata?.scratchpad)).toEqual(
    expect.arrayContaining([reviewed, accumulated, notesOnly]),
  );
  expect(saved.find((entry) => entry.minutes === 0)?.metadata?.recordings).toBeUndefined();
});
