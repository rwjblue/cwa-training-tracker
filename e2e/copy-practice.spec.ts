import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expectAccessible, signIn } from './helpers';
import {
  createCopyAttempt,
  defaultCopyRecipe,
  submitCopyAnswer,
} from '../src/shared/copy-practice';
import { copyAttemptSessionFields } from '../src/shared/copy-report';
import { dateInTimezone } from '../src/shared/training';

async function openCopy(page: Page) {
  await page.goto('/#practice');
  await page.getByRole('button', { name: 'Copy practice', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Copy practice', exact: true })).toBeVisible();
}

async function configureShortGroups(page: Page) {
  await page.getByRole('combobox', { name: 'Character set', exact: true }).selectOption('custom');
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Character E', exact: true }).check();
  await page.getByRole('combobox', { name: 'Characters per group', exact: true }).selectOption('1');
  await page.getByRole('combobox', { name: 'Practice length', exact: true }).selectOption('count');
  await page.getByRole('spinbutton', { name: 'Number of groups', exact: true }).fill('10');
  await page.getByRole('spinbutton', { name: /^Effective speed/ }).fill('25');
  await page.getByText('Sound and options', { exact: true }).click();
  await page.getByRole('spinbutton', { name: /^Start delay/ }).fill('2');
}

async function startWithoutMovingCopyField(
  page: Page,
  buttonName: string,
  firstCopy: string,
  countdownSeconds = 2,
) {
  const answer = page.getByRole('textbox', { name: 'Your copy', exact: true });
  await expect(answer).toBeVisible();
  await expect(answer).toHaveAttribute('readonly', '');
  const original = (await answer.elementHandle())!;
  const beforeY = await original.evaluate(
    (element) => element.getBoundingClientRect().top + scrollY,
  );
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  // Read immediately: auto-retrying focus assertions would miss a delayed focus at audio end.
  const started = await original.evaluate((element: HTMLTextAreaElement) => ({
    connected: element.isConnected,
    focused: document.activeElement === element,
    readOnly: element.readOnly,
    y: element.getBoundingClientRect().top + scrollY,
    audioPosition: document.querySelector<HTMLAudioElement>(
      'audio[aria-label="Copy practice audio"]',
    )!.currentTime,
  }));
  expect(started.connected).toBe(true);
  expect(started.focused).toBe(true);
  expect(started.readOnly).toBe(false);
  expect(Math.abs(started.y - beforeY)).toBeLessThanOrEqual(1);
  expect(started.audioPosition).toBeLessThan(countdownSeconds);
  await page.keyboard.type(firstCopy);
  await expect(answer).toHaveValue(firstCopy);
  await expect
    .poll(() =>
      page
        .getByLabel('Copy practice audio', { exact: true })
        .evaluate((element: HTMLAudioElement) => element.currentTime),
    )
    .toBeGreaterThan(countdownSeconds);
  await expect(answer).toHaveValue(firstCopy);
  await original.dispose();
}

test('guest copy survives reload and signs in to save one measured result with visible feedback', async ({
  page,
  context,
}) => {
  await openCopy(page);
  await page.screenshot({ path: '.tmp/copy-default-setup-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.tmp/copy-default-setup-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await configureShortGroups(page);
  await expectAccessible(page, 'copy-setup-desktop');
  await page.screenshot({ path: '.tmp/copy-setup-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.tmp/copy-setup-mobile.png', fullPage: true });
  await startWithoutMovingCopyField(page, 'Start code groups', 'E ');
  const audio = page.getByLabel('Copy practice audio', { exact: true });
  await expect(audio).toHaveAttribute('src', /^blob:/);
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Check copy', exact: true })).toBeEnabled();
  const answer = `${Array(9).fill('E').join(' ')} T`;
  await page.getByRole('textbox', { name: 'Your copy', exact: true }).fill(answer);
  await page.getByRole('button', { name: 'Pause answering', exact: true }).click();
  await page.reload();
  await expect(page.getByText(/Recovered on this device/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Your copy', exact: true })).toHaveValue(answer);
  await expect(page.getByRole('button', { name: 'Check copy', exact: true })).toBeEnabled();
  expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  await page.getByRole('button', { name: 'Check copy', exact: true }).click();
  await expect(page.locator('.copy-result-stats')).toContainText('90%');
  await expect(page.getByRole('group', { name: 'Group 10', exact: true })).toContainText(
    'Changed E to T.',
  );
  await expect(
    page.getByRole('button', { name: 'Practice missed characters', exact: true }),
  ).toBeVisible();
  expect((await context.request.get('/api/entries')).status()).toBe(401);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expectAccessible(page, 'copy-result-mobile');
  await page.screenshot({ path: '.tmp/copy-result-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Sign in to save result', exact: true }).click();
  await signIn(page, { dialogAlreadyOpen: true });
  await expect(page.getByRole('dialog')).toContainText('90%');
  await expect(page.getByLabel(/^Time practiced/)).toHaveAttribute('readonly', '');
  await page.getByRole('button', { name: 'Save practice', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const entries = (await (await context.request.get('/api/entries')).json()).entries;
  expect(entries).toHaveLength(1);
  const entry = entries[0];
  expect(entry.accuracy).toBe(90);
  expect(entry.metadata.copyAttempt.trials[0].answer).toBe(answer);
  expect(entry.metadata.copyAttempt.audioSeconds).toBeGreaterThan(0);
  expect(entry.metadata.copyAttempt.audioSeconds).toBeLessThan(5);
  expect(entry.metadata.copyAttempt.interruptionCount).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Practice log', exact: true }).click();
  await page.getByText('Code groups result', { exact: true }).click();
  await expect(page.locator('.session-copy-result')).toContainText('90%');
  await expectAccessible(page, 'copy-history-mobile');
  await page.screenshot({ path: '.tmp/copy-history-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Academy guide', exact: true }).click();
  await page.getByRole('button', { name: 'Practice report', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Code groups · completed');
  await expect(page.getByRole('dialog')).toContainText(
    'Native copy: 1 edits · 10% errors · 90% accuracy',
  );
  await expect(page.getByRole('dialog')).toContainText('Actual character/effective WPM: 25/25');
  await expect(page.getByRole('dialog')).toContainText('Measured time:');
  await expectAccessible(page, 'copy-report-mobile');
  await page.screenshot({ path: '.tmp/copy-report-mobile.png' });
});

test('authenticated word round completes all trials and retries an uncertain save without duplication', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await signIn(page);
  await openCopy(page);
  await page.getByRole('button', { name: 'Word copy', exact: true }).click();
  await page.getByRole('spinbutton', { name: /^Minimum character speed/ }).fill('50');
  await page.getByRole('spinbutton', { name: /^Starting effective speed/ }).fill('50');
  await page.getByRole('spinbutton', { name: 'Maximum word length', exact: false }).fill('1');
  await page.getByRole('checkbox', { name: /^Adaptive speed/ }).uncheck();
  await page.getByText('Sound and options', { exact: true }).click();
  await page.getByRole('spinbutton', { name: /^Start delay/ }).fill('1');
  await startWithoutMovingCopyField(page, 'Start word copy', 'A', 1);
  for (let n = 1; n <= 25; n++) {
    await expect(page.getByText(`Word ${n} of 25`, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check & next', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
    const target = (await page.locator('.copy-revealed').innerText()).trim().split(/\s+/)[0];
    expect(['A', 'I']).toContain(target);
    await page.getByRole('textbox', { name: 'Your copy', exact: true }).fill(target);
    await page.getByRole('textbox', { name: 'Your copy', exact: true }).press('Enter');
  }
  await expect(page.locator('.copy-result-stats')).toContainText('25/25');
  await expect(page.locator('.copy-result-stats')).toContainText('1250');
  await expect(
    page.getByText('Answers were revealed. This is practice with assistance.', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Notes for this round', exact: true })
    .fill('Practiced short words with answer reveals.');
  await page.route(
    '**/api/entries',
    async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await route.fetch();
      await route.abort('failed');
    },
    { times: 1 },
  );
  await page.getByRole('button', { name: 'Save result', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('still on this device');
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(1);
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved to history', exact: true })).toBeDisabled();
  const entries = (await (await context.request.get('/api/entries')).json()).entries;
  expect(entries).toHaveLength(1);
  expect(entries[0].metadata.copyAttempt.trials).toHaveLength(25);
  expect(entries[0].metadata.copyAttempt.revealCount).toBe(25);
  expect(entries[0].notes).toContain('short words');
  await expectAccessible(page, 'copy-words-desktop');
  await page.screenshot({ path: '.tmp/copy-words-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expectAccessible(page, 'copy-words-mobile');
  await page.screenshot({ path: '.tmp/copy-words-mobile.png', fullPage: true });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Academy guide', exact: true }).click();
  await page.getByRole('button', { name: 'Course settings', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Your course level', exact: true })
    .selectOption('fundamental');
  await page.getByLabel(/^First class date/).fill('2026-10-08');
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await page.getByRole('button', { name: 'Academy guide', exact: true }).click();
  await page.getByRole('button', { name: 'Whole course', exact: true }).click();
  const assigned = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Copy 2: Code groups', exact: true }) })
    .filter({ hasText: /Session 1 · Day 2 ·/ });
  await assigned.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: /^Character speed/ })).toHaveValue('25');
  await expect(page.getByRole('spinbutton', { name: /^Effective speed/ })).toHaveValue('6');
  await expect(
    page.getByRole('combobox', { name: 'Characters per group', exact: true }),
  ).toHaveValue('2');
  await expect(page.getByRole('combobox', { name: 'Target duration', exact: true })).toHaveValue(
    '60',
  );
  await expect(page.getByRole('button', { name: 'Start code groups', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Character E', exact: true }).check();
  await page
    .getByRole('checkbox', {
      name: 'I have selected the characters I want to strengthen for this assignment.',
    })
    .check();
  await expect(page.getByRole('button', { name: 'Start code groups', exact: true })).toBeEnabled();
  await expectAccessible(page, 'copy-assignment-desktop');
  await page.screenshot({ path: '.tmp/copy-assignment-desktop.png', fullPage: true });
});

test('group feedback preserves later matches when a whole middle group was omitted', async ({
  page,
  context,
}) => {
  await signIn(page);
  const endedAt = new Date().toISOString();
  const createdAt = new Date(Date.parse(endedAt) - 120_000).toISOString();
  const initial = createCopyAttempt(
    {
      ...defaultCopyRecipe(),
      lengthMode: 'count',
      groupCount: 4,
      groupLength: 5,
    },
    { id: crypto.randomUUID(), seed: 'comparison-missing-middle', now: createdAt },
  );
  const groups = initial.targets[0].split(' ');
  const answer = [groups[0], groups[2], groups[3]].join(' ');
  const attempt = {
    ...submitCopyAnswer(initial, answer, { now: endedAt }),
    audioSeconds: 20,
    answerSeconds: 5,
  };
  const response = await context.request.post('/api/entries', {
    headers: { Origin: new URL(page.url()).origin },
    data: {
      ...copyAttemptSessionFields(attempt),
      date: endedAt.slice(0, 10),
      kind: 'icr',
      notes: 'Whole middle group omitted.',
    },
  });
  expect(response.status()).toBe(201);
  await page.goto('/#logbook');
  await page.reload();
  await page.getByText('Code groups result', { exact: true }).click();
  const comparison = page.getByRole('list', { name: 'Character comparison', exact: true });
  await expect(comparison.getByRole('group')).toHaveCount(4);
  await expect(comparison.getByRole('group', { name: 'Group 2', exact: true })).toContainText(
    `Sent: ${groups[1]}`,
  );
  await expect(comparison.getByRole('group', { name: 'Group 2', exact: true })).toContainText(
    'Not copied',
  );
  const later = comparison.getByRole('group', { name: 'Group 3', exact: true });
  await expect(later).toContainText(`Sent: ${groups[2]}`);
  await expect(later).toContainText(`Your copy: ${groups[2]}`);
  await expect(later).toContainText('Correct');
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const bounds = await comparison.getByRole('group').evaluateAll((elements) =>
      elements.map((element) => {
        const { top, bottom, height } = element.getBoundingClientRect();
        return { top, bottom, height };
      }),
    );
    expect(
      bounds.every(
        (row, index) => row.height > 0 && (!index || row.top >= bounds[index - 1].bottom),
      ),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `.tmp/copy-omitted-group-${viewport.width}.png`,
      fullPage: true,
    });
  }
  await expectAccessible(page, 'copy-omitted-group-mobile');
});

test('assigned copy alternatives stay selected when a round is recovered and reopened', async ({
  page,
  context,
}) => {
  await signIn(page);
  const { settings } = await (await context.request.get('/api/settings')).json();
  const title = 'Choose groups or words';
  const words = {
    ...defaultCopyRecipe('words'),
    characterWpm: 50,
    effectiveWpm: 50,
    maxWordLength: 1,
    startDelaySeconds: 2,
  };
  const response = await context.request.post('/api/plan', {
    headers: { Origin: new URL(page.url()).origin },
    data: {
      task: {
        id: crypto.randomUUID(),
        title,
        kind: 'icr',
        targetMinutes: 3,
        done: false,
        dueDate: dateInTimezone(new Date(), settings.timezone),
        notes: '',
        createdAt: new Date().toISOString(),
        exercise: { type: 'copy', recipe: defaultCopyRecipe(), alternatives: [words] },
      },
    },
  });
  expect(response.ok()).toBe(true);
  await page.reload();
  const assigned = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await assigned.getByRole('button', { name: 'Practice', exact: true }).click();
  const option = page.getByRole('combobox', { name: 'Assignment option', exact: true });
  await option.selectOption('1');
  await expect(option.locator('option:checked')).toContainText('Word copy');
  await page.getByRole('button', { name: 'Start word copy', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your copy', exact: true }).fill('A');
  await page.getByRole('button', { name: 'Pause audio', exact: true }).click();
  await expect(option).toBeDisabled();
  await expect(option).toHaveValue('1');
  await page.reload();
  await expect(page.getByText(/Recovered on this device/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Word copy', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await assigned.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(option).toBeDisabled();
  await expect(option).toHaveValue('1');
  await expect(option.locator('option:checked')).toContainText('Word copy');
  await expect(page.getByRole('textbox', { name: 'Your copy', exact: true })).toHaveValue('A');
  await page.screenshot({ path: '.tmp/copy-recovered-assignment-option.png', fullPage: true });
});

test('callsign controls protect replay and blind feedback, and plain text grades punctuation and exports', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openCopy(page);
  await page.getByRole('button', { name: 'Callsign copy', exact: true }).click();
  await page.getByRole('spinbutton', { name: /^Minimum character speed/ }).fill('50');
  await page.getByRole('spinbutton', { name: /^Starting effective speed/ }).fill('50');
  await page.getByRole('combobox', { name: 'Callsigns', exact: false }).selectOption('simple');
  await page.getByText('Sound and options', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Pause after an incorrect call' }).check();
  await page
    .getByRole('checkbox', { name: 'Hide call feedback until the round is complete' })
    .check();
  const checkboxLayout = await page
    .getByRole('checkbox', { name: 'Hide call feedback until the round is complete' })
    .evaluate((element) => {
      const text = [...element.closest('label')!.childNodes].find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      )!;
      const range = document.createRange();
      range.selectNodeContents(text);
      return {
        boxRight: element.getBoundingClientRect().right,
        textLeft: range.getClientRects()[0].left,
      };
    });
  expect(checkboxLayout.textLeft).toBeGreaterThanOrEqual(checkboxLayout.boxRight);
  await page.getByRole('spinbutton', { name: /^Start delay/ }).fill('0');
  await expectAccessible(page, 'copy-calls-setup-mobile');
  await page.screenshot({ path: '.tmp/copy-calls-setup-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Start callsign copy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check & next', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Play again', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your copy', exact: true }).fill('BAD');
  await page.getByRole('textbox', { name: 'Your copy', exact: true }).press('Enter');
  await expect(page.getByText('Call 1 of 25', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check & next', exact: true })).toBeEnabled();
  await page.getByRole('textbox', { name: 'Your copy', exact: true }).press('Enter');
  await expect(page.getByText('Call 2 of 25', { exact: true })).toBeVisible();
  await expect(page.getByText('Answer recorded.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play audio', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check & next', exact: true })).toBeDisabled();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Finish early', exact: true }).click();
  await expect(page.getByText(/Partial round: 1 of 25 answers submitted/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Round answers', exact: true })).toContainText(
    'replayed 1×',
  );
  await expectAccessible(page, 'copy-calls-result-mobile');
  await page.screenshot({ path: '.tmp/copy-calls-result-mobile.png', fullPage: true });

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'New round', exact: true }).click();
  await page.getByRole('button', { name: 'Plain text', exact: true }).click();
  await page.getByRole('spinbutton', { name: /^Character speed/ }).fill('100');
  await page.getByRole('spinbutton', { name: /^Effective speed/ }).fill('100');
  await page.getByText('Sound and options', { exact: true }).click();
  await page.getByRole('spinbutton', { name: /^Start delay/ }).fill('0');
  await page.getByRole('button', { name: 'Start plain text', exact: true }).click();
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
  const target = await page
    .locator('.copy-revealed')
    .evaluate((element) => element.firstChild!.textContent!.trim());
  expect(target).toMatch(/\.$/);
  const answer = target.slice(0, -1);
  await page.getByRole('textbox', { name: 'Your copy', exact: true }).fill(answer);
  await expect(page.getByRole('button', { name: 'Check copy', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Check copy', exact: true }).click();
  await page.getByText('Scoring details', { exact: true }).click();
  await expect(
    page.getByText(`1 edits / ${target.length} transmitted characters, including spaces`, {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByLabel('Character comparison')).toContainText('Missing');
  await page
    .getByRole('textbox', { name: 'Notes for this round', exact: true })
    .fill('Missed the sentence ending.');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download result', exact: true }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(exported.recipe.mode).toBe('plaintext');
  expect(exported.trials[0].answer).toBe(answer);
  expect(exported.trials[0].distance).toBe(1);
  expect(exported.audioSeconds).toBeGreaterThan(0);
  expect(exported.notes).toBe('Missed the sentence ending.');
  await page.setViewportSize({ width: 1280, height: 900 });
  await expectAccessible(page, 'copy-plaintext-result-desktop');
  await page.screenshot({ path: '.tmp/copy-plaintext-result-desktop.png', fullPage: true });
});
