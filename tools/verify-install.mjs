#!/usr/bin/env node
/**
 * Packaging check for the two published packages, in clean consumer apps.
 *
 *   1. build and `pnpm pack` core and React (core first: the binding copies the
 *      core stylesheet during its own build)
 *   2. assert what the tarballs ship: export maps, sideEffects, README/LICENSE,
 *      CSS, declarations, no sources, no workspace protocol, optional motion
 *   3. copy a consumer template per leg into `.verify/`, point it at the packed
 *      tarballs and install it with its own npm cache
 *   4. prove the consumer works: `tsc --noEmit`, a production Vite build, the
 *      packed stylesheet tokens, the core `/dom` entry, server render + jsdom
 *      hydration, and the same hydration in Chromium
 *
 * Legs: React 18 and React 19 without motion, plus a React 19 app that installs
 * the optional motion peer and imports the separate `/motion` entry.
 *
 *   node tools/verify-install.mjs                    # all legs
 *   node tools/verify-install.mjs --leg react-19     # one leg
 *   node tools/verify-install.mjs --pack-only .verify/tarballs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templates = join(root, 'tools/install-check');
const verifyRoot = join(root, '.verify');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const LEGS = [
  { name: 'react-18', template: 'react', manifest: 'react-18', motion: false },
  { name: 'react-19', template: 'react', manifest: 'react-19', motion: false },
  { name: 'react-19-motion', template: 'motion', manifest: 'react-19-motion', motion: true },
];

const argv = process.argv.slice(2);
const option = (name) => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};
const onlyLeg = option('--leg');
const tarballDir = option('--tarballs');
const packOnly = option('--pack-only');

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const tarballName = (name, version) => `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`;
const step = (message) => console.log(`\n\u001b[1m▸ ${message}\u001b[0m`);
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

function run(command, args, cwd) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', env: process.env });
    child.on('error', fail);
    child.on('close', (code) =>
      code === 0 ? done() : fail(new Error(`${command} ${args.join(' ')} exited with ${code}`)),
    );
  });
}

function capture(command, args, cwd) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', fail);
    child.on('close', (code) =>
      code === 0 ? done(stdout) : fail(new Error(`${command} ${args.join(' ')}: ${stderr}`)),
    );
  });
}

async function packedManifest(tarball) {
  return JSON.parse(
    await capture('tar', ['-xzOf', basename(tarball), 'package/package.json'], dirname(tarball)),
  );
}

async function packedEntries(tarball) {
  return (await capture('tar', ['-tzf', basename(tarball)], dirname(tarball)))
    .split('\n')
    .filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/*  Pack and manifest assertions                                               */
/* -------------------------------------------------------------------------- */

async function packLibraries() {
  const packed = [];
  for (const relativeDir of ['packages/core', 'packages/react']) {
    const packageDir = join(root, relativeDir);
    const manifest = await readJson(join(packageDir, 'package.json'));

    step(`build ${manifest.name}`);
    await run('pnpm', ['build'], packageDir);
    step(`pnpm pack ${manifest.name}`);
    for (const file of await readdir(packageDir)) {
      if (file.endsWith('.tgz')) await rm(join(packageDir, file));
    }
    await run('pnpm', ['pack'], packageDir);

    const produced = (await readdir(packageDir)).find((file) => file.endsWith('.tgz'));
    const expected = tarballName(manifest.name, manifest.version);
    if (produced !== expected) {
      throw new Error(`pnpm pack produced ${produced}, expected ${expected}`);
    }
    packed.push({
      label: manifest.name,
      version: manifest.version,
      file: join(packageDir, produced),
    });
    console.log(`  → ${produced}`);
  }
  return packed;
}

async function collectLibraries(dir) {
  const files = (await readdir(dir)).filter((file) => file.endsWith('.tgz'));
  const packed = [];
  for (const relativeDir of ['packages/core', 'packages/react']) {
    const manifest = await readJson(join(root, relativeDir, 'package.json'));
    const expected = tarballName(manifest.name, manifest.version);
    if (!files.includes(expected)) throw new Error(`${expected} is missing from ${dir}`);
    packed.push({ label: manifest.name, version: manifest.version, file: join(dir, expected) });
  }
  return packed;
}

async function assertExports(label, tarball, keys) {
  step(`assert ${label} export map`);
  const manifest = await packedManifest(tarball);
  for (const key of keys) {
    if (manifest.exports?.[key] === undefined) {
      throw new Error(`${label} does not export "${key}"`);
    }
  }
  if (!manifest.sideEffects?.includes('**/*.css')) {
    throw new Error(`${label} does not declare "**/*.css" in sideEffects`);
  }
  console.log(`  → ${keys.join(', ')}; CSS side effects declared`);
}

async function assertShipFiles(label, tarball, required, forbidden) {
  step(`assert the ${label} tarball`);
  const entries = await packedEntries(tarball);
  for (const entry of required) {
    if (!entries.includes(entry)) throw new Error(`${label} does not ship ${entry}`);
  }
  for (const pattern of forbidden) {
    const found = entries.find((entry) => pattern.test(entry));
    if (found) throw new Error(`${label} ships an unwanted file: ${found}`);
  }
  console.log(`  → ${entries.length} entries, ${required.length} required, no sources or tests`);
}

async function assertPinned(label, tarball, dependency, version) {
  step(`assert ${label} resolves ${dependency} without the workspace protocol`);
  const manifest = await packedManifest(tarball);
  const pinned = manifest.dependencies?.[dependency];
  if (!pinned || pinned.includes('workspace:')) {
    throw new Error(`${label} ships "${pinned}" for ${dependency}`);
  }
  if (![version, `^${version}`, `~${version}`].includes(pinned)) {
    throw new Error(`${label} pins ${dependency} to "${pinned}"`);
  }
  console.log(`  → ${dependency}: ${pinned}`);
}

async function assertOptionalMotion(tarball) {
  step('assert motion is an optional peer');
  const manifest = await packedManifest(tarball);
  if (manifest.peerDependencies?.motion === undefined) {
    throw new Error('the React tarball has no motion peer');
  }
  if (manifest.peerDependenciesMeta?.motion?.optional !== true) {
    throw new Error('the React tarball does not mark motion optional');
  }
  console.log('  → motion: optional peer');
}

/* -------------------------------------------------------------------------- */
/*  Consumer legs                                                              */
/* -------------------------------------------------------------------------- */

async function prepareLeg(leg, packed) {
  const scratch = join(verifyRoot, leg.name);
  step(`prepare ${leg.name}`);
  await rm(scratch, { recursive: true, force: true });
  await mkdir(scratch, { recursive: true });
  await cp(join(templates, leg.template), scratch, { recursive: true });
  await cp(join(templates, leg.manifest, 'package.json'), join(scratch, 'package.json'));

  const manifestPath = join(scratch, 'package.json');
  const manifest = await readJson(manifestPath);
  for (const entry of packed) {
    manifest.dependencies[entry.label] = `file:${relative(scratch, entry.file)}`;
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  step(`npm install (${leg.name}, own cache)`);
  await run(
    npm,
    ['install', '--no-audit', '--no-fund', '--cache', join(scratch, 'npm-cache')],
    scratch,
  );
  return scratch;
}

async function builtAssets(scratch) {
  const directory = join(scratch, 'dist/assets');
  return (await readdir(directory)).filter((file) => /\.(js|css)$/.test(file));
}

async function readAssets(scratch, extension) {
  const assets = await builtAssets(scratch);
  const files = assets.filter((file) => file.endsWith(extension));
  return Promise.all(
    files.map(async (file) => ({
      file,
      contents: await readFile(join(scratch, 'dist/assets', file), 'utf8'),
    })),
  );
}

async function runDefaultLeg(leg, scratch) {
  if (existsSync(join(scratch, 'node_modules/motion'))) {
    throw new Error(`${leg.name} installed motion, which is optional`);
  }

  step(`tsc --noEmit (${leg.name})`);
  await run('npx', ['tsc', '--noEmit'], scratch);
  step(`vite build (${leg.name})`);
  await run('npx', ['vite', 'build'], scratch);

  const scripts = await readAssets(scratch, '.js');
  const styles = await readAssets(scratch, '.css');
  if (
    !styles.some(
      ({ contents }) => contents.includes('--il-accent') && contents.includes('.il-root'),
    )
  ) {
    throw new Error(`${leg.name}: the packed stylesheet did not reach the build`);
  }
  if (scripts.some(({ contents }) => contents.includes('data-il-motion'))) {
    throw new Error(`${leg.name}: the default bundle pulled in the Motion kit`);
  }

  step(`server render + jsdom hydration (${leg.name})`);
  await run(npm, ['run', 'ssr'], scratch);
  step(`prerender (${leg.name})`);
  await run(npm, ['run', 'prerender'], scratch);
  step(`hydration in Chromium (${leg.name})`);
  await run(
    process.execPath,
    [join(root, 'tools/browser-checks/scripts/check-consumer.mjs'), '--dir', join(scratch, 'dist')],
    root,
  );

  const jsBytes = scripts.reduce((sum, asset) => sum + Buffer.byteLength(asset.contents), 0);
  const cssBytes = styles.reduce((sum, asset) => sum + Buffer.byteLength(asset.contents), 0);
  console.log(`  → assets: ${kb(jsBytes)} JS, ${kb(cssBytes)} CSS`);
}

async function runMotionLeg(leg, scratch) {
  if (!existsSync(join(scratch, 'node_modules/motion'))) {
    throw new Error(`${leg.name} did not install its motion peer`);
  }
  step(`tsc --noEmit (${leg.name})`);
  await run('npx', ['tsc', '--noEmit'], scratch);
  step(`vite build (${leg.name})`);
  await run('npx', ['vite', 'build'], scratch);

  const scripts = await readAssets(scratch, '.js');
  const styles = await readAssets(scratch, '.css');
  if (!scripts.some(({ contents }) => contents.includes('data-il-motion'))) {
    throw new Error(`${leg.name}: the /motion entry rendered no Motion marker`);
  }
  if (!styles.some(({ contents }) => contents.includes('--il-accent'))) {
    throw new Error(`${leg.name}: stylesheet missing from the motion build`);
  }
  const bytes = scripts.reduce((sum, asset) => sum + Buffer.byteLength(asset.contents), 0);
  console.log(`  → motion entry built, ${kb(bytes)} JS`);
}

/* -------------------------------------------------------------------------- */

const legs = onlyLeg ? LEGS.filter((leg) => leg.name === onlyLeg) : LEGS;
if (legs.length === 0) {
  throw new Error(`unknown leg "${onlyLeg}"; known: ${LEGS.map((leg) => leg.name).join(', ')}`);
}

const packed = tarballDir ? await collectLibraries(tarballDir) : await packLibraries();
const core = packed.find((entry) => entry.label.endsWith('inboxline-core'));
const react = packed.find((entry) => entry.label.endsWith('inboxline-react'));

await assertExports(core.label, core.file, ['.', './dom', './styles.css']);
await assertExports(react.label, react.file, ['.', './motion', './styles.css']);
await assertPinned(react.label, react.file, core.label, core.version);
await assertOptionalMotion(react.file);
await assertShipFiles(
  core.label,
  core.file,
  [
    'package/README.md',
    'package/LICENSE',
    'package/dist/index.js',
    'package/dist/index.cjs',
    'package/dist/index.d.ts',
    'package/dist/dom.js',
    'package/dist/dom.cjs',
    'package/dist/dom.d.ts',
    'package/dist/inboxline.css',
  ],
  [
    /^package\/src\//,
    /^package\/.*\.test\./,
    /^package\/(\.env|tsconfig|vitest)/,
    /^package\/(\.storybook|storybook-static)/,
  ],
);
await assertShipFiles(
  react.label,
  react.file,
  [
    'package/README.md',
    'package/LICENSE',
    'package/dist/index.js',
    'package/dist/index.cjs',
    'package/dist/index.d.ts',
    'package/dist/motion.js',
    'package/dist/motion.cjs',
    'package/dist/motion.d.ts',
    'package/dist/inboxline.css',
  ],
  [
    /^package\/src\//,
    /^package\/.*\.test\./,
    /^package\/(\.env|tsconfig|vitest)/,
    /^package\/(\.storybook|storybook-static)/,
  ],
);

for (const entry of packed) {
  const info = await stat(entry.file);
  console.log(`  ${entry.label}@${entry.version}: ${kb(info.size)} tarball`);
}

if (packOnly) {
  const target = resolve(packOnly);
  await mkdir(target, { recursive: true });
  for (const entry of packed) {
    await cp(entry.file, join(target, basename(entry.file)));
  }
  step(`packed ${packed.length} packages into ${packOnly}`);
  process.exit(0);
}

for (const leg of legs) {
  const scratch = await prepareLeg(leg, packed);
  if (leg.motion) await runMotionLeg(leg, scratch);
  else await runDefaultLeg(leg, scratch);
  console.log(`\u001b[32m✓ ${leg.name}\u001b[0m`);
}

console.log(`\n\u001b[32m✓ packed packages work in ${legs.length} clean consumer app(s)\u001b[0m`);
for (const leg of legs) console.log(`  .verify/${leg.name}`);
