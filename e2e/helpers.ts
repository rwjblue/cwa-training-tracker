import { e2eOrigin } from './environment';
import {
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

type FixtureContext = APIRequestContext | BrowserContext;
type WriteMethod = 'POST' | 'PUT' | 'DELETE';

/** Open optional controls through their visible disclosure, preserving an already-open panel. */
export async function openDisclosure(scope: Page | Locator, name: string) {
  const summary = scope.getByText(name, { exact: true });
  if (!(await summary.evaluate((element) => (element.parentElement as HTMLDetailsElement).open)))
    await summary.click();
}

/** Inspect another view through the shared navigation without retiring the current block. */
export async function navigateView(
  page: Page,
  name: string,
  activate: (control: Locator) => Promise<void> = (control) => control.click(),
) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await activate(menu);
  await activate(
    page
      .getByRole('navigation', { name: 'Main navigation', exact: true })
      .getByRole('link', { name, exact: true }),
  );
}

/** Deliberately launch a tool from the library, preserving the current block's save guard. */
export async function openPracticeTool(
  page: Page,
  name: string,
  activate: (control: Locator) => Promise<void> = (control) => control.click(),
) {
  await navigateView(page, 'Practice tools', activate);
  await activate(
    page
      .getByRole('region', { name: 'Practice tools', exact: true })
      .getByRole('link', { name, exact: true }),
  );
}

async function accountHeaders(context: FixtureContext) {
  const request = 'request' in context ? context.request : context;
  const response = await request.get('/api/account-state');
  expect(response.ok()).toBe(true);
  const { state } = await response.json();
  return {
    request,
    headers: {
      Origin: e2eOrigin,
      'X-CWA-Account': state.accountId as string,
      'If-Match': `"${state.revision}"`,
      'X-CWA-Generation': String(state.generation),
    },
  };
}

/** Arrange mutable fixtures against a freshly confirmed account revision. */
export async function accountRequest(
  context: FixtureContext,
  method: WriteMethod,
  path: string,
  data: unknown,
) {
  const { request, headers } = await accountHeaders(context);
  return request.fetch(path, { method, headers, data });
}

/** Result fixture writes retain their expected account, like the production queue. */
export async function scopedRequest(
  context: FixtureContext,
  method: WriteMethod,
  path: string,
  data: unknown,
) {
  const { request, headers } = await accountHeaders(context);
  return request.fetch(path, {
    method,
    headers: {
      Origin: headers.Origin,
      'X-CWA-Account': headers['X-CWA-Account'],
      'X-CWA-Generation': headers['X-CWA-Generation'],
    },
    data,
  });
}

export async function expectAccessible(page: Page, label: string) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  const summary = result.violations.flatMap((item) =>
    item.nodes.map((node) => ({ rule: item.id, target: node.target, detail: node.failureSummary })),
  );
  await writeFile(`.tmp/accessibility-${label}.json`, JSON.stringify(summary, null, 2));
  expect(summary.map((item) => `${item.rule}: ${item.target.join(', ')}`)).toEqual([]);
}

/** Check a settled screen at both widths without replaying its persistence workflow. */
export async function expectResponsive(page: Page, label: string) {
  const original = page.viewportSize();
  try {
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `${label} should fit at ${viewport.width}px`,
      ).toBe(true);
      if (viewport.width === 390) {
        // iOS Safari zooms when focusing text controls smaller than 16px.
        const undersizedControls = await page
          .locator('input, textarea, select')
          .evaluateAll((controls) =>
            controls
              .filter((control) => {
                if (
                  control.matches(
                    '[type="checkbox"], [type="radio"], [type="range"], [type="file"]',
                  )
                )
                  return false;
                const style = getComputedStyle(control);
                return (
                  control.getClientRects().length > 0 &&
                  style.visibility === 'visible' &&
                  parseFloat(style.fontSize) < 16
                );
              })
              .map(
                (control) => control.getAttribute('aria-label') || control.id || control.tagName,
              ),
          );
        expect(undersizedControls, `${label} should avoid Safari input-focus zoom`).toEqual([]);
      }
      await expectAccessible(page, `${label}-${viewport.width}`);
    }
  } finally {
    if (original) await page.setViewportSize(original);
  }
}

async function latestLocalCode(after: number, email: string): Promise<string> {
  let code = '';
  await expect
    .poll(
      async () => {
        const output = (await readFile('.tmp/e2e-server.log', 'utf8'))
          .slice(after)
          .replace(/\u001b\[[0-9;]*m/g, '');
        // Match the recipient and text file in the same simulator message.
        // Another worker's newer email must never supply this browser's code.
        const paths = [
          ...output.matchAll(/^To: ([^\r\n]+)\r?\n(?:(?!^To:)[\s\S])*?^Text:\s*(\S+\.txt)/gm),
        ];
        for (const match of paths.reverse()) {
          if (match[1].trim().toLowerCase() !== email.trim().toLowerCase()) continue;
          const text = await readFile(match[2], 'utf8').catch(() => '');
          code = text.match(/sign-in code is (\d{6})/)?.[1] ?? '';
          if (code) return true;
        }
        return false;
      },
      { timeout: 15_000, message: 'A code should arrive in the local email simulator' },
    )
    .toBe(true);
  return code;
}

export async function signIn(
  page: Page,
  { dialogAlreadyOpen = false, email = `browser-${crypto.randomUUID()}@example.test` } = {},
) {
  const offset = (await readFile('.tmp/e2e-server.log', 'utf8')).length;
  if (!dialogAlreadyOpen) {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  }
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in code', exact: true }).click();
  const code = await latestLocalCode(offset, email);
  await page.getByLabel('One-time code', { exact: true }).fill(code);
  await page
    .getByRole('button', { name: /verify|continue|sign in/i })
    .last()
    .click();
  await expect(page.getByRole('dialog', { name: 'Check your inbox.', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open your account', exact: true })).toBeVisible();
}

/** Use the pitch slider's keyboard controls; no exact-value field is displayed. */
export async function setSidetone(page: Page, value: number) {
  const slider = page.getByRole('slider', { name: 'Sidetone', exact: true });
  await expect(slider).toBeEnabled();
  await slider.press('Home');
  const pages = Math.floor((value - 300) / 70);
  for (let i = 0; i < pages; i++) await slider.press('PageUp');
  let current = Number(await slider.inputValue());
  while (current !== value) {
    await slider.press(current < value ? 'ArrowRight' : 'ArrowLeft');
    current += current < value ? 1 : -1;
  }
}
