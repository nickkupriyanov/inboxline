#!/usr/bin/env node
/**
 * Documentation checks.
 *
 * The docs make claims about exports, class slots, tokens, message keys, links
 * and commands. This script verifies those claims against the built packages and
 * the repository, and `tsc` (run by `pnpm check:docs`) verifies the example
 * snippets against the sources.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const failures = [];
const fail = (message) => failures.push(message);
const read = (path) => readFile(join(root, path), 'utf8');

const DOCS = [
  'README.md',
  'roadmap.md',
  'docs/reference.md',
  'docs/specification.md',
  'docs/visual-reference.md',
  'docs/migration.md',
  'packages/core/README.md',
  'packages/react/README.md',
];

const contents = new Map();
for (const path of DOCS) contents.set(path, await read(path));

/* -------------------------------------------------------------------------- */
/*  Links and anchors                                                          */
/* -------------------------------------------------------------------------- */

const slug = (heading) =>
  heading
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');

const headingsOf = (text) =>
  [...text.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((match) => slug(match[1]));

for (const [path, text] of contents) {
  const anchors = new Set(headingsOf(text));
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    if (/^[a-z]+:/i.test(target) || target.startsWith('mailto:')) continue;
    const [filePart, anchor] = target.split('#');
    const file = filePart.length === 0 ? path : join(dirname(path), filePart);
    let targetText;
    try {
      targetText = file === path ? text : await read(file);
    } catch {
      fail(`${path}: link target does not exist: ${target}`);
      continue;
    }
    if (anchor !== undefined && anchor.length > 0) {
      const targetAnchors = file === path ? anchors : new Set(headingsOf(targetText));
      if (!targetAnchors.has(anchor)) {
        fail(`${path}: anchor #${anchor} does not exist in ${file}`);
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Commands                                                                   */
/* -------------------------------------------------------------------------- */

const rootManifest = JSON.parse(await read('package.json'));
const scripts = new Set(Object.keys(rootManifest.scripts ?? {}));
const allowed = new Set(['add', 'install', 'exec', 'dlx', 'create']);

for (const [path, text] of contents) {
  for (const line of text.split('\n')) {
    const match = /^\s*pnpm\s+([a-zA-Z0-9:_.-]+)/.exec(line);
    if (!match) continue;
    const command = match[1];
    if (command.startsWith('--')) continue; // global pnpm flags, not a script
    if (!scripts.has(command) && !allowed.has(command)) {
      fail(`${path}: documented command "pnpm ${command}" is not a root script`);
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Exports                                                                    */
/* -------------------------------------------------------------------------- */

const core = await import('../../packages/core/dist/index.js');
const coreDom = await import('../../packages/core/dist/dom.js');
const react = await import('../../packages/react/dist/index.js');
const motion = await import('../../packages/react/dist/motion.js');

const required = {
  core: [
    'createInboxController',
    'createInboxState',
    'inboxReducer',
    'deriveInboxView',
    'createInboxViewMemo',
    'resolveInboxConfig',
    'defaultMessages',
    'IL_CLASS',
    'cx',
    'createMockAdapter',
    'InboxError',
    'isInboxError',
    'toInboxError',
    'systemInboxClock',
    'isInboxTimestamp',
    'DEFAULT_INBOX_CONTEXT',
    'DEFAULT_FILTER',
  ],
  'core/dom': ['observeMediaQuery', 'observeAvailableArea', 'restoreFocus', 'measureAvailableArea'],
  react: [
    'Inbox',
    'InboxProvider',
    'useInboxFlow',
    'useInboxUI',
    'cssAnimations',
    'DEFAULT_INBOX_COMPONENTS',
    'DefaultTrigger',
    'DefaultHeader',
    'DefaultFilters',
    'DefaultNotificationItem',
    'DefaultAvatar',
    'DefaultLoading',
    'DefaultEmpty',
    'DefaultError',
    'DefaultPageError',
  ],
  motion: ['motionAnimations', 'Inbox', 'InboxProvider', 'useInboxFlow', 'useInboxUI'],
};

const modules = { core, 'core/dom': coreDom, react, motion };
for (const [name, names] of Object.entries(required)) {
  for (const exportName of names) {
    if (!(exportName in modules[name])) {
      fail(`${name}: documented export "${exportName}" is missing`);
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Class slots, tokens and messages                                           */
/* -------------------------------------------------------------------------- */

const reference = contents.get('docs/reference.md');
for (const slot of Object.keys(core.IL_CLASS)) {
  if (!reference.includes(`\`${slot}\``))
    fail(`docs/reference.md: class slot "${slot}" is not documented`);
}

const tokensCss = await read('packages/core/src/styles/tokens.css');
const allTokens = new Set(tokensCss.match(/--il-[a-z0-9-]+/g) ?? []);
for (const token of reference.match(/--il-[a-z0-9-]+/g) ?? []) {
  if (!allTokens.has(token)) fail(`docs/reference.md: token "${token}" does not exist`);
}

const messageKeys = [
  ...new Set([
    ...Object.keys(core.defaultMessages.en),
    ...Object.keys(core.defaultMessages.en).flatMap((key) =>
      typeof core.defaultMessages.en[key] === 'object'
        ? Object.keys(core.defaultMessages.en[key])
        : [],
    ),
  ]),
];
for (const key of Object.keys(core.defaultMessages.en)) {
  if (!reference.includes(`\`${key}\``))
    fail(`docs/reference.md: message key "${key}" is not documented`);
}
void messageKeys;

/* -------------------------------------------------------------------------- */

if (failures.length > 0) {
  console.error(`✗ docs checks failed (${failures.length}):`);
  for (const failure of failures) console.error(`  • ${failure}`);
  process.exit(1);
}

console.log(
  `✓ docs: ${DOCS.length} files, links and anchors, commands, exports, ` +
    `${Object.keys(core.IL_CLASS).length} class slots, ${allTokens.size} tokens, ` +
    `${Object.keys(core.defaultMessages.en).length} message keys`,
);
