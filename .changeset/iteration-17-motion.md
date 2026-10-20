---
'@nickkupriyanov/inboxline-core': minor
'@nickkupriyanov/inboxline-react': minor
---

Add soft animations, a replaceable animation kit and an optional Motion entry.

- **Animation layer.** `packages/core/src/styles/animations.css` joins the
  stylesheet after the components. Rows enter with a 40 ms stagger driven by
  `--il-index` and leave through one collapse; the panel enters from its trigger
  and leaves for `--il-exit-duration`; `.il-height`/`.il-height-inner` carry a
  measured height while it changes. `--il-stagger-step`, `--il-index` and
  `--il-exit-duration` are published tokens.
- **DOM helpers.** `measureHeight()`, `observeAnimatedHeight()`,
  `REDUCED_MOTION_QUERY`, `canMatchMedia()`, `matchesMediaQuery()` and
  `observeMediaQuery()` are exported from `@nickkupriyanov/inboxline-core/dom`.
  The height observer reports the new height with an `animating` flag that settles
  after the duration; the media helpers report once and watch nothing where
  `matchMedia` does not exist. Neither touches a browser object at import time.
- **`AnimationKit`.** `InboxProvider` accepts `animations` with two primitives:
  `Item` (the row element itself, receiving `index` and `exiting`) and `Height`
  (the measured container). `cssAnimations` is the zero-dependency default and is
  exported from the main entry. A custom kit keeps the class hooks
  (`il-row-animated`, `il-height`/`il-height-inner`) and the `data-il-*` attributes.
- **`/motion`.** `@nickkupriyanov/inboxline-react/motion` exports
  `motionAnimations` and an `InboxProvider` that defaults to it; `motion` becomes
  an optional peer. The main entry never imports the Motion module, which is
  checked by walking the module graph.
- **Exit semantics.** A row made read by the visitor stays mounted for 240 ms with
  `data-il-exiting="true"`, `aria-hidden` and no controls, so it leaves the
  interaction tree before it collapses. Focus moves to the next row on the same
  commit. A filter or context change drops held rows at once, and bulk “mark all
  as read”, refreshes and page replacements do not animate as a cascade. The bell
  keeps its panel mounted, inert, for the same window; reopening cancels the exit.
- **Reduced motion.** Both hooks disable themselves under
  `prefers-reduced-motion: reduce` (no measurement, no held rows, the panel
  unmounts at once), and the stylesheet still collapses every animation and
  transition to 1 ms as a fallback.
- **Playground and docs.** A Motion section joins the playground, and
  `docs/specification.md` documents the kit contract, the exit rules and the
  browser-only limits of the jsdom tests.

Migration is additive apart from one type change: `NotificationItemPartProps`
now includes required `index: number` and `exiting: boolean`. A custom
`NotificationItem` that receives the props object unchanged needs no edit; code
that constructs the props by hand must add both fields. Rows now carry the extra
`il-row-animated` class, and the surface content is wrapped in `.il-height`; slot
classes, prepared props and behaviour are unchanged.
