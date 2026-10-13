import { expect } from '@playwright/test';
import { test } from './fixtures';
import { expectAccessible, expectResponsive, openPracticeTool, signIn } from './helpers';

test('appearance follows the system, persists explicit choices, and updates other tabs', async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose your appearance', exact: true });
  await expect(dialog.getByRole('button', { name: 'System', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await dialog.getByRole('button', { name: 'Light', exact: true }).click();
  await expect(root).toHaveAttribute('data-theme', 'light');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Appearance', exact: true })).toBeFocused();
  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'light');

  const other = await context.newPage();
  await other.goto('/');
  await other.getByRole('button', { name: 'Appearance', exact: true }).click();
  await other.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'dark');
  await other.close();

  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await dialog.getByRole('button', { name: 'System', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(root).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expectAccessible(page, 'appearance-dark');
  await expectResponsive(page, 'appearance-dark');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();

  // The embedded simulator follows the site's explicit mode, even when the OS
  // preference disagrees, without changing the engine or its message protocol.
  await openPracticeTool(page, 'Morse Runner');
  const runner = page.frameLocator('iframe');
  await expect(runner.locator('body')).toHaveCSS('background-color', 'rgb(16, 27, 22)');
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await dialog.getByRole('button', { name: 'Light', exact: true }).click();
  await expect(runner.locator('body')).toHaveCSS('background-color', 'rgb(247, 248, 243)');
  await page.emulateMedia({ colorScheme: 'light' });
  await dialog.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(runner.locator('body')).toHaveCSS('background-color', 'rgb(16, 27, 22)');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();

  await signIn(page);
  await page.getByRole('button', { name: 'Open your account', exact: true }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Dark', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expectAccessible(page, 'account-dark');
  await expectResponsive(page, 'account-dark');
});

test('the saved appearance applies before the application bundle runs under the site CSP', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('cwa:appearance:v1', 'dark'));
  await page.route('**/assets/index-*.js', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(16, 27, 22)');
  await expect(page.locator('#root')).toBeEmpty();
});

test('appearance controls work for a visit when browser storage is unavailable', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException('Storage is disabled', 'SecurityError');
    };
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage is disabled', 'SecurityError');
    };
    Storage.prototype.removeItem = () => {
      throw new DOMException('Storage is disabled', 'SecurityError');
    };
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'System', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
