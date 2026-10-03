import { expect } from '@playwright/test';
import { test } from './fixtures';
import { readFile } from 'node:fs/promises';
import { accountRequest, expectAccessible, signIn } from './helpers';

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

test('email login, private records, backup controls, and passkeys work together', async ({
  page,
  context,
}, testInfo) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Log practice', exact: true }).click();
  await expect(page.getByLabel(/^Time practiced/)).toHaveValue('');
  await page.getByLabel(/^Time practiced/).fill('15');
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
  await page
    .getByRole('button', { name: `Edit Listening on ${savedEntry.date}`, exact: true })
    .click();
  await expect(page.getByLabel(/^Time practiced/)).toHaveValue('15:00');
  await page.getByLabel(/^Time practiced/).fill('3:49');

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await (await context.request.get('/api/entries')).json()).entries[0].minutes).toBe(
    229 / 60,
  );
  // Arrange one additional kind of private data; exercise backup operations
  // through the account UI rather than repeating Worker API import tests.
  const planned = await accountRequest(context, 'POST', '/api/plan', {
    id: 'backup-exercise',
    title: 'A private exercise to restore',
    kind: 'sending',
    targetMinutes: 10,
    done: false,
    notes: 'Preserve the homework alongside practice.',
    createdAt: savedEntry.createdAt,
  });
  expect(planned.ok()).toBe(true);
  // A fixture written outside this page advances the account revision.
  // Refresh its confirmed state before reviewing a destructive operation.
  await page.reload();
  await page.getByRole('button', { name: 'Your account', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/^cw-academy-backup-.*\.json$/);
  const backupPath = testInfo.outputPath('training-backup.json');
  await download.saveAs(backupPath);
  const backup = JSON.parse(await readFile(backupPath, 'utf8'));
  expect(backup.format).toBe('cwa-training-tracker');
  expect(backup.sessions).toHaveLength(1);
  expect(backup.sessions[0]).toMatchObject({
    id: savedEntry.id,
    notes: 'Browser integration practice',
  });
  expect(backup.plan).toHaveLength(1);
  expect(backup.plan[0].title).toBe('A private exercise to restore');

  await page.getByRole('button', { name: 'Reset practice data', exact: true }).click();
  const resetDialog = page.getByRole('dialog', { name: 'Start with a fresh page?', exact: true });
  await expect(
    resetDialog.getByRole('button', { name: 'Reset practice data', exact: true }),
  ).toBeDisabled();
  await resetDialog.getByLabel('Type RESET to continue', { exact: true }).fill('RESET');
  await resetDialog.getByRole('radio', { name: /^Discard old waiting work/ }).check();
  const resetResult = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/reset' && response.request().method() === 'POST',
  );
  await resetDialog.getByRole('button', { name: 'Reset practice data', exact: true }).click();
  expect((await resetResult).ok()).toBe(true);
  await expect(resetDialog).toHaveCount(0);
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(0);
  expect((await (await context.request.get('/api/plan')).json()).plan).toHaveLength(0);

  const restoreChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import backup', exact: true }).click();
  await (await restoreChooser).setFiles(backupPath);
  const importDialog = page.getByRole('dialog', {
    name: 'Bring your practice along.',
    exact: true,
  });
  await expect(importDialog).toContainText('training-backup.json');
  await importDialog.getByRole('radio', { name: /^Replace my practice data/ }).check();
  const restoredResult = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/import' && response.request().method() === 'POST',
  );
  await importDialog.getByRole('button', { name: 'Replace and import', exact: true }).click();
  const replacementDialog = page.getByRole('dialog', {
    name: 'Replace your practice data?',
    exact: true,
  });
  await replacementDialog.getByRole('radio', { name: /^Discard old waiting work/ }).check();
  await replacementDialog.getByRole('button', { name: 'Replace and import', exact: true }).click();
  const restored = await restoredResult;
  expect(restored.ok()).toBe(true);
  expect(restored.request().postDataJSON().mode).toBe('replace');
  await expect(importDialog).toHaveCount(0);
  expect((await (await context.request.get('/api/entries')).json()).entries[0].id).toBe(
    savedEntry.id,
  );
  expect((await (await context.request.get('/api/plan')).json()).plan[0].title).toBe(
    'A private exercise to restore',
  );

  // Reimporting the same file through the default merge control keeps one copy.
  const mergeChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import backup', exact: true }).click();
  await (await mergeChooser).setFiles(backupPath);
  await expect(
    importDialog.getByRole('radio', { name: /^Merge with my practice log/ }),
  ).toBeChecked();
  const mergedResult = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/import' && response.request().method() === 'POST',
  );
  await importDialog.getByRole('button', { name: 'Import sessions', exact: true }).click();
  const merged = await mergedResult;
  expect(merged.ok()).toBe(true);
  expect(merged.request().postDataJSON().mode).toBe('merge');
  await expect(importDialog).toHaveCount(0);
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(1);
  expect((await (await context.request.get('/api/plan')).json()).plan).toHaveLength(1);
  await page.getByRole('button', { name: 'Practice log', exact: true }).click();
  await page.reload();
  await expect(page.getByText('Browser integration practice', { exact: true })).toBeVisible();

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
