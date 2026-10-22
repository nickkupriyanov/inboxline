import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const root = fileURLToPath(new URL('../../', import.meta.url));

// Locally the browsers live inside the workspace, so the check needs no global
// cache. CI runs in the official Playwright container, which exports its own
// `/ms-playwright`; an explicit environment value always wins.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= fileURLToPath(
  new URL('../../.playwright-browsers', import.meta.url),
);
// Firefox 157 crashes its content process under the macOS file sandbox used by
// this environment; the harness disables that sandbox for the local test only.
process.env.MOZ_DISABLE_CONTENT_SANDBOX ??= '1';
process.env.MOZ_DISABLE_SANDBOX ??= '1';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      command: 'pnpm dev',
      cwd: root,
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm ssr',
      cwd: root,
      url: 'http://127.0.0.1:4175',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm dev-server',
      cwd: root,
      url: 'http://127.0.0.1:8787/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
