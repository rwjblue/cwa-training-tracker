import { expect } from '@playwright/test';
import { test } from './fixtures';
import { expectResponsive, navigateView, scopedRequest, signIn } from './helpers';
import type { PracticeSession } from '../src/shared/training';

test('Summary shows saved activity colors and history separately from the Today plan', async ({
  page,
  context,
}) => {
  await signIn(page);
  await page.clock.setFixedTime(new Date('2026-10-05T12:00:00Z'));
  const entry = (
    id: string,
    kind: PracticeSession['kind'],
    minutes: number,
    extra: Partial<PracticeSession> = {},
  ): PracticeSession => ({
    id,
    date: '2026-10-05',
    kind,
    minutes,
    notes: `${id} practice`,
    source: 'manual',
    createdAt: '2026-10-05T12:00:00Z',
    ...extra,
  });
  for (const practice of [
    ...['2026-09-27', '2026-09-29', '2026-10-01', '2026-10-03'].map((date) =>
      entry(date, 'icr', 1, { date }),
    ),
    entry('copy', 'icr', 10),
    entry('runner', 'simulator', 15),
    entry('recording', 'listening', 20, {
      metadata: { recordingUrl: 'https://example.test/assigned.mp3' },
    }),
    entry('pota', 'on-air', 12, { metadata: { onAirCategory: 'pota' } }),
    entry('sota', 'on-air', 8, { metadata: { onAirCategory: 'sota' } }),
    entry('qso', 'on-air', 5, { metadata: { onAirCategory: 'qso' } }),
    entry('old-on-air', 'on-air', 6),
    entry('class', 'listening', 60, { context: 'class' }),
  ])
    expect((await scopedRequest(context, 'POST', '/api/entries', practice)).status()).toBe(201);

  await page.reload();
  await navigateView(page, 'Summary');
  await expect(
    page.getByRole('heading', { name: 'Your practice summary.', exact: true }),
  ).toBeVisible();
  const totals = page.getByRole('region', { name: 'Practice summary', exact: true });
  await expect(totals).toContainText('79');
  await expect(totals).toContainText('10 sessions in the last 7 days');
  await expect(totals).toContainText('5practice days');
  await expect(totals).toContainText('Single days off keep your streak.');
  const todayBar = page.getByRole('img', { name: /Oct 5: 76 minutes/ });
  await expect(todayBar).toBeVisible();
  await expect(todayBar).toHaveAccessibleName(
    /Copy \/ code groups: 10 minutes; Morse Runner: 15 minutes; Recording listening: 20 minutes; On air · QSO \/ ragchew: 11 minutes; On air · POTA: 12 minutes; On air · SOTA: 8 minutes/,
  );
  await todayBar.focus();
  await expect(todayBar).toBeFocused();
  const legend = page.getByRole('list', { name: 'Practice activity colors', exact: true });
  await expect(legend).toContainText('Copy / code groups');
  await expect(legend).toContainText('Morse Runner');
  await expect(legend).toContainText('Recording listening');
  await expect(legend).toContainText('On air · POTA');
  await expect(legend).toContainText('On air · SOTA');
  const colors = await legend
    .getByRole('listitem')
    .filter({ hasNotText: 'Personal target' })
    .evaluateAll((items) =>
      items.map((item) => getComputedStyle(item.querySelector('i')!).backgroundColor),
    );
  expect(new Set(colors).size).toBe(6);
  await page.getByText('Daily activity breakdown', { exact: true }).click();
  await expect(page.getByRole('table')).toContainText('On air · QSO / ragchew');
  await expect(page.getByRole('heading', { name: 'Recent practice', exact: true })).toBeVisible();
  await expectResponsive(page, 'practice-summary');
  await page.getByRole('button', { name: 'View practice log', exact: true }).click();
  await expect(page).toHaveURL(/#logbook$/);
  await navigateView(page, 'Today');
  await expect(
    page.getByRole('heading', { name: 'Your practice for today.', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent practice', exact: true })).toHaveCount(0);
});
