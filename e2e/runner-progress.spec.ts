import { expect, test, type Locator, type Page } from '@playwright/test';
import { accountRequest, scopedRequest, expectAccessible, signIn } from './helpers';
import { createRunnerRun, RUNNER_REVISION } from '../src/shared/runner';
import type { PlannedTask } from '../src/shared/plan';
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
const displayTime = (seconds: number, ceil = false) => {
  const whole = ceil ? Math.ceil(seconds) : Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};
async function expectTotal(region: Locator, label: string, value: string) {
  await expect(
    region
      .locator('dl > div')
      .filter({ hasText: new RegExp(`^${label}`) })
      .locator('dd'),
  ).toHaveText(value);
}
for (const mobile of [false, true]) {
  test(`cumulative Runner progress separates saved/current, retry and completion (${mobile ? 'mobile touch' : 'desktop keyboard'})`, async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await context.setExtraHTTPHeaders({
      'CF-Connecting-IP': mobile ? '192.0.2.162' : '192.0.2.161',
    });
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto('/#practice');
    await activate(page, page.getByRole('button', { name: 'Morse Runner', exact: true }), mobile);
    await expect(page.getByRole('region', { name: 'Runner assignment progress' })).toHaveCount(0);
    const frame = page.frameLocator('iframe[title="Web Morse Runner practice simulator"]');
    await frame.getByRole('button', { name: /Run$/ }).click();
    await expect.poll(() => frame.locator('#clock').textContent()).not.toBe('00:00:00');
    await activate(page, page.getByRole('button', { name: 'Stop run', exact: true }), mobile);
    await expect(page.getByRole('region', { name: 'Runner assignment progress' })).toHaveCount(0);
    expect((await context.request.get('/api/entries')).status()).toBe(401);
    await signIn(page);
    const { settings: profile } = await (await context.request.get('/api/settings')).json();
    expect(
      (
        await accountRequest(context, 'PUT', '/api/settings', {
          settings: { ...profile, timezone: 'UTC' },
        })
      ).ok(),
    ).toBe(true);
    const today = new Date().toISOString().slice(0, 10);
    const task: PlannedTask = {
      id: crypto.randomUUID(),
      title: 'Synthetic cumulative Runner assignment',
      kind: 'simulator',
      targetMinutes: 10.1,
      dueDate: today,
      done: false,
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
    const fixture = (id: string): PracticeSession => {
      const settings = {
        ...(task.exercise!.type === 'morse-runner'
          ? task.exercise!.settings
          : (() => {
              throw new Error();
            })()),
        durationSeconds: 300,
      };
      const { lastSequence: _, ...run } = createRunnerRun(id, settings);
      return {
        id: `runner:${id}`,
        date: today,
        kind: 'simulator',
        minutes: 5,
        notes: 'Synthetic archived run',
        createdAt: `${today}T00:05:00.000Z`,
        metadata: {
          plannedTaskId: task.id,
          practicePurpose: 'assigned',
          elapsedSeconds: 300,
          runner: {
            ...run,
            status: 'completed',
            elapsedSeconds: 300,
            revision: RUNNER_REVISION,
            runStartedAt: `${today}T00:00:00.000Z`,
            runEndedAt: `${today}T00:05:00.000Z`,
            attribution: { version: 1, timezone: 'UTC' },
          },
        },
      };
    };
    for (const id of ['first', 'second', 'extra-review', 'class']) {
      const entry = fixture(id);
      if (id === 'extra-review') entry.metadata!.practicePurpose = 'review';
      if (id === 'class') entry.context = 'class';
      expect((await scopedRequest(context, 'POST', '/api/entries', entry)).status()).toBe(201);
    }
    expect((await scopedRequest(context, 'POST', '/api/entries', fixture('first'))).status()).toBe(
      200,
    );
    await page.goto('/?runner-progress#overview');
    const row = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: task.title, exact: true }) });
    const progress = page.getByRole('region', { name: 'Runner assignment progress', exact: true });
    await expectTotal(progress, 'Saved time', '10:00');
    await expectTotal(progress, 'Current required time', '0:00');
    await expectTotal(progress, 'Remaining time', '0:06');
    await activate(page, row.getByRole('button', { name: 'Practice', exact: true }), mobile);
    await expectTotal(progress, 'Saved time', '10:00');
    await frame.getByRole('button', { name: /Run$/ }).click();
    await expect.poll(() => frame.locator('#clock').textContent()).toMatch(/00:00:0[2-9]/);
    await activate(page, page.getByRole('button', { name: 'Inspect Today', exact: true }), mobile);
    await expect(page.getByRole('heading', { name: 'What should I do today?' })).toBeVisible();
    const retained = await page.evaluate(() =>
      Object.entries(localStorage)
        .filter(
          ([key]) =>
            key.startsWith('cwa:runner:result:v1:') &&
            !key.startsWith('cwa:runner:result:v1:guest:'),
        )
        .map(([, value]) => JSON.parse(value)),
    );
    const first = retained[0].entry as PracticeSession;
    const seconds = first.minutes * 60;
    await expectTotal(progress, 'Current required time', displayTime(seconds));
    await expectTotal(progress, 'Combined time', displayTime(600 + seconds));
    await expectTotal(
      progress,
      'Remaining time',
      displayTime(Math.max(0, 606 - seconds - 600), true),
    );
    await expectAccessible(page, `runner-progress-today-${mobile ? 'mobile' : 'desktop'}`);
    await page.screenshot({
      path: `.tmp/runner-progress-today-${mobile ? 'mobile' : 'desktop'}.png`,
      fullPage: true,
    });
    await activate(
      page,
      page.getByRole('button', { name: 'Return to practice', exact: true }),
      mobile,
    );
    await expect(
      page.getByText('Run stopped. Your confirmed practice time and results are ready to save.', {
        exact: true,
      }),
    ).toBeVisible();
    await activate(
      page,
      page.getByRole('button', { name: 'Review & save run', exact: true }),
      mobile,
    );
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/^Notes/).fill('Canceled cumulative draft');
    await activate(page, dialog.getByRole('button', { name: 'Cancel', exact: true }), mobile);
    await expectTotal(progress, 'Combined time', displayTime(600 + seconds));
    await activate(
      page,
      page.getByRole('button', { name: 'Review & save run', exact: true }),
      mobile,
    );
    await expect(dialog.getByLabel(/^Notes/)).toHaveValue('Canceled cumulative draft');
    const assignedClass = dialog.getByRole('checkbox', {
      name: 'This was a class meeting (kept separate from practice goals)',
      exact: true,
    });
    if (mobile) await assignedClass.tap();
    else {
      await assignedClass.focus();
      await page.keyboard.press('Space');
    }
    await activate(page, dialog.getByRole('button', { name: 'Cancel', exact: true }), mobile);
    await expectTotal(progress, 'Current required time', '0:00');
    await expectTotal(progress, 'Combined time', '10:00');
    await activate(
      page,
      page.getByRole('button', { name: 'Review & save run', exact: true }),
      mobile,
    );
    await expect(assignedClass).toBeChecked();
    if (mobile) await assignedClass.tap();
    else {
      await assignedClass.focus();
      await page.keyboard.press('Space');
    }
    await activate(page, dialog.getByRole('button', { name: 'Cancel', exact: true }), mobile);
    await expectTotal(progress, 'Current required time', displayTime(seconds));
    await activate(
      page,
      page.getByRole('button', { name: 'Review & save run', exact: true }),
      mobile,
    );
    const restoreSet = await page.evaluateHandle(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('cwa:practice:pending:v1:'))
          throw new DOMException('Synthetic pending refusal', 'QuotaExceededError');
        return original.call(this, key, value);
      };
      return original;
    });
    const bodies: PracticeSession[] = [];
    await page.route('**/api/entries', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      bodies.push(route.request().postDataJSON());
      if (bodies.length === 1)
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Synthetic retry boundary' }),
        });
      return route.continue();
    });
    await activate(
      page,
      dialog.getByRole('button', { name: 'Save practice', exact: true }),
      mobile,
    );
    await expect(dialog.getByRole('alert')).toContainText('Synthetic retry boundary');
    await expect(dialog.getByLabel(/^Notes/)).toBeDisabled();
    await activate(page, dialog.getByRole('button', { name: 'Cancel', exact: true }), mobile);
    await activate(
      page,
      page.getByRole('button', { name: 'Review & save run', exact: true }),
      mobile,
    );
    await expect(dialog.getByLabel(/^Notes/)).toHaveValue('Canceled cumulative draft');
    await activate(
      page,
      dialog.getByRole('button', { name: 'Save practice', exact: true }),
      mobile,
    );
    await expect(dialog).toHaveCount(0);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]);
    await page.evaluate((original) => {
      Storage.prototype.setItem = original;
    }, restoreSet);
    await restoreSet.dispose();
    await page.unroute('**/api/entries');
    await expectTotal(progress, 'Saved time', displayTime(600 + seconds));
    await expectTotal(progress, 'Current required time', '0:00');
    await expectTotal(progress, 'Combined time', displayTime(600 + seconds));
    await activate(page, row.getByRole('button', { name: 'Practice', exact: true }), mobile);
    await frame.getByRole('button', { name: /Run$/ }).click();
    await expect
      .poll(() => frame.locator('#clock').textContent(), { timeout: 15_000 })
      .toMatch(/00:00:0[7-9]/);
    await activate(page, page.getByRole('button', { name: 'Stop run', exact: true }), mobile);
    await expect(progress).toContainText('Time requirement met.');
    const beforeComplete = (await (await context.request.get('/api/entries')).json()).entries;
    await activate(
      page,
      page.getByRole('button', { name: 'Complete exercise', exact: true }),
      mobile,
    );
    await expect(page.getByRole('button', { name: 'Reopen exercise', exact: true })).toBeVisible();
    expect((await (await context.request.get('/api/entries')).json()).entries).toEqual(
      beforeComplete,
    );
    await activate(
      page,
      page.getByRole('button', { name: 'Reopen exercise', exact: true }),
      mobile,
    );
    await expect(
      page.getByRole('button', { name: 'Complete exercise', exact: true }),
    ).toBeVisible();
    expect((await (await context.request.get('/api/entries')).json()).entries).toEqual(
      beforeComplete,
    );
    await expectAccessible(page, `runner-progress-studio-${mobile ? 'mobile' : 'desktop'}`);
    await progress.screenshot({
      path: `.tmp/runner-progress-studio-${mobile ? 'mobile' : 'desktop'}.png`,
    });
    await activate(
      page,
      page.getByRole('button', { name: 'Review & save run', exact: true }),
      mobile,
    );
    await activate(
      page,
      dialog.getByRole('button', { name: 'Save practice', exact: true }),
      mobile,
    );
    await expect(dialog).toHaveCount(0);
    await expectTotal(progress, 'Current required time', '0:00');
    await expect(progress).toContainText('Time requirement met.');
    const entries = (await (await context.request.get('/api/entries')).json()).entries;
    expect(entries).toHaveLength(6);
    expect(new Set(entries.map((entry: PracticeSession) => entry.id)).size).toBe(6);
    expect(
      (await (await context.request.get('/api/plan')).json()).plan.find(
        (item: PlannedTask) => item.id === task.id,
      ).done,
    ).toBe(false);
    await activate(page, row.getByRole('button', { name: 'Extra review', exact: true }), mobile);
    await frame.getByRole('button', { name: /Run$/ }).click();
    await expect.poll(() => frame.locator('#clock').textContent()).not.toBe('00:00:00');
    await activate(page, page.getByRole('button', { name: 'Stop run', exact: true }), mobile);
    await expectTotal(progress, 'Current required time', '0:00');
    await expect(progress).toContainText(
      'Extra review and class time do not reduce the required time.',
    );
    await activate(
      page,
      page.getByRole('button', { name: 'Review & save run', exact: true }),
      mobile,
    );
    const classChoice = dialog.getByRole('checkbox', {
      name: 'This was a class meeting (kept separate from practice goals)',
      exact: true,
    });
    if (mobile) await classChoice.tap();
    else {
      await classChoice.focus();
      await page.keyboard.press('Space');
    }
    await activate(page, dialog.getByRole('button', { name: 'Cancel', exact: true }), mobile);
    await expectTotal(progress, 'Current required time', '0:00');
    await activate(
      page,
      page.getByRole('button', { name: 'Review & save run', exact: true }),
      mobile,
    );
    await activate(
      page,
      dialog.getByRole('button', { name: 'Save practice', exact: true }),
      mobile,
    );
    await expect(dialog).toHaveCount(0);
    await expectTotal(
      progress,
      'Saved time',
      displayTime(
        entries
          .filter(
            (entry: PracticeSession) =>
              entry.context !== 'class' && entry.metadata?.practicePurpose !== 'review',
          )
          .reduce((total: number, entry: PracticeSession) => total + entry.minutes * 60, 0),
      ),
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
