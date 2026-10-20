#!/usr/bin/env node
/**
 * Release-readiness checks that do not publish anything.
 *
 * It validates the package manifests, the packed file lists, the runtime
 * dependency shape, the changeset configuration and the CI workflows. It is the
 * gate the release candidate and CI run before a human is asked to publish.
 */
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const fail = (message) => failures.push(message);
const read = (path) => readFile(join(root, path), 'utf8');
const readJson = async (path) => JSON.parse(await read(path));

const PUBLIC = ['@nickkupriyanov/inboxline-core', '@nickkupriyanov/inboxline-react'];
const manifests = {
  core: await readJson('packages/core/package.json'),
  react: await readJson('packages/react/package.json'),
};

/* Package manifests -------------------------------------------------------- */

for (const [name, label] of [
  [manifests.core, 'core'],
  [manifests.react, 'react'],
]) {
  if (name.private === true) fail(`${label}: a published package must not be private`);
  if (name.license !== 'MIT') fail(`${label}: license must be MIT`);
  if (!name.files?.includes('LICENSE') || !name.files?.includes('README.md')) {
    fail(`${label}: files must include LICENSE and README.md`);
  }
  if (!name.files?.includes('dist')) fail(`${label}: files must include dist`);
  if (name.publishConfig?.access !== 'public')
    fail(`${label}: publishConfig.access must be public`);
  if (!name.repository?.directory?.startsWith('packages/')) {
    fail(`${label}: repository.directory must point at the package`);
  }
  for (const file of ['LICENSE', 'README.md']) {
    try {
      await read(`packages/${label}/${file}`);
    } catch {
      fail(`${label}: ${file} is missing`);
    }
  }
}

const coreDeps = Object.keys(manifests.core.dependencies ?? {});
if (coreDeps.length > 0)
  fail(`core must have no runtime dependencies, found ${coreDeps.join(', ')}`);

const reactDeps = Object.keys(manifests.react.dependencies ?? {});
if (reactDeps.length !== 1 || reactDeps[0] !== PUBLIC[0]) {
  fail(
    `react runtime dependencies must be only ${PUBLIC[0]}, found ${reactDeps.join(', ') || 'none'}`,
  );
}
if (manifests.react.dependencies?.[PUBLIC[0]] !== 'workspace:^') {
  fail('react must depend on core through workspace:^ (pack rewrites it)');
}
for (const peer of ['react', 'react-dom', 'motion']) {
  if (!manifests.react.peerDependencies?.[peer]) fail(`react: missing peer ${peer}`);
}
if (manifests.react.peerDependenciesMeta?.motion?.optional !== true) {
  fail('react: motion must be an optional peer');
}
if (manifests.react.optionalDependencies !== undefined) {
  fail('react: optionalDependencies would ship a dependency; use peerDependenciesMeta');
}

/* Changesets --------------------------------------------------------------- */

const changesetConfig = await readJson('.changeset/config.json');
if (changesetConfig.commit !== false) fail('changesets must not commit automatically');
if (changesetConfig.access !== 'public') fail('changesets access must be public');
if (changesetConfig.baseBranch !== 'main') fail('changesets baseBranch must be main');

const changesetFiles = (await readdir(join(root, '.changeset'))).filter(
  (file) => file.endsWith('.md') && file !== 'README.md',
);
for (const file of changesetFiles) {
  const text = await read(`.changeset/${file}`);
  const head = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!head) {
    fail(`.changeset/${file}: missing frontmatter`);
    continue;
  }
  const lines = head[1].split('\n').filter(Boolean);
  if (lines.length === 0) fail(`.changeset/${file}: empty frontmatter`);
  for (const line of lines) {
    const match = /^'([^']+)':\s*(patch|minor|major)$/.exec(line.trim());
    if (!match) {
      fail(`.changeset/${file}: invalid line "${line}"`);
      continue;
    }
    if (!PUBLIC.includes(match[1])) fail(`.changeset/${file}: unknown package ${match[1]}`);
  }
}

/* Workflows and release docs ------------------------------------------------ */

const workflows = (await readdir(join(root, '.github/workflows'))).filter((file) =>
  file.endsWith('.yml'),
);
for (const required of ['ci.yml', 'version-packages.yml', 'release-candidate.yml', 'pages.yml']) {
  if (!workflows.includes(required)) fail(`missing workflow .github/workflows/${required}`);
}
for (const file of workflows) {
  const text = await read(`.github/workflows/${file}`);
  if (
    file !== 'version-packages.yml' &&
    /changeset publish|npm publish|pnpm release\b/.test(text)
  ) {
    fail(`.github/workflows/${file}: publishing belongs only in version-packages.yml`);
  }
  if (file !== 'version-packages.yml' && /NPM_TOKEN|NODE_AUTH_TOKEN/.test(text)) {
    fail(`.github/workflows/${file}: only the release workflow may reference a publish token`);
  }
}
const ci = await read('.github/workflows/ci.yml');
for (const command of [
  'format:check',
  'typecheck',
  'test',
  'build',
  'check:docs',
  'test:browser',
  'verify:install',
]) {
  if (!ci.includes(command)) fail(`ci.yml does not run ${command}`);
}
const versionWorkflow = await read('.github/workflows/version-packages.yml');
if (!versionWorkflow.includes('changesets/action')) {
  fail('version-packages.yml does not use changesets/action');
}
if (!versionWorkflow.includes('version-script')) {
  fail('version-packages.yml does not set version-script');
}

for (const input of ['publish-script', 'create-github-releases', 'push-git-tags']) {
  const line = versionWorkflow.split('\n').find((line) => line.trim().startsWith(`${input}:`));
  if (!line?.includes("vars.NPM_PUBLISH_ENABLED == 'true'")) {
    fail(`version-packages.yml must gate ${input} on NPM_PUBLISH_ENABLED`);
  }
}
const workspaceManifest = await readJson('package.json');
if (workspaceManifest.scripts?.release !== 'pnpm build && changeset publish') {
  fail('release must build packages before changeset publish');
}
for (const [label, manifest] of Object.entries(manifests)) {
  if (changesetFiles.length === 0 && manifest.version === '0.0.0') {
    fail(`${label}: refusing an unversioned release without changesets`);
  }
}

const releaseDoc = await read('docs/release.md');
if (!/explicit/i.test(releaseDoc) || !/publish/i.test(releaseDoc)) {
  fail('docs/release.md must document the explicit publish procedure');
}

/* -------------------------------------------------------------------------- */

if (failures.length > 0) {
  console.error(`✗ release checks failed (${failures.length}):`);
  for (const failure of failures) console.error(`  • ${failure}`);
  process.exit(1);
}

console.log(
  `✓ release readiness: ${PUBLIC.length} packages, ${changesetFiles.length} changesets, ` +
    `${workflows.length} workflows, npm publish requires explicit opt-in`,
);
