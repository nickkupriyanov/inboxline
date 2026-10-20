---
'@nickkupriyanov/inboxline-core': minor
'@nickkupriyanov/inboxline-react': minor
---

Add server rendering and hydration support.

- **Serialisable first paint.** `InboxInitialData<TData>` (`page`, `unreadCount`,
  `now`) is accepted by `createInboxController()` and by `<InboxProvider>` as
  `initialData`. It becomes confirmed state at creation, contains no pending
  operations or callbacks, and is still confirmed by the adapter when the
  controller starts. The seed's timestamp anchors relative labels until `start()`
  or `refreshTime()`, so the server and the first client render agree.
- **Browser preferences after mount.** `locale` and `timeZone` keep the
  deterministic `en`/`UTC` fallback while rendering; the React provider detects
  the visitor's language and zone in an effect and uses them only for fields the
  application omitted. The first client render therefore still matches the server.
- **SSR-safe markup.** An idle list renders as loading instead of an empty inbox,
  and the bell trigger reports `aria-expanded`/`aria-controls` only once the
  client-only panel exists, so `defaultOpen` does not break hydration.
- `apps/ssr-example/` is a runnable `renderToString()` → `hydrateRoot()` example
  (`pnpm ssr`).

Migration: nothing changes for a client-only application except that, when
`config.locale` and `config.timeZone` are not passed, the visitor's browser
preferences are used after mounting instead of always `en`/`UTC`. Pass them
explicitly to keep a fixed presentation.
