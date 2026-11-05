import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4179', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /production-csp/,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: /production-csp/,
    },
    {
      name: 'production-csp',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:4180',
      },
      testMatch: /production-csp/,
    },
  ],
  webServer: [
    {
      command: 'pnpm exec vite --host 127.0.0.1 --port 4179',
      url: 'http://127.0.0.1:4179',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm exec tsx tools/serve-dist.ts',
      url: 'http://127.0.0.1:4180',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
