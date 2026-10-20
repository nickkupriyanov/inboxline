/**
 * @nickkupriyanov/inboxline-react — the React binding of Inboxline.
 *
 * The provider owns one core controller and exposes it through
 * `useSyncExternalStore`; the hooks below are the whole headless surface. The
 * ready-made bell and feed layouts use exactly these values, so a custom UI is
 * never a second-class consumer.
 *
 * ```tsx
 * import { InboxProvider, Inbox, useInboxFlow, useInboxUI } from '@nickkupriyanov/inboxline-react';
 * ```
 *
 * The stylesheet is published next to this entry as
 * `@nickkupriyanov/inboxline-react/styles.css`. This entry uses the zero-cost CSS
 * animation kit; `@nickkupriyanov/inboxline-react/motion` swaps in springs and is
 * the only entry that imports `motion`.
 */

export { Inbox } from './Inbox';
export type { InboxProps } from './Inbox';
export { InboxProvider } from './provider';
export { useInboxFlow, useInboxUI } from './context';
export { cssAnimations } from './animations/css';
export {
  DEFAULT_INBOX_COMPONENTS,
  DefaultAvatar,
  DefaultEmpty,
  DefaultError,
  DefaultFilters,
  DefaultHeader,
  DefaultLoading,
  DefaultNotificationItem,
  DefaultPageError,
  DefaultTrigger,
} from './parts';
export type {
  AvatarPartProps,
  EmptyPartProps,
  ErrorPartProps,
  FilterOption,
  FiltersPartProps,
  HeaderPartProps,
  InboxComponents,
  LoadingPartProps,
  NotificationItemPartProps,
  PageErrorPartProps,
  PartComponent,
  SlotProps,
  TriggerPartProps,
} from './parts';
export type {
  AnimationKit,
  HeightProps,
  InboxClassNames,
  InboxFlow,
  InboxProviderProps,
  InboxTheme,
  InboxUI,
  ItemProps,
} from './types';
export type * from '@nickkupriyanov/inboxline-core';
