import { expect, type Locator, type Page } from '@playwright/test';
import { test } from './fixtures';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { accountRequest, expectResponsive, scopedRequest, signIn } from './helpers';

test.use({ hasTouch: true });

async function activate(page: Page, control: Locator, mobile: boolean) {
  await expect(control).toBeEnabled();
  if (mobile) await control.tap();
  else {
    await control.focus();
    await page.keyboard.press('Enter');
  }
}

test('safe stop describes a changed server log and refreshes a second open page', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '192.0.2.145' });
  await signIn(page);
  const entry = {
    id: 'before-remote-stop',
    date: '2026-09-30',
    kind: 'other',
    minutes: 1,
    notes: 'Original history before remote reset',
    source: 'manual',
    createdAt: '2026-09-30T12:00:00.000Z',
  };
  expect((await scopedRequest(context, 'POST', '/api/entries', entry)).ok()).toBe(true);
  await page.reload();
  await navigate(page, 'Practice log', false);
  await context.route('**/api/entries', (route) =>
    route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue(),
  );
  await manual(page, 'Waiting work from the old dataset', false);
  const observer = await context.newPage();
  await observer.goto('/#logbook');
  await expect(observer.getByText(entry.notes, { exact: true })).toBeVisible();
  await navigate(page, 'Your account', false);
  await page.route('**/api/account-lifecycle/prepare', async (route) => {
    expect((await route.fetch()).ok()).toBe(true);
    await route.abort('failed');
  });
  await activate(
    page,
    page.getByRole('button', { name: 'Reset practice data', exact: true }),
    false,
  );
  const review = page.getByRole('dialog', { name: 'Start with a fresh page?', exact: true });
  await review.getByRole('radio', { name: /^Discard old waiting work/ }).check();
  await review.getByLabel('Type RESET to continue', { exact: true }).fill('RESET');
  await activate(
    page,
    review.getByRole('button', { name: 'Reset practice data', exact: true }),
    false,
  );
  const status = page.getByRole('region', { name: 'Account data change' });
  await expect(status).toContainText('Your account work is paused before this request is sent.');

  // Arrange an independent device's committed boundary while this page has
  // only reserved its request. Stopping the old reservation cannot restore it.
  const { state } = await (await context.request.get('/api/account-state')).json();
  const payload = { confirmation: 'RESET' };
  const identity = {
    version: 1,
    id: crypto.randomUUID(),
    accountId: state.accountId,
    kind: 'reset',
    baseRevision: state.revision,
    baseHistoryRevision: state.historyRevision,
    generation: state.generation,
    payloadHash: createHash('sha256')
      .update(JSON.stringify({ kind: 'reset', payload }))
      .digest('hex'),
  };
  expect(
    (await scopedRequest(context, 'POST', '/api/account-lifecycle/prepare', identity)).ok(),
  ).toBe(true);
  expect(
    (await scopedRequest(context, 'POST', '/api/reset', { ...payload, lifecycle: identity })).ok(),
  ).toBe(true);
  expect(
    (
      await scopedRequest(context, 'POST', '/api/entries', {
        ...entry,
        id: 'after-remote-stop',
        notes: 'Current history from another device',
      })
    ).ok(),
  ).toBe(true);
  await activate(
    page,
    status.getByRole('button', { name: 'Stop request safely', exact: true }),
    false,
  );
  await expect(status).toHaveCount(0);
  await expect(review).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('The server log changed elsewhere');
  await expect(
    observer.getByText('Current history from another device', { exact: true }),
  ).toBeVisible();
  await expect(observer.getByText(entry.notes, { exact: true })).toHaveCount(0);
  await context.unroute('**/api/entries');
  await navigate(page, 'Practice log', false);
  await manual(page, 'Fresh work after safe stop', false);
  await expect
    .poll(async () => (await (await context.request.get('/api/entries')).json()).entries.length)
    .toBe(2);
  await observer.close();
});
async function navigate(page: Page, name: string, mobile: boolean) {
  if (mobile) await page.getByRole('button', { name: 'Open navigation', exact: true }).tap();
  await activate(page, page.getByRole('button', { name, exact: true }), mobile);
}
async function manual(page: Page, notes: string, mobile: boolean) {
  await activate(
    page,
    page.getByRole('button', { name: 'Log practice', exact: true }).first(),
    mobile,
  );
  await page.getByLabel(/^Time practiced/).fill('0:43');
  await page.getByLabel(/^Notes/).fill(notes);
  await activate(page, page.getByRole('button', { name: 'Save practice', exact: true }), mobile);
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function fileDownload(page: Page, control: Locator, mobile: boolean) {
  const event = page.waitForEvent('download');
  await activate(page, control, mobile);
  const file = await event;
  return JSON.parse(await readFile((await file.path())!, 'utf8'));
}
async function replacement(
  page: Page,
  data: unknown,
  mobile: boolean,
  name = 'synthetic-replacement.json',
) {
  const chooser = page.waitForEvent('filechooser');
  await activate(page, page.getByRole('button', { name: 'Import backup', exact: true }), mobile);
  await (
    await chooser
  ).setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  const importReview = page.getByRole('dialog', {
    name: 'Bring your practice along.',
    exact: true,
  });
  await importReview.getByRole('radio', { name: /^Replace my practice data/ }).check();
  await activate(
    page,
    importReview.getByRole('button', { name: 'Replace and import', exact: true }),
    mobile,
  );
  return page.getByRole('dialog', { name: 'Replace your practice data?', exact: true });
}
async function geometry(page: Page, label: string) {
  // Inspect the settled interface; transient modal opacity is not its contrast.
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.playState === 'running' &&
            animation.effect?.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const status = page.getByRole('region', { name: 'Account data change' });
  if (await status.count()) {
    const paragraphWidths = await status
      .locator('p')
      .evaluateAll((paragraphs) =>
        paragraphs.map((paragraph) => paragraph.getBoundingClientRect().width),
      );
    expect(paragraphWidths.length).toBeGreaterThan(0);
    // Pending/error instructions need a readable line, even if narrow columns
    // technically avoid horizontal overflow and satisfy accessibility rules.
    expect(Math.min(...paragraphWidths)).toBeGreaterThan(250);
  }
  await expectResponsive(page, label);
}

const mobile = false;

const mode = mobile ? 'mobile touch' : 'desktop keyboard';
test(`reset retires queued work and a committed delayed acknowledgement (${mode})`, async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await context.setExtraHTTPHeaders({
    'CF-Connecting-IP': '192.0.2.141',
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#logbook');
  await manual(page, 'Guest work outside the reset scope', mobile);
  const guestKeys = await page.evaluate(() =>
    Object.entries(localStorage).filter(([key]) =>
      key.startsWith('cwa:practice:pending:v1:guest:'),
    ),
  );
  await signIn(page);
  const owner = (await (await context.request.get('/api/me')).json()).user;
  expect(
    (
      await scopedRequest(context, 'POST', '/api/entries', {
        id: `before-reset-${mobile}`,
        date: '2026-09-30',
        kind: 'other',
        minutes: 1,
        notes: 'Confirmed before reset',
        source: 'manual',
        createdAt: '2026-09-30T12:00:00.000Z',
      })
    ).ok(),
  ).toBe(true);
  await page.reload();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let committed!: () => void;
  const commit = new Promise<void>((resolve) => {
    committed = resolve;
  });
  let first = true;
  await page.route('**/api/entries', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    if (!first) return route.abort('internetdisconnected');
    first = false;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    committed();
    await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.route('**/api/account-operations', (route) => route.abort('internetdisconnected'));
  try {
    await navigate(page, 'Practice log', mobile);
    await manual(page, 'Committed save with held acknowledgement', mobile);
    await commit;
    await manual(page, 'Queued result must never return', mobile);
    await navigate(page, 'Your account', mobile);
    await page.getByLabel('Name', { exact: true }).fill('Queued old preference');
    await activate(
      page,
      page.getByRole('button', { name: 'Save preferences', exact: true }),
      mobile,
    );
    await expect(page.getByRole('region', { name: 'Account sync status' })).toContainText(
      '1 account edit saved on this device.',
    );
    const frozen = await page.evaluate(() =>
      Object.entries(localStorage).filter(
        ([key]) => key.startsWith('cwa:practice:pending:v1:') && !key.includes(':guest:'),
      ),
    );
    expect(frozen).toHaveLength(2);
    await activate(
      page,
      page.getByRole('button', { name: 'Reset practice data', exact: true }),
      mobile,
    );
    let dialog = page.getByRole('dialog', { name: 'Start with a fresh page?', exact: true });
    await expect(dialog).toContainText(owner.email);
    await expect(
      dialog.getByRole('button', { name: 'Reset practice data', exact: true }),
    ).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        Object.entries(localStorage).filter(
          ([key]) => key.startsWith('cwa:practice:pending:v1:') && !key.includes(':guest:'),
        ),
      ),
    ).toEqual(frozen);
    await activate(
      page,
      page.getByRole('button', { name: 'Reset practice data', exact: true }),
      mobile,
    );
    dialog = page.getByRole('dialog', { name: 'Start with a fresh page?', exact: true });
    const serverBackup = await fileDownload(
      page,
      dialog.getByRole('button', { name: 'Download server backup', exact: true }),
      mobile,
    );
    expect(serverBackup.sessions.map((entry: { notes: string }) => entry.notes)).toContain(
      'Committed save with held acknowledgement',
    );
    const deviceBackup = await fileDownload(
      page,
      dialog.getByRole('button', { name: 'Download device backup', exact: true }),
      mobile,
    );
    expect(deviceBackup.scope.id).toBe(owner.id);
    expect(deviceBackup.stores.practice).toHaveLength(2);
    expect(deviceBackup.stores.accountOperations).toHaveLength(1);
    expect(deviceBackup.stores.practice.map((item: { body: string }) => item.body).sort()).toEqual(
      frozen.map(([, body]) => body).sort(),
    );
    await dialog.getByLabel('Type RESET to continue', { exact: true }).fill('RESET');
    await geometry(page, `lifecycle-reset-review-desktop`);
    const response = page.waitForResponse(
      (item) => new URL(item.url()).pathname === '/api/reset' && item.request().method() === 'POST',
    );
    const recoveryDownload = page.waitForEvent('download');
    await activate(
      page,
      dialog.getByRole('button', { name: 'Reset practice data', exact: true }),
      mobile,
    );
    expect((await response).ok()).toBe(true);
    const recovery = JSON.parse(await readFile((await (await recoveryDownload).path())!, 'utf8'));
    expect(recovery.stores.practice).toHaveLength(2);
    await expect(page.getByRole('region', { name: 'Account data change' })).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Your space, at your pace.', exact: true }),
    ).toBeVisible();
    release();
    await page.unroute('**/api/entries');
    await page.unroute('**/api/account-operations');
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.reload();
    const after = await (await context.request.get('/api/entries')).json();
    expect(after.generation).toBe(1);
    expect(after.entries).toEqual([]);
    expect(
      await page.evaluate(() =>
        Object.entries(localStorage).filter(([key]) =>
          key.startsWith('cwa:practice:pending:v1:guest:'),
        ),
      ),
    ).toEqual(guestKeys);
    await navigate(page, 'Practice log', mobile);
    await manual(page, 'Fresh practice after reset', mobile);
    await expect(page.getByText('Fresh practice after reset', { exact: true })).toBeVisible();
    await expect
      .poll(async () =>
        (await (await context.request.get('/api/entries')).json()).entries.map(
          (entry: { notes: string }) => entry.notes,
        ),
      )
      .toEqual(['Fresh practice after reset']);
    await geometry(page, `lifecycle-reset-ready-desktop`);
  } finally {
    release();
  }
});

test(`replacement preserves a stable request across lost response and reload (${mode})`, async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await context.setExtraHTTPHeaders({
    'CF-Connecting-IP': '192.0.2.143',
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  expect(
    (
      await scopedRequest(context, 'POST', '/api/entries', {
        id: `before-replace-${mobile}`,
        date: '2026-09-30',
        kind: 'other',
        minutes: 1,
        notes: 'Original dataset',
        source: 'manual',
        createdAt: '2026-09-30T12:00:00.000Z',
      })
    ).ok(),
  ).toBe(true);
  await navigate(page, 'Your account', mobile);
  const backup = await fileDownload(
    page,
    page.getByRole('button', { name: 'Export backup', exact: true }),
    mobile,
  );
  const data = {
    ...backup,
    sessions: [
      { ...backup.sessions[0], id: `replacement-${mobile}`, notes: 'Replacement dataset' },
    ],
  };
  await page.route('**/api/entries', (route) =>
    route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue(),
  );
  await navigate(page, 'Practice log', mobile);
  await manual(page, 'Retired queue before replacement', mobile);
  await navigate(page, 'Your account', mobile);
  const originalWaiting = await page.evaluate(() =>
    Object.entries(localStorage).filter(([key]) => key.startsWith('cwa:practice:pending:v1:')),
  );
  const invalid = { ...backup, sessions: [{ ...backup.sessions[0], minutes: -1 }] };
  const rejectedReview = await replacement(page, invalid, mobile, 'invalid-synthetic.json');
  await rejectedReview.getByRole('radio', { name: /^Discard old waiting work/ }).check();
  await activate(
    page,
    rejectedReview.getByRole('button', { name: 'Replace and import', exact: true }),
    mobile,
  );
  const failed = page.getByRole('region', { name: 'Account data change' });
  await expect(failed).toContainText('The server outcome has not been confirmed.');
  await expect(
    failed.getByRole('button', { name: 'Stop request safely', exact: true }),
  ).toBeEnabled();
  await geometry(page, `lifecycle-replace-failed-desktop`);
  expect(
    (await (await context.request.get('/api/entries')).json()).entries.map(
      (entry: { notes: string }) => entry.notes,
    ),
  ).toEqual(['Original dataset']);
  await activate(
    page,
    failed.getByRole('button', { name: 'Stop request safely', exact: true }),
    mobile,
  );
  await expect(rejectedReview).toBeVisible();
  await expect(rejectedReview).toContainText('invalid-synthetic.json');
  expect(
    await page.evaluate(() =>
      Object.entries(localStorage).filter(([key]) => key.startsWith('cwa:practice:pending:v1:')),
    ),
  ).toEqual(originalWaiting);
  expect((await (await context.request.get('/api/entries')).json()).generation).toBe(0);
  await activate(
    page,
    rejectedReview.getByRole('button', { name: 'Keep my data', exact: true }),
    mobile,
  );
  expect(invalid.sessions[0].minutes).toBe(-1);
  let identity: unknown;
  const posted: unknown[] = [];
  await page.route('**/api/import', async (route) => {
    if (route.request().postDataJSON()?.mode !== 'replace') return route.continue();
    identity = route.request().postDataJSON().lifecycle;
    posted.push(route.request().postDataJSON());
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort('failed');
  });
  await context.route('**/api/account-lifecycle/outcome', (route) =>
    route.abort('internetdisconnected'),
  );
  const dialog = await replacement(page, data, mobile);
  await dialog.getByRole('radio', { name: /^Discard old waiting work/ }).check();
  await geometry(page, `lifecycle-replace-review-desktop`);
  await activate(
    page,
    dialog.getByRole('button', { name: 'Replace and import', exact: true }),
    mobile,
  );
  const pending = page.getByRole('region', { name: 'Account data change' });
  await expect(pending).toContainText('The server outcome has not been confirmed.');
  expect(identity).toBeTruthy();
  const stored = await (await context.request.get('/api/entries')).json();
  expect(stored.generation).toBe(1);
  expect(stored.entries.map((entry: { notes: string }) => entry.notes)).toEqual([
    'Replacement dataset',
  ]);
  // A new shell has only the compact request identity, never a duplicate file.
  await page.reload();
  await expect(pending).toContainText('The server outcome has not been confirmed.');
  const device = await fileDownload(
    page,
    pending.getByRole('button', { name: 'Download device recovery', exact: true }),
    mobile,
  );
  expect(device.stores.practice).toHaveLength(1);
  await activate(
    page,
    pending.getByRole('button', { name: 'Retry exact request', exact: true }),
    mobile,
  );
  await expect(pending).toContainText(
    'Choose the same replacement file to retry this exact request.',
  );
  await geometry(page, `lifecycle-replace-pending-desktop`);
  await page.unroute('**/api/import');
  await page.unroute('**/api/entries');
  const retryBodies: unknown[] = [];
  const retriedIdentities: unknown[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/import') retryBodies.push(request.postDataJSON());
    if (new URL(request.url()).pathname === '/api/account-lifecycle/prepare')
      retriedIdentities.push(request.postDataJSON());
  });
  const choose = page.waitForEvent('filechooser');
  await activate(
    page,
    pending.getByRole('button', { name: 'Choose original replacement file', exact: true }),
    mobile,
  );
  await (
    await choose
  ).setFiles({
    name: 'same-replacement.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  });
  // Arrange new-generation history as another device would. Exact destructive
  // replay must return its receipt and leave this newer practice untouched.
  expect(
    (
      await scopedRequest(context, 'POST', '/api/entries', {
        id: `newer-${mobile}`,
        date: '2026-09-30',
        kind: 'other',
        minutes: 1,
        notes: 'Newer practice must survive exact replay',
        source: 'manual',
        createdAt: '2026-09-30T13:00:00.000Z',
      })
    ).ok(),
  ).toBe(true);
  await activate(
    page,
    pending.getByRole('button', { name: 'Retry exact request', exact: true }),
    mobile,
  );
  await expect(pending).toHaveCount(0);
  expect(retriedIdentities).toEqual([identity]);
  expect(posted).toHaveLength(1);
  // An applied reservation receipt resolves this exact request without
  // uploading the replacement a second time.
  expect(retryBodies).toEqual([]);
  await context.unroute('**/api/account-lifecycle/outcome');
  await navigate(page, 'Practice log', mobile);
  await expect(page.getByText('Replacement dataset', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Newer practice must survive exact replay', { exact: true }),
  ).toBeVisible();
  const after = await (await context.request.get('/api/entries')).json();
  expect(after.generation).toBe(1);
  expect(after.entries).toHaveLength(2);
  expect(
    after.entries.some(
      (entry: { notes: string }) => entry.notes === 'Retired queue before replacement',
    ),
  ).toBe(false);
  await geometry(page, `lifecycle-replace-ready-desktop`);
});

for (const kind of ['reset', 'replace'] as const) {
  const mobile = kind === 'replace';
  test(`Keep recovery files protects server work added after download (${kind})`, async ({
    page,
    context,
  }) => {
    await context.setExtraHTTPHeaders({
      'CF-Connecting-IP': mobile ? '192.0.2.147' : '192.0.2.146',
    });
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await signIn(page);
    const original = {
      id: `backup-original-${kind}`,
      date: '2026-09-30',
      kind: 'other',
      minutes: 1,
      notes: 'Original server evidence',
      source: 'manual',
      createdAt: '2026-09-30T12:00:00.000Z',
    };
    expect((await scopedRequest(context, 'POST', '/api/entries', original)).ok()).toBe(true);
    await page.reload();
    await navigate(page, 'Your account', mobile);
    let review: Locator;
    if (kind === 'reset') {
      await activate(
        page,
        page.getByRole('button', { name: 'Reset practice data', exact: true }),
        mobile,
      );
      review = page.getByRole('dialog', { name: 'Start with a fresh page?', exact: true });
      await review.getByLabel('Type RESET to continue', { exact: true }).fill('RESET');
    } else {
      const source = await (await context.request.get('/api/export')).json();
      review = await replacement(
        page,
        {
          ...source,
          sessions: [
            { ...original, id: 'replacement-recovery-safe', notes: 'Replacement evidence' },
          ],
        },
        mobile,
      );
    }
    const confirm = review.getByRole('button', {
      name: kind === 'reset' ? 'Reset practice data' : 'Replace and import',
      exact: true,
    });
    const firstServer = await fileDownload(
      page,
      review.getByRole('button', { name: 'Download server backup', exact: true }),
      mobile,
    );
    expect(firstServer.sessions.map((entry: { notes: string }) => entry.notes)).toEqual([
      'Original server evidence',
    ]);
    expect(firstServer.accountId).toBeUndefined();
    expect(firstServer.historyRevision).toBeUndefined();
    await fileDownload(
      page,
      review.getByRole('button', { name: 'Download device backup', exact: true }),
      mobile,
    );
    await expect(confirm).toBeEnabled();
    const authorityBefore = (await (await context.request.get('/api/account-state')).json()).state;
    expect(
      (
        await scopedRequest(context, 'POST', '/api/entries', {
          ...original,
          id: `backup-newer-${kind}`,
          notes: 'Server evidence added after download',
        })
      ).ok(),
    ).toBe(true);
    const authorityAfter = (await (await context.request.get('/api/account-state')).json()).state;
    expect(authorityAfter.revision).toBe(authorityBefore.revision);
    expect(authorityAfter.historyRevision).toBeGreaterThan(authorityBefore.historyRevision);
    const refused = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/account-lifecycle/prepare',
    );
    await activate(page, confirm, mobile);
    expect((await refused).status()).toBe(409);
    const status = page.getByRole('region', { name: 'Account data change' });
    await expect(
      status.getByRole('button', { name: 'Stop request safely', exact: true }),
    ).toBeEnabled();
    expect((await (await context.request.get('/api/entries')).json()).entries).toHaveLength(2);
    await geometry(page, `lifecycle-stale-backup-${kind}-${mobile ? 'mobile' : 'desktop'}`);
    await activate(
      page,
      status.getByRole('button', { name: 'Stop request safely', exact: true }),
      mobile,
    );
    await expect(review).toBeVisible();
    await expect(confirm).toBeDisabled();

    // A response downloaded for an older semantic revision must not rearm Keep
    // when a remote edit lands while that export response is delayed.
    await fileDownload(
      page,
      review.getByRole('button', { name: 'Download device backup', exact: true }),
      mobile,
    );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held!: () => void;
    const captured = new Promise<void>((resolve) => {
      held = resolve;
    });
    await page.route('**/api/account-lifecycle/backup', async (route) => {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      held();
      await gate;
      await route.fulfill({ response });
    });
    const delayedDownload = page.waitForEvent('download');
    await activate(
      page,
      review.getByRole('button', { name: 'Download server backup', exact: true }),
      mobile,
    );
    await captured;
    try {
      const { state } = await (await context.request.get('/api/account-state')).json();
      expect(
        (
          await accountRequest(context, 'PUT', '/api/settings', {
            ...state.settings,
            displayName: 'Remote preference after export',
          })
        ).ok(),
      ).toBe(true);
    } finally {
      release();
    }
    const delayedFile = JSON.parse(await readFile((await (await delayedDownload).path())!, 'utf8'));
    expect(delayedFile.profile.displayName).not.toBe('Remote preference after export');
    await expect(review).toContainText('Your server data changed after the download.');
    await expect(confirm).toBeDisabled();
    await page.unroute('**/api/account-lifecycle/backup');

    const freshServer = await fileDownload(
      page,
      review.getByRole('button', { name: 'Download server backup', exact: true }),
      mobile,
    );
    expect(freshServer.sessions.map((entry: { notes: string }) => entry.notes)).toContain(
      'Server evidence added after download',
    );
    expect(freshServer.profile.displayName).toBe('Remote preference after export');
    await expect(confirm).toBeEnabled();
    await geometry(page, `lifecycle-fresh-backup-${kind}-${mobile ? 'mobile' : 'desktop'}`);
    const applied = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === (kind === 'reset' ? '/api/reset' : '/api/import'),
    );
    await activate(page, confirm, mobile);
    expect((await applied).ok()).toBe(true);
    await expect(status).toHaveCount(0);
    await expect(review).toHaveCount(0);
    const after = await (await context.request.get('/api/entries')).json();
    expect(after.generation).toBe(1);
    expect(after.entries.map((entry: { notes: string }) => entry.notes)).toEqual(
      kind === 'reset' ? [] : ['Replacement evidence'],
    );
  });
}
