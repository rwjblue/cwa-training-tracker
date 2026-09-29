import { expect, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

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

async function latestLocalCode(after: number): Promise<string> {
  let code = '';
  await expect
    .poll(
      async () => {
        const output = (await readFile('.tmp/e2e-server.log', 'utf8'))
          .slice(after)
          .replace(/\u001b\[[0-9;]*m/g, '');
        const paths = [...output.matchAll(/(?:Text|text):\s*(\S+\.txt)/g)];
        for (const match of paths.reverse()) {
          const text = await readFile(match[1], 'utf8').catch(() => '');
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

export async function signIn(page: Page, { dialogAlreadyOpen = false } = {}) {
  const offset = (await readFile('.tmp/e2e-server.log', 'utf8')).length;
  if (!dialogAlreadyOpen) {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  }
  await page.getByLabel('Email address').fill(`browser-${crypto.randomUUID()}@example.test`);
  await page.getByRole('button', { name: 'Email me a sign-in code', exact: true }).click();
  const code = await latestLocalCode(offset);
  await page.getByLabel('One-time code', { exact: true }).fill(code);
  await page
    .getByRole('button', { name: /verify|continue|sign in/i })
    .last()
    .click();
  await expect(page.getByText('Your private workspace', { exact: true })).toBeVisible();
}
