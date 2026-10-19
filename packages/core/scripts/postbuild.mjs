/**
 * Post-build step: concatenate the authored CSS into `dist/inboxline.css`.
 *
 * The core owns the stylesheet for every binding — `inboxline-react` copies this
 * file into its own `dist` so `@nickkupriyanov/inboxline-react/styles.css` keeps
 * working, and a future binding can do the same.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Order matters: tokens, the base layer, then the components. */
const CSS_SOURCES = ['src/styles/tokens.css', 'src/styles/base.css', 'src/styles/inboxline.css'];

const banner = `/*! @nickkupriyanov/inboxline-core — MIT licensed. Generated file, do not edit directly. */\n`;
const parts = [];
for (const file of CSS_SOURCES) {
  const source = await readFile(resolve(root, file), 'utf8');
  parts.push(`/* ---- ${file} ---- */\n${source.trim()}\n`);
}

const dist = resolve(root, 'dist');
await mkdir(dist, { recursive: true });
await writeFile(resolve(dist, 'inboxline.css'), banner + parts.join('\n'), 'utf8');
console.log(`[inboxline-core] css → dist/inboxline.css (${CSS_SOURCES.length} sources)`);
