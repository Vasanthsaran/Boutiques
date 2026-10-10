import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against an isolated stack: API on :4200 using the *_e2e database
 * (reset on start) and Vite on :5174. Uses the locally installed Google Chrome.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: [
    {
      command:
        'cd ../backend && npx dotenv -e ../.env.e2e -- tsx scripts/e2e-reset.ts && npx dotenv -e ../.env.e2e -- tsx src/index.ts',
      url: 'http://localhost:4200/healthz',
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
    },
    {
      command: 'API_URL=http://localhost:4200 npx vite --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
