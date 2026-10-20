# Inboxline — visual reference

Inboxline belongs to the same family as Slotline and Soundline: dark by
default, an explicit light theme, neutral surfaces, thin borders, a pink accent
and the system font at 14 px. This document is the contract between the
stylesheet in `packages/core/src/styles/` and the two reference projects. It
records where every value comes from, what was adapted, and which differences
were measured rather than chosen by eye.

The references are read-only neighbours:

| Project   | Directory      | Files used                                                         |
| --------- | -------------- | ------------------------------------------------------------------ |
| Soundline | `../soundline` | `packages/core/src/styles/tokens.css`, `base.css`, `soundline.css` |
| Slotline  | `../booking`   | `packages/core/src/styles/tokens.css`, `base.css`, `slotline.css`  |

No file in either project is modified, linked or imported at runtime. The
stylesheet is authored inside Inboxline and copied nowhere else.

## 1. Layers and entry points

The authored CSS is split into four files and concatenated, in this order, into
`packages/core/dist/inboxline.css` by `packages/core/scripts/postbuild.mjs`:

| File                    | Role                                                                   |
| ----------------------- | ---------------------------------------------------------------------- |
| `styles/tokens.css`     | Shape, layout, type, motion, the dark palette and the light overrides. |
| `styles/base.css`       | Scoped box model, typography, focus, utilities, reduced motion.        |
| `styles/inboxline.css`  | Root surface, bell, header, list, day groups, rows and states.         |
| `styles/animations.css` | Row stagger/exit, panel enter/leave and the measured-height clip.      |

`styles/index.css` is the development entry that imports the four files. It is
not published. The public paths are:

- `@nickkupriyanov/inboxline-core/styles.css` → `dist/inboxline.css`
- `@nickkupriyanov/inboxline-react/styles.css` → a byte copy of the same file

The React package copies the core file so a consumer that installs only the
binding still gets the stylesheet. The copy is performed by
`packages/react/scripts/postbuild.mjs`; building the core first is mandatory,
and the root `pnpm build` already does that.

Both packages declare `sideEffects: ["**/*.css"]`, so a bundler keeps the
stylesheet. Plain CSS only: no Tailwind, no CSS-in-JS, no build-time token
generator.

## 2. Tokens

Every token is defined on `.il-root` and, for the bell trigger that sits outside
the panel root, on `.il-bell`. The light theme redefines the same palette under
`[data-il-theme='light']` on either scope; there is no `prefers-color-scheme`
rule, so an explicitly chosen theme is never switched by the operating system. A
consumer can override a token on its own `.il-root` or `.il-bell` without
touching the package.

### Shape and layout

| Token                  | Value                   | Source and decision                                                                                     |
| ---------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `--il-radius-card`     | `28px`                  | Both references. Used by the root surface.                                                              |
| `--il-radius-panel`    | `22px`                  | Both references. Used by inner panels and the empty state.                                              |
| `--il-radius-control`  | `14px`                  | Both references. Used by rows and buttons.                                                              |
| `--il-radius-pill`     | `999px`                 | Both references. Used by the “show more” control.                                                       |
| `--il-radius-avatar`   | `50%`                   | Not a reference token: a notification author avatar is round.                                           |
| `--il-radius-icon`     | `11px`                  | Adapted from the 10–11 px icon tiles in Slotline (`sl-slots-icon`, `sl-summary-icon`).                  |
| `--il-width-panel`     | `400px`                 | Roadmap and Slotline’s card width. The popover composition.                                             |
| `--il-width-feed`      | `800px`                 | Roadmap and Slotline’s adaptive width. The standalone feed.                                             |
| `--il-width-current`   | `var(--il-width-panel)` | The default composition is the popover; the layout attribute overrides it.                              |
| `--il-padding`         | `14px`                  | Soundline’s card inset, rounded from 12–14 px to one value.                                             |
| `--il-block-gap`       | `10px`                  | Slotline’s card gap; the rhythm between header and list.                                                |
| `--il-row-gap`         | `2px`                   | Soundline’s queue gap; keeps a day’s rows visually connected.                                           |
| `--il-avatar-size`     | `36px`                  | Between Soundline’s 34 px artwork and Slotline’s 34 px icon; a notification needs a short leading tile. |
| `--il-row-max-height`  | `6rem`                  | The tallest a row is assumed to be while its exit collapses it.                                         |
| `--il-list-max-height` | `340px`                 | Soundline’s 320 px queue cap, raised for notification rows. Only the popover list scrolls.              |

### Type and motion

| Token                | Value                                                                                                           | Source                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `--il-font-family`   | `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif` | Both references, unchanged. |
| `--il-font-size`     | `14px`                                                                                                          | Both references.            |
| `--il-ease-soft`     | `cubic-bezier(0.22, 1, 0.36, 1)`                                                                                | Both references.            |
| `--il-ease-standard` | `cubic-bezier(0.4, 0, 0.2, 1)`                                                                                  | Both references.            |
| `--il-duration-fast` | `140ms`                                                                                                         | Both references.            |
| `--il-duration`      | `240ms`                                                                                                         | Both references.            |
| `--il-duration-slow` | `420ms`                                                                                                         | Both references.            |
| `--il-stagger-step`  | `40ms`                                                                                                          | Soundline’s queue stagger.  |
| `--il-index`         | `0`                                                                                                             | Written inline per row.     |
| `--il-exit-duration` | `var(--il-duration)`                                                                                            | Matches the kit timer.      |

### Palette

The dark column is the default. The light column is what
`[data-il-theme='light']` replaces; shape, layout, type and motion stay the same.

| Token                       | Dark                                                                                                                 | Light                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `--il-surface`              | `#141419`                                                                                                            | `#f4f4f5`                                                                           |
| `--il-surface-raised`       | `#1d1d25`                                                                                                            | `#ffffff`                                                                           |
| `--il-panel`                | `#1b1b22`                                                                                                            | `#ffffff`                                                                           |
| `--il-control`              | `#23232c`                                                                                                            | `#f4f4f6`                                                                           |
| `--il-control-hover`        | `#2c2c37`                                                                                                            | `#ececef`                                                                           |
| `--il-row-hover`            | `#202028`                                                                                                            | `#efeff1`                                                                           |
| `--il-row-press`            | `#262630`                                                                                                            | `#e8e8eb`                                                                           |
| `--il-unread-surface`       | `#261821`                                                                                                            | `#fff1f4`                                                                           |
| `--il-unread-surface-hover` | `#2f1b24`                                                                                                            | `#ffe4ea`                                                                           |
| `--il-text`                 | `#f4f4f6`                                                                                                            | `#171719`                                                                           |
| `--il-text-muted`           | `#a2a2b0`                                                                                                            | `#54545e`                                                                           |
| `--il-text-subtle`          | `#9595a3`                                                                                                            | `#66666f`                                                                           |
| `--il-ink`                  | `#f4f4f6`                                                                                                            | `#171719`                                                                           |
| `--il-ink-contrast`         | `#16161a`                                                                                                            | `#ffffff`                                                                           |
| `--il-border`               | `rgba(255, 255, 255, 0.07)`                                                                                          | `rgba(23, 23, 25, 0.07)`                                                            |
| `--il-border-strong`        | `rgba(255, 255, 255, 0.14)`                                                                                          | `rgba(23, 23, 25, 0.14)`                                                            |
| `--il-focus-ring`           | `rgba(255, 33, 90, 0.9)`                                                                                             | `rgba(255, 33, 90, 0.98)`                                                           |
| `--il-accent`               | `#ff215a`                                                                                                            | `#ff215a`                                                                           |
| `--il-accent-hover`         | `#ff4271`                                                                                                            | `#f5114e`                                                                           |
| `--il-accent-press`         | `#e30f49`                                                                                                            | `#d80c43`                                                                           |
| `--il-accent-contrast`      | `#ffffff`                                                                                                            | `#ffffff`                                                                           |
| `--il-badge-ink`            | `#16161a`                                                                                                            | `#16161a`                                                                           |
| `--il-accent-ink`           | `#ff6b90`                                                                                                            | `#c2144a`                                                                           |
| `--il-accent-soft`          | `rgba(255, 33, 90, 0.16)`                                                                                            | `#fee5e6`                                                                           |
| `--il-accent-soft-strong`   | `rgba(255, 33, 90, 0.28)`                                                                                            | `#fbd2d5`                                                                           |
| `--il-accent-glow`          | `rgba(255, 33, 90, 0.45)`                                                                                            | `rgba(255, 33, 90, 0.35)`                                                           |
| `--il-danger`               | `#ff6178`                                                                                                            | `#e0243f`                                                                           |
| `--il-danger-contrast`      | `#141419`                                                                                                            | `#ffffff`                                                                           |
| `--il-danger-ink`           | `#ffc2cb`                                                                                                            | `#a3102a`                                                                           |
| `--il-danger-soft`          | `rgba(255, 97, 120, 0.14)`                                                                                           | `#fde8ec`                                                                           |
| `--il-warning`              | `#ffb86b`                                                                                                            | `#a35a00`                                                                           |
| `--il-warning-ink`          | `#ffd6a3`                                                                                                            | `#7a4300`                                                                           |
| `--il-warning-soft`         | `rgba(255, 184, 107, 0.14)`                                                                                          | `#fff1dc`                                                                           |
| `--il-skeleton-base`        | `rgba(255, 255, 255, 0.05)`                                                                                          | `rgba(23, 23, 25, 0.06)`                                                            |
| `--il-skeleton-shine`       | `rgba(255, 255, 255, 0.12)`                                                                                          | `rgba(23, 23, 25, 0.12)`                                                            |
| `--il-shadow-card`          | `0 1px 0 rgba(255, 255, 255, 0.03) inset, 0 32px 64px -32px rgba(0, 0, 0, 0.9), 0 8px 24px -16px rgba(0, 0, 0, 0.7)` | `0 32px 64px -40px rgba(23, 23, 25, 0.35), 0 6px 20px -12px rgba(23, 23, 25, 0.12)` |
| `--il-shadow-panel`         | `0 24px 48px -24px rgba(0, 0, 0, 0.85)`                                                                              | `0 24px 48px -24px rgba(23, 23, 25, 0.3)`                                           |

The dark surfaces, accent, danger and shadow are copied from Soundline because
its tokens already separate the reading surface from controls and document
measured caption fixes. The light palette follows both references; the two greys
are the darker values that pass on every row state.

### Measured deviations

The family look is preserved; the following values differ from the reference
tokens because the darker/lighter value was measured, not chosen:

| Value             | Reference                    | Inboxline                         | Reason                                                                                                                     |
| ----------------- | ---------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Dark subtle text  | `#9292a0`                    | `#9595a3`                         | `#9292a0` on `--il-control-hover` measured 4.49:1, just below 4.5:1.                                                       |
| Dark focus ring   | `rgba(..., 0.6)`             | `rgba(..., 0.9)`                  | 2.41:1 against `--il-surface`; 4.15:1 is the measured result, and the worst row state is 3.19:1.                           |
| Light focus ring  | `rgba(..., 0.45)`            | `rgba(..., 0.98)`                 | 1.92:1 against `--il-surface`; 3.37:1 is the measured result, and the worst row state is 3.04:1.                           |
| Read action glyph | quiet control at 60% opacity | `--il-text-subtle` at 0.8 opacity | At 60% the glyph measured 2.32:1 on the light unread surface; 80% keeps it quiet and every row surface is at least 3.25:1. |

`packages/core/src/styles/styles.test.ts` recalculates the contrast of the
caption, warning, danger, focus, unread-marker and read-action colours on every
surface, including the read action's opacity read from the CSS. The numbers
above are reproduced by that test. The Iteration 18 browser pass measured the
same pairs in Chromium with axe: the smallest caption on an unread surface was
5.75:1 dark / 5.18:1 light, the read glyph 4.16:1 / 3.46:1, and the badge
4.83:1 in both themes. A browser measurement remains part of the visual review;
the test does not replace it.

## 3. Classes and states

The stylesheet styles every slot in `IL_CLASS` and no class outside `il-*`. The
map between Inboxline and the chapters of the reference stylesheets:

| `IL_CLASS` slot    | Reference pattern                    | Note                                          |
| ------------------ | ------------------------------------ | --------------------------------------------- |
| `root`             | `.sn-root` / `.sl-root`              | Surface, width and container.                 |
| `bell`             | `.sl-control` (wrapper)              | Trigger scope and token holder.               |
| `trigger`          | `.sl-icon-button`                    | 44 px round bell with the shared badge.       |
| `badge`            | `.sl-day-dot` / count pill           | 19 px accent pill, `aria-hidden`.             |
| `panel`            | `.sl-popover`                        | Portalled root; fixed coordinates are inline. |
| `panelClose`       | `.sl-icon-button`                    | 30 px close action in the panel header.       |
| `header`           | `.sl-header`                         | Two-line rhythm is not used yet.              |
| `heading`          | `.sl-title`                          | 17 px, 650, ellipsis.                         |
| `filters`          | `.sl-tabs`                           | Segmented pill around two native buttons.     |
| `filter`           | `.sl-tab`                            | 12.5 px, selected state from `aria-pressed`.  |
| `actions`          | `.sl-toolbar`                        | Quiet row for the bulk action and its status. |
| `markAllRead`      | `.sl-secondary-button`               | Pill, `aria-disabled` instead of `disabled`.  |
| `status`           | `.sl-status`                         | Small textual pending/unknown/refusal line.   |
| `updates`          | `.sl-secondary-button`               | Full-width accent-soft acknowledgement.       |
| `list`             | `.sn-queue-list`                     | Scrolls only in the popover.                  |
| `group`            | day groups — new                     | One day of rows.                              |
| `groupLabel`       | `.sl-weekday` / `.sn-queue-count`    | 11.5 px, uppercase, subtle.                   |
| `item`             | `.sn-track-item`                     | Grid: tile, text, read action, marker.        |
| `itemAvatar`       | `.sn-artwork`                        | Round, 36 px, image cover.                    |
| `itemIcon`         | `.sl-slots-icon`                     | Rounded tile, accent-soft.                    |
| `itemContent`      | `.sn-track-info`                     | The flexible text column.                     |
| `itemTitle`        | `.sn-track-title`                    | 13.5 px, 600, wraps instead of ellipsis.      |
| `itemBody`         | — new                                | 12.5 px, muted, wraps.                        |
| `itemMeta`         | `.sn-track-line` / `.sn-queue-count` | Author and other meta; 11.5 px subtle.        |
| `itemTime`         | `.sn-track-duration`                 | Right-aligned, tabular numbers, no movement.  |
| `itemActivate`     | `.sn-track-item` (button reset)      | The row's main button; title/body/meta.       |
| `itemAction`       | `.sl-icon-button`                    | 28 px read/unread circle; visible on hover.   |
| `itemUnreadMarker` | `.sl-day-dot`                        | 7 px accent dot with a soft halo.             |
| `empty`            | `.sn-empty`                          | Dashed panel, centered.                       |
| `loading`          | `.sl-skeleton`                       | Shimmer from the two skeleton tokens.         |
| `error`            | `.sn-error` / `.sl-error`            | Soft danger panel; a retry button if present. |
| `pageError`        | `.sl-error`                          | Smaller strip under the loaded rows.          |
| `loadMore`         | `.sl-secondary-button`               | Pill button, 38 px minimum height.            |
| `live`             | `.sn-live`                           | Visually hidden live region.                  |

The stylesheet reads these states:

| Attribute                  | Styled as                                                             |
| -------------------------- | --------------------------------------------------------------------- |
| `data-il-theme="light"`    | The light palette; no system-preference switch.                       |
| `data-il-layout="popover"` | 400 px width, capped list and panel shadow.                           |
| `data-il-layout="feed"`    | 800 px width; the list grows with its rows.                           |
| `data-il-filter="…"`       | The applied filter, available to consumer styles.                     |
| `data-il-side="…"`         | The side of the trigger the portalled panel occupies.                 |
| `data-il-unread="true"`    | Unread surface, hover surface and visible marker.                     |
| `data-il-pending="true"`   | `cursor: progress` and a pulsing marker; the text keeps its contrast. |
| `data-il-unknown="true"`   | Amber inset ring and amber meta text; paired with a textual status.   |
| `data-il-error="true"`     | Danger inset ring on the refused row; paired with its status text.    |
| `data-il-kind="…"`         | A status line: subtle, amber (`unknown`) or danger (`error`).         |
| `data-il-disabled="true"`  | No pointer input; header and list at 60% opacity.                     |
| `aria-disabled="true"`     | A busy read action or bulk button at reduced opacity.                 |

`data-il-status` and `data-il-empty` are documented for the DOM contract but do
not need a visual rule: the loading, empty and error blocks are rendered as their
own slots. They remain available to a consumer that wants to style the list by
status.

### Consumer overrides

The stable slots are the styling extension point; a consumer never has to rely on
nesting.

- `className` on the provider is a whole-widget class. In the feed it lands on
  `.il-root`; in the bell it lands on both `.il-bell` and the portalled `.il-root`,
  because the panel is outside the trigger wrapper. A theme declared on that class
  therefore reaches the trigger and the panel.
- `classNames` is a map from `IlClassSlot` to an extra class. The DOM order is the
  stable `il-*` class first, the consumer's override second and any state class
  last, so `.il-item app-item` is the expected shape. Overrides never replace the
  base class and an omitted slot keeps only its base.
- Tokens stay on `.il-root` and `.il-bell`. Overriding `--il-accent`,
  `--il-radius-*` or a surface token under the provider class retunes both
  compositions; no selector needs to reach into internal markup.
- The playground's lilac example uses `--il-accent`, the accent-soft trio, the
  focus ring and the three radii, plus per-slot `header`/`item` hooks. It keeps the
  dark and light themes intact because it does not replace the palette wholesale.

Focus is one rule for the whole widget: a 2 px ring with a 2 px offset. The ring
is never removed without a replacement, and no rule uses `:focus` to hide it.
`prefers-reduced-motion` collapses every animation and transition to 1 ms in
`base.css`.

Unread is deliberately not only a colour: the marker, the weight and the
accessible name carry the state. The same applies to an unknown outcome, whose
ring is accompanied by a textual status in the binding. A disabled state is
marked with `aria-disabled` or the root attribute, not by colour alone.

## 4. Geometry and narrow containers

- The popover is 400 px and the feed 800 px, or 100% of a narrower parent. The
  portalled panel is additionally capped by the viewport: it is
  `min(400px, viewport − 2 × 8px)`, so a 320 px window shows a 304 px panel and
  never horizontal scroll.
- The bell trigger is a 44 px round control with a 19 px accent badge. It sits in
  the `.il-bell` token scope; the panel keeps the `.il-root` card and its theme.
- Both work at 320 px: the root caps its width, the grid gives the text column
  all remaining space, long titles and bodies use `overflow-wrap: anywhere`, and
  a container query tightens the insets and the leading tile below 380 px.
- There is no horizontal scrolling and no fixed height on the feed. The popover
  list has a 340 px cap; the header stays in place and the rows scroll.
- The layout is chosen by the layout attribute, never by the viewport width, so
  a panel does not flip its composition while it is open.
- The feed is a list, not a grid of cards: rows keep a single reading column.

## 5. Static state stand

`apps/style-stand/index.html` is a hand-written page for visual review. It shows
the dark and light palettes side by side, the feed at 800 and 320 px, the popover
at 400 and 320 px, and the row states: read, unread, pending, unknown, focused,
disabled, long content, loading, empty, first-page error and next-page error.

It has no framework, no data fetching and no build step of its own. Build the
packages first, then serve the repository root:

```sh
pnpm build
pnpm stand
# http://localhost:4174/apps/style-stand/
```

The page links the built `packages/core/dist/inboxline.css`, so it shows exactly
what a consumer installs. `pnpm stand` is a local Python static server; it is a
review tool, not part of the published packages. Screenshots belong in
`.screenshots/`, which is ignored by Git, and are not committed to package
sources.

For the comparison with the family, run the Soundline and Slotline playgrounds
locally (they are separate repositories and are not modified):

```sh
pnpm --dir ../soundline/apps/playground dev
pnpm --dir ../booking/apps/playground dev
```

Compare the dark/light surfaces, the 28 px card radius, the 400 px panel, the
pink accent, the system font and the soft shadow. The notification composition
is new; the visual language is not.

## 6. Limits of this iteration

- The stylesheet covers every slot that exists in `IL_CLASS`, including the bell,
  trigger, badge, panel, close action and all replaceable parts. Custom parts use
  their own classes; the published slots and tokens remain the contract. No empty
  placeholder class is published ahead of its component.
- The static stand shows the feed and the popover surface with hand-written
  markup. The live trigger, the portal and the viewport placement are exercised
  by the playground and the React tests; jsdom cannot measure their real geometry.
- The animation layer is `styles/animations.css`: the row stagger and collapse,
  the panel enter/leave and the measured-height clip. `il-shimmer` and `il-pulse`
  remain state feedback; the two layers share the same duration and easing tokens.
  Under `prefers-reduced-motion` every animation and transition collapses to 1 ms,
  and the React hooks stop holding rows and stop measuring heights as well.
- The static stand is not Storybook and not a screenshot suite. Browser
  regression tests arrive in Iteration 22; until then the review is manual.
- Contrast is measured arithmetically for the authored tokens. The test cannot
  see compositing differences, browser zoom, or the operating system’s
  forced-colours mode; the visual review checks the rendered page as well.
- Disabled states are exempt from WCAG text contrast, but they are still marked
  programmatically and never rely on opacity alone.
- The page chrome of the stand is written inline in the stand and is not part of
  the library: the package stylesheet never resets the consuming page.
