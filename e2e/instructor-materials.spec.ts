import { expect, type Page, type Locator } from '@playwright/test';
import { test } from './fixtures';
import { accountRequest, scopedRequest, expectResponsive, signIn } from './helpers';
import { DEFAULT_PROFILE } from '../src/shared/training';
test.use({ hasTouch: true, timezoneId: 'UTC' });
async function keyboard(control: Locator) {
  await expect(control).toBeEnabled();
  await control.focus();
  await expect(control).toBeFocused();
  await control.press('Enter');
}
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.tap();
  await keyboard(
    page.getByRole(['Your account', 'This device'].includes(name) ? 'button' : 'link', {
      name,
      exact: true,
    }),
  );
}
async function arrange(page: Page, context: Parameters<typeof accountRequest>[0], ip: string) {
  if ('setExtraHTTPHeaders' in context)
    await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': ip });
  await signIn(page);
  await page.clock.setFixedTime(new Date('2026-10-03T12:00:00Z'));
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        ...DEFAULT_PROFILE,
        timezone: 'UTC',
        firstClassDate: '2026-10-03',
        classDays: [0, 6],
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await navigate(page, 'Academy guide');
}
async function settleDialog(page: Page) {
  await page
    .getByRole('dialog')
    .evaluate(async (element) =>
      Promise.all(
        element
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
}
async function timed(page: Page, seconds: number) {
  await page.clock.install({ time: new Date('2026-10-03T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-03T12:00:01Z'));
  await keyboard(page.getByRole('button', { name: 'Start practice', exact: true }));
  await page.clock.fastForward(seconds * 1000);
  await keyboard(page.getByRole('button', { name: 'Pause practice', exact: true }));
  await page.clock.resume();
  await keyboard(page.getByRole('button', { name: /Review & save/ }));
}
test('private paste/link/file authoring retains exact revisions through reader, practice/class, cancellation and save retry', async ({
  page,
  context,
}) => {
  await arrange(page, context, '198.51.100.21');
  await keyboard(page.getByRole('button', { name: 'Add material', exact: true }));
  let dialog = page.getByRole('dialog');
  await settleDialog(page);
  await expectResponsive(page, 'material-author');
  await dialog.getByLabel('Title', { exact: true }).fill('Synthetic preparation');
  await dialog
    .getByRole('textbox', { name: 'Material text', exact: true })
    .fill('<script>window.materialExecuted=true</script>\n' + 'CQ TEST\n'.repeat(180));
  await dialog
    .getByLabel('Material link', { exact: true })
    .fill('https://example.test/private-resource');
  await keyboard(dialog.getByRole('button', { name: 'Save material', exact: true }));
  await expect(page.getByRole('dialog', { name: 'Read instructor material' })).toBeVisible();
  const first = (await (await context.request.get('/api/account-state')).json()).state.materials[0];
  expect(first.text).toContain('<script>');
  expect(await page.evaluate(() => Object.hasOwn(window, 'materialExecuted'))).toBe(false);
  await settleDialog(page);
  await expectResponsive(page, 'material-reader');
  await page.getByRole('slider', { name: /Reader text size/ }).focus();
  await page.getByRole('slider', { name: /Reader text size/ }).press('ArrowRight');
  const text = page.getByRole('region', { name: 'Material text', exact: true });
  await text.focus();
  await text.evaluate((element) => {
    Reflect.set(element, 'testScrollEnded', false);
    element.addEventListener('scrollend', () => Reflect.set(element, 'testScrollEnded', true), {
      once: true,
    });
  });
  await text.press('PageDown');
  await expect
    .poll(() => text.evaluate((element) => Reflect.get(element, 'testScrollEnded')))
    .toBe(true);
  await expect.poll(() => text.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const scroll = await text.evaluate((element) => element.scrollTop);
  await page.keyboard.press('Escape');
  await keyboard(page.getByRole('button', { name: 'Read Synthetic preparation', exact: true }));
  await expect(page.getByRole('slider', { name: /Reader text size/ })).toHaveValue('27');
  await expect.poll(() => text.evaluate((element) => element.scrollTop)).toBe(scroll);
  await page.keyboard.press('Escape');
  await navigate(page, 'Today');
  const preparation = page.getByRole('region', { name: 'Instructor preparation', exact: true });
  await expect(preparation).toContainText('Synthetic preparation');
  const next = page.getByRole('region', { name: 'Your next practice', exact: true });
  expect(
    await preparation.evaluate((element) =>
      Boolean(
        element.compareDocumentPosition(document.querySelector('.next-practice')!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ),
  ).toBe(true);
  await expect(next).toBeVisible();
  await expectResponsive(page, 'material-today-preparation');
  await keyboard(page.getByRole('button', { name: 'Open instructor materials', exact: true }));
  await keyboard(page.getByRole('button', { name: 'Read Synthetic preparation', exact: true }));
  await keyboard(page.getByRole('button', { name: 'Use for practice', exact: true }));
  await expect(page).toHaveURL(/#practice(?:[/?].*)?$/);
  await expect(page.getByRole('region', { name: 'Material text' })).toContainText(first.text);
  await expectResponsive(page, 'material-practice');
  await timed(page, 65);
  dialog = page.getByRole('dialog');
  await dialog.getByRole('checkbox', { name: /completed this material/ }).check();
  await page.keyboard.press('Escape');
  expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(0);
  await keyboard(page.getByRole('button', { name: /Review & save/ }));
  await page
    .getByRole('dialog')
    .getByRole('checkbox', { name: /completed this material/ })
    .check();
  await keyboard(page.getByRole('button', { name: 'Save practice', exact: true }));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  let entries = (await (await context.request.get('/api/entries')).json()).entries;
  expect(entries[0]).toMatchObject({
    context: 'practice',
    lesson: 1,
    minutes: 65 / 60,
    metadata: { instructorMaterial: { id: first.id }, materialCompleted: true },
  });
  await navigate(page, 'Academy guide');
  await keyboard(page.getByRole('button', { name: 'Revise Synthetic preparation', exact: true }));
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title', { exact: true }).fill('Synthetic revision');
  await dialog.getByLabel('UTF-8 text file').setInputFiles({
    name: 'synthetic-material.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('UTF-8 café CQ\nRevised source'),
  });
  await expect(dialog.getByRole('textbox', { name: 'Material text', exact: true })).toHaveValue(
    'UTF-8 café CQ\nRevised source',
  );
  await keyboard(dialog.getByRole('button', { name: 'Save revision', exact: true }));
  await expect(page.getByRole('dialog', { name: 'Read instructor material' })).toBeVisible();
  const materials = (await (await context.request.get('/api/account-state')).json()).state
    .materials;
  expect(materials).toHaveLength(2);
  expect(materials.find((material: { id: string }) => material.id === first.id)).toEqual(first);
  const revised = materials.find(
    (material: { supersedesId?: string }) => material.supersedesId === first.id,
  );
  expect(revised.filename).toBe('synthetic-material.txt');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Use in class', exact: true }).tap();
  await timed(page, 30);
  await settleDialog(page);
  await expectResponsive(page, 'material-class-review');
  await expect(page.getByRole('checkbox', { name: /class meeting/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /class meeting/ })).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: /completed this material/ })).toHaveCount(0);
  await keyboard(page.getByRole('button', { name: 'Save practice', exact: true }));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  entries = (await (await context.request.get('/api/entries')).json()).entries;
  expect(entries).toHaveLength(2);
  expect(entries.find((entry: { context: string }) => entry.context === 'class')).toMatchObject({
    minutes: 0.5,
    metadata: { instructorMaterial: { id: revised.id, supersedesId: first.id } },
  });
  await navigate(page, 'Practice log');
  await page.getByText('Practice evidence', { exact: true }).first().click();
  await expect(page.getByText(/Exact material version:/).first()).toBeVisible();
  await expectResponsive(page, 'material-history');
  const backup = await (await context.request.get('/api/export')).json();
  expect(backup.materials).toEqual(materials);
});

test('unmatched imported material revisions can be explicitly associated and remain immutable during failure/retry and native use', async ({
  page,
  context,
}) => {
  await arrange(page, context, '198.51.100.22');
  const original = {
    course: { title: 'Unmatched source' },
    attempts: [],
    materials: [
      {
        id: 'original:one',
        session: 20,
        title: 'Earlier imported material',
        text: 'OLD TEXT',
        usage: 'reference',
        createdAt: '2026-10-01T12:00:00Z',
      },
      {
        id: 'original:two',
        session: 20,
        title: 'Imported revision',
        text: 'ACTUAL ORIGINAL REVISION',
        usage: 'class',
        supersedesId: 'original:one',
        createdAt: '2026-10-02T12:00:00Z',
      },
    ],
  };
  expect(
    (
      await scopedRequest(context, 'POST', '/api/import', { mode: 'merge', data: original })
    ).status(),
  ).toBe(200);
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        ...DEFAULT_PROFILE,
        timezone: 'UTC',
        firstClassDate: '2026-10-03',
        classDays: [0, 6],
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await navigate(page, 'Academy guide');
  await keyboard(page.getByText('Imported original materials (2)', { exact: true }));
  await keyboard(page.getByRole('button', { name: 'Associate Imported revision', exact: true }));
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('combobox', { name: 'Session', exact: true })).toHaveValue('');
  await dialog.getByRole('combobox', { name: 'Session', exact: true }).selectOption('2');
  await settleDialog(page);
  await expectResponsive(page, 'material-original-association');
  // Denied browser persistence must retain fields and must not claim a save.
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Object.defineProperty(window, '__materialSet', { value: set });
    Storage.prototype.setItem = function (name, value) {
      if (name.startsWith('cwa:account:operation:'))
        throw new Error('Synthetic queue storage failure');
      return set.call(this, name, value);
    };
  });
  await keyboard(dialog.getByRole('button', { name: 'Save associated copy', exact: true }));
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Session', exact: true })).toHaveValue('2');
  await page.evaluate(() => {
    Storage.prototype.setItem = Reflect.get(window, '__materialSet');
  });
  await keyboard(dialog.getByRole('button', { name: 'Save associated copy', exact: true }));
  await expect(page.getByRole('dialog', { name: 'Read instructor material' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Material text' })).toHaveText(
    'ACTUAL ORIGINAL REVISION',
  );
  await expect(page.getByText(/Original material original:two/)).toBeVisible();
  await page.getByRole('button', { name: 'Use in class', exact: true }).tap();
  await timed(page, 12);
  await keyboard(page.getByRole('button', { name: 'Save practice', exact: true }));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const exported = await (await context.request.get('/api/export')).json();
  expect(exported.legacy.data).toEqual(original);
  expect(exported.materials).toHaveLength(1);
  expect(exported.materials[0].origin).toMatchObject({
    id: 'original:two',
    supersedesId: 'original:one',
  });
  expect(exported.sessions[0]).toMatchObject({
    context: 'class',
    lesson: 2,
    metadata: { instructorMaterial: { origin: { id: 'original:two' } } },
  });
});

test('accepted long native and imported titles fit the library, reader and association controls', async ({
  page,
  context,
}) => {
  await arrange(page, context, '198.51.100.23');
  const title = 'T'.repeat(200);
  await keyboard(page.getByRole('button', { name: 'Add material', exact: true }));
  await page.getByRole('dialog').getByLabel('Title', { exact: true }).fill(title);
  await page
    .getByRole('dialog')
    .getByLabel('Material link', { exact: true })
    .fill('https://example.test/long-title');
  await keyboard(page.getByRole('button', { name: 'Save material', exact: true }));
  await expect(page.getByRole('dialog', { name: 'Read instructor material' })).toBeVisible();
  await settleDialog(page);
  await expectResponsive(page, 'material-long-title-reader');
  await page.keyboard.press('Escape');
  await expectResponsive(page, 'material-long-title-library');
  await keyboard(page.getByRole('button', { name: `Revise ${title}`, exact: true }));
  await expect(page.getByRole('dialog').getByLabel('Title', { exact: true })).toHaveValue(title);
  await page.keyboard.press('Escape');
  await navigate(page, 'Today');
  await expect(page.getByRole('region', { name: 'Instructor preparation' })).toContainText(title);
  await expectResponsive(page, 'material-long-title-preparation');

  const importedTitle = 'I'.repeat(200);
  const original = {
    course: { title: 'Synthetic source' },
    attempts: [],
    materials: [
      {
        id: 'original:long',
        session: 1,
        title: importedTitle,
        text: 'PRIVATE SOURCE',
        filename: 'F'.repeat(255),
        usage: 'reference',
      },
    ],
  };
  expect(
    (
      await scopedRequest(context, 'POST', '/api/import', { mode: 'merge', data: original })
    ).status(),
  ).toBe(200);
  expect(
    (
      await accountRequest(context, 'PUT', '/api/settings', {
        ...DEFAULT_PROFILE,
        timezone: 'UTC',
        firstClassDate: '2026-10-03',
        classDays: [0, 6],
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await navigate(page, 'Academy guide');
  await keyboard(page.getByText('Imported original materials (1)', { exact: true }));
  await expectResponsive(page, 'material-long-imported-library');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: `Associate ${importedTitle}`, exact: true }).tap();
  await settleDialog(page);
  await expectResponsive(page, 'material-long-imported-association');
  await keyboard(page.getByRole('button', { name: 'Save associated copy', exact: true }));
  await expect(page.getByRole('dialog', { name: 'Read instructor material' })).toBeVisible();
  await settleDialog(page);
  await expectResponsive(page, 'material-long-imported-reader');
  expect((await (await context.request.get('/api/export')).json()).legacy.data).toEqual(original);
});
