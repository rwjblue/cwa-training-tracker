import { expect, type Locator, type Page } from '@playwright/test';
import { test } from './fixtures';
import {
  openDisclosure,
  openPracticeTool,
  navigateView,
  expectAccessible,
  expectResponsive,
  signIn,
} from './helpers';

test.use({ hasTouch: true, extraHTTPHeaders: { 'CF-Connecting-IP': '192.0.2.107' } });

async function speed(page: Page, character: number, effective: number) {
  // This journey owns selected-but-unplayed setup and save recovery, not live edits.
  // Pause before arranging multiple keyboard values so intermediate live setups
  // do not legitimately consume the bounded evidence inventory.
  const pause = page.getByRole('button', { name: 'Pause practice', exact: true });
  if (await pause.isVisible()) await pause.click();
  const settings = page.locator('details').filter({ has: page.getByText(/^Sound settings ·/) });
  if (!(await settings.evaluate((element: HTMLDetailsElement) => element.open)))
    await settings.getByText(/^Sound settings ·/).click();
  for (const [label, value, min] of [
    ['Character speed', character, 5],
    ['Effective speed', effective, 3],
  ] as const) {
    const slider = page.getByRole('slider', { name: label, exact: true });
    await slider.press('Home');
    for (let index = min; index < value; index++) await slider.press('ArrowRight');
  }
}

const viewport = { width: 390, height: 844 };

test(`generated listening saves only applied setups and retains exact content at ${viewport.width}px`, async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize(viewport);
  const activate = async (control: Locator) => {
    await expect(control).toBeEnabled();
    await control.tap();
  };
  const navigate = async (name: string) => {
    const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (await menu.isVisible()) await activate(menu);
    await activate(
      page.getByRole(['Your account', 'This device'].includes(name) ? 'button' : 'link', {
        name,
        exact: true,
      }),
    );
  };
  await signIn(page);
  await openPracticeTool(page, 'Word listening', activate);
  const audio = page.getByLabel('Practice audio', { exact: true });
  const listen = async () => {
    await activate(page.getByRole('button', { name: /^(Start|Resume) practice$/, exact: true }));
    await expect
      .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
      .toBeGreaterThan(1.25);
  };
  await page.getByRole('combobox', { name: 'Word list', exact: true }).selectOption('custom');
  const custom = 'E E I';
  await page.getByRole('textbox', { name: /^Your word list/ }).fill(custom);
  await speed(page, 20, 10);
  await listen();
  await activate(page.getByRole('button', { name: 'Save', exact: true }));
  await activate(page.getByRole('button', { name: 'Cancel', exact: true }));
  await expect(page.getByRole('textbox', { name: /^Your word list/ })).toHaveValue(custom);
  await page.getByRole('combobox', { name: 'Word list', exact: true }).selectOption('common-30');
  await speed(page, 25, 15);
  await listen();
  await activate(page.getByRole('button', { name: 'Pause practice', exact: true }));
  await speed(page, 30, 20); // A paused selected setup has not played.
  await audio.evaluate((element: HTMLAudioElement) => {
    const original = element.play;
    element.play = function () {
      element.play = original;
      return Promise.reject(new Error('Synthetic playback denied'));
    };
  });
  await activate(page.getByRole('button', { name: /^(Start|Resume) practice$/, exact: true }));
  await expect(page.getByRole('alert')).toContainText(
    'Audio was interrupted. Press Play to try again.',
  );
  await page
    .getByRole('textbox', { name: 'Scratchpad', exact: true })
    .fill('Keep only the two played setups.');
  await navigateView(page, 'Today', activate);
  const retained = page.getByRole('region', { name: 'Current practice block', exact: true });
  await activate(retained.getByRole('button', { name: 'Return to practice', exact: true }));
  expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  await activate(page.getByRole('button', { name: 'Save', exact: true }));
  const review = page.getByRole('dialog');
  const reviewTitle = review.getByRole('heading', {
    name: 'Save practice',
    exact: true,
  });
  const firstPlayed = review.getByText(/^Played Your word list:/);
  const expectInsideReview = async (control: Locator) => {
    await expect
      .poll(() =>
        control.evaluate((element) => {
          const dialog = element.closest('[role="dialog"]') as HTMLElement;
          const bounds = element.getBoundingClientRect();
          const viewport = dialog.getBoundingClientRect();
          const top = viewport.top + dialog.clientTop;
          const left = viewport.left + dialog.clientLeft;
          return (
            bounds.top >= top &&
            bounds.bottom <= top + dialog.clientHeight &&
            bounds.left >= left &&
            bounds.right <= left + dialog.clientWidth
          );
        }),
      )
      .toBe(true);
  };
  await expect(reviewTitle).toBeFocused();
  await expect.poll(() => review.evaluate((element) => element.scrollTop)).toBe(0);
  await expect(firstPlayed).not.toBeVisible();

  await page.keyboard.press('Shift+Tab');
  await expect(review.getByRole('button', { name: 'Save practice', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(review.getByRole('button', { name: 'Close dialog', exact: true })).toBeFocused();
  await expect.poll(() => review.evaluate((element) => element.scrollTop)).toBe(0);
  await expectInsideReview(reviewTitle);
  await expect(firstPlayed).not.toBeVisible();
  await openDisclosure(review, 'Measured results and practice evidence');
  await expect(review).toContainText('20 character / 10 effective WPM');
  await expect(review).toContainText('25 character / 15 effective WPM');
  await expect(review).not.toContainText('30 character / 20 effective WPM');
  await openDisclosure(review, 'Speed, rating and on-air observations');
  await expect(page.getByLabel('Character WPM', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Character WPM', { exact: true })).toHaveAttribute('readonly', '');
  await expect(page.getByLabel('Effective WPM', { exact: true })).toHaveValue('');
  await firstPlayed.scrollIntoViewIfNeeded();

  const bodies: unknown[] = [];
  let unavailable = true;
  await page.route('**/api/entries', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    bodies.push(route.request().postDataJSON());
    if (unavailable)
      return route.fulfill({ status: 503, json: { error: 'Synthetic listening save failure.' } });
    return route.continue();
  });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Reflect.set(window, 'restoreGeneratedStorage', () => {
      Storage.prototype.setItem = original;
    });
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('cwa:practice:pending:v1:'))
        throw new DOMException('Synthetic storage full', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await activate(review.getByRole('button', { name: 'Save practice', exact: true }));
  await expect(review.getByRole('alert')).toContainText('retained for an exact retry');
  await expect(review.getByRole('textbox', { name: /^Notes/ })).toBeDisabled();
  await expectResponsive(page, `generated-review-${viewport.width}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  unavailable = false;
  await page.evaluate(() =>
    (window as unknown as { restoreGeneratedStorage: () => void }).restoreGeneratedStorage(),
  );
  const wordReply = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/entries' && response.request().method() === 'POST',
  );
  await activate(review.getByRole('button', { name: 'Save practice', exact: true }));
  await expect(review).toHaveCount(0);
  if (!(await wordReply).ok()) {
    // Closing review can mean a durable device receipt, not a server receipt.
    const uploaded = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/entries' &&
        response.request().method() === 'POST' &&
        [200, 201].includes(response.status()) &&
        JSON.stringify(response.request().postDataJSON()) === JSON.stringify(bodies[0]),
    );
    await activate(page.getByRole('button', { name: 'Retry practice uploads', exact: true }));
    await uploaded;
  }
  await expect.poll(() => bodies.length).toBeGreaterThanOrEqual(2);
  expect(bodies.every((body) => JSON.stringify(body) === JSON.stringify(bodies[0]))).toBe(true);
  const saved = (await (await context.request.get('/api/export')).json()).sessions[0];
  expect(saved.metadata.evidence.generatedListening).toMatchObject({
    version: 1,
    overflow: false,
    summaries: [
      { mode: 'words', listId: 'custom', entryCount: 3, characterWpm: 20, effectiveWpm: 10 },
      { mode: 'words', listId: 'common-30', entryCount: 30, characterWpm: 25, effectiveWpm: 15 },
    ],
  });
  expect(saved).not.toHaveProperty('characterWpm');
  expect(saved).not.toHaveProperty('effectiveWpm');
  expect(saved.metadata).not.toHaveProperty('wordList');
  expect(JSON.stringify(saved.metadata.evidence)).not.toContain(custom);
  await navigate('Practice log');
  await activate(page.getByText('Practice evidence', { exact: true }));
  await expect(page.getByText(/20 character \/ 10 effective WPM/)).toBeVisible();
  await expect(page.getByText(/25 character \/ 15 effective WPM/)).toBeVisible();
  await activate(
    page.getByRole('button', { name: `Edit Head copy on ${saved.date}`, exact: true }),
  );
  const editTitle = review.getByRole('heading', {
    name: 'Edit practice',
    exact: true,
  });
  await expect(editTitle).toBeFocused();
  await expect.poll(() => review.evaluate((element) => element.scrollTop)).toBe(0);
  await expect(firstPlayed).not.toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect(review.getByRole('button', { name: 'Save changes', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(review).toHaveCount(0);
  await expectAccessible(page, `generated-history-${viewport.width}`);

  await openPracticeTool(page, 'QSO practice', activate);
  await page
    .getByRole('combobox', { name: 'QSO scenario', exact: true })
    .selectOption('short-contact');
  await activate(page.getByRole('button', { name: 'Reveal text', exact: true }));
  await page.getByText('View full conversation', { exact: true }).click();
  const transcript = await page.locator('.trainer-catalog').innerText();
  const calls = [
    ...new Set([...transcript.matchAll(/\bDE ([A-Z0-9]+)\b/g)].map((match) => match[1])),
  ];
  await speed(page, 20, 10);
  await page.getByRole('checkbox', { name: 'Variable pitch', exact: true }).uncheck();
  await page.getByRole('slider', { name: 'Sidetone', exact: true }).press('End');
  await expect(page.getByLabel('QSO station tones', { exact: true })).toContainText('950 Hz');
  await expect.poll(() => page.locator('.trainer-catalog').innerText()).toBe(transcript);
  await listen();
  await speed(page, 25, 15);
  await expect.poll(() => page.locator('.trainer-catalog').innerText()).toBe(transcript);
  await activate(page.getByRole('button', { name: 'Save', exact: true }));
  for (const call of calls) await expect(review).toContainText(call);
  await activate(review.getByRole('button', { name: 'Cancel', exact: true }));
  await expect.poll(() => page.locator('.trainer-catalog').innerText()).toBe(transcript);
  await activate(page.getByRole('button', { name: 'Check your copy', exact: true }));
  await activate(page.getByRole('button', { name: 'Replay QSO', exact: true }));
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(0.25);
  await activate(page.getByRole('button', { name: 'Show answers', exact: true }));
  await page.getByText('View full conversation', { exact: true }).click();
  await expect.poll(() => page.locator('.trainer-catalog').innerText()).toBe(transcript);
  await page.getByRole('combobox', { name: 'QSO scenario', exact: true }).selectOption('pota');
  await listen();
  await speed(page, 30, 20);
  await activate(page.getByRole('button', { name: 'Save', exact: true }));
  await expect(review).toContainText('20 character / 10 effective WPM');
  await expect(review).toContainText('25 character / 15 effective WPM');
  await expect(review).not.toContainText('30 character / 20 effective WPM');
  const qsoBodyStart = bodies.length;
  unavailable = true;
  const refused = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/entries' &&
      response.request().method() === 'POST' &&
      response.status() === 503,
  );
  await activate(review.getByRole('button', { name: 'Save practice', exact: true }));
  await expect(review).toHaveCount(0);
  await refused;
  const uploads = page.getByRole('region', { name: 'Practice upload status', exact: true });
  await expect(uploads).toContainText('Synthetic listening save failure.');
  unavailable = false;
  const uploaded = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/entries' &&
      response.request().method() === 'POST' &&
      [200, 201].includes(response.status()) &&
      JSON.stringify(response.request().postDataJSON()) === JSON.stringify(bodies[qsoBodyStart]),
  );
  await activate(uploads.getByRole('button', { name: 'Retry practice uploads', exact: true }));
  await uploaded;
  await expect(uploads).toHaveCount(0);
  const qsoBodies = bodies.slice(qsoBodyStart);
  expect(qsoBodies).toHaveLength(2);
  expect(qsoBodies[1]).toEqual(qsoBodies[0]);
  const exported = await (await context.request.get('/api/export')).json();
  const qso = exported.sessions.find(
    (entry: { metadata: { practiceTool: string } }) => entry.metadata.practiceTool === 'qso',
  );
  expect(qso.metadata.evidence.generatedListening.summaries).toMatchObject([
    {
      mode: 'qso',
      scenarioId: 'short-contact',
      characterWpm: 20,
      effectiveWpm: 10,
      tonesHz: [1000, 950],
    },
    {
      mode: 'qso',
      scenarioId: 'short-contact',
      characterWpm: 25,
      effectiveWpm: 15,
      tonesHz: [1000, 950],
    },
    { mode: 'qso', scenarioId: 'pota', characterWpm: 25, effectiveWpm: 15, tonesHz: [1000, 950] },
  ]);
  expect(qso.metadata.evidence.generatedListening.summaries[0].stations).toEqual(
    qso.metadata.evidence.generatedListening.summaries[1].stations,
  );
  expect(JSON.stringify(qso.metadata.evidence)).not.toContain(transcript);
  await navigate('Academy guide');
  await activate(page.getByRole('button', { name: 'Practice report', exact: true }));
  await page.getByLabel('From', { exact: true }).fill(saved.date);
  await page.getByLabel('Through', { exact: true }).fill(qso.date);
  const report = page.getByRole('dialog', { name: 'Your practice report', exact: true });
  await expect(report).toContainText('20 character / 10 effective WPM');
  await expect(report).toContainText('25 character / 15 effective WPM');
  await expect(report).toContainText(
    qso.metadata.evidence.generatedListening.summaries[0].stations[0],
  );
  await expect(report).toContainText('station tones 1000 / 950 Hz');
  await expectAccessible(page, `generated-report-${viewport.width}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
