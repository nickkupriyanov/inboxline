/**
 * Puts the server-rendered widget into the built page, so the browser check
 * hydrates exactly what the server produced. Run after `vite build`.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { renderToString } from 'react-dom/server';
import { createApp } from '../src/app.mjs';

const html = renderToString(createApp());
const file = new URL('../dist/index.html', import.meta.url);
const page = await readFile(file, 'utf8');
if (!page.includes('<div id="root"></div>')) {
  throw new Error('the built page has no empty #root to fill');
}

await writeFile(
  file,
  page.replace('<div id="root"></div>', `<div id="root">${html}</div>`),
  'utf8',
);
console.log(`✓ prerendered ${html.length} characters of widget markup into dist/index.html`);
