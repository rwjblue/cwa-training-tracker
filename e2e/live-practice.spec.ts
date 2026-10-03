import { expect, type Locator } from '@playwright/test';
import { test } from './fixtures';
import ICAL from 'ical.js';
import { readFile } from 'node:fs/promises';
import { expectResponsive } from './helpers';

test.use({ hasTouch: true, timezoneId: 'Asia/Tokyo' });
test('guest live agenda boundaries, retained time mode, calendar import and clipboard fallback', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('Synthetic clipboard denial');
        },
      },
    });
  });
  await page.goto('/');
  // Calendar/manual-only journey: no native media or engine credit is created.
  await page.clock.install({ time: new Date('2026-10-02T19:59:59.500Z') });
  await page.clock.setFixedTime(new Date('2026-10-02T19:59:59.500Z'));
  let mobile = false;
  const activate = async (control: Locator) => {
    if (mobile) await control.tap();
    else {
      await control.focus();
      await page.keyboard.press('Enter');
    }
  };
  await activate(page.getByRole('button', { name: 'See SST, MST and CWT live practice' }));
  await expect(page.getByRole('heading', { name: 'Live practice', exact: true })).toBeVisible();
  await expect(page.getByText('No event in progress. Next: SST.', { exact: true })).toBeVisible();
  await expect(page.getByText('Times shown in', { exact: false })).toContainText('Asia/Tokyo');
  const next = page.getByRole('article', { name: 'Next live event', exact: true });
  await expect(next).toContainText('Sat, Oct 3, 2026, 05:00');
  await expect(next).toContainText('Starts in 0m 1s');
  await expectResponsive(page, 'live-agenda-next-local');
  const mode = page.getByRole('combobox', { name: 'Display times', exact: true });
  await mode.focus();
  await page.keyboard.press('u');
  await page.keyboard.press('Enter');
  await expect(mode).toHaveValue('utc');
  await expect(next).toContainText('Fri, Oct 2, 2026, 20:00');
  await page.reload();
  await expect(mode).toHaveValue('utc');
  await page.clock.setFixedTime(new Date('2026-10-02T20:00:00Z'));
  const current = page.getByRole('article', { name: 'SST in progress', exact: true });
  await expect(current).toContainText('Ends in 1h 0m 0s');
  await expect(next).toContainText('Mon, Oct 5, 2026, 00:00');
  await expectResponsive(page, 'live-agenda-current');

  await page.setViewportSize({ width: 390, height: 844 });
  mobile = true;

  await page.clock.setFixedTime(new Date('2026-10-02T20:59:59.999Z'));
  await expect(current).toContainText('Ends in 0m 1s');
  await page.clock.setFixedTime(new Date('2026-10-02T21:00:00Z'));
  await expect(current).toHaveCount(0);
  await expect(page.getByText('No event in progress. Next: SST.', { exact: true })).toBeVisible();
  await activate(page.getByRole('button', { name: 'Copy calendar URL', exact: true }));
  const url = page.getByRole('textbox', { name: 'Public calendar URL', exact: true });
  const feed = 'http://localhost:8791/api/live-practice/calendar.ics';
  await expect(url).toHaveValue(feed);
  await expect(url).toBeFocused();
  await expect(
    page.getByText('Clipboard unavailable. Select and copy the calendar URL below.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await url.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd]),
  ).toEqual([0, feed.length]);
  await expectResponsive(page, 'live-agenda-copy-fallback');
  const downloading = page.waitForEvent('download');
  await activate(page.getByRole('link', { name: 'Download calendar', exact: true }));
  const download = await downloading;
  const body = await readFile((await download.path())!, 'utf8');
  const calendar = new ICAL.Component(ICAL.parse(body));
  expect(calendar.getAllSubcomponents('vevent')).toHaveLength(9);
  expect(body).toContain('http://localhost:8791/#events');
  const fetched = await context.request.get(feed);
  expect(fetched.ok()).toBe(true);
  expect(await fetched.text()).toBe(body);
  expect((await context.request.head(feed)).status()).toBe(200);
  expect(
    (
      await context.request.get(feed, { headers: { 'If-None-Match': fetched.headers().etag } })
    ).status(),
  ).toBe(304);
  expect((await context.request.get('/api/entries')).status()).toBe(401);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'cwa.live-practice.time-mode.v1') throw new Error('Synthetic preference refusal');
      original.call(this, key, value);
    };
    Object.assign(window, {
      restoreEventPreference: () => {
        Storage.prototype.setItem = original;
      },
    });
  });
  await mode.selectOption('local');
  await expect(mode).toHaveValue('local');
  await expect(
    page.getByText('This choice is active, but could not be kept on this device.', {
      exact: false,
    }),
  ).toBeVisible();
  await expectResponsive(page, 'live-agenda-preference-failure');
  await page.evaluate(() => {
    (window as unknown as { restoreEventPreference: () => void }).restoreEventPreference();
  });
  await activate(page.getByRole('button', { name: 'Retry saving choice', exact: true }));
  await expect(page.getByRole('button', { name: 'Retry saving choice', exact: true })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(mode).toHaveValue('local');
  // Return through real public navigation; inspecting the calendar must pause
  // and retain this manual block rather than launch or save a new exercise.
  await page.goto('/#overview');
  await activate(page.getByRole('button', { name: 'Sending practice', exact: false }));
  await activate(page.getByRole('button', { name: 'Start practice', exact: true }));
  await page.clock.runFor(2000);
  await activate(page.getByRole('button', { name: 'Inspect live practice', exact: true }));
  await expect(page.getByRole('heading', { name: 'Live practice', exact: true })).toBeVisible();
  await activate(page.getByRole('button', { name: 'Return to current practice', exact: true }));
  await expect(page.getByRole('button', { name: 'Resume practice', exact: true })).toBeVisible();
  const summary = page.getByRole('region', { name: 'Today’s practice time', exact: true });
  await expect(summary.getByLabel('Independent practice', { exact: true })).toContainText('0:02');
  await expect(
    summary
      .getByLabel('Independent practice', { exact: true })
      .locator('div')
      .filter({ has: page.getByText('Saved', { exact: true }) }),
  ).toContainText('0:00');
  await expectResponsive(page, 'live-agenda-retained-practice');
});
