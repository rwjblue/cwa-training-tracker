import { e2eOrigin } from './environment';
import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

type FixtureContext = APIRequestContext | BrowserContext;
type WriteMethod = 'POST' | 'PUT' | 'DELETE';

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
