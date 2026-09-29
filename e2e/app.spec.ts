import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expectAccessible, signIn } from './helpers';

test('public practice is useful without signing in and fits a phone', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Practice Morse. Keep your progress.' }),
  ).toBeVisible();
  await expectAccessible(page, 'overview');
  await page.getByRole('button', { name: 'Try practice', exact: true }).click();
  await page.getByRole('button', { name: 'Free practice', exact: true }).click();
  await page.getByRole('button', { name: 'Your text', exact: true }).click();
  await page.getByLabel('Practice text', { exact: true }).fill('CQ TEST');
  await page.getByRole('button', { name: 'Play Morse', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
  await expectAccessible(page, 'practice');
  await page.getByRole('button', { name: 'Start timer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause timer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause timer', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'The listening room' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'The listening room' })).toBeVisible();
  expect(failures).toEqual([]);
});

test('email login, private records, import, reset, and passkeys work together', async ({
  page,
  context,
}) => {
  await signIn(page);
  const origin = 'http://localhost:8791';
  const headers = { Origin: origin };
  await page.getByRole('button', { name: 'Log practice', exact: true }).click();
  await page.getByLabel('Character WPM', { exact: true }).fill('20');
  await page.getByLabel('Effective WPM', { exact: true }).fill('10');
  await page.getByLabel(/^Notes/).fill('Browser integration practice');
  await page.getByRole('button', { name: 'Save practice', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const savedEntry = (await (await context.request.get('/api/entries')).json()).entries[0];
  expect(savedEntry.minutes).toBe(15);
  await page.getByRole('button', { name: 'Practice log', exact: true }).click();
  await page.reload();
  await expect(page.getByText('Browser integration practice', { exact: true })).toBeVisible();
  const exported = await context.request.get('/api/export');
  expect(exported.ok()).toBe(true);
  const backup = await exported.json();
  const merged = await context.request.post('/api/import', {
    data: { mode: 'merge', data: backup },
    headers,
  });
  expect(await merged.json()).toMatchObject({ imported: 0, skipped: 1 });
  const reset = await context.request.post('/api/reset', {
    data: { confirmation: 'RESET' },
    headers,
  });
  expect(reset.ok()).toBe(true);
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(0);
  const restored = await context.request.post('/api/import', {
    data: { mode: 'replace', data: backup },
    headers,
  });
  expect(restored.ok()).toBe(true);
  expect(await restored.json()).toMatchObject({ imported: 1, skipped: 0 });
  expect((await (await context.request.get('/api/entries')).json()).entries[0].id).toBe(
    savedEntry.id,
  );

  // Use Chromium's virtual authenticator for a real WebAuthn signature round trip.
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.getByRole('button', { name: 'Your account', exact: true }).click();
  await page.getByRole('button', { name: /add.*passkey/i }).click();
  await expect
    .poll(
      async () => (await (await context.request.get('/api/auth/passkeys')).json()).passkeys.length,
    )
    .toBe(1);
  await page.getByRole('button', { name: /sign out/i }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /passkey/i }).click();
  await expect(page.getByText('Your private workspace', { exact: true })).toBeVisible();
  expect((await (await context.request.get('/api/entries')).json()).entries[0].id).toBe(
    savedEntry.id,
  );
});

test('private API access and cross-origin mutations are rejected', async ({ request }) => {
  expect((await request.get('/api/entries')).status()).toBe(401);
  expect((await request.get('/api/export')).status()).toBe(401);
  expect(
    (
      await request.post('/api/auth/email/request', {
        data: { email: 'unused@example.test' },
        headers: { Origin: 'https://evil.example' },
      })
    ).status(),
  ).toBe(403);
});
