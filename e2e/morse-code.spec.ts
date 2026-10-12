import { expect } from '@playwright/test';
import { test } from './fixtures';
import { openPracticeTool } from './helpers';
import { COPY_MORSE } from '../src/shared/copy-content';

test('footer and sidebar Morse stay correct across views and viewport sizes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const footerMorse = page.locator('footer').getByTitle('73 in Morse code', { exact: true });
  await expect(footerMorse).toHaveText(/^− − · · ·\s+· · · − −$/);

  const sidebarMorse = page.getByTitle(/^[A-Z] in Morse code$/);
  await expect(sidebarMorse).toBeVisible();
  const letter = (await sidebarMorse.getAttribute('title'))![0];
  const sidebarCode = (await sidebarMorse.innerText())
    .replace(/\s/g, '')
    .replaceAll('−', '-')
    .replaceAll('·', '.');
  expect(sidebarCode).toBe(COPY_MORSE[letter]);

  await openPracticeTool(page, 'Free practice');

  await expect(footerMorse).toBeVisible();
  await expect(footerMorse).toHaveText(/^− − · · ·\s+· · · − −$/);
  expect(
    await footerMorse.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= window.innerWidth;
    }),
  ).toBe(true);

  // The existing phone layout hides the decorative footer sign-off.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(footerMorse).toBeHidden();
  await expect(footerMorse).toHaveText(/^− − · · ·\s+· · · − −$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
