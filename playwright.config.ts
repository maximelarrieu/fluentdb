import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://127.0.0.1:${process.env.FLUENTDB_E2E_PORT ?? 4989}`,
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        // Use the browser preinstalled in this environment instead of
        // downloading one (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD is set).
        launchOptions: process.env.FLUENTDB_CHROMIUM
          ? { executablePath: process.env.FLUENTDB_CHROMIUM }
          : undefined,
      },
    },
  ],
});
