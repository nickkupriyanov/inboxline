---
'@nickkupriyanov/inboxline-core': minor
---

Add the deterministic mock adapter and its scenario controls.

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
