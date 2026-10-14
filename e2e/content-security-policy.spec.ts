import { expect } from '@playwright/test';
import { test } from './fixtures';

test('the site CSP permits versioned analytics beacons while blocking unrelated scripts', async ({
  page,
}) => {
  // Wrangler does not inject the analytics script that Cloudflare adds at the
  // edge. Reproduce that injection while retaining the real response headers.
  const beaconUrls = [
    'https://static.cloudflareinsights.com/beacon.min.js',
    'https://static.cloudflareinsights.com/beacon.min.js/v-synthetic-release',
  ];
  await page.route('https://static.cloudflareinsights.com/**', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: `document.documentElement.dataset.beacons = String(Number(document.documentElement.dataset.beacons ?? 0) + 1);`,
    }),
  );
  await page.route('**/', async (route) => {
    if (!route.request().isNavigationRequest()) return route.continue();
    const response = await route.fetch();
    const body = (await response.text()).replace(
      '</body>',
      `${beaconUrls.map((src) => `<script type="module" src="${src}"></script>`).join('\n')}</body>`,
    );
    await route.fulfill({ response, body });
  });
  await page.goto('/#overview');
  await expect(
    page.getByRole('heading', { name: 'Practice Morse. Keep your progress.', exact: true }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-beacons', '2');

  const blockedUrl = 'https://static.cloudflareinsights.com/unrelated.js';
  const violation = page.evaluate(
    (src) =>
      new Promise<string>((resolve) => {
        document.addEventListener('securitypolicyviolation', function onViolation(event) {
          if (event.blockedURI !== src) return;
          document.removeEventListener('securitypolicyviolation', onViolation);
          resolve(event.effectiveDirective);
        });
        const script = document.createElement('script');
        script.src = src;
        document.body.appendChild(script);
      }),
    blockedUrl,
  );
  expect(await violation).toBe('script-src-elem');
  await expect(page.locator('html')).toHaveAttribute('data-beacons', '2');
});
