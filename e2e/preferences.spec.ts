import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, signIn } from './helpers';

async function savePreferences(page: Page) {
  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/settings' && response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  expect((await saved).ok()).toBe(true);
  await expect(page.getByRole('button', { name: 'Save preferences', exact: true })).toBeEnabled();
}

test('account identity, timezone, and opt-in avatars remain readable and private', async ({
  page,
  context,
}) => {
  const avatarRequests: { url: string; headers: Record<string, string> }[] = [];
  // Never contact Gravatar with even the synthetic account's identifier. Also
  // intercept its subdomains so a future redirect cannot escape this test.
  await context.route(
    (url) => url.hostname === 'gravatar.com' || url.hostname.endsWith('.gravatar.com'),
    async (route) => {
      avatarRequests.push({ url: route.request().url(), headers: route.request().headers() });
      await route.fulfill({
        status: 404,
        contentType: 'text/plain',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: 'No avatar for this test account',
      });
    },
  );

  await signIn(page);
  const account = page.getByRole('button', { name: 'Open your account', exact: true });
  await expect(account).toHaveText('Me');
  await account.click();
  await expect(
    page.getByRole('heading', { name: 'Your practice preferences', exact: true }),
  ).toBeVisible();
  const timezone = page.getByRole('combobox', { name: 'Practice timezone', exact: true });
  const gravatar = page.getByRole('checkbox', { name: 'Use my Gravatar image', exact: true });
  await expect(gravatar).not.toBeChecked();
  await timezone.selectOption('America/Los_Angeles');
  await page.getByLabel(/^Callsign/).fill('N1RWJ');
  await savePreferences(page);
  await expect(account).toHaveText('N1RWJ');
  expect(avatarRequests).toHaveLength(0);

  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Your practice preferences', exact: true }),
  ).toBeVisible();
  await expect(timezone).toHaveValue('America/Los_Angeles');
  await expect(page.getByLabel(/^Callsign/)).toHaveValue('N1RWJ');
  await expect(account).toHaveText('N1RWJ');
  await expect(gravatar).not.toBeChecked();
  await expectAccessible(page, 'preferences-desktop');
  expect(avatarRequests).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: '.tmp/preferences-desktop.png', fullPage: true });

  await gravatar.check();
  await savePreferences(page);
  await expect.poll(() => avatarRequests.length).toBe(1);
  const avatarUrl = new URL(avatarRequests[0].url);
  expect(avatarUrl.origin).toBe('https://gravatar.com');
  expect(avatarUrl.pathname).toMatch(/^\/avatar\/[a-f0-9]{64}$/);
  expect(avatarUrl.searchParams.get('d')).toBe('404');
  expect(avatarUrl.searchParams.get('r')).toBe('g');
  expect(avatarRequests[0].headers.referer).toBeUndefined();
  expect(avatarRequests[0].headers.cookie).toBeUndefined();
  await expect(account.locator('img')).toHaveCount(0);
  await expect(account).toHaveText('N1RWJ');

  await gravatar.uncheck();
  await savePreferences(page);
  const requestsAfterOptOut = avatarRequests.length;
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Your practice preferences', exact: true }),
  ).toBeVisible();
  await expect(gravatar).not.toBeChecked();
  await expect(account).toHaveText('N1RWJ');
  await page.waitForLoadState('networkidle');
  expect(avatarRequests).toHaveLength(requestsAfterOptOut);

  await page.getByLabel(/^Callsign/).fill('EA8/N1RWJ/P');
  await savePreferences(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(account).toBeVisible();
  await expect(account).toHaveText('EA8/N1RWJ/P');
  expect(
    await account.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= window.innerWidth;
    }),
  ).toBe(true);
  expect(
    await account
      .locator('.account-identity-label')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expectAccessible(page, 'preferences-mobile');
  await page.screenshot({ path: '.tmp/preferences-mobile.png', fullPage: true });
  expect(avatarRequests).toHaveLength(requestsAfterOptOut);
});
