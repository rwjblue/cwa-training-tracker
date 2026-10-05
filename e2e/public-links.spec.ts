import { expect, type Page } from '@playwright/test';
import { DEFAULT_PROFILE } from '../src/shared/training';
import {
  DEFAULT_PRACTICE_PREFERENCES,
  PRACTICE_PREFERENCES_KEY,
} from '../src/client/practice-preferences';
import { RECORDING_SPEED_STORAGE_KEY } from '../src/client/recording-variants';
import { test } from './fixtures';
import { e2eOrigin } from './environment';
import { expectResponsive, navigateView, openDisclosure, openPracticeTool } from './helpers';
import { morsePcmBands, observeMorsePcm } from './morse-pcm';
import { syntheticRecording } from './synthetic-recording';

test.use({ hasTouch: true });
const media = (page: Page) => page.getByLabel('Practice audio', { exact: true });
const hashParams = (url: string) => new URLSearchParams(new URL(url).hash.split('?')[1] ?? '');

async function recordingFingerprint(page: Page) {
  await page.getByRole('button', { name: /^(Start|Resume) practice$/, exact: true }).click();
  await expect(media(page)).toHaveAttribute('src', /^blob:/);
  await page.getByRole('button', { name: 'Pause practice', exact: true }).click();
  await expect(media(page)).toHaveJSProperty('paused', true);
  return media(page).evaluate(async (audio: HTMLAudioElement) => {
    const blobs = Reflect.get(window, 'emittedMorsePcmBlobs') as Map<string, Blob>;
    const bytes = await blobs.get(audio.src)!.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  });
}

async function conversation(page: Page) {
  await openDisclosure(page, 'View full conversation');
  const catalog = page
    .locator('details')
    .filter({ has: page.getByText('View full conversation', { exact: true }) });
  return catalog.getByRole('button', { name: /^Seek to word / }).allTextContents();
}

test('public tool links open their selections in a fresh guest browser and on reload', async ({
  page,
  browser,
}) => {
  await observeMorsePcm(page);
  await page.goto('/#tools');
  const library = page.getByRole('region', { name: 'Practice tools', exact: true });
  for (const [label, tool] of [
    ['Word listening', 'words'],
    ['QSO practice', 'qso'],
    ['Stories', 'stories'],
    ['Copy practice', 'copy'],
    ['Sending practice', 'sending'],
    ['Free practice', 'free'],
    ['Morse Runner', 'runner'],
  ])
    await expect(library.getByRole('link', { name: label, exact: true })).toHaveAttribute(
      'href',
      `#practice/${tool}`,
    );
  await library.getByRole('link', { name: 'Word listening', exact: true }).press('Enter');
  await expect(page).toHaveURL(/#practice\/words\?/);
  const selector = page.getByRole('combobox', { name: 'Word list', exact: true });
  await selector.selectOption('common-30');
  await expect.poll(() => hashParams(page.url()).get('list')).toBe('common-30');
  await expect.poll(() => hashParams(page.url()).get('order')).not.toBeNull();
  const fingerprint = await recordingFingerprint(page);
  await openDisclosure(page, 'Word options · pause, repeat and spoken answers');
  await page.getByRole('checkbox', { name: 'Shuffle list', exact: true }).uncheck();
  await expect.poll(() => hashParams(page.url()).get('shuffle')).toBe('0');
  await expect.poll(() => hashParams(page.url()).get('round-shuffle')).toBe('1');
  const shared = page.url();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Word listening', exact: true, level: 1 }),
  ).toBeVisible();
  await expect(selector).toHaveValue('common-30');
  await expect(media(page)).toHaveJSProperty('paused', true);
  expect(await recordingFingerprint(page)).toBe(fingerprint);

  const recipient = await browser.newContext({
    baseURL: e2eOrigin,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  try {
    const other = await recipient.newPage();
    await observeMorsePcm(other);
    await other.goto(shared);
    await expect(
      other.getByRole('heading', { name: 'Word listening', exact: true, level: 1 }),
    ).toBeVisible();
    await expect(other.getByRole('combobox', { name: 'Word list', exact: true })).toHaveValue(
      'common-30',
    );
    await expect(media(other)).toHaveJSProperty('paused', true);
    expect(await recordingFingerprint(other)).toBe(fingerprint);
    await expect(media(other)).toHaveJSProperty('paused', true);
    await expect(other.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  } finally {
    await recipient.close();
  }
});

test('a generated QSO and selected Story share their exact text and sound across guests', async ({
  page,
  browser,
}) => {
  await observeMorsePcm(page);
  await page.goto(
    '/#practice/qso?scenario=pota&cwpm=30&ewpm=20&tone=650&variable=1&text=show&volume=75',
  );
  await expect.poll(() => hashParams(page.url()).get('qso')).not.toBeNull();
  const words = await conversation(page);
  const fingerprint = await recordingFingerprint(page);
  const tones = await page.getByLabel('QSO station tones', { exact: true }).textContent();
  const bands = await morsePcmBands(page);
  expect(bands.bands).toHaveLength(2);
  await page.getByRole('button', { name: 'Check your copy', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Station 1 callsign', exact: true })
    .fill('SYNTHETICPRIVATECOPY');
  await expect.poll(() => hashParams(page.url()).get('view')).toBe('copy');
  const shared = page.url();
  expect(shared).not.toContain('SYNTHETICPRIVATECOPY');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Check your copy', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('textbox', { name: 'Station 1 callsign', exact: true })).toHaveValue(
    '',
  );
  await page.getByRole('button', { name: 'Show answers', exact: true }).click();
  await expect(media(page)).toHaveJSProperty('paused', true);
  expect(await recordingFingerprint(page)).toBe(fingerprint);
  expect(await conversation(page)).toEqual(words);
  await expect(page.getByLabel('QSO station tones', { exact: true })).toHaveText(tones!);
  await expect(media(page)).toHaveJSProperty('paused', true);

  const recipient = await browser.newContext({
    baseURL: e2eOrigin,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  try {
    const other = await recipient.newPage();
    await observeMorsePcm(other);
    await other.addInitScript(
      ({ key, defaults }) => {
        localStorage.setItem(
          key,
          JSON.stringify({
            ...defaults,
            volume: 25,
            qsoScenario: 'ragchew',
            variableQsoPitch: false,
            qsoSettings: {
              ...defaults.qsoSettings,
              characterWpm: 12,
              effectiveWpm: 5,
              tone: 975,
              hideTrainerText: true,
            },
          }),
        );
      },
      { key: PRACTICE_PREFERENCES_KEY, defaults: DEFAULT_PRACTICE_PREFERENCES },
    );
    await other.goto(shared);
    await expect(other.getByRole('combobox', { name: 'QSO scenario', exact: true })).toHaveValue(
      'pota',
    );
    await expect(
      other.getByRole('button', { name: 'Check your copy', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      other.getByRole('textbox', { name: 'Station 1 callsign', exact: true }),
    ).toHaveValue('');
    await other.getByRole('button', { name: 'Show answers', exact: true }).click();
    await expect(media(other)).toHaveJSProperty('paused', true);
    expect(await recordingFingerprint(other)).toBe(fingerprint);
    expect(await conversation(other)).toEqual(words);
    await expect(other.getByLabel('QSO station tones', { exact: true })).toHaveText(tones!);
    expect(await morsePcmBands(other)).toEqual(bands);
    await expect(media(other)).toHaveJSProperty('paused', true);
    await expectResponsive(other, 'public-shared-qso');

    await openPracticeTool(page, 'Stories');
    await page.getByRole('combobox', { name: 'Story', exact: true }).selectOption('story-light');
    await expect.poll(() => hashParams(page.url()).get('story')).toBe('story-light');
    const storyUrl = page.url();
    const storyFingerprint = await recordingFingerprint(page);
    await other.goto(storyUrl);
    await expect(other.getByRole('combobox', { name: 'Story', exact: true })).toHaveValue(
      'story-light',
    );
    await expect(media(other)).toHaveJSProperty('paused', true);
    expect(await recordingFingerprint(other)).toBe(storyFingerprint);
    await expect(media(other)).toHaveJSProperty('paused', true);
  } finally {
    await recipient.close();
  }
});

test('public course sessions and exact recording speeds override a recipient device default', async ({
  page,
  browser,
}) => {
  // Read-only identity fixtures give this sender a different private course
  // default from the fresh guest, without changing any stored account data.
  const user = {
    id: 'public-course-sender',
    email: 'public-course-sender@example.test',
    createdAt: '2026-10-01T00:00:00.000Z',
  };
  const state = {
    accountId: user.id,
    revision: 0,
    generation: 0,
    settings: { ...DEFAULT_PROFILE, level: 'advanced', useGravatar: false },
    plan: [],
  };
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith(`${e2eOrigin}/api/`) && request.method() !== 'GET')
      writes.push(request.method());
  });
  await page.route('**/api/me', (route) => route.fulfill({ json: { user } }));
  await page.route('**/api/account-state', (route) => route.fulfill({ json: { state } }));
  await page.route('**/api/entries', (route) =>
    route.fulfill({ json: { accountId: user.id, generation: 0, revision: 0, entries: [] } }),
  );
  await page.route('**/api/lcwo', (route) => route.fulfill({ json: { state, data: null } }));
  await page.goto('/#course');
  await expect(page).toHaveURL(/#course\?level=advanced&session=1$/);
  await expect(
    page.getByRole('heading', { name: 'Advanced curriculum', exact: true }),
  ).toBeVisible();
  const bareShare = page.url();
  const recipient = await browser.newContext({
    baseURL: e2eOrigin,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  try {
    const fresh = await recipient.newPage();
    await fresh.goto('/#course');
    await expect(fresh).toHaveURL(/#course\?level=beginner&session=1$/);
    await fresh.goto(bareShare);
    await expect(fresh).toHaveURL(bareShare);
    await expect(
      fresh.getByRole('heading', { name: 'Advanced curriculum', exact: true }),
    ).toBeVisible();
    await expect(
      fresh
        .getByRole('navigation', { name: 'Advanced sessions', exact: true })
        .getByRole('link', { name: 'Session 1', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
  } finally {
    await recipient.close();
  }
  await page.goto('/#course?session=4');
  await expect(page).toHaveURL(/#course\?level=advanced&session=4$/);
  await page.goto('/#course?level=fundamental');
  await expect(page).toHaveURL(/#course\?level=fundamental&session=1$/);
  await page.goto('/#course');
  await expect(page).toHaveURL(/#course\?level=advanced&session=1$/);
  expect(writes).toEqual([]);
  await page.addInitScript((key) => localStorage.setItem(key, 'next'), RECORDING_SPEED_STORAGE_KEY);
  await page.route('https://cwa.cwops.org/wp-content/uploads/POTA*.mp3', syntheticRecording(12));
  await page.goto('/#course?level=advanced&session=7');
  await expect(
    page.getByRole('heading', { name: 'Advanced curriculum', exact: true }),
  ).toBeVisible();
  const sessions = page.getByRole('navigation', { name: 'Advanced sessions', exact: true });
  await expect(sessions.getByRole('link', { name: 'Session 7', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const item = {
    id: 's1-d3-t2',
    session: 1,
    title: 'POTA101-20',
    sourceUrl:
      'https://cwops.org/wp-content/uploads/2025/05/CW-Academy-Advanced-Curriculum-v2.1.htm#_Toc172984025',
  };
  await sessions.getByRole('link', { name: `Session ${item.session}`, exact: true }).tap();
  await expect(page).toHaveURL(new RegExp(`#course\\?level=advanced&session=${item.session}$`));
  const exercise = page
    .getByRole('link')
    .filter({ has: page.getByText(item.title, { exact: true }) });
  await expect(exercise).toHaveAttribute('href', `#practice/lesson/advanced/${item.id}`);
  await expectResponsive(page, 'public-course-session');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page
      .getByRole('heading', { name: `Session ${item.session} practice`, exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.tmp/public-course-session-${width}.png` });
  }
  await exercise.tap();
  await expect(
    page.getByRole('heading', {
      name: `Session ${item.session} · ${item.title}`,
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  const audio = page.getByLabel('Assigned recording', { exact: true });
  await expect(audio).toHaveAttribute(
    'src',
    'https://cwa.cwops.org/wp-content/uploads/POTA101_20.mp3',
  );
  await expect(audio).toHaveJSProperty('paused', true);
  await expect(
    page.getByRole('link', { name: 'Official instructions', exact: true }),
  ).toHaveAttribute('href', item.sourceUrl);
  await openDisclosure(page, 'Choose a recording speed');
  await page
    .getByRole('combobox', { name: 'Recording speed', exact: true })
    .selectOption('https://cwa.cwops.org/wp-content/uploads/POTA101_25.mp3');
  await expect.poll(() => hashParams(page.url()).get('recording')).toBe('pota101_25');
  await page.reload();
  await expect(audio).toHaveAttribute(
    'src',
    'https://cwa.cwops.org/wp-content/uploads/POTA101_25.mp3',
  );
  await expect(audio).toHaveJSProperty('paused', true);

  // Reload keeps the syllabus speed available; selecting it removes the override.
  await openDisclosure(page, 'Choose a recording speed');
  await page
    .getByRole('combobox', { name: 'Recording speed', exact: true })
    .selectOption('https://cwa.cwops.org/wp-content/uploads/POTA101_20.mp3');
  await expect.poll(() => hashParams(page.url()).get('recording')).toBeNull();
  await expect(audio).toHaveAttribute(
    'src',
    'https://cwa.cwops.org/wp-content/uploads/POTA101_20.mp3',
  );

  await page.goto('/#practice/recording/pota208_15');
  await expect(
    page.getByRole('heading', { name: 'POTA208-15', exact: true, level: 1 }),
  ).toBeVisible();
  await expect(audio).toHaveAttribute(
    'src',
    'https://cwa.cwops.org/wp-content/uploads/POTA208_15.mp3',
  );
  await expect(audio).toHaveJSProperty('paused', true);
  await openDisclosure(page, 'Choose a recording speed');
  await page
    .getByRole('combobox', { name: 'Recording speed', exact: true })
    .selectOption('https://cwa.cwops.org/wp-content/uploads/POTA208_20.mp3');
  await expect(page).toHaveURL(/#practice\/recording\/pota208_20$/);
  await page.reload();
  await expect(audio).toHaveAttribute(
    'src',
    'https://cwa.cwops.org/wp-content/uploads/POTA208_20.mp3',
  );
  await expect(audio).toHaveJSProperty('paused', true);
});

test('URL traversal retains hidden practice and a refused replacement restores its accepted URL', async ({
  page,
}) => {
  await page.goto('/#practice/stories?story=story-trail');
  await expect.poll(() => hashParams(page.url()).get('pitch')).not.toBeNull();
  const shared = page.url();
  const scratchpad = page.getByRole('textbox', { name: 'Scratchpad', exact: true });
  await scratchpad.fill('Private notes remain with the retained practice.');
  await page.getByRole('button', { name: 'Start practice', exact: true }).tap();
  await expect
    .poll(() => media(page).evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(1.2);
  await navigateView(page, 'Academy guide');
  await expect(page).toHaveURL(/#course\?level=beginner&session=1$/);
  const position = await media(page).evaluate((audio: HTMLAudioElement) => audio.currentTime);
  await expect(media(page)).toHaveJSProperty('paused', true);
  await page.goBack();
  await expect(page).toHaveURL(shared);
  await expect(scratchpad).toHaveValue('Private notes remain with the retained practice.');
  expect(await media(page).evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBe(position);
  await expect(media(page)).toHaveJSProperty('paused', true);
  await page.goForward();
  await expect(page).toHaveURL(/#course\?level=beginner&session=1$/);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Reflect.set(window, 'restorePublicRouteStorage', () => {
      Storage.prototype.setItem = set;
    });
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('cwa:practice:pending:v1:'))
        throw new Error('Synthetic public replacement save refusal');
      return set.call(this, key, value);
    };
    location.hash = '#practice/sending';
  });
  await expect(page).toHaveURL(/#course\?level=beginner&session=1$/);
  await page
    .getByRole('region', { name: 'Current practice block', exact: true })
    .getByRole('button', { name: 'Return to practice', exact: true })
    .tap();
  await expect(page).toHaveURL(shared);
  await expect(page.getByRole('alert')).toContainText('Your session is still here.');
  await expect(scratchpad).toHaveValue('Private notes remain with the retained practice.');
  await expect(media(page)).toHaveJSProperty('paused', true);
  expect(page.url()).not.toContain('Private');
  await page.evaluate(() => Reflect.get(window, 'restorePublicRouteStorage')());
  await openPracticeTool(page, 'Word listening');
  await expect(page).toHaveURL(/#practice\/words\?/);
  await expect.poll(() => hashParams(page.url()).get('order')).not.toBeNull();
  const wordsUrl = page.url();
  await page.evaluate(() => {
    location.hash = '#practice/sending';
  });
  await expect(
    page.getByRole('heading', { name: 'Sending practice', exact: true, level: 1 }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(wordsUrl);
  await expect(
    page.getByRole('heading', { name: 'Word listening', exact: true, level: 1 }),
  ).toBeVisible();
  await page.goForward();
  await expect(
    page.getByRole('heading', { name: 'Sending practice', exact: true, level: 1 }),
  ).toBeVisible();
});
