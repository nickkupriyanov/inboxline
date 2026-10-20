# @nickkupriyanov/inboxline-react

## 0.1.0

### Minor Changes

- 15e0d73: Publish the shared stylesheet as `@nickkupriyanov/inboxline-core/styles.css`.

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

- 4d99971: Add the ready-made feed, `@nickkupriyanov/inboxline-react`'s first complete UI.

  - **`<Inbox />`** renders the `feed` layout from the nearest `InboxProvider`: the
    heading, the “All”/“Unread” filter buttons, day groups, notification rows, the
    “Show more” control, the external-update banner and the loading, empty, list
    error and next-page error states. It is a consumer of `useInboxFlow()` and
    `useInboxUI()`, so a custom UI sees the same snapshot and actions.
  - **Rows** show the author avatar or the notification icon, the title, the
    optional body and the time. A broken avatar falls back to the author's
    initials, a broken icon to an inline bell, and a row with neither renders no
    leading tile. Missing optional fields are omitted instead of rendered empty;
    long titles and bodies wrap without a fixed row height.
  - **Accessible semantics**: the list is a labelled `<ul>`, groups are list items
    with a nested list, the filters are a named `role="group"` of native buttons
    whose selection is `aria-pressed`, and the server counter is announced through
    a polite live region. Unread is carried by the surface, the marker, a visually
    hidden label and the row's `data-il-unread`, not by colour alone.
  - **Public style slots** `filters`, `filter` and `updates` in `IlClassSlot` and
    `IL_CLASS`; the root sets `data-il-layout="feed"`, `data-il-theme` and
    `data-il-filter`. New copy keys `filtersLabel`, `filterAllLabel` and
    `filterUnreadLabel` ship in `en` and `ru`.
  - **Playground**: the Vite example now renders the real feed next to a headless
    counter card and imports the published stylesheet path through a source alias.

  Row activation, read/unread actions and the bell panel remain absent: they arrive
  in Iterations 14 and 15. No migration is needed; every addition is new API.

- ee06d6e: Finish the feed flow: activation, individual read actions and “Mark all as read”.

  - **Activation.** `Inbox` calls `onNotificationClick` with the confirmed
    `notification` for the row and, when `markReadOnOpen` (default `true`) is on and
    the row is unread, asks `actions.setRead(id, true)` at the same time. Navigation
    and the read request never wait for each other, and an exception from the
    callback is contained after the request has left. `InboxUI` exposes
    `markReadOnOpen` so a custom row makes the same decision.
  - **Two independent row controls.** The activation surface and the read/unread
    action are sibling native buttons, never nested. The action has the accessible
    name “Mark as read/unread: {title}” and a guarded `aria-disabled` state, so a
    focused button does not disappear when another mutation owns the queue.
  - **Whole-context action.** A “Mark all as read” button appears for a known
    non-zero counter and shows its own pending, reconciliation and refusal statuses.
    It uses `actions.markAllRead()`, so rows that were never loaded are covered by
    the server operation.
  - **Mutation feedback.** Core state gains `actionError`, a confirmed read or bulk
    refusal scoped to its row or the bulk action; the derived row gains the confirmed
    `notification` and a localized `actionError`, while `actions` gains
    `bulkStatus` and `bulkError`. A lost answer stays `unknown` and is reconciled,
    not reported as a refusal. New copy covers both locales, and new class slots are
    `actions`, `markAllRead`, `status`, `itemActivate` and `itemAction`.
  - **Focus.** When the used row leaves the unread filter, focus moves to the same
    control of the next row, then the previous row, and finally to the active
    “Unread” filter. It moves only if the removed control still had focus.

  The playground now reports the last activated notification. No migration is
  needed: every new prop, field and slot is additive.

- fa053b2: Add the bell trigger and its non-modal panel as the default `<Inbox />` layout.

  - **Two compositions, one surface.** `<Inbox />` now renders the `popover` layout —
    a bell trigger with the shared unread badge and a portalled panel. The previous
    list is still available as `<Inbox layout="feed" />`. Both use the same internal
    surface and the same provider snapshot, so a bell and a feed under one
    `InboxProvider` show the same counter, rows and action results.
  - **Trigger.** A native 44 px button with `aria-haspopup="dialog"`,
    `aria-expanded` and `aria-controls`. Its accessible name combines `listLabel`
    with the server counter label; the visible badge is `aria-hidden`, and an
    unknown or zero counter renders no badge instead of a false zero. The badge
    uses the new `--il-badge-ink` token, because white on the pink fill measures
    3.74:1 at its 10.5 px size; the dark ink measures 4.83:1 and a contrast test
    covers both themes.
  - **Panel.** The shared root card becomes a `role="dialog"` labelled by its
    heading, without `aria-modal` and without a focus trap. It is portalled to
    `document.body` only after mount, so server markup stays portal-free.
  - **Placement.** `observeAvailableArea()` from `@nickkupriyanov/inboxline-core/dom`
    reports the anchor's available area; the panel is `position: fixed`,
    right-aligned to the trigger, sized `min(400, viewport − 16)`, placed on the
    side with more space and capped to the free height. Scrolling a nested
    container, resizing the window and resizing the anchor re-place it.
    `data-il-side="top" | "bottom"` exposes the chosen side.
  - **Focus and dismissal.** Opening from the trigger moves focus into the dialog,
    Tab stays free, Escape and the close button restore focus to the trigger, and
    an outside pointer-down closes without stealing focus. A controlled `open`
    changed by the application does not move focus on its own.
  - **Data.** Reopening calls `actions.refresh()`; the initial render is skipped
    because the provider already starts its first load. Closing never calls
    `stop()`, so the provider stays alive for a co-existing feed.
  - **Core additions.** `InboxLayout`, the `closeLabel` copy in `en` and `ru`, and
    the `bell`, `trigger`, `badge`, `panel` and `panelClose` slots. `.il-bell` is a
    second token and focus scope so the trigger keeps the theme outside the card.

  No migration is needed: every new prop, type, message and slot is additive, and
  the default `<Inbox />` change is documented in the README and specification.

- ea5932b: Add replaceable parts, provider-level class overrides and a class helper.

  - **`cx(...values: ClassValue[])`** joins the truthy class names in order and is
    exported from the core. `ClassValue` is `string | false | null | undefined`.
    The helper does no de-duplication or CSS-module lookup, so the resulting string
    is predictable in a snapshot.
  - **Part props and defaults.** `InboxComponents<TData>` maps `Trigger`, `Header`,
    `Filters`, `NotificationItem`, `Avatar`, `Loading`, `Empty`, `Error` and
    `PageError` to replacement components. Every part receives the data it renders
    and the actions it triggers; the controller, read queue, focus hand-off, dialog
    placement and list structure stay with the library. `DEFAULT_INBOX_COMPONENTS`
    and the `Default*` components (`DefaultTrigger`, `DefaultHeader`,
    `DefaultFilters`, `DefaultNotificationItem`, `DefaultAvatar`,
    `DefaultLoading`, `DefaultEmpty`, `DefaultError`, `DefaultPageError`) are
    exported so an application can wrap rather than re-implement.
  - **Prepared props.** `SlotProps` bundles the stable `il-*` class with the
    consumer's override, the `data-il-*` state, the relevant `role`/`aria-*` and
    the handler or `ref` the library needs back. `TriggerPartProps.slotProps`
    carries the dialog contract; `HeaderPartProps.headingProps` keeps the dialog's
    `aria-labelledby` valid; `FilterOption.props` keeps `aria-pressed`, the click
    and the focus fallback; `NotificationItemPartProps.activateProps`/`readProps`
    keep the accessible read name, the disabled mirror and the refs used for focus.
  - **`className` and `classNames`.** `className` is added to `.il-root` in the feed
    and to both `.il-bell` and the portalled `.il-root` in the bell, so a theme
    reaches the trigger and the panel. `classNames` adds a per-slot class after the
    stable slot class; omitted slots keep only their base class.
  - **`TData`.** It flows through `InboxComponents<TData>`,
    `NotificationItemPartProps<TData>`, `AvatarPartProps<TData>` and `InboxUI`, so a
    custom row reads `item.data` without a cast.
  - **Lifecycle.** Changing `components`, `className` or `classNames` on a mounted
    provider does not recreate the controller or reload the list; only the
    presentation context changes. An exception in an application callback remains
    contained.
  - **Playground and docs.** Three new sections show a typed custom row/avatar, an
    alternative header with custom filter pills, and a CSS theme declared through
    `className`/`classNames`. `docs/specification.md` and
    `docs/visual-reference.md` document the parts contract, the merge order and the
    override scopes.

  No migration is needed: every new prop, export and type is additive. The
  `Default*` names are new, and the existing ready-made layouts keep their markup
  through those defaults.

- 22cbe76: Add soft animations, a replaceable animation kit and an optional Motion entry.

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

- 9570be4: Add server rendering and hydration support.

  - **Serialisable first paint.** `InboxInitialData<TData>` (`page`, `unreadCount`,
    `now`) is accepted by `createInboxController()` and by `<InboxProvider>` as
    `initialData`. It becomes confirmed state at creation, contains no pending
    operations or callbacks, and is still confirmed by the adapter when the
    controller starts. The seed's timestamp anchors relative labels until `start()`
    or `refreshTime()`, so the server and the first client render agree.
  - **Browser preferences after mount.** `locale` and `timeZone` keep the
    deterministic `en`/`UTC` fallback while rendering; the React provider detects
    the visitor's language and zone in an effect and uses them only for fields the
    application omitted. The first client render therefore still matches the server.
  - **SSR-safe markup.** An idle list renders as loading instead of an empty inbox,
    and the bell trigger reports `aria-expanded`/`aria-controls` only once the
    client-only panel exists, so `defaultOpen` does not break hydration.
  - `apps/ssr-example/` is a runnable `renderToString()` → `hydrateRoot()` example
    (`pnpm ssr`).

  Migration: nothing changes for a client-only application except that, when
  `config.locale` and `config.timeZone` are not passed, the visitor's browser
  preferences are used after mounting instead of always `en`/`UTC`. Pass them
  explicitly to keep a fixed presentation.

- 47a34c8: Add the React provider and the headless API: `InboxProvider` owns one core
  controller, `useInboxFlow()` exposes its snapshot and actions, and
  `useInboxUI()` exposes the theme, copy, filter and panel state. The provider
  creates no controller work before mounting, starts and stops the core lifecycle,
  keeps adapter/context/config props in step, and isolates independent providers.
  `filter` and `open` support controlled and uncontrolled modes, fixed at creation
  with development warnings on a mode change. The package also ships a minimal Vite
  playground under `apps/playground` that demonstrates two custom views under one
  provider and two isolated providers.

### Patch Changes

- e88d448: Improve keyboard focus and non-text contrast found by the accessibility audit.

  - **Focus survives asynchronous controls.** “Show more” uses `aria-disabled` and a
    guarded handler while the next page loads instead of the native `disabled`
    attribute, so focus stays on the button. When “Mark all as read”, “Show updates”,
    a retry or the last “Show more” removes the focused control, focus falls back to
    the active filter instead of `body`; the existing row-to-row hand-off is unchanged.
  - **A clearer live region.** The hidden counter region adds `role="status"` to its
    polite, atomic contract. Row and bulk statuses keep their own roles.
  - **Read/unread glyph contrast.** The quiet action glyph uses 0.8 opacity instead
    of 0.6: its worst measured contrast on a row surface changes from 2.32:1 to
    3.25:1, above the 3:1 required for a non-text control, without changing the
    palette or the layout.
  - The playground button defaults use zero specificity so demo styles cannot
    repaint the widget's controls during visual review.

  The accessible names, roles, dialog relationships and both themes' text contrast
  were verified with axe and a keyboard pass in Chromium; see the specification and
  `.screenshots/` for the measurements and their boundaries.

- c1b8a70: Ship the package README in both tarballs and add a packaging check.

  - `files` in both manifests now includes `README.md`, so the published tarball
    carries the package documentation next to its `LICENSE` and `dist` build.
  - `tools/verify-install.mjs` packs the libraries, asserts the export maps,
    `sideEffects`, README/LICENSE/CSS/declarations and absence of sources, then
    installs and builds React 18, React 19 and an optional-motion consumer from
    the tarballs (including SSR hydration and a Chromium check).

  No runtime API changes; the published JavaScript is unchanged.

- cad0778: Expand the published package documentation.

  - The package READMEs now cover installation, a quick start, the backend adapter,
    the controller and provider surfaces, layouts, hooks, theming, locales,
    replaceable parts, SSR, support and known limits.
  - `docs/reference.md` adds tables for the adapter, controller, provider props,
    hooks, parts, class slots, CSS tokens and message keys.
  - `docs/migration.md` records the changeset and migration rules and the explicit
    publish procedure. No runtime or API change.

- 1afccbb: Fix the six findings of the v1 review without changing the public API.

  - **Core: stale first page.** A first page requested before a confirmed read or
    bulk change is no longer applied over that confirmation; the controller reads
    the first page again instead of putting a row back to its old state.
  - **Core: retry after an unknown outcome.** A successful `retry()` that recovers
    both the list and the counter now settles the unknown operations, so the row
    action and “Mark all as read” stop being blocked. The mutation is never
    repeated.
  - **React: counter failure.** A failed counter gets its own compact alert with a
    retry while the loaded rows stay on screen and the previous value is kept.
  - **React: focus on programmatic close.** Closing the controlled panel while
    focus is inside returns focus to the trigger, including under reduced motion
    where the panel unmounts immediately. Focus outside is never stolen.
  - **Styles: header layout.** The narrow-container query now measures 360 px
    instead of 379 px, so the standard 400 px panel keeps its heading, filters and
    close action on one row; at narrow widths the heading and close share the first
    row and the filters take the second.
  - **React: panel width token.** The resolved `--il-width-panel` is read from the
    panel's token scope and used for placement and the viewport cap instead of the
    compiled-in 400 px. A root-only override through `classNames.root` works as
    well as the shared `className`; the correction runs before paint.

- Updated dependencies [2c79200]
- Updated dependencies [0a1ca14]
- Updated dependencies [15e0d73]
- Updated dependencies [4d99971]
- Updated dependencies [ee06d6e]
- Updated dependencies [fa053b2]
- Updated dependencies [ea5932b]
- Updated dependencies [22cbe76]
- Updated dependencies [e88d448]
- Updated dependencies [9570be4]
- Updated dependencies [20626e6]
- Updated dependencies [c1b8a70]
- Updated dependencies [cad0778]
- Updated dependencies [1afccbb]
- Updated dependencies [049ff3a]
- Updated dependencies [900e3bf]
- Updated dependencies [bc561c9]
- Updated dependencies [289b30d]
- Updated dependencies [821fda0]
- Updated dependencies [7846cf2]
- Updated dependencies [449cbf1]
  - @nickkupriyanov/inboxline-core@0.1.0
