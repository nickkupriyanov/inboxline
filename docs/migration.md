# Versions, changesets and migrations

Inboxline is pre-1.0. The packages are versioned with
[Changesets](https://github.com/changesets/changesets); nothing is published by a
local commit or by CI in this iteration.

## What a release means

| Change                                 | Release type before `1.0.0`                       | Examples                                                         |
| -------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| Incompatible public behaviour or types | `minor`, with a migration note                    | Renaming a prop, removing an export, changing an adapter result. |
| Compatible feature                     | `minor`                                           | A new layout option, a new part, a new helper.                   |
| Fix without contract change            | `patch`                                           | Focus repair, contrast fix, packaging fix.                       |
| Documentation only                     | no changeset unless the published package changes | README on npm.                                                   |

The rule is the one in the repository `AGENTS.md`: before `1.0.0` an incompatible
change is a `minor`, and its changeset must say what a consumer has to change.
After `1.0.0`, incompatible changes become `major` and follow the same note rule.

A changeset is required when the published JavaScript, types, stylesheet, export
map or shipped package files change. Development-only work (Storybook, tests,
the playground, the teaching server, browser checks) does not need one.

## Adding a changeset

```sh
pnpm changeset
```

Choose the package(s), the bump type and write the note for a consumer — not a
list of commits. Mention:

- what changed;
- who is affected;
- the exact migration when the change is incompatible;
- whether an adapter, a configuration or a custom part has to change.

Then commit the generated Markdown file with the iteration. Do not run
`changeset version` or publish without a separate explicit instruction.

## Preparing a version

When the user asks for a release (not part of normal iteration work):

```sh
pnpm changeset status       # inspect pending bumps and notes
pnpm version-packages       # consume the changesets, update manifests and changelogs
pnpm install                # refresh the lockfile after version changes
pnpm verify:install         # pack and install the exact artifacts in clean consumers
```

`version-packages` is `changeset version`. It is local and does not publish.

## Publishing (explicit, separate)

Publishing is never triggered by a local commit, by CI in Iteration 24, or by an
approval of the previous iteration. A release requires all of:

1. `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`;
2. `pnpm test:browser` (Chromium, Firefox, WebKit);
3. `pnpm verify:install` (React 18, React 19, `/motion`);
4. a review of `git diff` and the generated changelogs;
5. a separate explicit instruction from the user to publish;
6. the registry credentials and 2FA of the person publishing, outside the repo.

The likely commands are `changeset publish` (or `pnpm changeset publish`) with the
appropriate npm authentication. This repository does not configure or store
credentials and does not run the command automatically. The CI/version-PR side and
the candidate checklist are in [`release.md`](./release.md).

## Migration notes so far

No public release has been published from this checkout. The notes below are the
consumer-visible changes recorded in the changesets and are the format future
notes should follow.

- **Iteration 18 — focus and non-text contrast (patch).** “Show more” stays
  focusable while loading through `aria-disabled`; a control that removes itself
  hands focus to the active filter; the read/unread glyph is more opaque. No API
  change.
- **Iteration 19 — server rendering (minor).** `InboxInitialData` and
  `initialData` are new. When `config.locale`/`config.timeZone` are omitted, the
  React provider now detects the visitor's language and zone after mounting
  instead of keeping `en`/`UTC` forever. Pass them explicitly to keep a fixed
  presentation.
- **Iteration 20 — Storybook and gallery (no changeset).** Development tooling
  only; the published packages were unchanged.
- **Iteration 21 — HTTP example (no changeset).** The teaching server and adapter
  live in the private `tools/` workspace and are not published.
- **Iteration 22 — browser checks (no changeset).** Development tooling only.
- **Iteration 23 — packaging (patch).** The tarballs ship `README.md` next to
  `LICENSE` and `dist`; runtime unchanged.

## Compatibility promises

- React 18.2+ and 19 are supported; both are installed from packed tarballs in
  `verify:install`.
- Core has no runtime dependencies and never imports React or browser globals at
  module scope.
- `motion` is optional; importing the default entry never requires it.
- The export map, CSS tokens and `il-*` class names are public contracts. Renames
  need a changeset and a migration note.
- Domain data and the global counter belong to the server. The library does not
  add a second controlled data model.
