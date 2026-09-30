import { expect, test } from '@playwright/test';
import { dateInTimezone } from '../src/shared/training';
import { expectAccessible, signIn } from './helpers';

test('sending scales stay in the studio and save assigned practice without opening the PDF', async ({
  page,
  context,
}) => {
  const scalesUrl =
    'https://cwops.org/wp-content/uploads/2022/03/Everyday-Send-Code-WR7Q-ver.-7.pdf';
  const sending = page.getByRole('button', { name: 'Sending practice', exact: true });
  const warmUp = page.getByRole('button', { name: 'Warm-up', exact: true });
  const drill = page.getByRole('button', { name: 'Drill', exact: true });
  const exercise = page.getByRole('button', { name: 'Exercise', exact: true });
  const text = page.getByRole('region', { name: 'Sending practice text', exact: true });
  const textSize = page.getByRole('combobox', { name: 'Practice text size', exact: true });

  // The sending material and its source are useful before creating an account.
  await page.goto('/');
  await page.getByRole('button', { name: /Sending practice/ }).click();
  await expect(page).toHaveURL(/#practice$/);
  await expect(sending).toHaveAttribute('aria-pressed', 'true');
  await expect(warmUp).toBeVisible();
  await expect(drill).toBeVisible();
  await expect(exercise).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Bob Carter WR7Q’s scales PDF', exact: true }),
  ).toHaveAttribute('href', scalesUrl);
  await warmUp.click();
  await expect(warmUp).toHaveAttribute('aria-pressed', 'true');
  await expect(text).toContainText(/[A-Z0-9]{2}/);
  await expect(text).toContainText('<SK>');
  await expect(page.getByText(/prosigns.*joined|joined.*prosigns/i)).toBeVisible();
  const warmUpText = await text.innerText();
  await drill.click();
  await expect(drill).toHaveAttribute('aria-pressed', 'true');
  await expect(text).not.toHaveText(warmUpText);
  await expect(text).toContainText('<SK> <SK> <SK> <SK> <SK>');
  await expect(text).toContainText('<AR> <AR> <AR> <AR> <AR>');
  await expect(text).toContainText('<BT> <BT> <BT> <BT> <BT>');
  const drillText = await text.innerText();
  await exercise.click();
  await expect(exercise).toHaveAttribute('aria-pressed', 'true');
  await expect(text).not.toHaveText(drillText);
  await textSize.selectOption('large');
  await expect(textSize).toHaveValue('large');
  expect((await context.request.get('/api/entries')).status()).toBe(401);
  await page.reload();
  await expect(sending).toHaveAttribute('aria-pressed', 'true');
  await expect(text).toBeVisible();

  await signIn(page);
  const settings = (await (await context.request.get('/api/settings')).json()).settings;
  const now = new Date();
  const task = {
    id: 'sending-scales-practice',
    title: 'Practice the warm-up and drill scales',
    kind: 'sending',
    dueDate: dateInTimezone(now, settings.timezone),
    done: false,
    notes: 'Use your key and keep the spacing even.',
    createdAt: now.toISOString(),
    exercise: { type: 'sending', url: scalesUrl, sections: ['warm-up', 'drill'] },
  };
  expect(
    (
      await context.request.post('/api/plan', {
        headers: { Origin: 'http://localhost:8791' },
        data: { task },
      })
    ).status(),
  ).toBe(201);
  await page.reload();
  const today = page.getByRole('region', { name: 'What should I do today?' });
  const row = today.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: task.title, exact: true }),
  });
  await row.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(page).toHaveURL(/#practice$/);
  await expect(warmUp).toHaveAttribute('aria-pressed', 'true');
  await expect(drill).toBeVisible();
  await expect(exercise).toHaveCount(0);
  await expect(text).toBeVisible();
  await textSize.selectOption('large');
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important}',
  });
  await page.clock.install({ time: now });
  await page.clock.pauseAt(new Date(now.getTime() + 1000));
  const popups: string[] = [];
  page.on('popup', (popup) => popups.push(popup.url()));
  const pagesBeforePractice = context.pages().length;
  await page.getByRole('button', { name: 'Start practice', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause practice', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#practice$/);
  expect(context.pages()).toHaveLength(pagesBeforePractice);
  await page.clock.fastForward(37_000);
  await drill.click();
  await expect(drill).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Pause practice', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Review & save 00:37', exact: true }),
  ).toBeEnabled();
  await page.clock.fastForward(23_000);
  await page.getByRole('button', { name: 'Pause practice', exact: true }).click();
  await page.clock.fastForward(120_000);
  await warmUp.click();
  await drill.click();
  await expect(
    page.getByRole('button', { name: 'Review & save 01:00', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Resume practice', exact: true }).click();
  await page.clock.fastForward(17_000);
  await page.getByRole('button', { name: 'Pause practice', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Review & save 01:17', exact: true }),
  ).toBeEnabled();
  expect(popups).toEqual([]);
  expect(context.pages()).toHaveLength(pagesBeforePractice);
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(0);

  // Axe schedules browser callbacks; release the fake clock after timed practice.
  await page.clock.resume();
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expectAccessible(page, 'sending-desktop');
  await page.screenshot({ path: '.tmp/sending-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const controls = page.getByRole('group', { name: 'Sending practice controls', exact: true });
  await expect(page.getByRole('button', { name: 'Resume practice', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Review & save 01:17', exact: true })).toHaveCount(
    1,
  );
  // Read down the page while retaining compact, reachable controls above the targets.
  await text.getByText('<BT> <BT> <BT> <BT> <BT>', { exact: true }).scrollIntoViewIfNeeded();
  const controlsBox = await controls.boundingBox();
  expect(controlsBox).not.toBeNull();
  expect(controlsBox!.height).toBeLessThanOrEqual(80);
  expect(controlsBox!.y).toBeGreaterThanOrEqual(0);
  expect(controlsBox!.y + controlsBox!.height).toBeLessThan(844);
  for (const button of [
    controls.getByRole('button', { name: 'Resume practice', exact: true }),
    controls.getByRole('button', { name: 'Review & save 01:17', exact: true }),
  ]) {
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(
      await button.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
        );
      }),
    ).toBe(true);
  }
  await expectAccessible(page, 'sending-mobile');
  await page.screenshot({ path: '.tmp/sending-mobile.png', fullPage: true });

  await page.getByRole('button', { name: 'Review & save 01:17', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Activity', exact: true })).toHaveValue(
    'sending',
  );
  await expect(page.getByLabel(/^Time practiced/)).toHaveValue('1:17');
  await page.getByRole('button', { name: 'Save practice', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/#overview$/);
  await expect(row.getByText('Started', { exact: true })).toBeVisible();
  const entries = (await (await context.request.get('/api/entries')).json()).entries;
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    kind: 'sending',
    metadata: { plannedTaskId: task.id, elapsedSeconds: 77 },
  });
  expect(entries[0].minutes).toBeCloseTo(77 / 60, 8);
  expect((await (await context.request.get('/api/plan')).json()).plan[0].done).toBe(false);
  await page.clock.resume();
});
