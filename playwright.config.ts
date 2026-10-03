import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 2,
  reporter: [['list'], ['./scripts/browser-timings.ts']],
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:8791',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && node scripts/e2e-server.mjs',
    url: 'http://localhost:8791/api/health',
    reuseExistingServer: false,
    timeout: 90_000,
  },
});
