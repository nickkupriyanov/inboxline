# Inboxline — API reference

The quick lookup for the public surface. The behaviour behind each item is in
[`specification.md`](./specification.md); the visual tokens are in
[`visual-reference.md`](./visual-reference.md).

## Entry points

| Import                                       | What it contains                                                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@nickkupriyanov/inboxline-core`             | Adapter and notification contracts, context/filter helpers, errors, reducer, derived view, config and copy, mock adapter, controller, `cx()` and `IL_CLASS`. |
| `@nickkupriyanov/inboxline-core/dom`         | Browser helpers for focus, sizing, media queries and animated height. No DOM access at import time.                                                          |
| `@nickkupriyanov/inboxline-core/styles.css`  | The authored stylesheet.                                                                                                                                     |
| `@nickkupriyanov/inboxline-react`            | Provider, hooks, the bell/feed widget, built-in parts and the CSS animation kit.                                                                             |
| `@nickkupriyanov/inboxline-react/motion`     | The same API with spring animations; requires the optional `motion` peer.                                                                                    |
| `@nickkupriyanov/inboxline-react/styles.css` | A copy of the stylesheet, so a React-only consumer can import one path.                                                                                      |

The binding re-exports the core domain types, so a React application can import
them from either package.

## Notification and adapter

```ts
interface InboxNotification<TData = unknown> {
  id: string;
  createdAt: string; // RFC 3339 with Z or ±HH:MM
  title: string;
  body?: string;
  author?: { id?: string; name: string; avatarUrl?: string };
  icon?: string;
  read: boolean;
  data?: TData;
}

type InboxFilter = 'all' | 'unread';
interface InboxContext<TContextData = unknown> {
  key: string;
  data?: TContextData;
}

interface InboxPage<TData = unknown> {
  items: InboxNotification<TData>[];
  nextCursor: string | null;
}
```

`InboxAdapter<TData, TContextData>` has four required methods and one optional
transport hook:

| Method             | Receives                              | Resolves to                     | Rules                                                                                       |
| ------------------ | ------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------- |
| `getNotifications` | `{ context, filter, cursor, signal }` | `InboxPage<TData>`              | Newest first, deterministic ties, a non-repeating opaque cursor or `null`; honour `signal`. |
| `getUnreadCount`   | `{ context, signal }`                 | `{ unreadCount: number }`       | The whole context, independent of filter and loaded pages.                                  |
| `setReadStatus`    | `{ context, id, read }`               | `{ notification, unreadCount }` | Desired state, not a toggle; idempotent; unknown id is `NOT_FOUND`.                         |
| `markAllRead`      | `{ context }`                         | `{ boundary, unreadCount }`     | Applies to every row existing at the server boundary; later rows stay unread.               |
| `subscribe?`       | `{ context, onInvalidate }`           | `() => void`                    | Optional transport invalidation. Events carry no delta.                                     |

`context.key` identifies the user/workspace and the scope of the counter. A
backend is responsible for authentication, recipients, tenancy, ordering,
cursors, mutations and the counter; the adapter is the only integration point.

## Controller

```ts
const controller = createInboxController({
  adapter,
  context: { key: 'user-1' },
  filter: 'all',
  config: { locale: 'en', timeZone: 'UTC' },
  clock: { now: () => Date.now() },
  initialData, // optional server seed
  callbacks: { onNotificationClick, onError },
});
controller.start();
```

Creating a controller performs no request, subscription or timer. `start()` and
`stop()` are idempotent; `stop()` cancels loads and the subscription, but a
mutation already sent is left to settle.

`getSnapshot()` returns a stable `{ revision, state, view }` until the model,
configuration or displayed minute changes. `subscribe(listener)` returns its own
unsubscribe. `refreshTime()` announces that the clock moved.

| Action                | Effect                                                                       |
| --------------------- | ---------------------------------------------------------------------------- |
| `setFilter(filter)`   | Changes the list filter; the counter is untouched.                           |
| `refresh()`           | Reloads the first page and the counter together.                             |
| `retry()`             | Repeats only loads that are in the `error` state.                            |
| `loadMore()`          | Appends the next page when a cursor exists and no page is loading.           |
| `setRead(id, read)`   | Sets a desired read state; individual mutations are serialised.              |
| `markAllRead()`       | Server-wide bulk; runs alone, refused while individual mutations are queued. |
| `showUpdates()`       | Applies a pending invalidation (first page + counter).                       |
| `reconcile()`         | Reads the server after unknown outcomes without resending them.              |
| `setContext(context)` | Replaces the scope; in-flight work of the old one is abandoned.              |
| `setAdapter(adapter)` | Replaces the data source; the same abandonment rules apply.                  |

Callbacks are invoked after the snapshot already holds the result. An exception
inside a callback is contained and never retries a request.

## React provider

```tsx
<InboxProvider adapter={adapter} context={{ key: 'user-1' }} theme="dark">
  <Inbox />
  <Inbox layout="feed" />
</InboxProvider>
```

| Prop                                          | Type                                   | Default              | Notes                                                                                      |
| --------------------------------------------- | -------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------ |
| `adapter`                                     | `InboxAdapter<TData, TContextData>`    | required             | A new instance is treated as a new source.                                                 |
| `context`                                     | `InboxContext<TContextData>`           | `{ key: 'default' }` | A new `key` resets and reloads; new `data` under the same key only affects later requests. |
| `config`                                      | `InboxConfigInput`                     | `en` / `UTC`         | `locale`, `timeZone`, per-key `messages`; omitted fields are detected after mount.         |
| `clock`                                       | `InboxClock`                           | system clock         | Fixed at controller creation.                                                              |
| `initialData`                                 | `InboxInitialData<TData>`              | —                    | Server seed, read only at creation; `start()` still confirms it.                           |
| `theme`                                       | `'dark' \| 'light'`                    | `'dark'`             | Explicit; the system preference never changes an explicit choice.                          |
| `className`                                   | `string`                               | —                    | Whole-widget class; reaches the bell trigger wrapper and the portalled panel.              |
| `classNames`                                  | `Partial<Record<IlClassSlot, string>>` | —                    | Per-slot classes, added after the stable `il-*` class.                                     |
| `components`                                  | `InboxComponents<TData>`               | built-ins            | Replace individual parts; absent parts keep their defaults.                                |
| `animations`                                  | `AnimationKit`                         | `cssAnimations`      | Pass `motionAnimations` from `/motion` or a custom kit.                                    |
| `filter` / `defaultFilter` / `onFilterChange` | controlled pair                        | `'all'`              | Mode fixed at creation; controlled mode waits for the prop.                                |
| `open` / `defaultOpen` / `onOpenChange`       | controlled pair                        | `false`              | One `open` value per provider, so two bells need two providers.                            |
| `onNotificationClick`                         | `(notification) => void`               | —                    | Application navigation; the library never opens a URL itself.                              |
| `markReadOnOpen`                              | `boolean`                              | `true`               | Activation asks to mark an unread row read, without delaying the callback.                 |
| `onError`                                     | `(error: InboxError) => void`          | —                    | Called after the failure is already in the snapshot.                                       |
| `children`                                    | `ReactNode`                            | —                    | The bell, feed, headless views or any combination.                                         |

`<Inbox layout="popover" />` (default) is the bell and its non-modal dialog;
`<Inbox layout="feed" />` is the standalone card. Both are the same surface over
one controller.

### Hooks

| Hook                                  | Returns                                                                                                                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useInboxFlow<TData, TContextData>()` | `{ snapshot, actions }` from the nearest provider.                                                                                                                                             |
| `useInboxUI<TData>()`                 | `theme`, resolved `locale`/`messages`, `className`/`classNames`/`components`/`animations`, applied `filter`, `filter`/`open` setters, `markReadOnOpen` and the prepared `onNotificationClick`. |

Using either hook outside a provider throws.

## Replaceable parts

`InboxComponents<TData>` has nine optional entries. Each receives prepared
`SlotProps`; a replacement must spread them to keep handlers, refs, classes and
`aria-*`.

| Part               | Receives                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `Trigger`          | `open`, `unreadCount`, `label`, `slotProps` (dialog contract, ref, click).                                            |
| `Header`           | `title`, `headingProps` (id), `slotProps`, rendered `filters`, `close`.                                               |
| `Filters`          | `label`, `options` (`aria-pressed`, click, ref), `slotProps`.                                                         |
| `NotificationItem` | `item`, `messages`, `index`, `exiting`, `activatable`, `slotProps`, `activateProps`, `readProps`, `avatar`, `status`. |
| `Avatar`           | `item`, `kind` (`avatar` / `icon` / `none`), `slotProps`.                                                             |
| `Loading`          | `label`, `slotProps` (status role).                                                                                   |
| `Empty`            | `label`, `slotProps`.                                                                                                 |
| `Error`            | `message`, `retryLabel`, `onRetry`, `slotProps` (alert role).                                                         |
| `PageError`        | Same shape as `Error`, for a failed next page.                                                                        |

Every default part is exported (`DefaultTrigger`, `DefaultHeader`, …), so a
replacement can wrap one instead of re-implementing it.

## Classes and DOM state

Base classes come from `IL_CLASS`; `classNames` adds to them and never replaces
them. The keys are:

`root`, `bell`, `trigger`, `badge`, `panel`, `panelClose`, `header`, `heading`,
`filters`, `filter`, `actions`, `markAllRead`, `status`, `updates`, `list`,
`group`, `groupLabel`, `item`, `itemAvatar`, `itemIcon`, `itemContent`,
`itemTitle`, `itemBody`, `itemMeta`, `itemTime`, `itemActivate`, `itemAction`,
`itemUnreadMarker`, `empty`, `loading`, `error`, `pageError`, `loadMore`, `live`.

State is exposed as data attributes, not modifier classes:

| Attribute                                                           | On         | Meaning                                                 |
| ------------------------------------------------------------------- | ---------- | ------------------------------------------------------- |
| `data-il-unread="true"`                                             | row        | Effective unread state; the accessible name repeats it. |
| `data-il-pending="true"`                                            | row        | A read mutation is queued or in flight.                 |
| `data-il-unknown="true"`                                            | row        | The mutation answer was lost; it is being reconciled.   |
| `data-il-error="true"`                                              | row        | The last read change was refused.                       |
| `data-il-kind`                                                      | status     | `pending` / `unknown` / `error`.                        |
| `data-il-status`                                                    | list/page  | `idle` / `loading` / `ready` / `error`.                 |
| `data-il-empty="true"`                                              | list       | Loaded and empty under the current filter.              |
| `data-il-layout`, `data-il-theme`, `data-il-filter`, `data-il-side` | root/panel | Widget-level presentation.                              |

## CSS tokens

Tokens are defined on `.il-root`/`.il-bell` and overridden under
`[data-il-theme='light']`. A consumer can set them on its own scope; the full
palette and measured values are in [`visual-reference.md`](./visual-reference.md).

| Group          | Tokens                                                                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Geometry       | `--il-radius-card` (28px), `--il-radius-panel` (22px), `--il-radius-control` (14px), `--il-radius-pill` (999px), `--il-radius-avatar`, `--il-radius-icon`                                           |
| Size           | `--il-width-panel` (400px), `--il-width-feed` (800px), `--il-width-current`, `--il-padding`, `--il-block-gap`, `--il-row-gap`, `--il-avatar-size`, `--il-row-max-height`, `--il-list-max-height`    |
| Type           | `--il-font-family`, `--il-font-size` (14px)                                                                                                                                                         |
| Motion         | `--il-ease-soft`, `--il-ease-standard`, `--il-duration-fast` (140ms), `--il-duration` (240ms), `--il-duration-slow` (420ms), `--il-stagger-step`, `--il-index`, `--il-exit-duration`                |
| Dark surfaces  | `--il-surface` (`#141419`), `--il-surface-raised`, `--il-panel`, `--il-control`, `--il-control-hover`, `--il-row-hover`, `--il-row-press`, `--il-unread-surface`, `--il-unread-surface-hover`       |
| Text and lines | `--il-text`, `--il-text-muted`, `--il-text-subtle`, `--il-ink`, `--il-ink-contrast`, `--il-border`, `--il-border-strong`, `--il-focus-ring`                                                         |
| Accent         | `--il-accent` (`#ff215a`), `--il-accent-hover`, `--il-accent-press`, `--il-accent-contrast`, `--il-badge-ink`, `--il-accent-ink`, `--il-accent-soft`, `--il-accent-soft-strong`, `--il-accent-glow` |
| Feedback       | `--il-danger`, `--il-danger-contrast`, `--il-danger-ink`, `--il-danger-soft`, `--il-warning`, `--il-warning-ink`, `--il-warning-soft`, `--il-skeleton-base`, `--il-skeleton-shine`                  |
| Shadow         | `--il-shadow-card`, `--il-shadow-panel`                                                                                                                                                             |

## Message keys

`InboxMessages` is plain text with `{placeholder}` markers. Every key can be
overridden through `config.messages`; an override replaces the whole plural group
for `countLabel`, `relativeMinute` and `relativeHour`.

`listLabel`, `closeLabel`, `countLabel`, `countUnknownLabel`, `emptyLabel`,
`emptyUnreadLabel`, `loadingLabel`, `listErrorLabel`, `pageErrorLabel`,
`countErrorLabel`, `retryLabel`, `loadMoreLabel`, `filtersLabel`,
`filterAllLabel`, `filterUnreadLabel`, `showUpdatesLabel`, `markAllReadLabel`,
`markReadLabel`, `markUnreadLabel`, `readPendingLabel`, `readUnknownLabel`,
`readErrorLabel`, `bulkPendingLabel`, `bulkUnknownLabel`, `bulkErrorLabel`,
`todayLabel`, `yesterdayLabel`, `unreadMarkerLabel`, `timeNow`,
`relativeMinute`, `relativeHour`.

## Support

| Area           | Supported                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| React          | 18.2–18.x and 19.x, verified from packed tarballs.                                                              |
| Module formats | ESM and CJS, `exports` with types, CSS as a separate subpath.                                                   |
| SSR            | `renderToString` + hydration; deterministic `en`/`UTC` before client detection.                                 |
| Browsers       | Chromium, Firefox and WebKit checked with Playwright; WebKit is the Playwright build, not the Safari app.       |
| Motion         | Optional peer, isolated in `/motion`; the default entry never imports it.                                       |
| Locales        | Built-in `en` and `ru`; other tags format dates via `Intl` and use English copy unless messages are overridden. |

Known limits: the library is a UI and state layer, not a notification server;
it owns no transport, persistence, authentication or recipient model. The panel
is not modal and does not trap focus. Browser zoom is verified by a CSS-viewport
emulation, not the browser zoom UI. The feed and bell are designed for 320 px and
wider.
