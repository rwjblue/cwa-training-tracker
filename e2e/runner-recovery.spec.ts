import { expect, type Locator, type Page } from '@playwright/test';
import { test } from './fixtures';
import { readFile } from 'node:fs/promises';
import type { PracticeSession } from '../src/shared/training';
import { accountRequest, expectAccessible, expectResponsive, signIn } from './helpers';

test.use({ hasTouch: true });

async function activate(page: Page, control: Locator, mobile: boolean) {
  await expect(control).toBeEnabled();
  if (mobile) await control.tap();
  else {
    await control.focus();
    await page.keyboard.press('Enter');
  }
}
async function navigate(page: Page, name: string, mobile: boolean) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await activate(page, menu, mobile);
  await activate(page, page.getByRole('button', { name, exact: true }), mobile);
}
async function retainedResults(page: Page, scope: string) {
  return page.evaluate(
    (scope) =>
      Object.entries(localStorage)
        .filter(([key]) => key.startsWith(`cwa:runner:result:v1:${encodeURIComponent(scope)}:`))
        .map(([, raw]) => JSON.parse(raw)),
    scope,
  );
}

{
  const mobile = true;
  test(`finished Runner recovery preserves start date, mixed speeds and exact retry (${mobile ? 'mobile touch' : 'desktop keyboard'})`, async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await context.setExtraHTTPHeaders({
      'CF-Connecting-IP': mobile ? '192.0.2.152' : '192.0.2.151',
    });
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    let finishAccountSelection!: () => void;
    const accountSelection = new Promise<void>((resolve) => {
      finishAccountSelection = resolve;
    });
    await page.route(
      '**/api/me',
      async (route) => {
        await accountSelection;
        await route.continue();
      },
      { times: 1 },
    );
    await page.goto('/#practice');
    await expect(page.getByText('Tuning in to your workspace…', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Practice log', exact: true, includeHidden: true }),
    ).toBeDisabled();
    finishAccountSelection();
    await activate(page, page.getByRole('button', { name: 'Morse Runner', exact: true }), mobile);
    const runner = page.frameLocator('iframe[title="Web Morse Runner practice simulator"]');
    await runner.getByRole('button', { name: /Run$/ }).click();
    await expect.poll(() => runner.locator('#clock').textContent()).not.toBe('00:00:00');
    await activate(page, page.getByRole('button', { name: 'Stop run', exact: true }), mobile);
    await expect.poll(async () => (await retainedResults(page, 'guest')).length).toBe(1);
    const [guest] = await retainedResults(page, 'guest');
    expect(guest.reviewed).toBe(false);
    expect((await context.request.get('/api/entries')).status()).toBe(401);
    await page.reload();
    await navigate(page, 'Practice log', mobile);
    await expect(
      page.getByRole('heading', { name: 'Finished Runner results to review', exact: true }),
    ).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
    await activate(
      page,
      page.getByRole('button', { name: 'Discard retained Runner result', exact: true }),
      mobile,
    );
    await activate(page, page.getByRole('button', { name: 'Keep result', exact: true }), mobile);
    expect((await retainedResults(page, 'guest'))[0]).toEqual(guest);
    await navigate(page, 'This device', mobile);
    const guestDownload = page.waitForEvent('download');
    await activate(
      page,
      page.getByRole('button', { name: 'Download device backup', exact: true }),
      mobile,
    );
    const guestFile = await guestDownload;
    const guestBackup = JSON.parse(await readFile((await guestFile.path())!, 'utf8'));
    expect(guestBackup.stores.runnerResults).toEqual([guest]);
    expect(guestBackup.stores.practice).toEqual([]);
    await page.keyboard.press('Escape');
    await activate(
      page,
      page.getByRole('button', { name: 'Discard retained Runner result', exact: true }),
      mobile,
    );
    await activate(
      page,
      page.getByRole('button', { name: 'Confirm discard result', exact: true }),
      mobile,
    );
    await expect.poll(async () => (await retainedResults(page, 'guest')).length).toBe(0);
    await navigate(page, 'This device', mobile);
    const guestChooser = page.waitForEvent('filechooser');
    await activate(
      page,
      page.getByRole('button', { name: 'Choose device backup', exact: true }),
      mobile,
    );
    await (
      await guestChooser
    ).setFiles({
      name: guestFile.suggestedFilename(),
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(guestBackup)),
    });
    await expect(page.getByRole('region', { name: 'Review device restore' })).toBeVisible();
    await activate(
      page,
      page.getByRole('button', { name: 'Restore device work', exact: true }),
      mobile,
    );
    await expect.poll(async () => (await retainedResults(page, 'guest')).length).toBe(1);
    expect((await retainedResults(page, 'guest'))[0]).toEqual(guest);
    await page.keyboard.press('Escape');

    await signIn(page);
    const { user } = await (await context.request.get('/api/me')).json();
    await navigate(page, 'Practice log', mobile);
    await expect(
      page.getByRole('heading', { name: 'Finished Runner results to review', exact: true }),
    ).toHaveCount(0);
    expect((await retainedResults(page, 'guest'))[0]).toEqual(guest);
    expect((await (await context.request.get('/api/entries')).json()).entries).toEqual([]);
    const { settings } = await (await context.request.get('/api/settings')).json();
    expect(
      (
        await accountRequest(context, 'PUT', '/api/settings', {
          settings: {
            ...settings,
            timezone: 'America/New_York',
            level: 'intermediate',
            firstClassDate: '2026-10-01',
          },
        })
      ).ok(),
    ).toBe(true);
    const task = {
      id: crypto.randomUUID(),
      title: 'Synthetic midnight Runner review',
      kind: 'simulator',
      done: false,
      dueDate: '2026-09-30',
      notes: '',
      createdAt: '2026-09-30T12:00:00.000Z',
      exercise: {
        type: 'morse-runner',
        url: 'https://fritzsche.github.io/WebMorseRunner/',
        settings: {
          mode: 'SingleCall',
          wpm: 20,
          durationSeconds: 60,
          activity: 1,
          conditions: { qrm: false, qrn: false, qsb: false, flutter: false, lids: false },
        },
      },
    };
    expect((await accountRequest(context, 'POST', '/api/plan', { task })).ok()).toBe(true);
    // Offset Date only. Native AudioWorklet/performance clocks advance normally;
    // reload retains the same offset instead of restarting the calendar clock.
    await page.addInitScript(() => {
      if (window !== window.top) return;
      const NativeDate = Date;
      const ShiftedDate = new Proxy(NativeDate, {
        construct(target, args) {
          return Reflect.construct(
            target,
            args.length
              ? args
              : [
                  NativeDate.now() +
                    Number(sessionStorage.getItem('synthetic-runner-date-offset') ?? 0),
                ],
          );
        },
        get(target, key, receiver) {
          if (key === 'now')
            return () =>
              NativeDate.now() +
              Number(sessionStorage.getItem('synthetic-runner-date-offset') ?? 0);
          return Reflect.get(target, key, receiver);
        },
      });
      Reflect.set(window, 'Date', ShiftedDate);
    });
    await page.evaluate(() =>
      sessionStorage.setItem(
        'synthetic-runner-date-offset',
        String(Date.parse('2026-09-30T20:00:00.000Z') - Date.now()),
      ),
    );
    await page.goto('/?runner-recovery#overview');
    const row = page
      .getByRole('region', { name: 'What should I do today?' })
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: task.title, exact: true }) });
    await activate(page, row.getByRole('button', { name: 'Extra review', exact: true }), mobile);
    await expect(runner.getByRole('button', { name: /Run$/ })).toBeEnabled();
    // This is a real run crossing midnight, not a forged postMessage result.
    await page.evaluate(() => {
      const currentOffset = Number(sessionStorage.getItem('synthetic-runner-date-offset'));
      sessionStorage.setItem(
        'synthetic-runner-date-offset',
        String(Date.parse('2026-10-01T03:59:58.000Z') - (Date.now() - currentOffset)),
      );
    });
    await runner.getByRole('button', { name: /Run$/ }).click();
    await expect.poll(() => runner.locator('#clock').textContent()).not.toBe('00:00:00');
    await runner.getByLabel('CW Speed', { exact: true }).fill('24');
    await runner.getByLabel('CW Speed', { exact: true }).press('Tab');
    await expect.poll(() => runner.locator('#clock').textContent()).toMatch(/00:00:0[4-9]/);
    await activate(page, page.getByRole('button', { name: 'Stop run', exact: true }), mobile);
    await expect.poll(async () => (await retainedResults(page, user.id)).length).toBe(1);
    const [captured] = await retainedResults(page, user.id);
    expect(captured.entry).toMatchObject({
      id: `runner:${captured.entry.metadata.runner.runId}`,
      date: '2026-09-30',
      metadata: {
        plannedTaskId: task.id,
        practicePurpose: 'review',
        runner: {
          attribution: { version: 1, timezone: 'America/New_York' },
          status: 'stopped',
          settings: { wpm: 20 },
        },
      },
    });
    expect(captured.entry).not.toHaveProperty('characterWpm');
    expect(
      captured.entry.metadata.runner.speedHistory.map((segment: { wpm: number }) => segment.wpm),
    ).toEqual([20, 24]);
    expect(captured.entry.metadata.runner.runStartedAt < '2026-10-01T04:00:00.000Z').toBe(true);
    expect(captured.entry.metadata.runner.runEndedAt > '2026-10-01T04:00:00.000Z').toBe(true);
    expect(captured.entry.createdAt).toBe(captured.entry.metadata.runner.runEndedAt);
    expect(captured.entry.minutes * 60).toBeCloseTo(
      captured.entry.metadata.runner.elapsedSeconds,
      8,
    );
    expect((await (await context.request.get('/api/entries')).json()).entries).toEqual([]);
    await page.evaluate(() => {
      const offset = Number(sessionStorage.getItem('synthetic-runner-date-offset'));
      sessionStorage.setItem(
        'synthetic-runner-date-offset',
        String(Date.parse('2026-10-01T16:00:00.000Z') - (Date.now() - offset)),
      );
    });
    await page.goto('/#logbook');
    await expect(page.locator('iframe')).toHaveCount(0);
    const recovery = page.getByRole('region', {
      name: 'Finished Runner results to review',
      exact: true,
    });
    await expectAccessible(page, `runner-recovery-list-${mobile ? 'mobile' : 'desktop'}`);

    const review = page.getByRole('button', { name: 'Review finished Runner result', exact: true });
    await activate(page, review, mobile);
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', { name: 'A little progress, worth recording.', exact: true }),
    ).toBeFocused();
    await expect(dialog.getByLabel('Practice date', { exact: true })).toHaveValue('2026-09-30');
    await expect(dialog.getByLabel('Practice date', { exact: true })).toHaveAttribute(
      'readonly',
      '',
    );
    await dialog.getByRole('combobox', { name: /^Performance rating/ }).selectOption('fair');
    const notes = 'Synthetic delayed Runner review, keep after cancellation.';
    await dialog.getByLabel(/^Notes/).fill(notes);
    await activate(page, dialog.getByRole('button', { name: 'Cancel', exact: true }), mobile);
    await activate(page, review, mobile);
    await expect(dialog.getByRole('combobox', { name: /^Performance rating/ })).toHaveValue('fair');
    await expect(dialog.getByLabel(/^Notes/)).toHaveValue(notes);
    await expect(dialog).toContainText('20 WPM starting speed');
    await expect(dialog).toContainText('24 WPM');
    await expect(dialog).toContainText('America/New_York');
    await dialog.evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished)),
    );
    await expectResponsive(page, `runner-recovery-review-${mobile ? 'mobile' : 'desktop'}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );

    const submitted: PracticeSession[] = [];
    await page.route('**/api/entries', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      submitted.push(route.request().postDataJSON());
      if (submitted.length === 1) {
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        return route.abort('failed');
      }
      return route.continue();
    });
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('cwa:practice:pending:v1:'))
          throw new DOMException('Synthetic quota', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    await activate(
      page,
      dialog.getByRole('button', { name: 'Save practice', exact: true }),
      mobile,
    );
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(
      dialog.getByText('Your reviewed fields are retained for an exact retry.', { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByLabel(/^Notes/)).toBeDisabled();
    const [frozen] = await retainedResults(page, user.id);
    expect(frozen.reviewed).toBe(true);
    expect(frozen.entry).toEqual(submitted[0]);
    expect(frozen.entry.metadata.runnerReviewedAt > frozen.entry.createdAt).toBe(true);
    await activate(page, dialog.getByRole('button', { name: 'Cancel', exact: true }), mobile);
    await page.reload();
    await activate(
      page,
      page.getByRole('button', { name: 'Reopen submitted Runner review', exact: true }),
      mobile,
    );
    await expect(dialog.getByLabel(/^Notes/)).toHaveValue(notes);
    await expect(dialog.getByLabel(/^Notes/)).toBeDisabled();
    const retry = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/entries') &&
        response.request().method() === 'POST' &&
        response.status() === 200,
    );
    await activate(
      page,
      dialog.getByRole('button', { name: 'Save practice', exact: true }),
      mobile,
    );
    expect((await (await retry).json()).duplicate).toBe(true);
    await expect(dialog).toHaveCount(0);
    expect(submitted).toHaveLength(2);
    expect(submitted[1]).toEqual(submitted[0]);
    await expect.poll(async () => (await retainedResults(page, user.id)).length).toBe(0);
    const entries = (await (await context.request.get('/api/entries')).json()).entries;
    expect(entries).toEqual([frozen.entry]);
    expect(entries[0].metadata.assessment).toEqual({
      version: 1,
      source: 'self-reported',
      performanceRating: 'fair',
    });
    const storedTask = (await (await context.request.get('/api/plan')).json()).plan.find(
      (item: { id: string }) => item.id === task.id,
    );
    expect(storedTask.done).toBe(false);
    await navigate(page, 'Practice log', mobile);
    await activate(page, page.getByText('Practice evidence', { exact: true }), mobile);
    await expect(page.getByRole('main')).toContainText('20 WPM starting speed');
    await expect(page.getByRole('main')).toContainText('24 WPM');
    await expectAccessible(page, `runner-recovery-history-${mobile ? 'mobile' : 'desktop'}`);

    await navigate(page, 'This device', mobile);
    const chooserDevice = page.waitForEvent('filechooser');
    await activate(
      page,
      page.getByRole('button', { name: 'Choose device backup', exact: true }),
      mobile,
    );
    await (
      await chooserDevice
    ).setFiles({
      name: guestFile.suggestedFilename(),
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(guestBackup)),
    });
    await expect(page.getByRole('alert')).toContainText(
      'Open that same account or guest scope before restoring it.',
    );
    await page.keyboard.press('Escape');
    await navigate(page, 'Academy guide', mobile);
    await activate(
      page,
      page.getByRole('button', { name: 'Practice report', exact: true }),
      mobile,
    );
    await expect(page.getByRole('dialog')).toContainText('20 WPM starting speed');
    await expect(page.getByRole('dialog')).toContainText('24 WPM');
    await expect(page.getByRole('dialog')).toContainText('America/New_York');
    await expectAccessible(page, `runner-recovery-report-${mobile ? 'mobile' : 'desktop'}`);
  });
}

{
  const mobile = false;
  test(`Runner storage refusal permits zero-time restart and exact canceled retry (${mobile ? 'mobile touch' : 'desktop keyboard'})`, async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await context.setExtraHTTPHeaders({
      'CF-Connecting-IP': mobile ? '192.0.2.154' : '192.0.2.153',
    });
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await signIn(page);
    const { user } = await (await context.request.get('/api/me')).json();
    await page.route('**/vendor/web-morse-runner/integration/main.js', (route) => route.abort());
    await page.goto('/#practice');
    await activate(page, page.getByRole('button', { name: 'Morse Runner', exact: true }), mobile);
    // The real load-timeout boundary has no acknowledged practice/result to discard.
    await expect(
      page.getByText('No practice time was recorded. Start a new run when you’re ready.', {
        exact: true,
      }),
    ).toBeVisible({ timeout: 25_000 });
    const originalRemove = await page.evaluateHandle(() => Storage.prototype.removeItem);
    await page.evaluate(() => {
      const remove = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function (key) {
        if (key.startsWith('cwa:runner:result:v1:'))
          throw new DOMException('Synthetic removal refusal', 'SecurityError');
        return remove.call(this, key);
      };
    });
    await page.unroute('**/vendor/web-morse-runner/integration/main.js');
    await activate(page, page.getByRole('button', { name: 'Start new run', exact: true }), mobile);
    const runner = page.frameLocator('iframe[title="Web Morse Runner practice simulator"]');
    await activate(page, runner.getByRole('button', { name: /Run$/ }), mobile);
    await expect.poll(() => runner.locator('#clock').textContent()).toMatch(/00:00:0[2-9]/);
    await activate(page, page.getByRole('button', { name: 'Stop run', exact: true }), mobile);
    await expect.poll(async () => (await retainedResults(page, user.id)).length).toBe(1);
    // The destructive confirmation must count the acknowledged terminal inventory.
    await navigate(page, 'Your account', mobile);
    await activate(
      page,
      page.getByRole('button', { name: 'Reset practice data', exact: true }),
      mobile,
    );
    const reset = page.getByRole('dialog', { name: 'Start with a fresh page?', exact: true });
    await expect(reset).toContainText('1 finished Runner results');
    await page.keyboard.press('Escape');
    await navigate(page, 'Practice studio', mobile);
    // A restored old unreviewed draft may coexist with an immutable queue body.
    // Review must display the exact submission it will retry, rather than draft fields.
    const [oldDraft] = await retainedResults(page, user.id);
    const firstQueued = {
      ...oldDraft.entry,
      notes: 'Earlier immutable queue submission',
      context: 'class',
      metadata: { ...oldDraft.entry.metadata, runnerReviewedAt: new Date().toISOString() },
    };
    await page.route('**/api/entries', (route) =>
      route.request().method() === 'POST' ? route.abort('failed') : route.continue(),
    );
    await page.evaluate(
      ({ scope, entry }) => {
        localStorage.setItem(
          `cwa:practice:pending:v1:${encodeURIComponent(scope)}:${encodeURIComponent(entry.id)}`,
          JSON.stringify(entry),
        );
      },
      { scope: user.id, entry: firstQueued },
    );
    await activate(
      page,
      page.getByRole('button', { name: 'Review & save run', exact: true }),
      mobile,
    );
    const restoredReview = page.getByRole('dialog');
    await expect(restoredReview.getByLabel(/^Notes/)).toHaveValue(firstQueued.notes);
    await expect(restoredReview.getByLabel(/^Notes/)).toBeDisabled();
    await expect(
      restoredReview.getByRole('checkbox', { name: /^This was a class meeting/ }),
    ).toBeChecked();
    await activate(
      page,
      restoredReview.getByRole('button', { name: 'Cancel', exact: true }),
      mobile,
    );
    await page.evaluate(
      ({ scope, id }) => {
        localStorage.removeItem(
          `cwa:practice:pending:v1:${encodeURIComponent(scope)}:${encodeURIComponent(id)}`,
        );
      },
      { scope: user.id, id: firstQueued.id },
    );
    await page.unroute('**/api/entries');
    // An actual result still cannot be discarded when removal is refused.
    await activate(page, page.getByRole('button', { name: 'Start new run', exact: true }), mobile);
    await activate(
      page,
      page.getByRole('button', { name: 'Discard & start new run', exact: true }),
      mobile,
    );
    await expect(page.getByRole('alert')).toContainText(
      'could not remove the retained Runner result',
    );
    expect(await retainedResults(page, user.id)).toHaveLength(1);
    await page.evaluate((remove) => {
      Storage.prototype.removeItem = remove;
    }, originalRemove);
    await activate(
      page,
      page.getByRole('button', { name: 'Discard & start new run', exact: true }),
      mobile,
    );
    await activate(page, runner.getByRole('button', { name: /Run$/ }), mobile);
    await expect.poll(() => runner.locator('#clock').textContent()).toMatch(/00:00:0[2-9]/);
    // Make both durable result writes and pending submission writes unavailable.
    await page.evaluate(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('cwa:runner:result:v1:') || key.startsWith('cwa:practice:pending:v1:'))
          throw new DOMException('Synthetic quota', 'QuotaExceededError');
        return set.call(this, key, value);
      };
    });
    await activate(page, page.getByRole('button', { name: 'Stop run', exact: true }), mobile);
    await expect(page.getByRole('alert')).toContainText('Keep this page open');
    expect(await retainedResults(page, user.id)).toEqual([]);
    await activate(
      page,
      page.getByRole('button', { name: 'Review & save run', exact: true }),
      mobile,
    );
    const dialog = page.getByRole('dialog');
    const notes = `Exact open-page submission ${mobile ? 'mobile' : 'desktop'}`;
    await dialog.getByLabel(/^Notes/).fill(notes);
    await activate(page, dialog.getByRole('button', { name: 'Cancel', exact: true }), mobile);
    await activate(
      page,
      page.getByRole('button', { name: 'Review & save run', exact: true }),
      mobile,
    );
    await expect(dialog.getByLabel(/^Notes/)).toHaveValue(notes);
    const posts: PracticeSession[] = [];
    await page.route('**/api/entries', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      posts.push(route.request().postDataJSON());
      if (posts.length === 1) {
        expect((await route.fetch()).status()).toBe(201);
        return route.abort('failed');
      }
      return route.continue();
    });
    await activate(
      page,
      dialog.getByRole('button', { name: 'Save practice', exact: true }),
      mobile,
    );
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog.getByLabel(/^Notes/)).toBeDisabled();
    await activate(page, dialog.getByRole('button', { name: 'Cancel', exact: true }), mobile);
    await activate(
      page,
      page.getByRole('button', { name: 'Review & save run', exact: true }),
      mobile,
    );
    await expect(dialog.getByLabel(/^Notes/)).toHaveValue(notes);
    await expect(dialog.getByLabel(/^Notes/)).toBeDisabled();
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.playState === 'running' &&
              animation.effect?.getTiming().iterations !== Infinity,
          )
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
    await expectResponsive(page, `runner-volatile-retry-${mobile ? 'mobile' : 'desktop'}`);

    await activate(
      page,
      dialog.getByRole('button', { name: 'Save practice', exact: true }),
      mobile,
    );
    await expect(dialog).toHaveCount(0);
    expect(posts).toHaveLength(2);
    expect(posts[1]).toEqual(posts[0]);
    expect((await (await context.request.get('/api/entries')).json()).entries).toEqual([posts[0]]);
    // Only the actual server acknowledgement retires this online-only result.
    await expect(
      page.getByRole('heading', { name: 'Your practice for today.', exact: true }),
    ).toBeVisible();
  });
}
