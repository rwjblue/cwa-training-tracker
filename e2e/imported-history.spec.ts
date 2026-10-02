import { expect, test } from '@playwright/test';
import { expectAccessible, signIn } from './helpers';

test('imported results, original reports, and device drafts remain readable privately', async ({
  page,
  context,
}) => {
  await signIn(page);
  const createdAt = '2026-09-28T14:00:00Z';
  const report = {
    id: 'report-submitted',
    session: 2,
    fromDate: '2026-09-25',
    toDate: '2026-09-28',
    reportDate: '2026-09-28',
    createdAt,
    submittedAt: createdAt,
    status: 'submitted',
    answers: {
      runnerVerifiedPoints: '0',
      learnedWords: 'CQ and TEST',
      problems: '<script>private notes stay text</script>',
    },
    sourceAttemptIds: ['saved-run'],
    sourceLcwoIds: ['lcwo-one'],
  };
  const fixture = {
    exportedAt: createdAt,
    snapshot: {
      course: {
        id: 'synthetic-course',
        title: 'Fundamental practice',
        timezone: 'America/New_York',
        dailyGoalMinutes: 60,
        meetings: [
          { session: 1, startsAt: '2026-09-07T23:00:00Z', endsAt: '2026-09-08T00:00:00Z' },
        ],
        assignments: [
          {
            id: 'assignment',
            session: 1,
            day: 1,
            date: '2026-09-07',
            tasks: [
              {
                id: 'exercise',
                kind: 'icr',
                title: 'Synthetic group practice',
                instructions: 'Original instructions',
                minutes: 10,
              },
            ],
          },
        ],
        resources: [],
      },
      attempts: [
        {
          id: 'saved-run',
          taskId: 'exercise',
          assignmentId: 'assignment',
          startedAt: createdAt,
          endedAt: '2026-09-28T14:10:00Z',
          activeSeconds: 600,
          recallSeconds: 30,
          completed: true,
          completedPasses: 2,
          performanceRating: 'good',
          scratchpad: 'Copied the final exchange.',
          context: 'practice',
          note: 'A saved practice result',
          lcwoResult: { kind: 'letters', speedWpm: 15, groupLength: 3, errorPercent: 0 },
          runnerResult: {
            mode: 'SingleCall',
            wpm: 20,
            speeds: [20, 22],
            verifiedPoints: 0,
            qsoCount: 0,
            score: 0,
            status: 'stopped',
          },
          audioResults: [
            {
              title: 'Actual practice recording',
              url: 'https://example.test/audio',
              speedWpm: 18,
              activeSeconds: 570,
              completedPasses: 2,
            },
          ],
          cwtResult: {
            qsoCount: 0,
            heardCallsigns: 'N0CALL',
            comments: 'Listened without transmitting.',
          },
        },
      ],
      reports: [report],
      materials: [
        {
          id: 'material-revision',
          session: 2,
          title: 'Advisor exercise revision',
          text: 'Preserve the original instruction.',
          supersedesId: 'material-original',
          createdAt,
          usage: 'preparation',
          url: 'javascript:alert(1)',
        },
      ],
      preferences: {
        blockMinutes: 15,
        reminderTime: '08:30',
        joinUrl: 'https://meeting.example.test/original?pwd=synthetic-reference',
        carriedTasks: [{ taskId: 'exercise', date: '2026-09-28' }],
      },
      lcwo: {
        runs: [
          {
            id: 'lcwo-one',
            kind: 'letters',
            sourceType: 'groups',
            recordedAt: createdAt,
            characterWpm: 25,
            effectiveWpm: 15,
            accuracyPercent: 0,
            sourceResultId: 'source-one',
          },
          {
            id: 'lcwo-uncovered',
            kind: 'letters',
            sourceType: 'groups',
            recordedAt: '2026-09-28T16:00:00Z',
            characterWpm: 25,
            effectiveWpm: 15,
            sourceResultId: 'source-two',
          },
        ],
      },
    },
    reportDraft: {
      ...report,
      id: 'device-draft',
      status: 'draft',
      submittedAt: undefined,
      answers: { learnedWords: 'Draft answer retained', problems: '' },
    },
    reportEditedKeys: ['learnedWords'],
    audioSpeedPreference: 'next',
    wordPracticeDefaults: {
      title: 'My word list',
      text: 'CQ TEST',
      settings: { wpm: 25, spokenAnswers: false },
    },
  };
  await page.getByRole('button', { name: 'Your account', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import backup', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: 'synthetic-history.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await page.getByRole('button', { name: 'Import sessions', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'View imported history', exact: true }).click();
  const archive = page.getByRole('region', { name: 'Imported history', exact: true });
  await archive.getByText('Original course & preferences', { exact: true }).click();
  await archive.getByText('Original class meetings (1)', { exact: true }).click();
  await expect(archive.getByText('2026-09-07T23:00:00Z', { exact: true })).toBeVisible();
  await expect(archive.getByText('2026-09-08T00:00:00Z', { exact: true })).toBeVisible();
  await expect(
    archive.getByRole('link', { name: 'Original class link', exact: true }),
  ).toHaveAttribute('href', fixture.snapshot.preferences.joinUrl);
  expect(
    (await (await context.request.get('/api/settings')).json()).settings.classSchedule,
  ).toBeUndefined();
  await archive.getByText('Session 2 · 2026-09-28 · Submitted report', { exact: true }).click();
  await expect(archive.getByText('CQ and TEST', { exact: true })).toBeVisible();
  await expect(
    archive.getByText('<script>private notes stay text</script>', { exact: true }),
  ).toBeVisible();
  await archive.getByText('LCWO measurements (2)', { exact: true }).click();
  await archive.getByText(`Letters · ${createdAt}`, { exact: true }).click();
  await expect(archive.getByText('Stored accuracy (%)', { exact: true })).toBeVisible();
  await archive.getByText('Instructor materials (1)', { exact: true }).click();
  await archive.getByText('Advisor exercise revision · Session 2', { exact: true }).click();
  await expect(archive.getByText('material-original', { exact: true })).toBeVisible();
  await expect(
    archive.getByRole('link', { name: 'Open original source', exact: true }),
  ).toHaveCount(0);
  await archive.getByText('Preserved device drafts & preferences', { exact: true }).click();
  await archive.getByText('Session 2 · 2026-09-28 · Saved draft', { exact: true }).click();
  await expect(archive.getByText('Draft answer retained', { exact: true })).toBeVisible();
  await expect(archive.getByText('Not recorded', { exact: true })).toBeVisible();
  await expectAccessible(page, 'imported-history-desktop');
  await page.screenshot({ path: '.tmp/imported-history-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expectAccessible(page, 'imported-history-mobile');
  await page.screenshot({ path: '.tmp/imported-history-mobile.png', fullPage: true });

  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Practice log', exact: true }).click();
  await page.getByText('Estimated LCWO practice', { exact: true }).click();
  await expect(page.getByText(/This is an estimate, not measured audio time/)).toBeVisible();
  await page.getByText('Imported results & context', { exact: true }).click();
  await expect(
    page.getByText('Recall seconds (included in practice)', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Copied the final exchange.', { exact: true })).not.toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Morse Runner result', exact: true }),
  ).toBeVisible();
  const lcwo = page.getByRole('heading', { name: 'LCWO result', exact: true }).locator('..');
  await expect(lcwo.getByText('Effective speed (WPM)', { exact: true })).toBeVisible();
  await expect(lcwo.getByText('15', { exact: true })).toBeVisible();
  await expect(lcwo.getByText('0', { exact: true })).toBeVisible();
  await expect(page.getByText('Listened without transmitting.', { exact: true })).toBeVisible();
  await expect(page.getByText('18', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expectAccessible(page, 'imported-result-mobile');
  await page.screenshot({ path: '.tmp/imported-result-mobile.png', fullPage: true });
  const backup = await (await context.request.get('/api/export')).json();
  expect(backup.legacy.data.snapshot.reports[0]).toEqual(report);
  expect(backup.legacy.data.reportDraft.answers.learnedWords).toBe('Draft answer retained');

  // Reauthentication can select another account without unmounting the settings page.
  // Previously loaded private archives must leave the screen with their account.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Your account', exact: true }).click();
  await page.getByRole('button', { name: 'View imported history', exact: true }).click();
  await expect(page.getByText('Advisor reports (1)', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Verify sign-in again', exact: true }).click();
  await signIn(page, { dialogAlreadyOpen: true });
  await expect(page.getByText('Advisor reports (1)', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'View imported history', exact: true }).click();
  await expect(
    page.getByText('No historical source archive is saved in this account.', { exact: true }),
  ).toBeVisible();
});
