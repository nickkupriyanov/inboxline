---
'@nickkupriyanov/inboxline-core': minor
'@nickkupriyanov/inboxline-react': minor
---

Finish the feed flow: activation, individual read actions and “Mark all as read”.

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
