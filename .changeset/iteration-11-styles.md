---
'@nickkupriyanov/inboxline-core': minor
'@nickkupriyanov/inboxline-react': minor
---

Publish the shared stylesheet as `@nickkupriyanov/inboxline-core/styles.css`.

- **Tokens.** `--il-*` custom properties for shape, layout, type, motion, the
  dark palette and an explicit light theme. The panel is 400 px and the feed
  800 px; both are capped by their parent and work at 320 px. There is no
  `prefers-color-scheme` rule, so an explicitly chosen theme is never switched
  by the system preference.
- **Scoped base and components.** The base layer resets only inside `.il-root`;
  the component layer styles every slot in `IL_CLASS` — root, header, heading,
  list, day groups, rows, avatar/icon, content, meta, time, unread marker and
  the loading/empty/error/load-more/live states.
- **States.** `data-il-unread`, `data-il-pending`, `data-il-unknown`,
  `data-il-disabled`, a row's `aria-disabled` and `:focus-visible` have visual
  rules. A pending row keeps its text contrast; an unknown outcome uses an amber
  ring and meta text instead of the danger red; unread also has a marker.
- **Build.** A post-build step concatenates `tokens.css`, `base.css` and
  `inboxline.css` into `dist/inboxline.css`. The React package copies the same
  bytes to its own `dist`, so `inboxline-react/styles.css` works on its own. Both
  packages list CSS in `sideEffects`.
- **Deviation from the reference tokens.** The dark subtle caption is `#9595a3`
  (the reference value measured 4.49:1 on the control hover), and the focus ring
  is stronger (4.15:1 dark / 3.37:1 light instead of 2.41:1 / 1.92:1, and at
  least 3.19:1 on every row surface). The
  palette, geometry and motion values otherwise follow Slotline and Soundline.
- **Review material.** `docs/visual-reference.md` maps tokens, classes and
  states to the reference files and records the measured contrast;
  `apps/style-stand/` is a static page for the dark/light, 320/400 px and state
  review. Neither is a published package.

No migration is needed: the entry points are additive. Trigger, panel, filters,
counter and replaceable parts stay absent until their components exist.
