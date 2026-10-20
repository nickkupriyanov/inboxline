---
'@nickkupriyanov/inboxline-core': minor
'@nickkupriyanov/inboxline-react': minor
---

Add the bell trigger and its non-modal panel as the default `<Inbox />` layout.

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
