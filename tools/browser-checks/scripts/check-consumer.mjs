#!/usr/bin/env node
/**
 * Browser check for a packed consumer build.
 *
 * `tools/verify-install.mjs` serves the built app here; this script hydrates it in
 * Chromium and proves that the packed stylesheet, the core `/dom` entry and the
 * headless hooks all work. The app records its own console output in
 * `window.__problems`, so a hydration mismatch raised while React boots is still
 * visible to the probe.
 *
 *   node tools/browser-checks/scripts/check-consumer.mjs --dir .verify/react-19/dist
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PLAYWRIGHT_BROWSERS_PATH = fileURLToPath(
  new URL('../../../.playwright-browsers', import.meta.url),
);

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index]?.replace(/^--/, ''), process.argv[index + 1]);
}
const directory = resolve(args.get('dir') ?? '');
if (!args.get('dir')) {
  console.error('usage: node check-consumer.mjs --dir <built-dist>');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

async function serve(root) {
  const server = createServer(async (request, response) => {
    const path = join(root, decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname));
    let file = path;
    try {
      const info = await stat(file);
      if (info.isDirectory()) file = join(file, 'index.html');
    } catch {
      file = join(root, 'index.html');
    }
    try {
      const body = await readFile(file);
      response.writeHead(200, {
        'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('not found');
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return { server, port: server.address().port };
}

const { chromium } = await import('@playwright/test');
const { server, port } = await serve(directory);
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const problems = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') problems.push(message.text());
  });

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#root .il-item');
  await page.waitForSelector('[data-styles="ok"]');
  await page.waitForSelector('[data-dom="ok"]');
  await page.waitForSelector('[data-headless="ok"]');

  const report = await page.evaluate(() => {
    const root = document.querySelector('#root .il-root');
    const style = root === null ? null : getComputedStyle(root);
    return {
      items: document.querySelectorAll('#root .il-item').length,
      accent: style?.getPropertyValue('--il-accent').trim() ?? '',
      radius: style?.getPropertyValue('--il-radius-card').trim() ?? '',
      styles: document.querySelector('[data-styles]')?.getAttribute('data-styles') ?? '',
      dom: document.querySelector('[data-dom]')?.getAttribute('data-dom') ?? '',
      headless: document.querySelector('[data-headless]')?.getAttribute('data-headless') ?? '',
      hydrated: root !== null,
      recorded: Array.isArray(window.__problems) ? window.__problems : [],
    };
  });

  const hydration = [...problems, ...report.recorded].filter((line) =>
    /hydrat|did not match|mismatch|server rendered|server html/i.test(line),
  );

  const failures = [];
  if (!report.hydrated) failures.push('the packaged widget did not render');
  if (report.items !== 4) failures.push(`expected 4 hydrated rows, got ${report.items}`);
  if (report.styles !== 'ok' || !report.accent || !report.radius) {
    failures.push(`the packed stylesheet did not provide tokens (accent "${report.accent}")`);
  }
  if (report.dom !== 'ok') failures.push('the core /dom entry did not work');
  if (report.headless !== 'ok') failures.push('the headless hook did not reach the counter');
  if (hydration.length > 0) failures.push(`hydration problems:\n${hydration.join('\n')}`);

  if (failures.length > 0) {
    console.error(`✗ packaged consumer: ${failures.join('; ')}`);
    process.exitCode = 1;
  } else {
    console.log(
      `✓ packaged consumer: ${report.items} rows, tokens ${report.accent}/${report.radius}, ` +
        `stylesheet ${report.styles}, dom ${report.dom}, headless ${report.headless}, no hydration mismatch`,
    );
  }
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
