import { expect, test } from '@playwright/test';
import { expectAccessible } from './helpers';

test('QSO copy checks stay with the heard contact and reveal answers only on request', async ({
  page,
}) => {
  await page.goto('/#practice');
  await page.getByRole('button', { name: 'QSO practice', exact: true }).click();
  await page.getByRole('combobox', { name: 'QSO scenario', exact: true }).selectOption('ragchew');
  // Capture the generated contact through its normal listening interface, then
  // verify copy mode overrides even a previously revealed transcript preference.
  await page.getByRole('button', { name: 'Reveal text', exact: true }).click();
  await page.getByText('View full conversation', { exact: true }).click();
  const transcript = await page.locator('.trainer-catalog').innerText();
  const call = transcript.match(/CQ CQ DE ([A-Z0-9]+)/)![1];
  const name = transcript.match(/NAME ([A-Z]+) \1 QTH/)![1];
  await page.getByRole('button', { name: 'Check your copy', exact: true }).click();
  const copy = page.getByRole('region', { name: 'Check your QSO copy', exact: true });
  const caller = copy.getByRole('group', { name: /Station 1/ });
  await expect(page.getByText('View full conversation', { exact: true })).toHaveCount(0);
  await expect(page.locator('.trainer-current')).not.toContainText(call);
  await expect(copy.getByText(name, { exact: true })).toHaveCount(0);
  await caller
    .getByRole('textbox', { name: 'Station 1 callsign', exact: true })
    .fill(call.toLowerCase());
  await caller.getByRole('textbox', { name: 'Station 1 name', exact: true }).fill('NOT THE NAME');
  await copy.getByRole('button', { name: 'Check answers', exact: true }).click();
  await expect(copy.getByRole('status')).toContainText('1 of 2');
  await expect(copy.getByText(name, { exact: true })).toHaveCount(0);
  await caller
    .getByRole('textbox', { name: 'Station 1 name', exact: true })
    .fill(name.toLowerCase());
  await copy.getByRole('button', { name: 'Check answers', exact: true }).click();
  await expect(copy.getByRole('status')).toContainText('2 of 2');

  await page.getByRole('button', { name: 'Replay QSO', exact: true }).click();
  const audio = page.getByLabel('Practice audio', { exact: true });
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(0);
  await expect(
    caller.getByRole('textbox', { name: 'Station 1 callsign', exact: true }),
  ).toHaveValue(call.toLowerCase());
  await page.getByText(/^Sound settings ·/).click();
  await page.getByRole('slider', { name: 'Character speed', exact: true }).press('ArrowRight');
  await expect(caller.getByRole('textbox', { name: 'Station 1 name', exact: true })).toHaveValue(
    name.toLowerCase(),
  );
  await copy.getByRole('button', { name: 'Show answers', exact: true }).click();
  await expect(copy).toContainText(call);
  await expect(copy).toContainText(name);
  await expectAccessible(page, 'qso-copy-desktop');
  await page.screenshot({ path: '.tmp/qso-copy-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expectAccessible(page, 'qso-copy-mobile');
  await page.screenshot({ path: '.tmp/qso-copy-mobile.png', fullPage: true });

  await page.getByRole('button', { name: 'New QSO', exact: true }).click();
  await expect(
    caller.getByRole('textbox', { name: 'Station 1 callsign', exact: true }),
  ).toHaveValue('');
  await expect(caller.getByRole('textbox', { name: 'Station 1 name', exact: true })).toHaveValue(
    '',
  );
  await expect(copy.getByRole('status')).not.toContainText('2 of 2');
  await expect(copy).not.toContainText(call);
  await expect(page.getByText('View full conversation', { exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'QSO scenario', exact: true }).selectOption('pota');
  await expect(copy.getByRole('textbox')).toHaveCount(5);
  await expect(copy.getByRole('textbox', { name: 'Station 1 name', exact: true })).toHaveCount(0);
});
