import { test as base } from '@playwright/test';
import { randomBytes } from 'node:crypto';

// Accounts and browser storage are already isolated per test. Give requests a
// separate network identity too, so faster runs don't share the auth rate limit.
export const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    const address = randomBytes(12).toString('hex').match(/.{4}/g)!.join(':');
    await use({ 'CF-Connecting-IP': `2001:db8:${address}` });
  },
});
