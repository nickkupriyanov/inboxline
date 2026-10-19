---
'@nickkupriyanov/inboxline-core': minor
---

Add optimistic read status changes for one notification.

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
