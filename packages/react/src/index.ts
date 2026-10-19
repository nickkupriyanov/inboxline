/**
 * @nickkupriyanov/inboxline-react — the React binding of Inboxline.
 *
 * The provider owns one core controller and exposes it through
 * `useSyncExternalStore`; the hooks below are the whole headless surface. The
 * ready-made bell and feed layouts arrive in the following iterations and use
 * exactly these values, so a custom UI is never a second-class consumer.
 *
 * ```tsx
 * import { InboxProvider, useInboxFlow, useInboxUI } from '@nickkupriyanov/inboxline-react';
 * ```
 *
 * The stylesheet is published next to this entry as
 * `@nickkupriyanov/inboxline-react/styles.css`.
 */

export { Inbox } from './Inbox';
export { InboxProvider } from './provider';
export { useInboxFlow, useInboxUI } from './context';
export type { InboxFlow, InboxProviderProps, InboxTheme, InboxUI } from './types';
export type * from '@nickkupriyanov/inboxline-core';
