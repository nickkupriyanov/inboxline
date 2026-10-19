---
'@nickkupriyanov/inboxline-core': minor
---

Add the controller lifecycle and the first page/counter load.

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
