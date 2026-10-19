---
'@nickkupriyanov/inboxline-core': minor
---

Implement external updates: the optional invalidation subscription and its safe
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
