import { expect } from '@playwright/test';
import { test } from './fixtures';
import { expectResponsive } from './helpers';

test('spoken comparison plays the original then the selected voice as a guest', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/audio/cw-training/words/compare.html');
  await expect(page.getByRole('heading', { name: 'Compare the spoken answers' })).toBeVisible();
  await expect(page.getByText('Bella · eleven_v4', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Compare both voices for / })).toHaveCount(12);
  const original = page.getByLabel('A — old Kokoro spoken answer', { exact: true });
  const selected = page.getByLabel('A — new ElevenLabs spoken answer', { exact: true });
  expect(
    await page
      .locator('audio')
      .evaluateAll((nodes: HTMLAudioElement[]) =>
        nodes.every((node) => node.paused && node.currentTime === 0),
      ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Compare both voices for A', exact: true }).click();
  await expect(selected).toHaveJSProperty('ended', true);
  await expect(original).toHaveJSProperty('ended', true);
  await expect(page.getByText('Comparison complete.', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Compare both voices for A', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await expectResponsive(page, 'spoken-comparison');
});
