import { expect, type Browser, type Page } from '@playwright/test';
import { defaultCopyRecipe, type CopyRecipe } from '../src/shared/copy-practice';
import type { RunnerSettings } from '../src/shared/runner';
import { test } from './fixtures';
import { expectResponsive, openDisclosure } from './helpers';

test.use({ hasTouch: true });

async function withFreshGuest(
  browser: Browser,
  url: string,
  inspect: (page: Page) => Promise<void>,
) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await page.goto(url);
    await inspect(page);
  } finally {
    await context.close();
  }
}

const params = (url: URL) => new URLSearchParams(url.hash.split('?')[1]);
const copyRoute = (recipe: CopyRecipe) =>
  `#practice/copy?${new URLSearchParams({ recipe: JSON.stringify(recipe) })}`;
const copyRecipeInUrl = (url: URL): CopyRecipe | undefined => {
  const recipe = params(url).get('recipe');
  return recipe ? (JSON.parse(recipe) as CopyRecipe) : undefined;
};
const runnerRoute = (settings: RunnerSettings) =>
  `#practice/runner?${new URLSearchParams({
    mode: settings.mode,
    wpm: String(settings.wpm),
    seconds: String(settings.durationSeconds),
    activity: String(settings.activity),
    conditions: Object.entries(settings.conditions)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name)
      .join(','),
  })}`;

test('a public Copy recipe opens its controls and shares edits with a fresh guest', async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const recipe = {
    ...defaultCopyRecipe('words'),
    characterWpm: 32,
    effectiveWpm: 18,
    wordCollection: 'short' as const,
    adaptive: false,
    toneMode: 'fixed' as const,
    toneHz: 750,
  };
  await page.goto(`/${copyRoute(recipe)}`);
  await expect(
    page.getByRole('heading', { name: 'Copy practice', exact: true, level: 1 }),
  ).toBeVisible();
  const copy = page.getByRole('region', { name: 'Copy practice', exact: true });
  await expect(copy.getByRole('button', { name: 'Word copy', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await openDisclosure(copy, 'Round settings');
  const characterSpeed = copy.getByRole('spinbutton', { name: /Minimum character speed/ });
  await expect(characterSpeed).toHaveValue('32');
  await expect(copy.getByRole('spinbutton', { name: /Starting effective speed/ })).toHaveValue(
    '18',
  );
  await expect(copy.getByRole('combobox', { name: 'Word collection', exact: true })).toHaveValue(
    'short',
  );
  await expect(copy.getByRole('checkbox', { name: /^Adaptive speed:/ })).not.toBeChecked();
  await openDisclosure(copy, 'Sound and options');
  await expect(copy.getByRole('combobox', { name: 'Tone', exact: true })).toHaveValue('fixed');
  await expect(copy.getByRole('spinbutton', { name: /Tone frequency/ })).toHaveValue('750');

  await characterSpeed.fill('36');
  await expect(page).toHaveURL((url) => copyRecipeInUrl(url)?.characterWpm === 36);
  const sharedUrl = page.url();
  await expectResponsive(page, 'public-copy-settings');

  await withFreshGuest(browser, sharedUrl, async (fresh) => {
    const reopened = fresh.getByRole('region', { name: 'Copy practice', exact: true });
    await openDisclosure(reopened, 'Round settings');
    await expect(reopened.getByRole('spinbutton', { name: /Minimum character speed/ })).toHaveValue(
      '36',
    );
    await expect(
      reopened.getByRole('spinbutton', { name: /Starting effective speed/ }),
    ).toHaveValue('18');
    await expect(
      reopened.getByRole('combobox', { name: 'Word collection', exact: true }),
    ).toHaveValue('short');
    await expect(
      reopened.getByRole('button', { name: 'Start word copy', exact: true }),
    ).toBeEnabled();
    await expect(fresh.getByText(/Recovered on this device/)).toHaveCount(0);
  });

  // This public catalog row offers letters, figures, custom groups and words.
  // Selecting an option keeps the lesson identity without creating an assignment.
  const lessonPath = '#practice/lesson/intermediate/s1-d1-t4';
  await page.goto(`/${lessonPath}`);
  await openDisclosure(copy, 'Round settings');
  await expect(copy.getByRole('combobox', { name: 'Assignment option', exact: true })).toHaveValue(
    '0',
  );
  await copy.getByRole('combobox', { name: 'Assignment option', exact: true }).selectOption('1');
  await copy.getByRole('spinbutton', { name: /^Character speed/ }).fill('31');
  await expect(page).toHaveURL(
    (url) =>
      url.hash.startsWith(`${lessonPath}?`) &&
      copyRecipeInUrl(url)?.groupKind === 'figures' &&
      copyRecipeInUrl(url)?.characterWpm === 31,
  );
  const lessonUrl = page.url();
  await expect(page.getByRole('button', { name: 'Complete exercise', exact: true })).toHaveCount(0);
  await page.reload();
  await openDisclosure(copy, 'Round settings');
  await expect(copy.getByRole('combobox', { name: 'Character set', exact: true })).toHaveValue(
    'figures',
  );
  await expect(copy.getByRole('spinbutton', { name: /^Character speed/ })).toHaveValue('31');
  await expectResponsive(page, 'public-copy-lesson-settings');
  await withFreshGuest(browser, lessonUrl, async (fresh) => {
    const reopened = fresh.getByRole('region', { name: 'Copy practice', exact: true });
    await openDisclosure(reopened, 'Round settings');
    await expect(
      reopened.getByRole('combobox', { name: 'Character set', exact: true }),
    ).toHaveValue('figures');
    await expect(reopened.getByRole('spinbutton', { name: /^Character speed/ })).toHaveValue('31');
    await expect(
      reopened.getByRole('button', { name: 'Start code groups', exact: true }),
    ).toBeEnabled();
    await expect(fresh.getByRole('button', { name: 'Complete exercise', exact: true })).toHaveCount(
      0,
    );
  });
});

test('Runner setup edits update the shareable URL before Run and reopen for a fresh guest', async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const settings: RunnerSettings = {
    mode: 'WPX',
    wpm: 30,
    durationSeconds: 180,
    activity: 4,
    conditions: { qrm: true, qrn: false, qsb: false, flutter: false, lids: false },
  };
  await page.goto(`/${runnerRoute(settings)}`);
  const runner = page.frameLocator('iframe[title="Web Morse Runner practice simulator"]');
  await expect(runner.getByRole('button', { name: /Run$/ })).toBeEnabled();
  await expect(runner.getByLabel('Mode', { exact: true })).toHaveValue('wpx');
  await expect(runner.getByLabel('CW Speed', { exact: true })).toHaveValue('30');
  await expect(runner.getByLabel('min.', { exact: true })).toHaveValue('3');
  await expect(runner.getByLabel('Activity', { exact: true })).toHaveValue('4');
  await expect(runner.getByRole('checkbox', { name: 'QRM', exact: true })).toBeChecked();

  await runner.getByLabel('CW Speed', { exact: true }).fill('37');
  await runner.getByLabel('Activity', { exact: true }).fill('6');
  await runner.getByRole('checkbox', { name: 'QRN', exact: true }).check();
  await runner
    .getByRole('group', { name: 'Station', exact: true })
    .getByRole('textbox', { name: 'Call', exact: true })
    .fill('N0PRIVATE');
  await expect(page).toHaveURL(
    (url) =>
      params(url).get('wpm') === '37' &&
      params(url).get('activity') === '6' &&
      params(url).get('conditions') === 'qrm,qrn',
  );
  await expect(page.getByRole('button', { name: 'Stop run', exact: true })).toHaveCount(0);
  const sharedUrl = page.url();
  expect(sharedUrl).not.toContain('N0PRIVATE');
  await expectResponsive(page, 'public-runner-setup');

  await withFreshGuest(browser, sharedUrl, async (fresh) => {
    const reopened = fresh.frameLocator('iframe[title="Web Morse Runner practice simulator"]');
    await expect(reopened.getByRole('button', { name: /Run$/ })).toBeEnabled();
    await expect(reopened.getByLabel('CW Speed', { exact: true })).toHaveValue('37');
    await expect(reopened.getByLabel('Activity', { exact: true })).toHaveValue('6');
    await expect(reopened.getByRole('checkbox', { name: 'QRN', exact: true })).toBeChecked();
    await expect(
      reopened
        .getByRole('group', { name: 'Station', exact: true })
        .getByRole('textbox', { name: 'Call', exact: true }),
    ).not.toHaveValue('N0PRIVATE');
    await expect(fresh.getByRole('button', { name: 'Stop run', exact: true })).toHaveCount(0);
  });

  const lessonPath = '#practice/lesson/intermediate/s1-d2-t6';
  await page.goto(`/${lessonPath}`);
  await expect(runner.getByRole('button', { name: /Run$/ })).toBeEnabled();
  await expect(runner.getByLabel('CW Speed', { exact: true })).toHaveValue('10');
  await expect(runner.getByLabel('min.', { exact: true })).toHaveValue('15');
  await runner.getByLabel('Mode', { exact: true }).selectOption('wpx');
  await runner.getByLabel('CW Speed', { exact: true }).fill('28');
  await runner.getByLabel('Activity', { exact: true }).fill('5');
  await expect(page).toHaveURL(
    (url) =>
      url.hash.startsWith(`${lessonPath}?`) &&
      params(url).get('mode') === 'WPX' &&
      params(url).get('wpm') === '28' &&
      params(url).get('activity') === '5',
  );
  const lessonUrl = page.url();
  await expect(page.getByRole('button', { name: 'Complete exercise', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(runner.getByRole('button', { name: /Run$/ })).toBeEnabled();
  await expect(runner.getByLabel('Mode', { exact: true })).toHaveValue('wpx');
  await expect(runner.getByLabel('CW Speed', { exact: true })).toHaveValue('28');
  await withFreshGuest(browser, lessonUrl, async (fresh) => {
    const reopened = fresh.frameLocator('iframe[title="Web Morse Runner practice simulator"]');
    await expect(reopened.getByRole('button', { name: /Run$/ })).toBeEnabled();
    await expect(reopened.getByLabel('Mode', { exact: true })).toHaveValue('wpx');
    await expect(reopened.getByLabel('CW Speed', { exact: true })).toHaveValue('28');
    await expect(reopened.getByLabel('Activity', { exact: true })).toHaveValue('5');
    await expect(
      fresh.getByText('Your assignment settings are loaded below.', { exact: false }),
    ).toHaveCount(0);
  });
});

test('the selected sending scale is shareable with a fresh guest', async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#practice/sending?section=exercise');
  const text = page.getByRole('region', { name: 'Sending practice text', exact: true });
  await expect(text.getByRole('heading', { name: 'Exercise', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Drill', exact: true }).tap();
  await expect(text.getByRole('heading', { name: 'Drill', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#practice\/sending\?section=drill$/);
  const sharedUrl = page.url();
  await expectResponsive(page, 'public-sending-drill');

  await withFreshGuest(browser, sharedUrl, async (fresh) => {
    await expect(
      fresh
        .getByRole('region', { name: 'Sending practice text', exact: true })
        .getByRole('heading', { name: 'Drill', exact: true }),
    ).toBeVisible();
    await expect(fresh.getByRole('button', { name: 'Drill', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  const lessonPath = '#practice/lesson/intermediate/s1-d2-t1';
  await page.goto(`/${lessonPath}`);
  await expect(text.getByRole('heading', { name: 'Warm-up', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Drill', exact: true }).tap();
  await expect(page).toHaveURL((url) => url.hash === `${lessonPath}?section=drill`);
  const lessonUrl = page.url();
  await page.reload();
  await expect(text.getByRole('heading', { name: 'Drill', exact: true })).toBeVisible();
  await withFreshGuest(browser, lessonUrl, async (fresh) => {
    await expect(
      fresh
        .getByRole('region', { name: 'Sending practice text', exact: true })
        .getByRole('heading', { name: 'Drill', exact: true }),
    ).toBeVisible();
    await expect(fresh.getByRole('button', { name: 'Complete exercise', exact: true })).toHaveCount(
      0,
    );
  });
});

test('Free practice shares its generated set while a typed script stays private', async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#logbook?owner=N0PRIVATE&notes=PRIVATE');
  await expect(page).toHaveURL(/#logbook$/);
  await page.goto('/#course?level=unknown&session=99&owner=N0PRIVATE');
  await expect(page).toHaveURL(/#course\?level=beginner&session=1$/);
  await page.goto('/#settings?owner=N0PRIVATE');
  await expect(page).toHaveURL(/#overview$/);
  await page.goto('/#events?time=utc&owner=N0PRIVATE');
  const timeMode = page.getByRole('combobox', { name: 'Display times', exact: true });
  await expect(timeMode).toHaveValue('utc');
  await expect(page).toHaveURL(/#events\?time=utc$/);
  const otherTab = await page.context().newPage();
  try {
    await otherTab.goto('/#events');
    const otherMode = otherTab.getByRole('combobox', { name: 'Display times', exact: true });
    await otherMode.selectOption('utc');
    await page.evaluate(() => {
      Object.assign(window, { observedLiveTimeMode: null });
      window.addEventListener('storage', (event) => {
        if (event.key === 'cwa.live-practice.time-mode.v1')
          Object.assign(window, { observedLiveTimeMode: event.newValue });
      });
    });
    await otherMode.selectOption('local');
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { observedLiveTimeMode: string | null }).observedLiveTimeMode,
        ),
      )
      .toBe('local');
    await expect(timeMode).toHaveValue('utc');
    await expect(page).toHaveURL(/#events\?time=utc$/);
  } finally {
    await otherTab.close();
  }
  await page.goto('/#practice/free');
  await page.getByRole('button', { name: 'Letter groups', exact: true }).click();
  await page.getByRole('combobox', { name: 'Letters per group', exact: true }).selectOption('3');
  await page.getByRole('button', { name: 'New set', exact: true }).click();
  const practiceText = page.getByRole('textbox', { name: 'Practice text', exact: true });
  const generated = await practiceText.inputValue();
  expect(generated.trim().split(/\s+/)).toHaveLength(12);
  expect(
    generated
      .trim()
      .split(/\s+/)
      .every((group) => /^[A-Z]{3}$/.test(group)),
  ).toBe(true);
  await expect(page).toHaveURL(
    (url) => params(url).get('set') === generated && params(url).get('groupLength') === '3',
  );
  const generatedUrl = page.url();
  await expectResponsive(page, 'public-free-generated-set');

  await withFreshGuest(browser, generatedUrl, async (fresh) => {
    await expect(fresh.getByRole('textbox', { name: 'Practice text', exact: true })).toHaveValue(
      generated,
    );
    await expect(
      fresh.getByRole('combobox', { name: 'Letters per group', exact: true }),
    ).toHaveValue('3');
  });

  const script = 'PRIVATE SCRIPT FOR THIS DEVICE';
  await practiceText.fill(script);
  await expect(page).toHaveURL(
    (url) => params(url).get('mode') === 'custom' && !params(url).has('set'),
  );
  await expect(practiceText).toHaveValue(script);
  const customUrl = page.url();
  expect(decodeURIComponent(customUrl)).not.toContain(script);
  await withFreshGuest(browser, customUrl, async (fresh) => {
    await expect(fresh.getByRole('textbox', { name: 'Practice text', exact: true })).toHaveValue(
      '',
    );
    await expect(fresh.getByRole('button', { name: 'Your text', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
