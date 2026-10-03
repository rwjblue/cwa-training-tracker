import { expect, type Locator } from '@playwright/test';
import { test } from './fixtures';
import { accountRequest, expectResponsive, signIn } from './helpers';

test.use({ hasTouch: true, extraHTTPHeaders: { 'CF-Connecting-IP': '192.0.2.108' } });

const viewport = { width: 1440, height: 1000 };

test(`interrupted recall stays separate from playback and survives corrected save at ${viewport.width}px`, async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize(viewport);
  const activate = async (control: Locator) => {
    await expect(control).toBeEnabled();

    await control.focus();
    await page.keyboard.press('Enter');
  };
  const navigate = async (name: string) => {
    const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (await menu.isVisible()) await activate(menu);
    await activate(page.getByRole('button', { name, exact: true }));
  };
  // Capture the platform handlers, then exercise the actual claimed transport.
  await page.addInitScript(() => {
    const handlers = new Map<MediaSessionAction, MediaSessionActionHandler | null>();
    const original = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
    navigator.mediaSession.setActionHandler = (action, handler) => {
      handlers.set(action, handler);
      original(action, handler);
    };
    Reflect.set(window, 'recallMediaPlay', () => handlers.get('play')?.({ action: 'play' }));
  });
  await signIn(page);
  await page.clock.setSystemTime(new Date('2026-10-06T16:00:00Z'));
  const { settings } = await (await context.request.get('/api/settings')).json();
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        settings: {
          ...settings,
          level: 'intermediate',
          firstClassDate: '2026-10-08',
          timezone: 'UTC',
        },
      })
    ).ok(),
  ).toBe(true);
  await page.reload();
  const { plan } = await (await context.request.get('/api/plan')).json();
  const task = plan.find(
    (item: { dueDate?: string; exercise?: { type: string; url?: string } }) =>
      item.dueDate === '2026-10-06' &&
      item.exercise?.type === 'audio' &&
      /WD101[-_]10/i.test(item.exercise.url ?? ''),
  );
  expect(task).toBeTruthy();
  // Twelve seconds of synthetic silence; real native movement provides credit.
  const wav = Buffer.alloc(44 + 192000);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(192000, 40);
  await page.route(task.exercise.url, (route) =>
    route.fulfill({ status: 200, contentType: 'audio/wav', body: wav }),
  );
  await activate(
    page
      .getByRole('listitem')
      .filter({
        has: page.getByRole('heading', { name: task.title, exact: true }),
      })
      .getByRole('button', { name: 'Listen & practice', exact: true }),
  );
  const audio = page.getByLabel('Assigned recording', { exact: true });
  await page.clock.install({ time: new Date('2026-10-06T16:00:00Z') });
  await activate(page.getByRole('button', { name: 'Start practice', exact: true }));
  await expect
    .poll(() => audio.evaluate((item: HTMLAudioElement) => item.currentTime))
    .toBeGreaterThan(1.2);
  await activate(page.getByRole('button', { name: 'Start recall timer', exact: true }));
  expect(await audio.evaluate((item: HTMLAudioElement) => item.paused)).toBe(true);
  const position = await audio.evaluate((item: HTMLAudioElement) => item.currentTime);
  await expect(page.getByRole('button', { name: 'Pause recall', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume listening', exact: true })).toBeVisible();
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  await page.clock.runFor(2000);
  await page.clock.fastForward(8000); // A deliberately unobserved delayed sample.
  const interruption = page.getByRole('status').filter({ hasText: 'Recall paused.' });
  await expect(interruption).toContainText('A delay interrupted the timer.');
  await expect(interruption).toContainText('Correct measured time');
  await expect(page.getByRole('button', { name: 'Pause recall', exact: true })).toHaveCount(0);
  const elapsed = await page.locator('.timer-readout').textContent();
  await page.clock.runFor(5000);
  await expect(page.locator('.timer-readout')).toHaveText(elapsed!);
  expect(await audio.evaluate((item: HTMLAudioElement) => item.currentTime)).toBe(position);
  await activate(page.getByRole('button', { name: 'Resume recall timer', exact: true }));
  await page.clock.runFor(2000);
  // Visibility is emulated. This does not claim physical device lock behavior.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(interruption).toContainText('This page was hidden.');

  const hiddenElapsed = await page.locator('.timer-readout').textContent();
  await page.clock.runFor(5000);
  await page.evaluate(() => {
    delete (document as unknown as Record<string, unknown>).hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('.timer-readout')).toHaveText(hiddenElapsed!);
  await activate(page.getByRole('button', { name: 'Inspect Today', exact: true }));
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(0);
  await activate(
    page
      .getByRole('region', { name: 'Current practice block' })
      .getByRole('button', { name: 'Return to practice', exact: true }),
  );
  await expect(interruption).toContainText('This page was hidden.');
  await activate(page.getByRole('button', { name: 'Resume recall timer', exact: true }));
  await page.clock.runFor(1000);
  // A failed app Play settles recall before the request, with readable feedback.
  await audio.evaluate((item: HTMLAudioElement) => {
    const original = item.play;
    item.play = () => {
      item.play = original;
      return Promise.reject(new Error('Synthetic Play denied'));
    };
  });
  await activate(page.getByRole('button', { name: 'Resume listening', exact: true }));
  await expect(page.getByRole('alert')).toContainText('Synthetic Play denied');
  const failedElapsed = await page.locator('.timer-readout').textContent();
  await page.clock.runFor(2000);
  await expect(page.locator('.timer-readout')).toHaveText(failedElapsed!);
  await activate(page.getByRole('button', { name: 'Resume recall timer', exact: true }));
  await page.clock.runFor(1000);
  // Media Session requests use the same pre-play boundary, including rejection.
  await audio.evaluate((item: HTMLAudioElement) => {
    const original = item.play;
    item.play = () => {
      item.play = original;
      return Promise.reject(new Error('Synthetic platform Play denied'));
    };
  });
  await page.evaluate(() => (window as unknown as { recallMediaPlay(): void }).recallMediaPlay());
  await expect(page.getByRole('alert')).toContainText('Synthetic platform Play denied');
  await expect(page.getByRole('button', { name: 'Pause recall', exact: true })).toHaveCount(0);
  await activate(page.getByRole('button', { name: 'Resume recall timer', exact: true }));
  await page.clock.runFor(1000);
  // Native Play also stops recall, then earns only actual heard movement.
  await page.clock.resume();
  await audio.evaluate((item: HTMLAudioElement) => item.play());
  await expect(page.getByRole('button', { name: 'Pause recall', exact: true })).toHaveCount(0);
  await expect
    .poll(() => audio.evaluate((item: HTMLAudioElement) => item.currentTime))
    .toBeGreaterThan(position + 0.5);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveCSS('opacity', '1');
  await expect(
    dialog.getByRole('heading', { name: 'A little progress, worth recording.', exact: true }),
  ).toBeFocused();
  await expect.poll(() => dialog.evaluate((item) => item.scrollTop)).toBe(0);

  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Save practice', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close dialog', exact: true })).toBeFocused();
  const measured = await dialog.getByText(/^Measured \d+\.\d{2} seconds/).textContent();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  await expect(dialog.getByText(/^Measured \d+\.\d{2} seconds/)).toHaveText(measured!);
  await dialog.getByRole('checkbox', { name: 'Correct measured time', exact: true }).check();
  await dialog.getByLabel(/^Corrected total time/).fill('0:30');
  await dialog
    .getByLabel('Correction reason', { exact: true })
    .fill('Focused recall continued during the interruption.');
  await dialog.getByLabel(/^Corrected recall time/).fill('0:31');
  await activate(dialog.getByRole('button', { name: 'Save practice', exact: true }));
  await expect(dialog.getByRole('alert')).toBeVisible();
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(0);
  await dialog.getByLabel(/^Corrected recall time/).fill('0:20');
  await expectResponsive(page, `recall-review-${viewport.width}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const bodies: unknown[] = [];
  let unavailable = true;
  await page.route('**/api/entries', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    bodies.push(route.request().postDataJSON());
    if (unavailable)
      return route.fulfill({ status: 503, json: { error: 'Synthetic recall save failure.' } });
    return route.continue();
  });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Reflect.set(window, 'restoreRecallStorage', () => {
      Storage.prototype.setItem = original;
    });
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('cwa:practice:pending:v1:'))
        throw new DOMException('Synthetic storage full', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await activate(dialog.getByRole('button', { name: 'Save practice', exact: true }));
  await expect(dialog.getByRole('alert')).toContainText('retained for an exact retry');
  await expect(dialog.getByLabel(/^Corrected recall time/)).toBeDisabled();
  unavailable = false;
  await page.evaluate(() =>
    (window as unknown as { restoreRecallStorage(): void }).restoreRecallStorage(),
  );
  await activate(dialog.getByRole('button', { name: 'Save practice', exact: true }));
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => bodies.length).toBeGreaterThanOrEqual(2);
  expect(bodies.every((body) => JSON.stringify(body) === JSON.stringify(bodies[0]))).toBe(true);
  const { entries } = await (await context.request.get('/api/entries')).json();
  expect(entries).toHaveLength(1);
  const saved = entries[0];
  const raw = saved.metadata.evidence.measurement;
  expect(saved.minutes).toBe(0.5);
  expect(raw.recallSeconds).toBeLessThan(12);
  expect(raw.seconds).toBeLessThan(16);
  expect(saved.metadata.evidence.correction).toMatchObject({ seconds: 30, recallSeconds: 20 });
  expect(saved.metadata.evidence.recordings[0].seconds).toBeGreaterThan(1.2);
  await navigate('Practice log');
  await activate(
    page.getByRole('button', { name: `Edit Listening on ${saved.date}`, exact: true }),
  );
  await expect(
    dialog.getByRole('heading', { name: 'A closer look at your practice.', exact: true }),
  ).toBeFocused();
  await expect.poll(() => dialog.evaluate((item) => item.scrollTop)).toBe(0);
  await dialog.getByLabel(/^Corrected recall time/).fill('0:18');
  await page.route(
    `**/api/entries/${saved.id}`,
    (route) =>
      route.fulfill({ status: 503, json: { error: 'Synthetic correction failure. Retry.' } }),
    { times: 1 },
  );
  await activate(dialog.getByRole('button', { name: 'Save changes', exact: true }));
  await expect(dialog.getByRole('alert')).toContainText('Synthetic correction failure. Retry.');
  await expect(dialog.getByLabel(/^Corrected recall time/)).toHaveValue('0:18');
  await activate(dialog.getByRole('button', { name: 'Save changes', exact: true }));
  await expect(dialog).toHaveCount(0);
  await page.getByText('Practice evidence', { exact: true }).click();
  await expect(
    page.getByText(/Learner correction: 30.00 total seconds, 18.00 recall seconds/),
  ).toBeVisible();
});
