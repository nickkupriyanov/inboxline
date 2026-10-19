/**
 * Post-build step: copy the core stylesheet into `dist/inboxline.css`, so
 * `@nickkupriyanov/inboxline-react/styles.css` keeps working now that the core
 * owns the authored CSS. Build the core first: the root `pnpm build` does.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

let coreStylesheet;
try {
  coreStylesheet = require.resolve('@nickkupriyanov/inboxline-core/styles.css');
} catch {
  throw new Error(
    '[inboxline-react] cannot find @nickkupriyanov/inboxline-core/styles.css — ' +
      'build @nickkupriyanov/inboxline-core first (pnpm build).',
  );
}

const dist = resolve(root, 'dist');
await mkdir(dist, { recursive: true });
await writeFile(resolve(dist, 'inboxline.css'), await readFile(coreStylesheet, 'utf8'), 'utf8');
console.log(
  `[inboxline-react] css → dist/inboxline.css (copied from @nickkupriyanov/inboxline-core)`,
);
