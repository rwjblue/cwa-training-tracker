import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { accountRequest, expectAccessible, signIn } from './helpers';
import type { PracticeSession } from '../src/shared/training';

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
async function terminalResult(page: Page, scope: string): Promise<PracticeSession> {
  await expect
    .poll(() =>
      page.evaluate(
        (scope) =>
          Object.keys(localStorage).filter((key) =>
            key.startsWith(`cwa:runner:result:v1:${encodeURIComponent(scope)}:`),
          ).length,
        scope,
      ),
    )
    .toBeGreaterThan(0);
  return page.evaluate(
    (scope) =>
      Object.entries(localStorage)
        .filter(([key]) => key.startsWith(`cwa:runner:result:v1:${encodeURIComponent(scope)}:`))
        .map(([, raw]) => JSON.parse(raw).entry)
        .at(-1),
    scope,
  );
}
async function refuseWrites(page: Page, refused: boolean) {
  await page.evaluate((refused) => {
    const win = window as typeof window & { runnerNextSetItem?: typeof Storage.prototype.setItem };
    win.runnerNextSetItem ??= Storage.prototype.setItem;
    Storage.prototype.setItem = refused
      ? function (this: Storage, key: string, value: string) {
          if (key.startsWith('cwa:runner:result:v1:') || key.startsWith('cwa:practice:pending:v1:'))
            throw new Error('Synthetic refused result storage');
          win.runnerNextSetItem!.call(this, key, value);
        }
      : win.runnerNextSetItem;
  }, refused);
}
for (const mobile of [false, true]) {
  test(`Runner save-next retains settings, queues before reset and separates identities (${mobile ? 'mobile touch' : 'desktop keyboard'})`, async ({
    page,
    context,
  }) => {
    test.setTimeout(150_000);
    await context.setExtraHTTPHeaders({
      'CF-Connecting-IP': mobile ? '192.0.2.172' : '192.0.2.171',
    });
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    const frame = page.frameLocator('iframe[title="Web Morse Runner practice simulator"]');
    const dialog = page.getByRole('dialog');
    const nextButton = dialog.getByRole('button', { name: 'Save & start next run', exact: true });
    const runShort = async () => {
      await activate(page, frame.getByRole('button', { name: /Run$/ }), mobile);
      await expect.poll(() => frame.locator('#clock').textContent()).toMatch(/00:00:0[2-9]/);
      await activate(page, page.getByRole('button', { name: 'Stop run', exact: true }), mobile);
      await activate(
        page,
        page.getByRole('button', { name: 'Review & save run', exact: true }),
        mobile,
      );
    };
    const fresh = async () => {
      await expect(dialog).toHaveCount(0);
      await expect(frame.getByRole('button', { name: /Run$/ })).toBeEnabled();
      await expect(frame.locator('#clock')).toHaveText('00:00:00');
      await expect(page.getByLabel('0:00 engine time', { exact: true })).toBeVisible();
      await expect(page.locator('#current-practice')).toBeFocused();
    };
    await page.goto('/#practice');
    await activate(page, page.getByRole('button', { name: 'Morse Runner', exact: true }), mobile);
    await runShort();
    const guest = await terminalResult(page, 'guest');
    await refuseWrites(page, true);
    await activate(page, nextButton, mobile);
    await expect(
      dialog.getByRole('alert').filter({ hasText: 'could not save your result' }),
    ).toBeVisible();
    await expect(frame.getByRole('button', { name: /Run$/ })).toHaveCount(0);
    await activate(page, dialog.getByRole('button', { name: 'Cancel', exact: true }), mobile);
    // A real reload exposes recovery without restoring a live engine. The
    // cross-view modal must focus the newly committed studio after cleanup.
    await page.goto('/?runner-next-recovered#logbook');
    await expect(page.locator('iframe')).toHaveCount(0);
    await activate(
      page,
      page.getByRole('button', { name: 'Review finished Runner result', exact: true }),
      mobile,
    );
    await refuseWrites(page, false);
    await activate(page, nextButton, mobile);
    await fresh();
    expect((await context.request.get('/api/entries')).status()).toBe(401);
    expect(
      await page.evaluate(() =>
        Object.entries(localStorage)
          .filter(([key]) => key.startsWith('cwa:practice:pending:v1:guest:'))
          .map(([, raw]) => JSON.parse(raw).id),
      ),
    ).toEqual([guest.id]);

    await signIn(page);
    const { user } = await (await context.request.get('/api/me')).json();
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
      title: 'Synthetic repeated Runner assignment',
      kind: 'simulator',
      done: false,
      targetMinutes: 15,
      dueDate: today,
      notes: '',
      createdAt: `${today}T00:00:00.000Z`,
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
    await page.goto('/?runner-next#overview');
    const row = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: task.title, exact: true }) });
    await activate(page, row.getByRole('button', { name: 'Practice', exact: true }), mobile);
    await frame.getByLabel('Mode', { exact: true }).selectOption('wpx');
    await frame.getByLabel('min.', { exact: true }).fill('3');
    await frame.getByLabel('CW Speed', { exact: true }).fill('22');
    await frame.getByLabel('CW Speed', { exact: true }).press('Tab');
    await frame.getByLabel('Activity', { exact: true }).fill('3');
    await frame.getByLabel('QRM', { exact: true }).check();
    await frame.getByLabel('QSB', { exact: true }).check();
    await activate(page, frame.getByRole('button', { name: /Run$/ }), mobile);
    await expect.poll(() => frame.locator('#clock').textContent()).toMatch(/00:00:0[2-9]/);
    await frame.getByLabel('CW Speed', { exact: true }).fill('24');
    await frame.getByLabel('CW Speed', { exact: true }).press('Tab');
    await activate(page, page.getByRole('button', { name: 'Stop run', exact: true }), mobile);
    const first = await terminalResult(page, user.id);
    await activate(
      page,
      page.getByRole('button', { name: 'Review & save run', exact: true }),
      mobile,
    );
    await dialog.getByLabel(/^Notes/).fill('First separate run; retain this canceled edit');
    await activate(page, dialog.getByRole('button', { name: 'Cancel', exact: true }), mobile);
    expect((await (await context.request.get('/api/entries')).json()).entries).toEqual([]);
    await activate(
      page,
      page.getByRole('button', { name: 'Review & save run', exact: true }),
      mobile,
    );
    await expect(dialog.getByLabel(/^Notes/)).toHaveValue(
      'First separate run; retain this canceled edit',
    );
    await dialog.evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished)),
    );
    await expectAccessible(page, `runner-next-review-${mobile}`);
    await page.screenshot({ path: `.tmp/runner-next-review-${mobile}.png`, fullPage: true });
    await nextButton.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.tmp/runner-next-actions-${mobile}.png` });
    for (const action of ['Cancel', 'Save practice', 'Save & start next run']) {
      const box = await dialog.getByRole('button', { name: action, exact: true }).boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(mobile ? 390 : 1440);
    }
    await refuseWrites(page, true);
    const bodies: string[] = [];
    let loseFirst = true;
    let releaseLost!: () => void;
    const releaseLostResponse = new Promise<void>((resolve) => {
      releaseLost = resolve;
    });
    let lostCommitted = false;
    await page.route('**/api/entries', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      bodies.push(route.request().postData()!);
      if (loseFirst) {
        loseFirst = false;
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        lostCommitted = true;
        await releaseLostResponse;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Synthetic lost committed response' }),
        });
      } else await route.continue();
    });
    await activate(page, nextButton, mobile);
    await expect.poll(() => lostCommitted).toBe(true);
    await expect(nextButton).toBeDisabled();
    if (!mobile) await page.keyboard.press('Enter');
    releaseLost();
    await expect(
      dialog.getByRole('alert').filter({ hasText: 'Synthetic lost committed response' }),
    ).toBeVisible();
    await expect(frame.getByRole('button', { name: /Run$/ })).toHaveCount(0);
    await expect(dialog.getByLabel(/^Notes/)).toBeDisabled();
    await activate(page, dialog.getByRole('button', { name: 'Cancel', exact: true }), mobile);
    await activate(
      page,
      page.getByRole('button', { name: 'Review & save run', exact: true }),
      mobile,
    );
    await activate(page, nextButton, mobile);
    await fresh();
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
    await refuseWrites(page, false);
    await page.unroute('**/api/entries');
    await expect(frame.getByLabel('Mode', { exact: true })).toHaveValue('wpx');
    await expect(frame.getByLabel('min.', { exact: true })).toHaveValue('3');
    await expect(frame.getByLabel('CW Speed', { exact: true })).toHaveValue('24');
    await expect(frame.getByLabel('Activity', { exact: true })).toHaveValue('3');
    await expect(frame.getByLabel('QRM', { exact: true })).toBeChecked();
    await expect(frame.getByLabel('QSB', { exact: true })).toBeChecked();
    await expectAccessible(page, `runner-next-ready-${mobile}`);
    await page.screenshot({ path: `.tmp/runner-next-ready-${mobile}.png`, fullPage: true });

    await runShort();
    const second = await terminalResult(page, user.id);
    expect(second.id).not.toBe(first.id);
    expect(second.createdAt > first.createdAt).toBe(true);
    await dialog.getByLabel(/^Notes/).fill('Second independent run queued offline');
    await dialog.getByRole('checkbox', { name: /^This was a class meeting/ }).check();
    let acknowledge!: () => void;
    const delayed = new Promise<void>((resolve) => {
      acknowledge = resolve;
    });
    let committed = false;
    let offlineFailed = false;
    const offlineBodies: string[] = [];
    await page.route('**/api/entries', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      offlineBodies.push(route.request().postData()!);
      if (!offlineFailed) {
        offlineFailed = true;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Synthetic unavailable upload' }),
        });
        return;
      }
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      committed = true;
      await delayed;
      await route.fulfill({ response });
    });
    await activate(page, nextButton, mobile);
    await fresh();
    await expect(
      page.getByText('Run saved on this device and waiting to upload. Your next run is ready.', {
        exact: true,
      }),
    ).toBeVisible();
    await expectAccessible(page, `runner-next-pending-${mobile}`);
    await page.screenshot({ path: `.tmp/runner-next-pending-${mobile}.png`, fullPage: true });
    await expect.poll(() => offlineFailed).toBe(true);
    expect(
      await page.evaluate(
        (scope) =>
          Object.entries(localStorage)
            .filter(([key]) =>
              key.startsWith(`cwa:practice:pending:v1:${encodeURIComponent(scope)}:`),
            )
            .map(([, raw]) => JSON.parse(raw).id),
        user.id,
      ),
    ).toEqual([second.id]);
    await expect(
      page.getByText(
        'This run is class time, kept separate from required practice and daily goals.',
        { exact: true },
      ),
    ).toBeVisible();
    await activate(page, frame.getByRole('button', { name: /Run$/ }), mobile);
    await expect.poll(() => frame.locator('#clock').textContent()).toMatch(/00:00:0[2-9]/);
    await activate(
      page,
      page.getByRole('button', { name: 'Retry practice uploads', exact: true }),
      mobile,
    );
    await expect.poll(() => committed).toBe(true);
    expect(offlineBodies).toHaveLength(2);
    expect(offlineBodies[1]).toBe(offlineBodies[0]);
    acknowledge();
    await expect
      .poll(() =>
        page.evaluate(
          (scope) =>
            Object.keys(localStorage).filter((key) =>
              key.startsWith(`cwa:practice:pending:v1:${encodeURIComponent(scope)}:`),
            ).length,
          user.id,
        ),
      )
      .toBe(0);
    await expect(frame.getByRole('button', { name: /Stop$/ })).toBeEnabled();
    await activate(page, page.getByRole('button', { name: 'Stop run', exact: true }), mobile);
    const third = await terminalResult(page, user.id);
    expect(new Set([first.id, second.id, third.id]).size).toBe(3);
    expect(third.context).toBe('class');
    await activate(
      page,
      page.getByRole('button', { name: 'Review & save run', exact: true }),
      mobile,
    );
    await expect(dialog.getByRole('checkbox', { name: /^This was a class meeting/ })).toBeChecked();
    await activate(
      page,
      dialog.getByRole('button', { name: 'Save practice', exact: true }),
      mobile,
    );
    await expect(page.getByRole('heading', { name: 'What should I do today?' })).toBeVisible();
    await page.unroute('**/api/entries');
    await activate(page, row.getByRole('button', { name: 'Extra review', exact: true }), mobile);
    await runShort();
    const reviewFirst = await terminalResult(page, user.id);
    expect(reviewFirst.metadata?.practicePurpose).toBe('review');
    await activate(page, nextButton, mobile);
    await fresh();
    await expect(
      page.getByRole('region', { name: 'Runner assignment progress', exact: true }),
    ).toContainText('Extra review and class time do not reduce the required time.');
    await runShort();
    const reviewSecond = await terminalResult(page, user.id);
    expect(reviewSecond.id).not.toBe(reviewFirst.id);
    expect(reviewSecond.metadata?.practicePurpose).toBe('review');
    await activate(
      page,
      dialog.getByRole('button', { name: 'Save practice', exact: true }),
      mobile,
    );
    await expect(page.getByRole('heading', { name: 'What should I do today?' })).toBeVisible();
    const entries: PracticeSession[] = (await (await context.request.get('/api/entries')).json())
      .entries;
    expect(entries).toHaveLength(5);
    for (const measured of [first, second, third]) {
      const saved = entries.find((entry) => entry.id === measured.id)!;
      expect(saved.minutes).toBe(measured.minutes);
      expect(saved.createdAt).toBe(measured.createdAt);
      expect(saved.qsoCount).toBe(measured.qsoCount);
      expect(saved.metadata?.runner).toEqual(measured.metadata?.runner);
      expect(saved.metadata?.plannedTaskId).toBe(task.id);
    }
    expect(entries.filter((entry) => entry.context === 'class')).toHaveLength(2);
    expect(entries.filter((entry) => entry.metadata?.practicePurpose === 'review')).toHaveLength(2);
    await navigate(page, 'Practice log', mobile);
    await expect(page.getByRole('heading', { name: 'Practice log', exact: true })).toBeVisible();
    await navigate(page, 'Your account', mobile);
    const downloading = page.waitForEvent('download');
    await activate(page, page.getByRole('button', { name: 'Export backup', exact: true }), mobile);
    const download = await downloading;
    const backup = JSON.parse(await readFile((await download.path())!, 'utf8'));
    expect(backup.sessions).toEqual(entries);
    const choosing = page.waitForEvent('filechooser');
    await activate(page, page.getByRole('button', { name: 'Import backup', exact: true }), mobile);
    await (
      await choosing
    ).setFiles({
      name: 'synthetic-runner-next-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await activate(
      page,
      page.getByRole('dialog').getByRole('button', { name: 'Import sessions', exact: true }),
      mobile,
    );
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await (await context.request.get('/api/entries')).json()).entries).toEqual(entries);
    await navigate(page, 'Academy guide', mobile);
    await activate(
      page,
      page.getByRole('button', { name: 'Practice report', exact: true }),
      mobile,
    );
    await dialog.getByLabel('From', { exact: true }).fill(today);
    await dialog.getByLabel('Through', { exact: true }).fill(today);
    await expect(dialog).toContainText('First separate run; retain this canceled edit');
    await expect(dialog).toContainText('22 WPM starting speed');
    await expect(dialog).toContainText('24 WPM');
    await expectAccessible(page, `runner-next-report-${mobile}`);
    await page.screenshot({ path: `.tmp/runner-next-report-${mobile}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
