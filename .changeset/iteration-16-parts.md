---
'@nickkupriyanov/inboxline-core': minor
'@nickkupriyanov/inboxline-react': minor
---

Add replaceable parts, provider-level class overrides and a class helper.

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
