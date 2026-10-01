import { expect, test, type Locator, type Route } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { accountRequest, expectAccessible, signIn } from './helpers';

test.use({
  hasTouch: true,
  actionTimeout: 10_000,
  extraHTTPHeaders: { 'CF-Connecting-IP': '192.0.2.110' },
});

function recording(seconds: number) {
  const samples = Math.round(seconds * 8000);
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF');
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
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    wav.writeInt16LE(Math.round(1000 * Math.sin((2 * Math.PI * 600 * i) / 8000)), 44 + i * 2);
  return (route: Route) => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '');
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
    return route.fulfill({
      status: range ? 206 : 200,
      contentType: 'audio/wav',
      headers: {
        'Accept-Ranges': 'bytes',
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` } : {}),
      },
      body: wav.subarray(start, end + 1),
    });
  };
}

for (const width of [1440, 390]) {
  test(`course replay uses observed passes and cancels obsolete native Play at ${width}px`, async ({
    page,
    context,
  }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    const activate = async (control: Locator) => {
      await expect(control).toBeEnabled();
      if (width < 600) await control.tap();
      else {
        await control.focus();
        await page.keyboard.press('Enter');
      }
    };
    const toggle = async (control: Locator) => {
      if (width < 600) await control.tap();
      else {
        await control.focus();
        await page.keyboard.press('Space');
      }
    };
    const navigate = async (name: string) => {
      const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
      if (await menu.isVisible()) await activate(menu);
      await activate(page.getByRole('button', { name, exact: true }));
    };
    await page.addInitScript(() => {
      const handlers = new Map<MediaSessionAction, MediaSessionActionHandler | null>();
      Reflect.set(window, 'courseMediaHandlers', handlers);
      const native = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
      navigator.mediaSession.setActionHandler = (action, handler) => {
        handlers.set(action, handler);
        return native(action, handler);
      };
    });
    await signIn(page);
    await page.addInitScript((fixed) => {
      const native = Date;
      const offset = fixed - native.now();
      Reflect.set(
        window,
        'Date',
        new Proxy(native, {
          apply: () => new native(native.now() + offset).toString(),
          construct: (target, args, newTarget) =>
            Reflect.construct(target, args.length ? args : [native.now() + offset], newTarget),
          get: (target, key, receiver) =>
            key === 'now' ? () => native.now() + offset : Reflect.get(target, key, receiver),
        }),
      );
    }, Date.parse('2026-10-06T16:00:00Z'));
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
      (item: { dueDate: string; exercise?: { url?: string } }) =>
        item.dueDate === '2026-10-06' && /WD101[-_]10/i.test(item.exercise?.url ?? ''),
    );
    expect(task.exercise.minimumPasses).toBe(2);
    await page.route(/^https:\/\/(?:[^/]+\.)?cwops\.org\//, recording(3.6));
    await activate(
      page
        .getByRole('listitem')
        .filter({ has: page.getByRole('heading', { name: task.title, exact: true }) })
        .getByRole('button', { name: 'Listen & practice', exact: true }),
    );
    const audio = page.getByLabel('Assigned recording', { exact: true });
    const replay = page.getByRole('checkbox', {
      name: 'Automatically replay required course passes',
    });
    const count = page
      .getByRole('region', { name: 'Listening passes', exact: true })
      .locator('dl > div')
      .filter({ has: page.getByText('This block', { exact: true }) })
      .locator('dd');
    const paused = () => audio.evaluate((el: HTMLAudioElement) => el.paused);
    const start = () =>
      activate(page.getByRole('button', { name: /^(Start|Resume) practice$/, exact: true }));
    const reset = async () => {
      await activate(page.getByRole('button', { name: 'Reset session', exact: true }));
      const discard = page.getByRole('button', { name: 'Discard & reset', exact: true });
      if (await discard.isVisible()) await activate(discard);
      await expect(count).toHaveText('0');
      await expect.poll(paused).toBe(true);
      await audio.evaluate((el: HTMLAudioElement) => {
        el.currentTime = 0;
      });
      await expect
        .poll(() => audio.evaluate((el: HTMLAudioElement) => !el.seeking && el.currentTime < 0.01))
        .toBe(true);
    };
    await expect(replay).not.toBeChecked();
    const originalGenerated = await page.evaluate(() =>
      localStorage.getItem('cwa.practice.preferences.v1'),
    );
    expect(originalGenerated).not.toBeNull();
    await start();
    await expect(count).toHaveText('1', { timeout: 10_000 });
    await expect.poll(paused).toBe(true);
    await expect(page.getByRole('group', { name: 'End of pass choices' })).toBeVisible();
    await page
      .locator('.assigned-recording')
      .screenshot({ path: `.tmp/course-replay-end-${width}.png` });
    await expect(
      page.getByRole('button', { name: 'Start recall timer', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: 'Full listening pass recorded.' }),
    ).toBeVisible();
    await reset();
    await toggle(replay);
    await expect(replay).toBeChecked();
    await start();
    await expect(count).toHaveText('1', { timeout: 10_000 });
    await expect
      .poll(() => audio.evaluate((el: HTMLAudioElement) => !el.paused && el.currentTime < 2))
      .toBe(true);
    expect(await audio.evaluate((el: HTMLAudioElement) => el.playbackRate)).toBe(1);
    expect(await page.evaluate(() => navigator.mediaSession.playbackState)).toBe('playing');
    await expect(count).toHaveText('2', { timeout: 10_000 });
    await expect.poll(paused).toBe(true);
    await expect(page.getByText('The minimum is met.', { exact: false })).toBeVisible();
    // Deliberate extra playback stops again, even with the checkbox on.
    await activate(page.getByRole('button', { name: 'Play another pass', exact: true }));
    await expect(count).toHaveText('3', { timeout: 10_000 });
    await expect.poll(paused).toBe(true);
    await reset();
    await audio.evaluate((el: HTMLAudioElement) => {
      el.currentTime = el.duration - 0.1;
    });
    await expect
      .poll(() => audio.evaluate((el: HTMLAudioElement) => !el.seeking && el.currentTime > 3.4))
      .toBe(true);
    await start();
    await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.ended)).toBe(true);
    await expect(count).toHaveText('0');
    await expect(
      page.getByRole('status').filter({ hasText: 'Some material was skipped.' }),
    ).toBeVisible();
    await expect.poll(paused).toBe(true);

    // Delay only the pending Play call. Earlier pass credit is real native media.
    await page.evaluate(() => {
      const native = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        const control = Reflect.get(window, 'nextReplay');
        if (
          this instanceof HTMLAudioElement &&
          this.dataset.recording === 'true' &&
          this.ended &&
          control
        ) {
          Reflect.set(window, 'nextReplay', undefined);
          if (control === 'reject')
            return Promise.reject(new DOMException('Synthetic autoplay denied', 'NotAllowedError'));
          return new Promise<void>((resolve, reject) => {
            Reflect.set(window, 'releaseReplay', () => native.call(this).then(resolve, reject));
          });
        }
        return native.call(this);
      };
    });
    for (const action of ['pause', 'media', 'recall', 'inspect', 'source', 'preference']) {
      await reset();
      await page.evaluate(() => Reflect.set(window, 'nextReplay', 'hold'));
      await start();
      await expect(count).toHaveText('1', { timeout: 10_000 });
      await expect(
        page.getByRole('status').filter({ hasText: 'Starting listening…' }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Pause practice', exact: true })).toBeVisible();
      const old = await audio.elementHandle();
      if (action === 'pause')
        await activate(page.getByRole('button', { name: 'Pause practice', exact: true }));
      if (action === 'media')
        await page.evaluate(() => {
          const handler = Reflect.get(window, 'courseMediaHandlers').get('pause');
          if (typeof handler !== 'function')
            throw new Error('Pending replay lost its Media Session Pause action');
          handler({ action: 'pause' });
        });
      if (action === 'recall')
        await activate(page.getByRole('button', { name: 'Start recall timer', exact: true }));
      if (action === 'inspect')
        await activate(page.getByRole('button', { name: 'Inspect Today', exact: true }));
      if (action === 'source')
        await page
          .getByRole('combobox', { name: 'Recording speed', exact: true })
          .selectOption(task.exercise.url.replace(/WD101_10/i, 'WD101_13'));
      if (action === 'preference') await toggle(replay);
      await page.evaluate(() => Reflect.get(window, 'releaseReplay')());
      await expect.poll(() => old!.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
      if (action === 'inspect') {
        await activate(page.getByRole('button', { name: 'Return to practice', exact: true }));
      }
      if (action === 'source')
        await page
          .getByRole('combobox', { name: 'Recording speed', exact: true })
          .selectOption(task.exercise.url);
      if (action === 'preference') await toggle(replay);
      await expect(count).toHaveText('1');
      await expect.poll(paused).toBe(true);
      if (action === 'recall')
        await activate(page.getByRole('button', { name: 'Pause recall', exact: true }));
    }
    await reset();
    await page.evaluate(() => Reflect.set(window, 'nextReplay', 'reject'));
    await start();
    await expect(count).toHaveText('1', { timeout: 10_000 });
    await expect(
      page.getByRole('alert').filter({ hasText: 'Automatic replay could not start.' }),
    ).toBeVisible();
    await expect.poll(paused).toBe(true);
    await activate(page.getByRole('button', { name: 'Play another pass', exact: true }));
    await expect(count).toHaveText('2', { timeout: 10_000 });
    await expect.poll(paused).toBe(true);
    // Turning the choice off leaves an already audible pass playing.
    await activate(page.getByRole('button', { name: 'Play another pass', exact: true }));
    await expect
      .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime))
      .toBeGreaterThan(0.5);
    await toggle(replay);
    await expect.poll(paused).toBe(false);
    await activate(page.getByRole('button', { name: 'Pause practice', exact: true }));
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Reflect.set(window, 'restoreReplayStorage', () => {
        Storage.prototype.setItem = original;
      });
      Storage.prototype.setItem = function (key, value) {
        if (key === 'cwa.recording.course-replay.v1')
          throw new DOMException('Synthetic quota', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    await toggle(replay);
    await expect(replay).toBeChecked();
    await expect(
      page.getByRole('status').filter({ hasText: 'could not be remembered on this device' }),
    ).toBeVisible();
    await page.evaluate(() => Reflect.get(window, 'restoreReplayStorage')());
    await activate(page.getByRole('button', { name: 'Retry remembering replay choice' }));
    await expect(page.getByRole('button', { name: 'Retry remembering replay choice' })).toHaveCount(
      0,
    );
    const preferences = await page.evaluate(() => ({
      course: localStorage.getItem('cwa.recording.course-replay.v1'),
      generated: localStorage.getItem('cwa.practice.preferences.v1'),
    }));
    expect(preferences.course).toBe('true');
    expect(preferences.generated).toBe(originalGenerated);
    await expectAccessible(page, `course-replay-${width}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `.tmp/course-replay-${width}.png`, fullPage: true });
    expect((await (await context.request.get('/api/entries')).json()).entries).toEqual([]);
    await reset();
    await navigate('This device');
    const downloaded = page.waitForEvent('download');
    await activate(page.getByRole('button', { name: 'Download device backup', exact: true }));
    const file = await downloaded;
    const bytes = await readFile((await file.path())!);
    expect(JSON.parse(bytes.toString()).shared.courseReplay).toBe(true);
    await page.keyboard.press('Escape');
    await expect(replay).toBeVisible();
    await toggle(replay);
    await expect(replay).not.toBeChecked();
    await navigate('This device');
    const chooser = page.waitForEvent('filechooser');
    await activate(page.getByRole('button', { name: 'Choose device backup', exact: true }));
    await (
      await chooser
    ).setFiles({
      name: 'synthetic-course-replay.json',
      mimeType: 'application/json',
      buffer: bytes,
    });
    await toggle(
      page.getByRole('checkbox', {
        name: 'Also restore shared device preferences used by every account',
      }),
    );
    await activate(page.getByRole('button', { name: 'Restore device work', exact: true }));
    await expect(page.getByRole('status').filter({ hasText: 'restored' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.reload();
    // Cold account/Studio initialization completes before keyboard navigation.
    await expect(
      page.getByRole('heading', { name: 'Your practice studio.', exact: true }),
    ).toBeVisible();
    await navigate('Today');
    await activate(
      page
        .getByRole('listitem')
        .filter({ has: page.getByRole('heading', { name: task.title, exact: true }) })
        .getByRole('button', { name: 'Listen & practice', exact: true }),
    );
    await expect(replay).toBeChecked();
    await expect.poll(paused).toBe(true);
    await expect(count).toHaveText('0');
    await start();
    await expect(count).toHaveText('2', { timeout: 12_000 });
    await expect.poll(paused).toBe(true);
    await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
    const review = page.getByRole('dialog');
    await expect(review).toContainText('2 completed passes');
    await page.keyboard.press('Escape');
    await expect(count).toHaveText('2');
    await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
    let fail = true;
    const bodies: unknown[] = [];
    await page.route('**/api/entries', (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      bodies.push(route.request().postDataJSON());
      return fail
        ? route.fulfill({ status: 503, json: { error: 'Synthetic replay save failure' } })
        : route.continue();
    });
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Reflect.set(window, 'restoreResultStorage', () => {
        Storage.prototype.setItem = original;
      });
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('cwa:practice:pending:v1:'))
          throw new DOMException('Synthetic quota', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    await activate(review.getByRole('button', { name: 'Save practice', exact: true }));
    await expect(review.getByRole('alert')).toContainText('retained for an exact retry');
    fail = false;
    await page.evaluate(() => Reflect.get(window, 'restoreResultStorage')());
    await activate(review.getByRole('button', { name: 'Save practice', exact: true }));
    await expect(review).toHaveCount(0);
    expect(bodies.length).toBeGreaterThanOrEqual(2);
    expect(bodies.every((body) => JSON.stringify(body) === JSON.stringify(bodies[0]))).toBe(true);
    const saved = (await (await context.request.get('/api/entries')).json()).entries;
    expect(saved).toHaveLength(1);
    expect(saved[0].metadata.evidence.recordings[0].passes.durations).toEqual([
      { durationSeconds: 3.6, completedPasses: 2 },
    ]);
    expect(saved[0].metadata.evidence.measurement.seconds).toBeGreaterThan(6.5);
    await activate(
      page
        .getByRole('listitem')
        .filter({ has: page.getByRole('heading', { name: task.title, exact: true }) })
        .getByRole('button', { name: 'Listen & practice', exact: true }),
    );
    await start();
    await expect(count).toHaveText('1', { timeout: 10_000 });
    await expect.poll(paused).toBe(true);
  });
}
