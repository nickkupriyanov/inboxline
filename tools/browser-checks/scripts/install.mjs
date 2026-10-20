#!/usr/bin/env node
/**
 * Installs the three Playwright builds inside the workspace.
 *
 * Playwright resolves a relative `PLAYWRIGHT_BROWSERS_PATH` against its own
 * working directory, which differs between `pnpm --filter` and a direct run; the
 * absolute path removes that ambiguity. The directory is gitignored.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const browsers = fileURLToPath(new URL('../../../.playwright-browsers', import.meta.url));
const child = spawn('playwright', ['install', 'chromium', 'firefox', 'webkit'], {
  stdio: 'inherit',
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsers },
});

child.on('exit', (code) => process.exit(code ?? 1));
