---
'@nickkupriyanov/inboxline-core': patch
'@nickkupriyanov/inboxline-react': patch
---

Improve keyboard focus and non-text contrast found by the accessibility audit.

- **Focus survives asynchronous controls.** “Show more” uses `aria-disabled` and a
  guarded handler while the next page loads instead of the native `disabled`
  attribute, so focus stays on the button. When “Mark all as read”, “Show updates”,
  a retry or the last “Show more” removes the focused control, focus falls back to
  the active filter instead of `body`; the existing row-to-row hand-off is unchanged.
- **A clearer live region.** The hidden counter region adds `role="status"` to its
  polite, atomic contract. Row and bulk statuses keep their own roles.
- **Read/unread glyph contrast.** The quiet action glyph uses 0.8 opacity instead
  of 0.6: its worst measured contrast on a row surface changes from 2.32:1 to
  3.25:1, above the 3:1 required for a non-text control, without changing the
  palette or the layout.
- The playground button defaults use zero specificity so demo styles cannot
  repaint the widget's controls during visual review.

The accessible names, roles, dialog relationships and both themes' text contrast
were verified with axe and a keyboard pass in Chromium; see the specification and
`.screenshots/` for the measurements and their boundaries.
