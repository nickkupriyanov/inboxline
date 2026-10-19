---
'@nickkupriyanov/inboxline-core': minor
'@nickkupriyanov/inboxline-react': minor
---

Add the ready-made feed, `@nickkupriyanov/inboxline-react`'s first complete UI.

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
