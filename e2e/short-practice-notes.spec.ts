import { expect, type Locator } from '@playwright/test';
import { test } from './fixtures';
import {
  navigateView,
  openPracticeTool,
  accountRequest,
  expectAccessible,
  expectResponsive,
  signIn,
} from './helpers';
import { syntheticRecording } from './synthetic-recording';
import type { PracticeSession } from '../src/shared/training';

test.use({ hasTouch: true });
const width = 1440;

test(`short practice and explicit zero notes keep exact receipts at ${width}px`, async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await context.setExtraHTTPHeaders({
    'CF-Connecting-IP': '192.0.2.127',
  });
  await page.setViewportSize({ width, height: 1000 });
  const activate = async (control: Locator) => {
    await control.focus();
    await page.keyboard.press('Space');
  };
  const navigate = async (name: string) => {
    const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (await menu.isVisible()) await activate(menu);
    await activate(page.getByRole('button', { name, exact: true }));
  };
  const scratchpad = page.getByRole('textbox', { name: 'Scratchpad', exact: true });
  const saveNotes = page.getByRole('button', { name: 'Save notes', exact: true });
  const localEntries = () =>
    page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('cwa:practice:pending:v1:guest:'))
        .map((key) => JSON.parse(localStorage.getItem(key)!)),
    );
  await page.goto('/#tools');
  await openPracticeTool(page, 'Word listening', activate);
  await expect(saveNotes).toBeDisabled();
  await scratchpad.fill(' \n\t');
  await expect(saveNotes).toBeDisabled();
  const guestNotes = 'Synthetic guest note at exactly zero.';
  await scratchpad.fill(guestNotes);
  await expect(saveNotes).toBeEnabled();
  await activate(saveNotes);
  await expect(
    page.getByText('Notes saved on this device. Find it in your logbook.', { exact: true }),
  ).toBeVisible();
  await expect(scratchpad).toHaveValue('');
  await expect(saveNotes).toBeDisabled();
  const guest = await localEntries();
  expect(guest).toHaveLength(1);
  expect(guest[0]).toMatchObject({
    minutes: 0,
    metadata: { scratchpad: guestNotes, elapsedSeconds: 0, recallSeconds: 0 },
  });
  expect(guest[0].metadata.evidence).not.toHaveProperty('generatedListening');
  await expectResponsive(page, `zero-notes-guest-${width}`);

  await navigateView(page, 'Overview', activate);
  await activate(
    page
      .getByRole('region', { name: 'Current practice block', exact: true })
      .getByRole('button', { name: 'Return to practice', exact: true }),
  );
  expect(await localEntries()).toHaveLength(1);
  await navigate('Practice log');
  await activate(page.locator('summary').filter({ hasText: /^Scratchpad$/ }));
  await expect(page.getByText(guestNotes, { exact: true })).toBeVisible();
  await page.reload();
  await activate(page.locator('summary').filter({ hasText: /^Scratchpad$/ }));
  await expect(page.getByText(guestNotes, { exact: true })).toBeVisible();
  expect((await context.request.get('/api/entries')).status()).toBe(401);

  await signIn(page);
  expect((await (await context.request.get('/api/entries')).json()).entries).toEqual([]);
  const { settings } = await (await context.request.get('/api/settings')).json();
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        settings: { ...settings, timezone: 'UTC' },
      })
    ).ok(),
  ).toBe(true);
  const today = new Date().toISOString().slice(0, 10);
  const task = {
    id: crypto.randomUUID(),
    title: 'Synthetic short assigned listening',
    kind: 'listening',
    done: false,
    notes: 'Follow the synthetic instructions.',
    dueDate: today,
    targetMinutes: 1,
    createdAt: new Date().toISOString(),
    exercise: {
      type: 'audio',
      url: 'https://cwa.cwops.org/wp-content/uploads/PR101_10.mp3',
      characterWpm: 10,
      minimumPasses: 3,
    },
  };
  expect((await accountRequest(context, 'POST', '/api/plan', { task })).ok()).toBe(true);
  await page.route(task.exercise.url, syntheticRecording(30));
  await page.reload();
  const row = page
    .getByRole('region', { name: 'What should I do today?' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: task.title, exact: true }) });
  await activate(row.getByRole('button', { name: 'Extra review', exact: true }));
  const notes = '  Synthetic private review note\nwith exact spacing.  ';
  await scratchpad.fill(notes);
  await expect(saveNotes).toBeEnabled();
  await navigateView(page, 'Today', activate);
  await activate(
    page
      .getByRole('region', { name: 'Current practice block', exact: true })
      .getByRole('button', { name: 'Return to practice', exact: true }),
  );
  await expect(scratchpad).toHaveValue(notes);
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(0);
  const bodies: unknown[] = [];
  let dropped = false;
  await page.route('**/api/entries', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    bodies.push(route.request().postDataJSON());
    if (!dropped) {
      dropped = true;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      return route.abort('failed');
    }
    return route.continue();
  });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Reflect.set(window, 'restoreShortNotesStorage', () => {
      Storage.prototype.setItem = original;
    });
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('cwa:practice:pending:v1:'))
        throw new DOMException('Synthetic storage full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await activate(saveNotes);
  await expect(page.getByRole('alert')).toContainText('Your session is still here.');
  await expect(scratchpad).toHaveValue(notes);
  const retryNotes = page.getByRole('button', { name: 'Retry saving session', exact: true });
  await expect(retryNotes).toBeFocused();
  await navigateView(page, 'Today', activate);
  await activate(
    page
      .getByRole('region', { name: 'Current practice block', exact: true })
      .getByRole('button', { name: 'Return to practice', exact: true }),
  );
  await expect(retryNotes).toBeFocused();
  await expect(scratchpad).toHaveValue(notes);
  await expect(scratchpad).toBeDisabled();
  await expect(saveNotes).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Complete exercise', exact: true })).toBeDisabled();
  await expectAccessible(page, `zero-notes-retry-${width}`);

  await page.evaluate(() =>
    (window as unknown as { restoreShortNotesStorage: () => void }).restoreShortNotesStorage(),
  );
  const receipt = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/entries') &&
      response.request().method() === 'POST' &&
      response.status() === 200,
  );
  await activate(page.getByRole('button', { name: 'Retry saving session', exact: true }));
  const acknowledged = await receipt;
  expect(acknowledged.request().postDataJSON()).toEqual(bodies[0]);
  expect(bodies).toHaveLength(2);
  await expect(scratchpad).toHaveValue('');
  await expect(saveNotes).toBeDisabled();
  await expect(page.getByText('Notes saved to history.', { exact: true })).toBeVisible();
  const zero = (await (await context.request.get('/api/entries')).json()).entries[0];
  expect(zero).toMatchObject({
    minutes: 0,
    metadata: {
      elapsedSeconds: 0,
      recallSeconds: 0,
      scratchpad: notes,
      plannedTaskId: task.id,
      practicePurpose: 'review',
      assignedRecordingUrl: task.exercise.url,
    },
  });
  expect(zero.metadata.evidence.recordings).toEqual([]);
  expect(zero.metadata).not.toHaveProperty('recordingUrl');
  await page.unroute('**/api/entries');
  await activate(page.getByRole('button', { name: 'Finish practice', exact: true }));
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(1);
  await activate(row.getByRole('button', { name: 'Listen & practice', exact: true }));
  const audio = page.getByLabel('Assigned recording', { exact: true });
  const shortNotes = 'Twelve seconds of actual synthetic assigned audio.';
  await scratchpad.fill(shortNotes);
  await activate(page.getByRole('button', { name: 'Start practice', exact: true }));
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime), { timeout: 20_000 })
    .toBeGreaterThan(12);
  await activate(page.getByRole('button', { name: 'Pause practice', exact: true }));
  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  await page.keyboard.press('Escape');
  await expect(scratchpad).toHaveValue(shortNotes);
  await activate(page.getByRole('button', { name: 'Finish practice', exact: true }));
  const assigned = (await (await context.request.get('/api/entries')).json()).entries.find(
    (item: PracticeSession) => item.minutes > 0,
  );
  expect(assigned.minutes * 60).toBeGreaterThan(12);
  expect(assigned.minutes * 60).toBeLessThan(14);
  expect(assigned.metadata.elapsedSeconds).toBeCloseTo(assigned.minutes * 60, 8);
  expect(assigned.metadata.scratchpad).toBe(shortNotes);
  expect(assigned.metadata.recordings[0].passes.durations[0].completedPasses).toBe(0);
  const plan = (await (await context.request.get('/api/plan')).json()).plan;
  expect(plan.find((item: { id: string }) => item.id === task.id).done).toBe(false);

  await openPracticeTool(page, 'Word listening', activate);
  await page.getByRole('combobox', { name: 'Word list', exact: true }).selectOption('custom');
  await page.getByRole('textbox', { name: /^Your word list/ }).fill(Array(100).fill('E').join(' '));
  const publicNotes = 'Twelve seconds of actual generated public listening.';
  await scratchpad.fill(publicNotes);
  await activate(page.getByRole('button', { name: 'Start practice', exact: true }));
  const generated = page.getByLabel('Practice audio', { exact: true });
  await expect
    .poll(() => generated.evaluate((el: HTMLAudioElement) => el.currentTime), { timeout: 20_000 })
    .toBeGreaterThan(12);
  await activate(page.getByRole('button', { name: 'Pause practice', exact: true }));
  await openPracticeTool(page, 'QSO practice', activate);
  const publicEntry = (await (await context.request.get('/api/entries')).json()).entries.find(
    (item: PracticeSession) => item.metadata?.scratchpad === publicNotes,
  );
  expect(publicEntry.minutes * 60).toBeGreaterThan(12);
  expect(publicEntry.minutes * 60).toBeLessThan(14);
  expect(publicEntry.metadata.evidence.generatedListening.summaries[0]).toMatchObject({
    mode: 'words',
    listId: 'custom',
  });
  expect(publicEntry.metadata).not.toHaveProperty('plannedTaskId');
  await activate(page.getByRole('button', { name: 'Finish practice', exact: true }));
  await navigate('Practice log');
  for (const text of [notes, shortNotes, publicNotes]) {
    const detail = page.getByText(text, { exact: true });
    await activate(detail.locator('..').getByText('Scratchpad', { exact: true }));
    await expect(detail).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expectAccessible(page, `short-notes-history-${width}`);
});
