import { expect, test, type Locator } from '@playwright/test';
import { accountRequest, expectResponsive, scopedRequest, signIn } from './helpers';
import { dateInTimezone } from '../src/shared/training';

test.use({ hasTouch: true, extraHTTPHeaders: { 'CF-Connecting-IP': '192.0.2.225' } });

test('optional daily words count actual replay separately from recall and retire once on queued save', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.getByRole('button', { name: /^Word listening Build recognition/ }).click();
  const daily = page.getByRole('region', { name: 'Optional daily word listening', exact: true });
  await expect(daily).toContainText('Public practice needs no account.');
  expect((await context.request.get('/api/entries')).status()).toBe(401);
  await signIn(page);
  const profile = (await (await context.request.get('/api/settings')).json()).settings;
  const timezone = 'Pacific/Honolulu';
  const date = dateInTimezone(new Date(), timezone);
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        settings: { ...profile, timezone, firstClassDate: '' },
      })
    ).ok(),
  ).toBe(true);
  const task = {
    id: 'daily-required',
    title: 'Required work stays independent',
    kind: 'sending',
    done: false,
    notes: '',
    dueDate: date,
    createdAt: new Date().toISOString(),
  };
  expect((await accountRequest(context, 'POST', '/api/plan', { task })).ok()).toBe(true);
  const raw = {
    version: 1,
    type: 'timed',
    measurement: { seconds: 598 },
    recordings: [],
    wordListeningSeconds: 598,
    generatedListening: {
      version: 1,
      overflow: false,
      summaries: [
        {
          mode: 'words',
          listId: 'common-30',
          entryCount: 30,
          characterWpm: 20,
          effectiveWpm: 10,
          toneHz: 600,
          wordGapSeconds: 1,
          shuffle: false,
          repeat: true,
          spokenAnswers: false,
        },
      ],
    },
  };
  for (const fixture of [
    { id: 'daily-before', date },
    { id: 'daily-class', date, context: 'class' },
    { id: 'daily-yesterday', date: '2026-09-29' },
  ])
    expect(
      (
        await scopedRequest(context, 'POST', '/api/entries', {
          entry: {
            ...fixture,
            kind: 'head-copy',
            source: 'morse',
            minutes: 598 / 60,
            notes: 'Synthetic native word evidence',
            createdAt: new Date().toISOString(),
            metadata: { evidence: raw },
          },
        })
      ).ok(),
    ).toBe(true);
  await page.goto('/#overview');
  await page.reload();
  let mobile = false;
  const activate = async (control: Locator) => {
    if (mobile) await control.tap();
    else {
      await control.focus();
      await page.keyboard.press('Enter');
    }
  };
  await expect(daily).toContainText(`${date} · Pacific/Honolulu`);
  await expect(daily.getByLabel('Word listening only')).toContainText('9:58');
  await activate(daily.getByText('Resource and progress details', { exact: true }));
  await expect(daily).toContainText('original daily recording is private and unavailable here');
  await expectResponsive(page, 'daily-words-today');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.screenshot({
      path: `.tmp/parity-queue/issue-25-today-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await activate(daily.getByRole('button', { name: 'Practice words', exact: true }));
  await page.getByRole('combobox', { name: 'Word list', exact: true }).selectOption('custom');
  await page.getByRole('textbox', { name: /^Your word list/ }).fill('E E');
  await page
    .getByRole('spinbutton', { name: 'Extra word pause exact (seconds)', exact: true })
    .fill('0');
  await page
    .getByRole('spinbutton', { name: 'Extra word pause exact (seconds)', exact: true })
    .press('Enter');
  await expect(page.getByRole('checkbox', { name: 'Repeat list', exact: true })).toBeChecked();
  await activate(page.getByRole('button', { name: /^Start practice$/ }));
  const audio = page.getByLabel('Practice audio', { exact: true });
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(0.1);
  await expect(daily).toContainText('Ten-minute listening goal reached');
  // Native looping remains active after the independent milestone.
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused))
    .toBe(false);
  await expect
    .poll(async () => {
      const text = await daily.getByLabel('Word listening only').innerText();
      return /Current listening\s+0:0[4-9]/.test(text);
    })
    .toBe(true);
  await activate(page.getByRole('button', { name: 'Start recall timer', exact: true }));
  expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  await activate(page.getByRole('button', { name: 'Pause recall', exact: true }));
  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  const review = page.getByRole('dialog');
  const rawListening = await review.getByText(/^Measured word listening:/).innerText();
  await activate(review.getByRole('button', { name: 'Cancel', exact: true }));
  const listened = await daily.getByLabel('Word listening only').innerText();
  // Native audio and this short observed recall both use real advancing clocks.
  await activate(page.getByRole('button', { name: 'Resume recall timer', exact: true }));
  await expect(
    page.getByRole('region', { name: 'Today’s practice time', exact: true }),
  ).toContainText('Recall included: 0:02');
  await activate(page.getByRole('button', { name: 'Pause recall', exact: true }));
  await expect(daily.getByLabel('Word listening only')).toHaveText(listened, {
    useInnerText: true,
  });
  await expect(
    page.getByRole('region', { name: 'Today’s practice time', exact: true }),
  ).toContainText('Recall included: 0:02');
  await activate(page.getByRole('button', { name: 'Inspect Today', exact: true }));
  await expect(daily.getByLabel('Word listening only')).toHaveText(listened, {
    useInnerText: true,
  });
  await expectResponsive(page, 'daily-words-retained');
  await activate(daily.getByRole('button', { name: 'Continue word listening', exact: true }));
  await expect(page.getByRole('textbox', { name: /^Your word list/ })).toHaveValue('E E');
  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  await expect(review.getByText(/^Measured word listening:/)).toHaveText(rawListening);
  await activate(review.getByRole('button', { name: 'Cancel', exact: true }));
  mobile = true;
  await page.setViewportSize({ width: 390, height: 844 });
  let fail = true;
  const bodies: unknown[] = [];
  await page.route('**/api/entries', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    bodies.push(route.request().postDataJSON());
    if (fail)
      return route.fulfill({ status: 503, json: { error: 'Synthetic word save unavailable' } });
    return route.continue();
  });
  await activate(page.getByRole('button', { name: 'Review & save', exact: true }));
  await review.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished),
    );
  });
  await expectResponsive(page, 'daily-words-review');
  await activate(review.getByRole('button', { name: 'Save practice', exact: true }));
  await expect(review).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Retry practice uploads', exact: true }),
  ).toBeVisible();
  await expect(daily.getByLabel('Word listening only')).toContainText('Current listening0:00');
  await expect(daily).toContainText('Ten-minute listening goal reached');
  const queuedText = await daily.innerText();
  await expectResponsive(page, 'daily-words-queued');
  fail = false;
  const uploaded = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/entries') &&
      response.request().method() === 'POST' &&
      response.ok(),
  );
  await activate(page.getByRole('button', { name: 'Retry practice uploads', exact: true }));
  await uploaded;
  expect(bodies.at(-1)).toEqual(bodies[0]);
  await expect(daily).toHaveText(queuedText, { useInnerText: true });
  const exported = (await (await context.request.get('/api/export')).json()).sessions;
  const saved = exported.find((entry: { id: string }) => entry.id.startsWith('studio:'));
  expect(saved.metadata.practicePurpose).toBe('review');
  expect(saved.metadata).not.toHaveProperty('plannedTaskId');
  expect(saved.metadata.evidence.wordListeningSeconds).toBeGreaterThan(3);
  expect(saved.metadata.evidence.measurement.recallSeconds).toBeGreaterThanOrEqual(1.5);
  expect(saved.metadata.evidence.measurement.seconds).toBeCloseTo(
    saved.metadata.evidence.wordListeningSeconds +
      saved.metadata.evidence.measurement.recallSeconds,
    5,
  );
  expect((await (await context.request.get('/api/plan')).json()).plan).toEqual([task]);
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await activate(menu);
  await activate(page.getByRole('button', { name: 'Practice log', exact: true }));
  await page
    .getByRole('textbox', { name: 'Search practice log', exact: true })
    .fill('Custom word recognition');
  await activate(page.getByText('Practice evidence', { exact: true }));
  await expect(page.getByText(/^Measured word listening:/)).toBeVisible();
  await expect(page.getByText(/^Played Your word list:/)).toBeVisible();
  await expectResponsive(page, 'daily-words-history');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.screenshot({
      path: `.tmp/parity-queue/issue-25-history-${width}.png`,
      fullPage: true,
    });
  }
});
