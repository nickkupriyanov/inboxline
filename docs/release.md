# Release candidate and publishing

This is the release runbook for Inboxline. Local checks and the candidate
workflow never publish. The release workflow publishes only after explicit
human approval and repository opt-in; credentials stay in GitHub Actions secrets.

## CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every push to
`main` and every pull request:

| Job         | Commands                                                                                                           | What it proves                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `workspace` | `format:check`, `typecheck`, `test`, `build`, `check:docs`, `check:release`, `build:playground`, `build-storybook` | Source, types, unit behaviour, documentation, both static examples and the release rules.                |
| `browser`   | Playwright install, `test:browser`                                                                                 | Layout, containers, portal, states, SSR/hydration and reduced motion in Chromium, Firefox and WebKit.    |
| `consumers` | `verify:install`                                                                                                   | React 18, React 19 and the optional motion entry installed from the packed tarballs, built and hydrated. |

The workspace job uploads the playground and Storybook as CI artifacts.

The browser job installs the three Playwright builds inside the runner workspace;
the consumer job only needs Chromium. `pnpm test:browser` starts the playground,
the SSR example and the teaching HTTP server itself, so CI needs no external
service.

## Version PR and opt-in publishing

[`.github/workflows/version-packages.yml`](../.github/workflows/version-packages.yml)
uses Changesets, as Soundline does. On pushes to `main` it opens or updates the
version PR. Without repository variable `NPM_PUBLISH_ENABLED=true`, the action
has no publish command and creates neither tags nor GitHub releases.

After explicit release approval, enabling that variable and providing
`NPM_TOKEN` allows the action to run `pnpm release` when there are no pending
changesets: it builds, publishes missing package versions in dependency order,
pushes tags and creates GitHub releases. **Merging the version PR while opt-in
is enabled is a publish trigger.** Manual dispatch on `main` can also publish.
Disable the variable to return to version-only mode. npm publication cannot be
rolled back by disabling it.

The version PR uses `GITHUB_TOKEN`; GitHub suppresses CI runs triggered by this
token. Run the candidate checks locally on the version PR before merging it, or
configure a separate token for PR creation. The release job checks package and
workflow rules and builds packages; it does not replace the full candidate checks.

## GitHub Pages

[`.github/workflows/pages.yml`](../.github/workflows/pages.yml) builds the
playground/gallery and Storybook on pushes to `main` or manual dispatch. The
Pages action supplies `PAGES_BASE` to Vite, so assets work under `/inboxline/`;
local dev still uses `/`. Storybook is copied into `storybook/` beside the
playground. The deploy job uses the `github-pages` environment.

For `nickkupriyanov/inboxline`, the resulting addresses are:

- Playground: https://nickkupriyanov.github.io/inboxline/
- Gallery: https://nickkupriyanov.github.io/inboxline/gallery.html
- Storybook: https://nickkupriyanov.github.io/inboxline/storybook/

These are intended addresses, not evidence that a deployment has happened.
Pages hosts the mock examples. The HTTP comparison needs the local teaching
server at `127.0.0.1:8787`; Pages does not run that server.

## First-time setup (separate authorization required)

1. After approval and commit, create the public GitHub repository
   `nickkupriyanov/inboxline` without generated README/license/gitignore files.
2. With explicit push authorization, connect the remote and push `main`.
   Keep `NPM_PUBLISH_ENABLED` unset: the first push must not publish `0.0.0`.
3. In **Settings → Actions → General**, allow Actions to create pull requests.
   Wait for all CI jobs to pass. Version PRs need write/PR permissions.
4. With explicit site publication authorization, set **Settings → Pages →
   Source → GitHub Actions** and run **Pages** on `main`. Inspect the three
   addresses above, including assets and navigation from the gallery.
5. Review the version PR: package versions, React's core dependency and both
   changelogs. The first version is determined by the pending changesets; do not
   describe it as `1.0.0` until that version has been explicitly chosen.
6. Check out the version PR and run the full candidate commands below. Approve
   the candidate before merging. No pending changesets after versioning is valid.
7. For token-based publication as in Soundline, create an npm granular access
   token with package write access for these packages and the required 2FA bypass
   for unattended publication. An initial package may need scope-wide permission
   because it does not exist yet. Store it as **Settings → Secrets and variables
   → Actions → Secrets → NPM_TOKEN**. Never put the value in source or chat.
8. Only after explicit npm/tag/GitHub Release approval, set **Actions → Variables
   → NPM_PUBLISH_ENABLED** to `true`, then merge the reviewed version PR. If it
   was merged with publication disabled, dispatch **Version packages** on `main`.
9. Confirm both versions on npm, the tags and GitHub releases, then install the
   published packages into a scratch React application. A partially failed
   publish needs inspection of npm and tags before rerunning; published versions
   are immutable.

References: [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages),
[Changesets action inputs](https://github.com/changesets/action),
[npm CI authentication](https://docs.npmjs.com/using-private-packages-in-a-ci-cd-workflow/).

## Manual candidate

[`.github/workflows/release-candidate.yml`](../.github/workflows/release-candidate.yml)
is a `workflow_dispatch` job. It runs format, typecheck, unit tests, docs,
release rules, packs the libraries, installs all three consumer legs from those
tarballs, builds the examples and uploads:

- `inboxline-tarballs` — the exact `.tgz` files that would be published;
- `inboxline-candidate-playground` and `inboxline-candidate-storybook` — static
  builds for review.

No npm token is read and no publish, tag or release is created.

## The same candidate locally

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm typecheck
pnpm test
pnpm check:docs
pnpm check:release
pnpm install:browsers
pnpm test:browser
pnpm verify:install
pnpm build:playground
pnpm build-storybook
```

`verify:install` is the clean-install proof: it packs core and React, then
installs them into scratch consumers with their own npm caches and no workspace
aliases. The scratch copies live in `.verify/` and are ignored.

Expected candidate facts (Iteration 25): core and React tarballs both around
200 KiB including source maps; React 18 consumer ≈196 KiB JS, React 19 ≈274 KiB
JS, motion entry ≈393 KiB JS, CSS ≈18 KiB. Sizes are evidence, not a budget.

## User scenarios from the roadmap, and where they are checked

| #   | Scenario                                                            | Evidence                                                                                   |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | Mock and HTTP adapters need no core/UI change                       | `pnpm test:server`; playground “Mock and HTTP adapters”.                                   |
| 2   | Ten loaded rows under a server counter of 27                        | Core tests (`derive`, `controller`, `mock`); the counter is server data in the contract.   |
| 3   | Mark-all includes unloaded rows and leaves later events             | `tools/dev-server/adapter.test.ts` (“marks the whole workspace read…”), HTTP playground.   |
| 4   | One failed mutation does not roll back others; no hidden bulk retry | Controller tests for queued/unknown operations; HTTP lost-answer tests.                    |
| 5   | Fast filter/context/adapter/start-stop changes do not mix answers   | Controller race tests; provider tests.                                                     |
| 6   | External updates do not duplicate rows or shift the open list       | Controller invalidation tests; gallery “another client wrote”; browser states.             |
| 7   | Bell and feed agree; providers/contexts are isolated                | React provider tests; Storybook “Both layouts”; playground workspaces.                     |
| 8   | Both themes/compositions fit the family and 320 px                  | `docs/visual-reference.md`; `test:browser` at 320/360/400 px, portal resize.               |
| 9   | Keyboard, live regions, contrast and reduced motion                 | Accessibility audit; `pnpm test:browser` reduced-motion and focus checks.                  |
| 10  | SSR, hydration, CSS and optional motion in packed consumers         | `verify:install`: React 18, React 19, motion; Chromium hydration.                          |
| 11  | Public API matches packages and examples                            | `check:docs`: links, exports, class slots, tokens, message keys, compile-checked examples. |
| 12  | Each iteration reviewed and committed separately                    | Git history; the roadmap status per iteration.                                             |

The scenarios are covered by a mix of unit, HTTP, browser and packaging checks
rather than one end-to-end suite; the table names the evidence so a reviewer can
rerun the narrow check.

## Packages, licences and dependencies

`check:release` verifies:

- both published manifests are MIT, not private, publish with public access and
  ship `dist`, `README.md` and `LICENSE`;
- core has no runtime dependencies; React depends only on core and keeps
  `react`, `react-dom` and `motion` as peers, with motion optional;
- `.changeset/config.json` has `commit: false`, public access and `main` as the
  base branch;
- every pending changeset names a public package and a valid bump;
- only the version workflow references the npm secret or publish command, and
  publish/tags/releases all require `NPM_PUBLISH_ENABLED=true`;
- zero pending changesets is valid after versioning, but unversioned `0.0.0`
  packages without changesets are rejected;
- the release documentation exists.

The tarball contents themselves are asserted by `verify:install`: export maps,
`sideEffects`, README/LICENSE, ESM/CJS, declarations, CSS and the absence of
sources/tests. Dev dependencies (Storybook, Vitest, Playwright, Vite) are outside
the published tarballs.

## Publishing — explicit approval before enabling automation

Use the first-time setup above. `pnpm release` means `pnpm build && changeset
publish`; it is a real publish command, not a dry run. Do not run it during an
ordinary iteration. The version workflow provides npm authentication via
`NODE_AUTH_TOKEN` and requests provenance with `NPM_CONFIG_PROVENANCE=true`.
No credential value is stored in this repository.

The manual candidate workflow remains read-only and never publishes, tags or
creates a GitHub release. Approving a local commit does not authorize enabling
publication, pushing to GitHub or deploying Pages.

## Candidate report — 20 October 2026

Built from the Iteration 25 working tree on macOS, Node 26.11.1, pnpm 9.8.0. The
commit hash is recorded when the reviewed candidate is committed.

| Check                 | Result                                                                                |
| --------------------- | ------------------------------------------------------------------------------------- |
| `pnpm format:check`   | clean                                                                                 |
| `pnpm typecheck`      | clean, including the compile-checked docs examples                                    |
| `pnpm test`           | 430 core, 126 react, 14 tools                                                         |
| `pnpm build`          | both packages, ESM/CJS/types/CSS                                                      |
| `pnpm check:docs`     | 9 files, links/anchors, commands, exports, 34 class slots, 62 tokens, 31 message keys |
| `pnpm check:release`  | 2 packages, 21 changesets, 3 workflows, no automated publish                          |
| `pnpm test:browser`   | 66/66 across Chromium, Firefox and WebKit                                             |
| `pnpm verify:install` | 3/3 consumer legs from tarballs                                                       |
| Tarballs              | core 205.4 KiB, react 203.9 KiB                                                       |
| Consumer assets       | React 18 195.8 KiB JS; React 19 273.5 KiB JS; motion 392.8 KiB JS; CSS 17.9 KiB       |

CI workflows were syntax-checked and covered by `check:release`, but GitHub
Actions has not run from this local checkout (no remote was configured). The first
push is the first real CI run.

## First-version limits

- The library is a UI/state layer, not a notification server: no sending, push,
  service worker, persistence or cross-tab sync.
- Transport and authentication belong to the application. The HTTP adapter is a
  teaching example, not a production backend.
- The panel is non-modal and does not trap focus. The design targets 320 px and
  wider.
- Search, archive, deletion, arbitrary bulk selections, attachments and rich
  text are out of scope.
- Browser checks use Playwright's WebKit build, not the Safari application; the
  real zoom UI is emulated by a CSS viewport.
- SSR is synchronous: no streaming or Suspense data fetching.
- The two ready-made compositions under one provider each have a live region, so
  the counter can be announced twice; one composition per provider is
  recommended for announcements.
