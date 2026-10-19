---
'@nickkupriyanov/inboxline-core': minor
---

Add the browser entry point `@nickkupriyanov/inboxline-core/dom`.

- **Import safety.** The subpath reads neither `window` nor `document` while it
  is being imported, so a server can load it; the main entry does not import it,
  and a bundler pulls it in only when a binding asks for it.
- **Focus around a non-modal panel.** `focusableWithin` lists the controls that
  can take focus now, `focusFirstWithin` focuses the first one or a focusable
  container, `captureFocus` remembers the active element and `restoreFocus`
  returns focus to it if it is still connected. There is deliberately no focus
  trap: the panel is non-modal, and deciding when restoring focus is polite stays
  with the UI layer.
- **Size observation.** `measureSize` reads the border box, and `observeSize`
  reports it now and on changes with `ResizeObserver`, falling back to the window
  resize event and doing nothing on a host without a window.
- **Available area.** `measureAvailableArea` returns the viewport-relative anchor
  rectangle, the layout viewport and the free space on four sides with a margin
  subtracted; `observeAvailableArea` reports it after scroll, resize or an anchor
  size change, skips identical measurements and removes every listener on
  cleanup. `DEFAULT_VIEWPORT_MARGIN` is `8` px.
- **Lifecycle.** Every subscription returns an idempotent remover, can be created
  again after removal and keeps several observed anchors independent. Missing
  `ResizeObserver`, `window` or `document` degrade to one measurement or a no-op
  remover instead of throwing.
