# @nickkupriyanov/inboxline-core

## 0.1.0

### Minor Changes

- 2c79200: Publish the integration contract.

  - **The domain model**: `InboxNotification<TData>` (stable `id`, RFC 3339
    `createdAt` with an explicit offset, `title`, optional `body`/`author`/`icon`,
    the confirmed server `read` state and application `data`), `InboxAuthor`,
    `InboxPage<TData>` with an opaque `nextCursor`, `InboxUnreadCount`,
    `InboxContext<TContextData>` and `InboxFilter`.
  - **The adapter contract**: `InboxAdapter<TData, TContextData>` with
    `getNotifications`, `getUnreadCount`, `setReadStatus` and `markAllRead`, each
    receiving the context; loads also receive an `AbortSignal`, and an optional
    `subscribe({ context, onInvalidate })` reports invalidations from a transport
    that stays in the application.
  - **The error contract**: `InboxError` with `code` (`ADAPTER_FAILURE`,
    `ADAPTER_CONTRACT_VIOLATION`, `UNAUTHORIZED`, `NOT_FOUND`, `CONFLICT`,
    `UNKNOWN`), `phase` (`load`/`mutation`), `outcome` (`rejected`/`unknown`),
    structural `isInboxError()`, `toInboxError()`, `createUnknownOutcomeError()`
    and the abort helpers. A cancelled request is not an `InboxError`.
  - **Boundary checks** for adapter authors: `assertInboxPage`,
    `assertInboxUnreadCount`, `assertInboxReadStatusResult`,
    `assertInboxMarkAllReadResult`, their `is*` predicates, and
    `isInboxTimestamp()`, which rejects an offset-less or rolled-over date instead
    of re-interpreting it.
  - **Context and filter helpers**: `DEFAULT_INBOX_CONTEXT`, `DEFAULT_CONTEXT_KEY`,
    `INBOX_FILTERS`, `DEFAULT_FILTER`, `isInboxContext()`,
    `isSameInboxContext()` (key equality) and `isInboxFilter()`.
  - **The controller vocabulary, types only** (`InboxActions`, `InboxCallbacks`):
    `setFilter`, `refresh`, `loadMore`, `setRead(id, read)`, `markAllRead`,
    `reconcile`, `setContext`, `setAdapter`, plus `onNotificationClick` and
    `onError`. Nothing runs yet — `createInboxController()` arrives in Iteration 5,
    and the controlled UI values stay in the binding.

  Decisions fixed here: `markAllRead` resolves with `{ boundary, unreadCount }`,
  where the boundary decides which notifications count as read after an unknown
  outcome, and a lost response is an `InboxError` with `outcome: 'unknown'` that is
  never retried automatically. Mutations receive no `AbortSignal`, because
  cancelling one after the server received it would create exactly that unknown
  outcome. No migration is needed: the package had no runtime exports before this
  change.

- 0a1ca14: Add the browser entry point `@nickkupriyanov/inboxline-core/dom`.

  - **Import safety.** The subpath reads neither `window` nor `document` while it
    is being imported, so a server can load it; the main entry does not import it,
    and a bundler pulls it in only when a binding asks for it.
  - **Focus around a non-modal panel.** `focusableWithin` lists the controls that
    can take focus now, `focusFirstWithin` focuses the first one or a focusable
    container, `captureFocus` remembers the active element and `restoreFocus`
    returns focus to it if it is still connected. There is deliberately no focus
    trap: the panel is non-modal, and deciding when restoring focus is polite stays
    with the UI layer.
  - **Size observation.** `measureSize` reads the border box, and `observeSize`
    reports it now and on changes with `ResizeObserver`, falling back to the window
    resize event and doing nothing on a host without a window.
  - **Available area.** `measureAvailableArea` returns the viewport-relative anchor
    rectangle, the layout viewport and the free space on four sides with a margin
    subtracted; `observeAvailableArea` reports it after scroll, resize or an anchor
    size change, skips identical measurements and removes every listener on
    cleanup. `DEFAULT_VIEWPORT_MARGIN` is `8` px.
  - **Lifecycle.** Every subscription returns an idempotent remover, can be created
    again after removal and keeps several observed anchors independent. Missing
    `ResizeObserver`, `window` or `document` degrade to one measurement or a no-op
    remover instead of throwing.

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

- 20626e6: Add the state machine: an immutable inbox state and its pure reducer.

  - **`InboxState<TData>`** and **`createInboxState()`**: the confirmed rows
    (`byId` indexed by id plus `order` in the server's order, without duplicates),
    the cursor of the next page, the filter, the context key, one status and one
    error per load (first page, next page, counter), the server counter with its
    honest `null` while it is unknown, the optimistic layer, and the generation of
    each request.
  - **`inboxReducer(state, action)`** with the transitions `contextChanged`,
    `setFilter`, `listLoading`/`listLoaded`/`listFailed`,
    `pageLoading`/`pageLoaded`/`pageFailed`,
    `countLoading`/`countLoaded`/`countFailed` and
    `readPending`/`readConfirmed`/`readFailed`/`readUnknown`. An action that
    changes nothing returns the same object, so a snapshot stays stable.
  - **The optimistic layer** (`InboxPendingState`, `InboxPendingRead`,
    `InboxPendingBulk`) stays separate from confirmed data: a pending read never
    writes `byId` or `unreadCount`, a rejected operation rolls back only its own
    layer, and an operation whose answer was lost stays `unknown` until the
    application reconciles.
  - **Documented guarantees**: the server order is never re-sorted, merging a page
    is additive (a repeated id keeps its place and its content), a `nextCursor`
    that does not advance ends the list, and a terminal action whose request
    generation no longer matches is dropped.

  No breaking change and no migration: the only runtime exports added are
  `createInboxState` and `inboxReducer`. The controller, the derived view model and
  the mock adapter are still to come, so nothing runs a request yet.

- 049ff3a: Derive the view model, and resolve the copy and the time reference it needs.

  - **Configuration** (`resolveInboxConfig`): `locale` and `timeZone` validated
    against `Intl` with deterministic fallbacks (`FALLBACK_LOCALE` = `en`,
    `FALLBACK_TIME_ZONE` = `UTC`) instead of a browser lookup, so the same input
    always resolves the same way — the property SSR and hydration rely on — plus
    `FALLBACK_*`, `isSupportedInboxLocale()` and `isSupportedInboxTimeZone()`.
  - **Copy** (`i18n.ts`): `en` and `ru` dictionaries (`defaultMessages`),
    `resolveMessageLocale()`, per-key `resolveMessages()` overrides, the
    `{placeholder}` `format()` substitution and `selectPlural()`, which picks the
    plural form with `Intl.PluralRules`.
  - **The derived view model** (`derive.ts`): the pure `deriveInboxView(state,
config, time)` returning `InboxView<TData>` — `settings`, the server `counter`
    with its honest “unknown”, the `list` with day `groups` and `items`, the `page`
    state, the available `actions` and the `live` announcement. The optimistic layer
    is applied per row (`read`/`unread`, `pending`, `unknown`), the server order is
    preserved, and nothing reads the clock.
  - **Time** (`time.ts`, `InboxTimeAnchor`, `InboxClock`): `createInboxTimeAnchor()`
    fixes the moment and the days “today” and “yesterday” mean in the configured
    zone; `systemInboxClock()` is the real clock. `isInboxDayKey()`, `dayKeyOf()`,
    `dayKeyOfInstant()`, `addDaysToDayKey()`, `formatInboxRelativeTime()`,
    `formatInboxDayLabel()` and `formatInboxItemTime()` turn those into the day
    groups and the relative or absolute row labels.
  - **Stable class names** (`classNames.ts`, `IlClassSlot`): `IL_CLASS` maps every
    slot to its `il-*` base class; state a stylesheet reacts to is written as a
    `data-il-*` attribute.
  - **The view cache** (`inboxViewKey`, `createInboxViewMemo`): the key is
    `stateRevision | configRevision | today | minuteBucket`, and the same key
    returns the very same view object.

  No migration: the additions are new runtime exports, and the previous surface —
  the contract, the reducer and `isInboxTimestamp` — is unchanged. The controller
  and the mock adapter are still to come, so nothing runs a request yet.

- 900e3bf: Add the deterministic mock adapter and its scenario controls.

  - **`createMockAdapter({ clock, pageSize, latencyMs, contexts })`** returns an
    ordinary `InboxAdapter` with an independent in-memory store per instance and
    per context key. Rows are explicit fixtures; time is an injected `InboxClock`.
  - **Contract behaviour**: newest-first order with a deterministic tie-breaker, a
    cursor built from the last row's sort key so paging survives new events and
    removed unread rows, a counter over the whole context including unloaded rows,
    idempotent `setReadStatus` with `NOT_FOUND` for an unknown id, and a
    `markAllRead` boundary taken from the injected clock that leaves later events
    unread.
  - **Simulator controls**: `addNotification()`, `invalidate()` with independent
    per-context subscriptions, `failNext()` for one-shot failures,
    `clearFailures()` and `setLatency()`. A load can be aborted and rejects with the
    contract's `AbortError`; a queued failure stays for the next real request.
  - **Two mutation outcomes**: a rejected failure leaves the data unchanged, while
    `{ apply: true, outcome: 'unknown' }` applies the change before throwing, which
    models a lost response after the server already acted.

  The mock is exported from `@nickkupriyanov/inboxline-core` next to the existing
  contract. No migration is needed: every addition is new runtime API.

- bc561c9: Add the controller lifecycle and the first page/counter load.

  - **`createInboxController({ adapter, context, filter, config, clock, callbacks })`**
    returns a stable snapshot (`{ revision, state, view }`), `subscribe()`,
    idempotent `start()`/`stop()`, `refreshTime()`, `updateConfig()` and `actions`.
    Creating a controller performs no request, subscription, timer or callback.
  - **Independent loads**: `start()` loads the first page and the counter in
    parallel; each keeps its own status, error and request generation, so either
    can fail while the other succeeds. A cancelled or superseded answer never
    reaches `onError`.
  - **Recovery**: `refresh()` reloads both the list and the counter while keeping
    the shown rows until the new first page arrives; the new `retry()` repeats only
    the loads that are in the error state.
  - **Lifecycle isolation**: a changed context, a replaced adapter, a stop and a
    newer refresh all abandon the previous answers, including a late response from
    a context whose reducer generations restarted.
  - **Configuration and time**: `updateConfig()` compares the resolved values
    structurally; the snapshot is derived from the injected `InboxClock`, and
    `refreshTime()` announces a new rendered minute without a request.
  - **Contained callbacks**: state is updated before `onError` runs, and an
    exception thrown by the callback neither rejects the action nor repeats it.

  `setFilter`, `loadMore`, `setRead`, `markAllRead` and `reconcile` remain part of
  the fixed vocabulary but are no-ops until their iterations. No migration is
  needed: every addition is new runtime API.

- 289b30d: Add controller filtering and cursor paging.

  - **`actions.setFilter(filter)`** now switches the list filter. A different
    filter abandons the rows, the cursor and the in-flight list/page requests of
    the previous one and loads the first page of the new filter when the controller
    is started. The global unread counter and its in-flight request are untouched.
    A filter chosen before `start()` is used by the initial load.
  - **`actions.loadMore()`** appends the next page of the current filter and
    context. It does nothing without a cursor, before the first page is ready or
    while another page is loading, so two rapid calls produce one request. A failed
    page keeps the shown rows and the cursor, so the next call retries that same
    page.
  - **Safe paging**: overlapping pages are folded into the first occurrence of an
    id, an empty page is a valid answer, and a cursor that was already requested in
    the current chain ends the list instead of looping. The chain starts over with
    every first page.
  - **First pages win**: `start`, `refresh`, `setFilter`, a context change and an
    adapter replacement abort an in-flight page load; a late page answer cannot
    append rows to the new chain.
  - **`actions.retry()`** also repeats a failed next page at the same cursor, but
    not at the same time as a failed first page, whose retry replaces the chain.

  No migration is needed: the public exports are unchanged and the added behaviour
  matches the already published action vocabulary.

- 821fda0: Add optimistic read status changes for one notification.

  - **`actions.setRead(id, read)`** is live. It is an explicit desired state, not a
    toggle, and it records the optimistic layer before the request leaves, so the
    row and the displayed counter answer the click immediately.
  - **Serialised mutations**: individual read operations are sent one at a time in
    the order they were asked for. A second request for the same id is ignored
    while the first operation is queued, in flight or waiting for reconciliation,
    and a request for the state the notification already has is not sent.
  - **Server confirmation**: a successful `setReadStatus` installs the confirmed
    notification and the counter the server reported. That counter supersedes a
    counter load that was already in flight, so a late older answer cannot restore
    it.
  - **Refusal and unknown outcome**: a confirmed rejection rolls back exactly that
    operation and reaches `onError`; anything that does not state an outcome — a
    transport error, a lost answer — is kept as the visible `unknown` state and a
    reconciliation refresh is started instead of retrying the mutation.
    `actions.reconcile()` is live and repeats that reconciliation after a failed
    one.
  - **Optimistic counter**: the derived view projects pending operations onto the
    server number using the confirmed state they started from. A lost answer is
    left out until the reconciliation resolves it.
  - **The unread filter is a live selection**: a row that becomes read leaves the
    list immediately and returns if the operation is rolled back.
  - `markAllRead` remains a no-op until Iteration 8.

  No migration is needed: the added behaviour matches the action vocabulary that
  was already published, and no export was added.

- 7846cf2: Implement the server-side “mark all read” operation.

  - **One whole-context request.** `markAllRead()` runs outside the queue of
    individual changes: it is refused while that queue is busy, and `setRead()` is
    refused while the bulk operation is pending or `unknown`. The derived
    `canMarkAllRead` and the action agree.
  - **A separate optimistic layer.** `pending.bulk` is `{ token, status }`. While it
    runs, every loaded row is shown as read and the displayed counter is projected
    to zero, because the request covers rows that were never loaded. The confirmed
    rows and `state.unreadCount` are not rewritten.
  - **The server boundary decides.** The new `bulkConfirmed` action marks loaded
    rows created at or before the server's `boundary` read, keeps the rows created
    after it as the server reported them, installs the server counter as is (it is
    not necessarily zero) and drops the layer. The controller then refreshes the
    first page and the counter, so events created after the boundary arrive unread.
  - **Refusal and lost answers.** `bulkFailed` retracts the layer after a confirmed
    rejection. An answer that states no outcome becomes an `InboxError` with
    `outcome: 'unknown'`, is kept as `pending.bulk.status === 'unknown'`, and is
    reconciled by a refreshed first page and counter through `readsReconciled`. The
    bulk request is never repeated automatically; a later call is a new user action
    with a new boundary.
  - **Lifecycle.** A context change resets the layer, an adapter replacement
    retracts it, and an answer from the previous source is dropped by the source
    generation.

  The reducer gains `bulkPending`, `bulkConfirmed`, `bulkFailed` and `bulkUnknown`,
  `readsReconciled` also drops an unknown bulk operation, and `InboxPendingBulk`
  now carries the request token. The mock adapter needed no contract change: its
  existing `markAllRead` boundary, counter and `failNext({ apply, outcome })`
  controls drive the new scenarios.

- 449cbf1: Implement external updates: the optional invalidation subscription and its safe
  acknowledgement.

  - **The subscription follows the lifecycle.** `start()` opens the adapter's
    optional `subscribe` before the first request, `stop()` releases it, and a
    context change or an adapter replacement releases the old subscription and opens
    the new one. A callback delivered after its subscription was released is ignored.
  - **A signal, not a change.** An invalidation refreshes the counter and raises the
    new `state.updatesAvailable` flag without touching the open list, so new events
    never shift a list the visitor is reading.
  - **Bursts are coalesced.** Any number of events in one turn produces one counter
    read. An event that arrives while the counter is being read makes that answer
    stale: a fresh read follows, and a failed read is reported once instead of being
    retried in a loop.
  - **An explicit acknowledgement applies the list.** The new action
    `showUpdates()` does nothing when no update is pending and otherwise behaves
    like `refresh()`. The flag is cleared by a first page that was requested after
    the latest invalidation, so an event that arrives during that load keeps the
    flag for the next acknowledgement.
  - **A failing subscription is contained.** `subscribe` that throws or returns no
    unsubscribe function is reported through `onError` with phase `load`; the
    controller keeps working without external updates and the next `refresh()`
    retries the subscription. Reconnection stays the application's responsibility.
  - **The view exposes the update.** `InboxView.updates` is `{ available, label }`
    with the new `InboxMessages.showUpdatesLabel` copy, and
    `InboxActionsView.canShowUpdates` follows the flag.

  The reducer gains the `externalUpdate` action, `listLoaded` carries whether an
  invalidation is still awaiting acknowledgement, and `InboxState` gains
  `updatesAvailable`. No migration is needed: the new action and flag are additive
  and the previous behaviour of `refresh()` is unchanged.

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
