---
'@nickkupriyanov/inboxline-core': minor
---

Derive the view model, and resolve the copy and the time reference it needs.

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
