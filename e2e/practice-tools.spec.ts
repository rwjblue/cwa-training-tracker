import { expect, type Locator } from '@playwright/test';
import type { PlannedTask } from '../src/shared/plan';
import { dateInTimezone, type PracticeSession } from '../src/shared/training';
import { test } from './fixtures';
import {
  accountRequest,
  expectResponsive,
  navigateView,
  openPracticeTool,
  signIn,
} from './helpers';
import { syntheticRecording } from './synthetic-recording';

test.use({ hasTouch: true });

test('guests choose from the public tool library without starting a default session', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#practice');
  await expect(page).toHaveURL(/#tools$/);
  await expect(page.getByRole('region', { name: 'Practice tools', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Scratchpad', exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    window.location.hash = 'practice';
  });
  await expect(page).toHaveURL(/#tools$/);

  await page.goto('/');
  await page.getByRole('button', { name: 'Try practice', exact: true }).tap();
  await expect(page).toHaveURL(/#tools$/);
  const library = page.getByRole('region', { name: 'Practice tools', exact: true });
  for (const name of [
    'Copy practice',
    'Sending practice',
    'Word listening',
    'QSO practice',
    'Sentences & stories',
    'Free practice',
    'Morse Runner',
  ]) {
    await expect(library.getByRole('link', { name, exact: true })).toBeVisible();
    await expect(library.getByRole('link', { name, exact: true })).toBeEnabled();
  }
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expectResponsive(page, 'guest-practice-tools');

  await openPracticeTool(page, 'Word listening', (control) => control.tap());
  await expect(page).toHaveURL(/#practice(?:[/?].*)?$/);
  await expect(
    page.getByRole('heading', { name: 'Word listening', exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole('group', { name: 'Studio tools', exact: true })).toHaveCount(0);
  await expect(
    page
      .getByRole('navigation', { name: 'Main navigation', exact: true })
      .getByRole('link', { name: 'Practice tools', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'All practice tools', exact: true }).tap();
  await expect(page).toHaveURL(/#tools$/);
  await expect(library).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#practice(?:[/?].*)?$/);
  await expect(
    page.getByRole('heading', { name: 'Word listening', exact: true, level: 1 }),
  ).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/#tools$/);
  await expect(library).toBeVisible();
});

test('tool library inspection retains a lesson and guards its replacement with the original save', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const activate = async (control: Locator) => {
    await expect(control).toBeEnabled();
    await control.focus();
    await page.keyboard.press('Enter');
  };
  await signIn(page);
  const { settings } = await (await context.request.get('/api/settings')).json();
  const url = 'https://cwa.cwops.org/wp-content/uploads/WD101_10.mp3';
  const task: PlannedTask = {
    id: 'tool-library-lesson',
    title: 'Synthetic library continuity lesson',
    kind: 'listening',
    notes: 'Listen to this synthetic recording.',
    source: 'manual',
    done: false,
    createdAt: '2026-09-30T12:00:00Z',
    dueDate: dateInTimezone(new Date(), settings.timezone),
    exercise: {
      type: 'audio',
      url,
      characterWpm: 10,
    },
  };
  expect((await accountRequest(context, 'POST', '/api/plan', { task })).status()).toBe(201);
  await page.route(url, syntheticRecording(12));
  await page.reload();
  await activate(
    page
      .getByRole('region', { name: 'What should I do today?', exact: true })
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: task.title, exact: true }) })
      .getByRole('button', { name: 'Listen & practice', exact: true }),
  );
  const heading = page.getByRole('heading', { name: 'Lesson practice', exact: true, level: 1 });
  await expect(heading).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Main navigation', exact: true })
      .getByRole('link', { name: 'Academy guide', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  const audio = page.getByLabel('Assigned recording', { exact: true });
  const native = await audio.elementHandle();
  const scratchpad = page.getByRole('textbox', { name: 'Scratchpad', exact: true });
  const notes = 'Keep the exact lesson while choosing another tool.';
  await scratchpad.fill(notes);
  await activate(page.getByRole('button', { name: 'Start practice', exact: true }));
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime))
    .toBeGreaterThan(1.2);

  await navigateView(page, 'Practice tools', activate);
  await expect(page).toHaveURL(/#tools$/);
  const library = page.getByRole('region', { name: 'Practice tools', exact: true });
  await expect(library).toBeVisible();
  const retained = page.getByRole('region', { name: 'Current practice block', exact: true });
  await expect(retained).toContainText(task.title);
  const resume = retained.getByRole('button', { name: 'Resume lesson practice', exact: true });
  await expect(resume).toBeVisible();
  const position = await native!.evaluate((el: HTMLAudioElement) => el.currentTime);
  expect(await native!.evaluate((el: HTMLAudioElement) => el.isConnected && el.paused)).toBe(true);
  expect((await (await context.request.get('/api/entries')).json()).entries).toEqual([]);
  await expectResponsive(page, 'lesson-practice-tools');

  await activate(resume);
  await expect(heading).toBeVisible();
  expect(await audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBe(position);
  expect(await audio.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
  await expect(scratchpad).toHaveValue(notes);
  await activate(page.getByRole('button', { name: 'Save', exact: true }));
  const measurement = await page
    .getByRole('dialog')
    .getByText(/^Measured \d+\.\d{2} seconds/)
    .textContent();
  const measuredSeconds = /^Measured (\d+\.\d{2}) seconds/.exec(measurement!)![1];
  await activate(page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }));
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // A failed save cannot turn a library selection into a new owner.
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Reflect.set(window, 'restoreToolLibraryStorage', () => {
      Storage.prototype.setItem = original;
    });
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('cwa:practice:pending:v1:'))
        throw new DOMException('Synthetic result storage refusal', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.route('**/api/entries', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 503, json: { error: 'Synthetic result save refusal' } })
      : route.continue(),
  );
  await navigateView(page, 'Practice tools', activate);
  const sending = library.getByRole('link', { name: 'Sending practice', exact: true });
  const refused = page.waitForResponse(
    (response) => response.url().endsWith('/api/entries') && response.request().method() === 'POST',
  );
  await activate(sending);
  expect((await refused).status()).toBe(503);
  await expect(sending).toBeEnabled();
  await expect(page).toHaveURL(/#tools$/);
  await expect(resume).toBeVisible();
  expect(await native!.evaluate((el: HTMLAudioElement) => el.isConnected && el.paused)).toBe(true);
  expect((await (await context.request.get('/api/entries')).json()).entries).toEqual([]);
  await activate(resume);
  await expect(heading).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Your session is still here.');
  await expect(scratchpad).toHaveValue(notes);
  expect(await audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBe(position);

  await page.evaluate(() => Reflect.get(window, 'restoreToolLibraryStorage')());
  await page.unroute('**/api/entries');
  await navigateView(page, 'Practice tools', activate);
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/entries') &&
      response.request().method() === 'POST' &&
      [200, 201].includes(response.status()),
  );
  await activate(sending);
  await saved;
  await expect(page).toHaveURL(/#practice(?:[/?].*)?$/);
  await expect(
    page.getByRole('heading', { name: 'Sending practice', exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.getByLabel('Assigned recording', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Scratchpad', exact: true })).toHaveValue('');
  const { entries }: { entries: PracticeSession[] } = await (
    await context.request.get('/api/entries')
  ).json();
  expect(entries).toHaveLength(1);
  expect(entries[0].metadata).toMatchObject({
    plannedTaskId: task.id,
    practicePurpose: 'assigned',
    practiceTool: 'audio',
    scratchpad: notes,
    recordings: [{ url }],
  });
  const elapsedSeconds = entries[0].metadata!.elapsedSeconds as number;
  expect(elapsedSeconds).toBeGreaterThan(1.2);
  expect(elapsedSeconds).toBeLessThan(12);
  expect(elapsedSeconds.toFixed(2)).toBe(measuredSeconds);
  expect(entries[0].minutes).toBeCloseTo(elapsedSeconds / 60, 8);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page
      .getByRole('group', { name: 'Sending practice controls', exact: true })
      .getByRole('button', { name: 'Save session', exact: true }),
  ).toBeDisabled();
});
