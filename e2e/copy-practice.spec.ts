import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { accountRequest, expectAccessible, scopedRequest, signIn } from './helpers';
import {
  createCopyAttempt,
  copyToneHz,
  defaultCopyRecipe,
  generateCopyTargets,
  scoreCopyText,
  submitCopyAnswer,
} from '../src/shared/copy-practice';
import { copyAttemptSessionFields } from '../src/shared/copy-report';
import { dateInTimezone } from '../src/shared/training';

async function openCopy(page: Page) {
  const observeAudio = () => {
    // Observe actual rendered audio without fetching blob: URLs (blocked by CSP)
    // or replacing native playback, its timing, or the generated PCM.
    const browserWindow = window as Window & { copyAudioBlobs?: Map<string, Blob> };
    if (browserWindow.copyAudioBlobs) return;
    const observed = new Map<string, Blob>();
    browserWindow.copyAudioBlobs = observed;
    const createObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (object) => {
      const url = createObjectURL(object);
      if (object instanceof Blob && object.type === 'audio/wav') observed.set(url, object);
      return url;
    };
  };
  await page.addInitScript(observeAudio);
  await page.goto('/#practice');
  await page.evaluate(observeAudio);
  await page.getByRole('button', { name: 'Copy practice', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Copy practice', exact: true })).toBeVisible();
}

async function configureShortGroups(page: Page) {
  await page.getByRole('combobox', { name: 'Character set', exact: true }).selectOption('custom');
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Character E', exact: true }).check();
  await page.getByRole('combobox', { name: 'Characters per group', exact: true }).selectOption('1');
  await expect(page.getByRole('combobox', { name: 'Practice length', exact: true })).toHaveCount(0);
  await expect(page.getByRole('spinbutton', { name: 'Number of groups', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('combobox', { name: 'Target duration', exact: true }).selectOption('10');
  await page.getByRole('spinbutton', { name: /^Effective speed/ }).fill('25');
  await page.getByText('Sound and options', { exact: true }).click();
  await page.getByRole('spinbutton', { name: /^Start delay/ }).fill('2');
}

/** Measure the actual generated PCM, not only the selected tone label. */
async function recordingTone(page: Page, toneCount = 1) {
  return page
    .getByLabel('Copy practice audio', { exact: true })
    .evaluate(async (element: HTMLAudioElement, count: number) => {
      const blob = (window as Window & { copyAudioBlobs?: Map<string, Blob> }).copyAudioBlobs?.get(
        element.src,
      );
      if (!blob) throw new Error('No generated audio captured.');
      const bytes = await blob.arrayBuffer();
      const view = new DataView(bytes);
      const rate = view.getUint32(24, true);
      if (view.getUint16(22, true) !== 1 || view.getUint16(34, true) !== 16)
        throw new Error('Expected mono 16-bit PCM practice audio.');
      const samples = (bytes.byteLength - 44) / 2;
      const sample = (index: number) => view.getInt16(44 + index * 2, true);
      const starts: number[] = [];
      let lastAudible = -Infinity;
      for (let index = 1; index < samples && starts.length < count; index++) {
        if (Math.abs(sample(index)) < 500) continue;
        if (index - lastAudible > rate / 200) starts.push(index);
        lastAudible = index;
      }
      const tones = starts.map((start) => {
        const crossings: number[] = [];
        for (let index = start; index < Math.min(samples, start + rate / 10); index++) {
          const previous = sample(index - 1);
          const current = sample(index);
          if (previous <= 0 && current > 0) {
            const at = index - 1 - previous / (current - previous);
            if (crossings.length && at - crossings[crossings.length - 1] > rate / 200) break;
            crossings.push(at);
          }
        }
        if (crossings.length < 3) throw new Error('No measurable Morse tone found.');
        return (rate * (crossings.length - 1)) / (crossings[crossings.length - 1] - crossings[0]);
      });
      if (tones.length !== count) throw new Error('Not enough Morse tones in this recording.');
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return {
        hz: tones[0],
        tones,
        digest: [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join(''),
      };
    }, toneCount);
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
  const started = await original.evaluate((element: HTMLInputElement | HTMLTextAreaElement) => ({
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
  await expect(page.getByRole('combobox', { name: 'Tone', exact: true })).toHaveValue('random');
  await expectAccessible(page, 'copy-setup-desktop');
  await page.screenshot({ path: '.tmp/copy-setup-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.tmp/copy-setup-mobile.png', fullPage: true });
  await startWithoutMovingCopyField(page, 'Start code groups', 'E ');
  const audio = page.getByLabel('Copy practice audio', { exact: true });
  await expect(audio).toHaveAttribute('src', /^blob:/);
  const randomTone = await recordingTone(page, 2);
  for (const hz of randomTone.tones) {
    expect(hz).toBeGreaterThanOrEqual(499.5);
    expect(hz).toBeLessThanOrEqual(900.5);
  }
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Check copy', exact: true })).toBeEnabled({
    timeout: 15_000,
  });
  const target = generateCopyTargets(
    {
      ...defaultCopyRecipe(),
      groupKind: 'custom',
      customCharacters: 'E',
      groupLength: 1,
      effectiveWpm: 25,
      durationSeconds: 10,
      lengthMode: 'duration',
    },
    'e-only',
  )[0];
  const groupCount = target.split(' ').length;
  const answer = `${target.slice(0, -1)}T`;
  const score = scoreCopyText(target, answer);
  await page.getByRole('textbox', { name: 'Your copy', exact: true }).fill(answer);
  await page.getByRole('button', { name: 'Pause answering', exact: true }).click();
  await page.reload();
  await expect(page.getByText(/Recovered on this device/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Your copy', exact: true })).toHaveValue(answer);
  await expect(page.getByRole('button', { name: 'Check copy', exact: true })).toBeEnabled();
  expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  await page.getByRole('button', { name: 'Check copy', exact: true }).click();
  await expect(page.locator('.copy-result-stats')).toContainText(`${score.accuracy}%`);
  await expect(page.getByRole('group', { name: `Group ${groupCount}`, exact: true })).toContainText(
    'Changed E to T.',
  );
  expect((await context.request.get('/api/entries')).status()).toBe(401);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expectAccessible(page, 'copy-result-mobile');
  await page.screenshot({ path: '.tmp/copy-result-mobile.png', fullPage: true });
  await page.getByText('Notes and more options', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Practice missed characters', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sign in to save result', exact: true }).click();
  await signIn(page, { dialogAlreadyOpen: true });
  await expect(page.getByRole('dialog')).toContainText(`${score.accuracy}%`);
  await expect(page.getByLabel(/^Time practiced/)).toHaveAttribute('readonly', '');
  await page.getByRole('button', { name: 'Save practice', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const entries = (await (await context.request.get('/api/entries')).json()).entries;
  expect(entries).toHaveLength(1);
  const entry = entries[0];
  expect(entry.accuracy).toBe(score.accuracy);
  expect(entry.metadata.copyAttempt.trials[0].answer).toBe(answer);
  expect(entry.metadata.copyAttempt.audioSeconds).toBeGreaterThan(8);
  expect(entry.metadata.copyAttempt.audioSeconds).toBeLessThan(12);
  expect(entry.metadata.copyAttempt.interruptionCount).toBeGreaterThan(0);
  randomTone.tones.forEach((hz, index) => {
    expect(Math.abs(hz - copyToneHz(entry.metadata.copyAttempt, 0, index))).toBeLessThan(1);
  });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Practice log', exact: true }).click();
  await page.getByText('Code groups result', { exact: true }).click();
  await expect(page.locator('.session-copy-result')).toContainText(`${score.accuracy}%`);
  await expectAccessible(page, 'copy-history-mobile');
  await page.screenshot({ path: '.tmp/copy-history-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Academy guide', exact: true }).click();
  await page.getByRole('button', { name: 'Practice report', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Code groups · completed');
  await expect(page.getByRole('dialog')).toContainText(
    `Native copy: 1 edits · ${score.errorPercent}% errors · ${score.accuracy}% accuracy`,
  );
  await expect(page.getByRole('dialog')).toContainText('Actual character/effective WPM: 25/25');
  await expect(page.getByRole('dialog')).toContainText('Measured time:');
  await expectAccessible(page, 'copy-report-mobile');
  await page.screenshot({ path: '.tmp/copy-report-mobile.png' });
});

test('word copy uses a compact input, replays with a period, and shows each trial outcome', async ({
  page,
}) => {
  await openCopy(page);
  await page.getByRole('button', { name: 'Word copy', exact: true }).click();
  await page.getByRole('spinbutton', { name: /^Minimum character speed/ }).fill('50');
  await page.getByRole('spinbutton', { name: /^Starting effective speed/ }).fill('50');
  await page.getByRole('spinbutton', { name: 'Maximum word length', exact: false }).fill('1');
  await page.getByRole('checkbox', { name: /^Adaptive speed/ }).uncheck();
  await page.getByText('Sound and options', { exact: true }).click();
  await page.getByRole('spinbutton', { name: /^Start delay/ }).fill('1');
  const answer = page.getByRole('textbox', { name: 'Your copy', exact: true });
  await expect(answer).toHaveAttribute('type', 'text');
  await startWithoutMovingCopyField(page, 'Start word copy', 'A', 1);
  const progress = page.getByRole('list', { name: 'Word progress', exact: true });
  await expect(progress.getByRole('listitem')).toHaveCount(25);
  await expect(
    progress.getByRole('listitem', { name: 'Word 1: Current', exact: true }),
  ).toHaveAttribute('aria-current', 'step');
  const check = page.getByRole('button', { name: 'Check & next', exact: true });
  await expect(check).toBeEnabled();
  const firstTone = await recordingTone(page);
  await answer.fill('KE');
  await answer.press('.');
  await expect(answer).toHaveValue('KE');
  await expect(answer).toBeFocused();
  await expect(check).toBeDisabled();
  expect((await recordingTone(page)).digest).toBe(firstTone.digest);
  await expect(check).toBeEnabled();
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
  const target = (await page.locator('.copy-revealed').innerText()).trim().split(/\s+/)[0];
  await answer.fill(target);
  await answer.press('Enter');
  await expect(
    progress.getByRole('listitem', { name: 'Word 1: Correct', exact: true }),
  ).toBeVisible();
  await expect(check).toBeEnabled();
  await answer.fill('ZZ');
  await answer.press('Enter');
  await expect(
    progress.getByRole('listitem', { name: 'Word 2: Incorrect', exact: true }),
  ).toBeVisible();
  await expect(check).toBeEnabled();
  await answer.fill('');
  await answer.press('Enter');
  await expect(
    progress.getByRole('listitem', { name: 'Word 3: Skipped', exact: true }),
  ).toBeVisible();
  await expect(
    progress.getByRole('listitem', { name: 'Word 4: Current', exact: true }),
  ).toHaveAttribute('aria-current', 'step');
  const recorded = await page.evaluate(
    () => JSON.parse(localStorage.getItem('cwa:copy:v1:guest')!).attempt.trials[0],
  );
  expect(recorded.answer).toBe(target);
  expect(recorded.replayCount).toBe(1);
  await expect(check).toBeEnabled();
  await page.getByRole('button', { name: 'Pause answering', exact: true }).click();
  expect((await answer.boundingBox())!.width).toBeLessThanOrEqual(400);
  await expectAccessible(page, 'copy-word-progress-desktop');
  await page.screenshot({ path: '.tmp/copy-word-progress-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expectAccessible(page, 'copy-word-progress-mobile');
  await page.screenshot({ path: '.tmp/copy-word-progress-mobile.png', fullPage: true });

  const previousAttempt = await page.evaluate(
    () => JSON.parse(localStorage.getItem('cwa:copy:v1:guest')!).attempt,
  );
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Finish early', exact: true }).click();
  await expect(
    page.getByText('Saved on this device. Find this round in your logbook.', { exact: true }),
  ).toBeVisible();
  const restart = page.getByRole('button', { name: 'Start next round', exact: true });
  await expect(restart).toBeFocused();
  await expect(restart).toBeInViewport();
  await expectAccessible(page, 'copy-restart-mobile');
  await page.screenshot({ path: '.tmp/copy-restart-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: '.tmp/copy-restart-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Start next round', exact: true }).click();
  await expect(answer).toBeFocused();
  await expect(answer).toHaveValue('');
  const audio = page.getByLabel('Copy practice audio');
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused))
    .toBe(false);
  await expect(page.getByText('Word 1 of 25', { exact: true })).toBeVisible();
  const restarted = await page.evaluate(() => {
    const current = JSON.parse(localStorage.getItem('cwa:copy:v1:guest')!);
    const saved = Object.keys(localStorage)
      .filter((key) => key.startsWith('cwa:practice:pending:v1:guest:'))
      .map((key) => JSON.parse(localStorage.getItem(key)!));
    return { current: current.attempt, saved };
  });
  expect(restarted.current.id).not.toBe(previousAttempt.id);
  expect(restarted.current.recipe).toEqual(previousAttempt.recipe);
  expect(restarted.current.status).toBe('active');
  expect(restarted.current.trials).toEqual([]);
  expect(restarted.saved).toHaveLength(1);
  expect(restarted.saved[0].metadata.copyAttempt.id).toBe(previousAttempt.id);
  expect(restarted.saved[0].metadata.copyAttempt.trials).toHaveLength(3);
});

test('authenticated word round completes all trials and retries an uncertain save without duplication', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await signIn(page);
  await openCopy(page);
  await page.getByRole('button', { name: 'Word listening', exact: true }).click();
  const retainedNotes = 'Keep these word-listening notes when Copy saves its own result.';
  await page.getByRole('textbox', { name: 'Scratchpad', exact: true }).fill(retainedNotes);
  await page.getByRole('button', { name: 'Copy practice', exact: true }).click();
  await page.getByRole('button', { name: 'Word copy', exact: true }).click();
  await page.getByRole('spinbutton', { name: /^Minimum character speed/ }).fill('50');
  await page.getByRole('spinbutton', { name: /^Starting effective speed/ }).fill('50');
  await page.getByRole('spinbutton', { name: 'Maximum word length', exact: false }).fill('1');
  await page.getByRole('checkbox', { name: /^Adaptive speed/ }).uncheck();
  await page.getByText('Sound and options', { exact: true }).click();
  await page.getByRole('spinbutton', { name: /^Start delay/ }).fill('1');
  await startWithoutMovingCopyField(page, 'Start word copy', 'A', 1);
  const postedBodies: string[] = [];
  await page.route('**/api/entries', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    postedBodies.push(route.request().postData()!);
    if (postedBodies.length === 1) {
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
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
  await expect(
    page.getByText('Saved on this device. Upload will retry when you reconnect.', { exact: true }),
  ).toBeVisible();
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(1);
  const identityRefresh = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/me' && response.request().method() === 'GET',
  );
  const historyRefresh = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/entries' && response.request().method() === 'GET',
  );
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await identityRefresh;
  await historyRefresh;
  await expect(
    page.getByText('Saved to history. Included in your weekly report.', { exact: true }),
  ).toBeVisible();
  expect(postedBodies).toHaveLength(2);
  expect(postedBodies[1]).toBe(postedBodies[0]);
  await expect(page.locator('.copy-result-stats')).toContainText('25/25');
  await expect(page.getByRole('button', { name: 'Start next round', exact: true })).toBeEnabled();
  await page.getByText('Notes and more options', { exact: true }).click();
  await page.getByRole('button', { name: 'Add notes', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: /^Notes/ })
    .fill('Practiced short words with answer reveals.');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
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
  await page.getByRole('button', { name: 'Word listening', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Scratchpad', exact: true })).toHaveValue(
    retainedNotes,
  );
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

test('group feedback keeps adjacent columns and later matches after omissions and extra input', async ({
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
  const response = await scopedRequest(context, 'POST', '/api/entries', {
    ...copyAttemptSessionFields(attempt),
    date: endedAt.slice(0, 10),
    kind: 'icr',
    notes: 'Whole middle group omitted.',
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
    const columnGap = await later.evaluate((row, sent) => {
      const columns = [...row.children].filter(
        (element) => element.getAttribute('aria-hidden') === 'true' && element.textContent === sent,
      );
      const sentEnd = columns[0].lastElementChild!.getBoundingClientRect().right;
      const copiedStart = columns[1].firstElementChild!.getBoundingClientRect().left;
      return copiedStart - sentEnd;
    }, groups[2]);
    expect(columnGap).toBeGreaterThanOrEqual(0);
    expect(columnGap).toBeLessThanOrEqual(32);
    await page.screenshot({
      path: `.tmp/copy-omitted-group-${viewport.width}.png`,
      fullPage: true,
    });
  }
  await expectAccessible(page, 'copy-omitted-group-mobile');
  // A separate, unambiguous insertion fixture checks wrapping without changing
  // the globally optimal alignment of the omission example above.
  const shortInitial = createCopyAttempt(
    { ...initial.recipe, groupLength: 3 },
    {
      id: initial.id,
      seed: initial.seed,
      now: createdAt,
    },
  );
  const extraAttempt = {
    ...submitCopyAnswer(shortInitial, `${shortInitial.targets[0]} ${'X'.repeat(100)}`, {
      now: endedAt,
    }),
    audioSeconds: 20,
    answerSeconds: 5,
  };
  const replacement = await scopedRequest(context, 'PUT', `/api/entries/copy:${initial.id}`, {
    ...copyAttemptSessionFields(extraAttempt),
    date: endedAt.slice(0, 10),
    kind: 'icr',
    notes: 'Excess copied text wraps.',
  });
  expect(replacement.ok()).toBe(true);
  await page.reload();
  await page.getByText('Code groups result', { exact: true }).click();
  await expect(comparison.getByRole('group', { name: 'Group 4', exact: true })).toContainText(
    'Extra X.',
  );
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const columnGap = await comparison
      .getByRole('group', { name: 'Group 1', exact: true })
      .evaluate((row, sent) => {
        const columns = [...row.children].filter(
          (element) =>
            element.getAttribute('aria-hidden') === 'true' && element.textContent === sent,
        );
        const sentEnd = columns[0].lastElementChild!.getBoundingClientRect().right;
        const copiedStart = columns[1].firstElementChild!.getBoundingClientRect().left;
        return copiedStart - sentEnd;
      }, shortInitial.targets[0].split(' ')[0]);
    expect(columnGap).toBeGreaterThanOrEqual(0);
    expect(columnGap).toBeLessThanOrEqual(32);
    const extraRow = await comparison
      .getByRole('group', { name: 'Group 4', exact: true })
      .boundingBox();
    // Extra characters should wrap across available space, not form a tall,
    // two-character column beside an otherwise empty comparison.
    await page.screenshot({ path: `.tmp/copy-extra-input-${width}.png`, fullPage: true });
    expect(extraRow!.height).toBeLessThan(width === 390 ? 700 : 200);
  }
});

test.describe('copy review inspection and recovery', () => {
  test.use({ hasTouch: true });
  test('copy review keeps its captured purpose and alternative when reopened as assigned practice', async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    const { settings } = await (await context.request.get('/api/settings')).json();
    const { state } = await (await context.request.get('/api/account-state')).json();
    const title = 'Choose groups or words';
    const words = {
      ...defaultCopyRecipe('words'),
      characterWpm: 50,
      effectiveWpm: 50,
      maxWordLength: 1,
      startDelaySeconds: 2,
    };
    const response = await accountRequest(context, 'POST', '/api/plan', {
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
    });
    expect(response.ok()).toBe(true);
    await page.reload();
    const assigned = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    await assigned.getByRole('button', { name: 'Extra review', exact: true }).click();
    const option = page.getByRole('combobox', { name: 'Assignment option', exact: true });
    await option.selectOption('1');
    await expect(option.locator('option:checked')).toContainText('Word copy');
    await page.getByRole('button', { name: 'Start word copy', exact: true }).click();
    await page.getByRole('textbox', { name: 'Your copy', exact: true }).fill('A');
    const audio = page.getByLabel('Copy practice audio', { exact: true });
    const originalAudio = (await audio.elementHandle())!;
    await expect
      .poll(() => originalAudio.evaluate((element: HTMLAudioElement) => element.currentTime))
      .toBeGreaterThan(0);
    const source = await originalAudio.evaluate((element: HTMLAudioElement) => element.src);
    const roundState = () =>
      page.evaluate((scope: string) => {
        const key = `cwa:copy:v1:${encodeURIComponent(scope)}`;
        return {
          draft: JSON.parse(localStorage.getItem(key) ?? 'null'),
          lease: JSON.parse(localStorage.getItem(`${key}:lease`) ?? 'null'),
        };
      }, state.accountId);
    const original = await roundState();
    expect(original.draft.purpose).toBe('review');
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      const inspect = page.getByRole('button', { name: 'Inspect Today', exact: true });
      if (width === 390) await inspect.tap();
      else {
        await inspect.focus();
        await inspect.press('Enter');
      }
      const retained = page.getByRole('region', { name: 'Current practice block', exact: true });
      await expect(retained).toContainText('EXTRA REVIEW');
      await expect(retained).toContainText(title);
      const paused = await roundState();
      expect(paused.draft).toMatchObject({
        answer: 'A',
        purpose: 'review',
        task: original.draft.task,
        attempt: {
          id: original.draft.attempt.id,
          targets: original.draft.attempt.targets,
          recipe: original.draft.attempt.recipe,
          interruptionCount: original.draft.attempt.interruptionCount,
        },
      });
      expect(paused.lease.owner).toBe(original.lease.owner);
      const pausedPosition = await originalAudio.evaluate((element: HTMLAudioElement) => {
        if (!element.paused) throw new Error('Inspected Copy audio must be paused.');
        return element.currentTime;
      });
      expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(0);
      const returning = retained.getByRole('button', { name: 'Return to practice', exact: true });
      if (width === 390) await returning.tap();
      else {
        await returning.focus();
        await returning.press('Enter');
      }
      await expect(page.getByRole('region', { name: 'Copy practice', exact: true })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Your copy', exact: true })).toHaveValue('A');
      await expect(page.locator('#current-practice')).toBeFocused();
      expect(
        await originalAudio.evaluate(
          (element) =>
            element.isConnected &&
            element === document.querySelector('audio[aria-label="Copy practice audio"]'),
        ),
      ).toBe(true);
      expect(await originalAudio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(
        true,
      );
      expect(await originalAudio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBe(
        pausedPosition,
      );
      expect(await originalAudio.evaluate((element: HTMLAudioElement) => element.src)).toBe(source);
      const returned = await roundState();
      expect(returned.lease.owner).toBe(original.lease.owner);
      expect(returned.draft.attempt.audioSeconds).toBe(paused.draft.attempt.audioSeconds);
      expect(returned.draft.attempt.answerSeconds).toBe(paused.draft.attempt.answerSeconds);
      expect(returned.draft.attempt.reviewSeconds).toBe(paused.draft.attempt.reviewSeconds);
      await expect(option).toHaveValue('1');
      await page.screenshot({
        path: `.tmp/copy-inspection-review-purpose-${width}.png`,
        fullPage: true,
      });
    }
    await originalAudio.dispose();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(option).toBeDisabled();
    await expect(option).toHaveValue('1');
    await page.reload();
    await expect(page.getByText(/Recovered on this device/)).toBeVisible();
    const copy = page.getByRole('region', { name: 'Copy practice', exact: true });
    await expect(
      copy.getByRole('status').filter({ hasText: 'This round is extra review for' }),
    ).toContainText(title);
    await expect(page.getByRole('button', { name: 'Word copy', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await assigned.getByRole('button', { name: 'Practice', exact: true }).click();
    await expect(option).toBeDisabled();
    await expect(option).toHaveValue('1');
    await expect(option.locator('option:checked')).toContainText('Word copy');
    await expect(page.getByRole('textbox', { name: 'Your copy', exact: true })).toHaveValue('A');
    await expect(
      copy.getByRole('status').filter({ hasText: 'This round is extra review for' }),
    ).toContainText(title);
    await expect(
      copy.getByRole('status').filter({ hasText: 'Your recovered round keeps' }),
    ).toContainText(`A new round will use assigned practice for ${title}`);
    await page.screenshot({ path: '.tmp/copy-recovered-assignment-option.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expectAccessible(page, 'copy-recovered-review-purpose-mobile');
    await page.screenshot({
      path: '.tmp/copy-recovered-review-purpose-mobile.png',
      fullPage: true,
    });
  });
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
  const firstPlay = await recordingTone(page);
  await page.getByRole('button', { name: 'Play again', exact: true }).click();
  expect((await recordingTone(page)).digest).toBe(firstPlay.digest);
  await page.getByRole('textbox', { name: 'Your copy', exact: true }).fill('BAD');
  await page.getByRole('textbox', { name: 'Your copy', exact: true }).press('Enter');
  await expect(page.getByText('Call 1 of 25', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check & next', exact: true })).toBeEnabled();
  await page.getByRole('textbox', { name: 'Your copy', exact: true }).press('Enter');
  await expect(page.getByText('Call 2 of 25', { exact: true })).toBeVisible();
  await expect(page.getByText('Answer recorded.', { exact: true })).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'Call 1: Recorded', exact: true })).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'Call 1: Incorrect', exact: true })).toHaveCount(
    0,
  );
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

  await page.getByRole('button', { name: 'Adjust settings', exact: true }).click();
  await page.getByRole('button', { name: 'Plain text', exact: true }).click();
  await page.getByRole('spinbutton', { name: /^Character speed/ }).fill('100');
  await page.getByRole('spinbutton', { name: /^Effective speed/ }).fill('100');
  await page.getByText('Sound and options', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Tone', exact: true }).selectOption('fixed');
  await page.getByRole('spinbutton', { name: 'Tone frequency Hz', exact: true }).fill('700');
  await page.getByRole('spinbutton', { name: /^Start delay/ }).fill('0');
  await page.getByRole('button', { name: 'Start plain text', exact: true }).click();
  expect(Math.abs((await recordingTone(page)).hz - 700)).toBeLessThan(1);
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
  await page.getByText('Notes and more options', { exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download result', exact: true }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(exported.recipe.mode).toBe('plaintext');
  expect(exported.trials[0].answer).toBe(answer);
  expect(exported.trials[0].distance).toBe(1);
  expect(exported.audioSeconds).toBeGreaterThan(0);
  expect(exported.notes).toBe('');
  await page.setViewportSize({ width: 1280, height: 900 });
  await expectAccessible(page, 'copy-plaintext-result-desktop');
  await page.screenshot({ path: '.tmp/copy-plaintext-result-desktop.png', fullPage: true });
});
