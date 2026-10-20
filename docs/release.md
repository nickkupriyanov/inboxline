# Release candidate and publishing

This is the release runbook for Inboxline. It builds and verifies a candidate;
it does not publish anything. A publish needs a separate, explicit human
instruction and registry credentials outside the repository.

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

## Version PR, never a publish

[`.github/workflows/version-packages.yml`](../.github/workflows/version-packages.yml)
runs `changesets/action` with `version-script` only. It opens or updates a
“Version Packages” pull request; merging it consumes changesets and updates
versions/changelogs. It has no `publish-script`, no npm token, no git tag and no
GitHub release, so it cannot publish by accident.

The version PR is created with `GITHUB_TOKEN`; GitHub suppresses CI runs that
this token triggers. Its diff is version numbers and changelogs only. Run the
checks locally before merging it, or configure a PAT if the PR should carry its
own CI.

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
- workflows contain no publish command and no npm token;
- the release documentation exists.

The tarball contents themselves are asserted by `verify:install`: export maps,
`sideEffects`, README/LICENSE, ESM/CJS, declarations, CSS and the absence of
sources/tests. Dev dependencies (Storybook, Vitest, Playwright, Vite) are outside
the published tarballs.

## Publishing — explicit, not automated

Do **not** run these as part of a normal iteration. They require a separate
explicit instruction, a clean reviewed candidate and npm 2FA credentials.

1. Confirm the reviewed commit is the candidate and the working tree is clean.
2. Run every command in “The same candidate locally” on that commit.
3. Run `pnpm changeset status` and review every pending note.
4. On the release branch, run `pnpm version-packages` (local changes only) and
   review the version/changelog diff; commit it with the release approval.
5. Run `pnpm verify:install` again against the versioned tarballs.
6. Publish with the npm CLI from a machine holding the maintainer credentials:
   `pnpm -r publish --access public` (core before React), or the approved
   Changesets equivalent. Publishing is never done by CI or by this repository's
   scripts.
7. Create the git tag/GitHub release only when explicitly asked; the version PR
   workflow deliberately creates neither.

Nothing in this repository stores an npm token. `release-candidate.yml` proves a
candidate without credentials and uploads the artifacts for inspection.

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
