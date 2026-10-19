---
'@nickkupriyanov/inboxline-core': minor
---

Implement the server-side “mark all read” operation.

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
