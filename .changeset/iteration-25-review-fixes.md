---
'@nickkupriyanov/inboxline-core': patch
'@nickkupriyanov/inboxline-react': patch
---

Fix the six findings of the v1 review without changing the public API.

- **Core: stale first page.** A first page requested before a confirmed read or
  bulk change is no longer applied over that confirmation; the controller reads
  the first page again instead of putting a row back to its old state.
- **Core: retry after an unknown outcome.** A successful `retry()` that recovers
  both the list and the counter now settles the unknown operations, so the row
  action and “Mark all as read” stop being blocked. The mutation is never
  repeated.
- **React: counter failure.** A failed counter gets its own compact alert with a
  retry while the loaded rows stay on screen and the previous value is kept.
- **React: focus on programmatic close.** Closing the controlled panel while
  focus is inside returns focus to the trigger, including under reduced motion
  where the panel unmounts immediately. Focus outside is never stolen.
- **Styles: header layout.** The narrow-container query now measures 360 px
  instead of 379 px, so the standard 400 px panel keeps its heading, filters and
  close action on one row; at narrow widths the heading and close share the first
  row and the filters take the second.
- **React: panel width token.** The resolved `--il-width-panel` is read from the
  panel's token scope and used for placement and the viewport cap instead of the
  compiled-in 400 px. A root-only override through `classNames.root` works as
  well as the shared `className`; the correction runs before paint.
