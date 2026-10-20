/**
 * The extension points of the ready-made widget.
 *
 * Every part receives the data it renders and the actions it triggers — nothing
 * else. The library keeps the behaviour that must not be re-implemented: the
 * controller lifecycle, the read queue, focus movement after a row leaves the
 * unread selection, the dialog and its placement, and the layout of the card.
 * A part receives values it cannot get wrong:
 *
 * - `slotProps` is spread on the element the part owns. It carries the stable
 *   `il-*` class with the consumer's `classNames` override merged in, the
 *   library's `data-il-*` state, the `role`/`aria-*` contract where applicable,
 *   and the handler or `ref` the library needs back.
 * - A part that is a button receives its own prepared bundle (`activateProps`,
 *   `readProps`, `filter.props`, `slotProps` on the trigger) so its accessible
 *   name, pressed state and click cannot drift from the flow.
 * - A part that sits inside a shell the library owns receives the shell's
 *   content already rendered (`children`, `filters`, `close`, `avatar`,
 *   `status`).
 *
 * Replacing a part is independent of `classNames`: the prepared props already
 * carry the slot class with the consumer's override, so a replaced part keeps
 * both its look and its accessibility contract.
 *
 * ```tsx
 * import {
 *   InboxProvider,
 *   DefaultNotificationItem,
 *   type NotificationItemPartProps,
 * } from '@nickkupriyanov/inboxline-react';
 *
 * // Wrap the default rather than rewriting it.
 * function LoudRow(props: NotificationItemPartProps<MyData>) {
 *   return (
 *     <div className="loud">
 *       <DefaultNotificationItem {...props} />
 *     </div>
 *   );
 * }
 *
 * <InboxProvider adapter={adapter} components={{ NotificationItem: LoudRow }}>
 *   <Inbox />
 * </InboxProvider>;
 * ```
 */
import type { ComponentPropsWithoutRef, ComponentPropsWithRef, ReactNode } from 'react';
import type { InboxFilter, InboxItemView, InboxMessages } from '@nickkupriyanov/inboxline-core';
import {
  Empty as DefaultEmpty,
  ErrorState as DefaultError,
  Loading as DefaultLoading,
  PageErrorState as DefaultPageError,
} from './components/blocks';
import { Filters as DefaultFilters } from './components/Filters';
import { Header as DefaultHeader } from './components/Header';
import { NotificationAvatar as DefaultAvatar } from './components/NotificationAvatar';
import { NotificationItem as DefaultNotificationItem } from './components/NotificationItem';
import { Trigger as DefaultTrigger } from './components/Trigger';

/**
 * Props for an element whose behaviour and accessibility the library prepared.
 *
 * Spread them on your own element: they carry the class, the handler wiring,
 * the role, the `aria-*` contract, the tab order and the `ref` the library uses
 * to keep focus and placement working. The `data-*` allowance keeps the
 * library's DOM hooks (`data-il-unread`, `data-il-side`, …) on the element even
 * when the part that renders it was replaced.
 */
export type SlotProps<Props> = Props & { [key: `data-${string}`]: string | undefined };

/** A part is a component, or a function returning nodes — whatever fits the call site. */
export type PartComponent<Props> = (props: Props) => ReactNode;

/* -------------------------------------------------------------------------- */
/*  Trigger                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The bell trigger.
 *
 * The default renders a native button with the bell glyph and the badge. A
 * replacement owns the button and must spread `slotProps`: they carry the
 * accessible name, `aria-haspopup`/`aria-expanded`/`aria-controls`, the click
 * and the `ref` used for placement and for returning focus after Escape.
 * `children` is the default glyph and badge, already rendered; keep it or draw
 * your own, but keep the counter available to assistive technology exactly once
 * (the visible badge is `aria-hidden` and the name already contains the count).
 */
export interface TriggerPartProps {
  /** Whether the panel is open. Mirrors `slotProps['aria-expanded']`. */
  open: boolean;
  /** The server counter, or `null` while it is unknown. */
  unreadCount: number | null;
  /** The trigger's accessible name, already localised and including the counter. */
  label: string;
  /** Spread on your own button. */
  slotProps: SlotProps<ComponentPropsWithRef<'button'>>;
  /** The default glyph and badge. */
  children: ReactNode;
}

/* -------------------------------------------------------------------------- */
/*  Header and filters                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The card header.
 *
 * A replacement owns the header element and must render `headingProps` on the
 * heading: the popover is labelled by that heading id, so dropping it would leave
 * the dialog without a name. `filters` and `close` are already rendered through
 * their own parts; place them wherever the layout wants, or drop them.
 */
export interface HeaderPartProps {
  /** The card's accessible and visible title. */
  title: string;
  /** The id the dialog's `aria-labelledby` points at. */
  headingId: string;
  /** Spread on your own `<header>`. */
  slotProps: SlotProps<ComponentPropsWithoutRef<'header'>>;
  /** Spread on your own heading: the id, the class and its override. */
  headingProps: SlotProps<ComponentPropsWithoutRef<'h2'>>;
  /** The filter group, already rendered through the `Filters` part. */
  filters: ReactNode;
  /** The panel's close action in the popover; `null` in the feed. */
  close: ReactNode | null;
}

/**
 * One filter option prepared by the library.
 *
 * `props` carries the stable class, `aria-pressed`, the click that asks the
 * provider for this filter and the `ref` used when focus falls back to the
 * active filter after the unread selection empties.
 */
export interface FilterOption {
  value: InboxFilter;
  label: string;
  selected: boolean;
  props: SlotProps<ComponentPropsWithRef<'button'>>;
}

/**
 * The filter group.
 *
 * A replacement owns the container and spreads `slotProps` on it — the group
 * role, its accessible name and its class live there. Each option must be a
 * native button that spreads its prepared `props`; the filter is decided by the
 * provider, so a part never stores the selection itself.
 */
export interface FiltersPartProps {
  /** The group's accessible name. */
  label: string;
  options: readonly FilterOption[];
  /** Spread on your own container. */
  slotProps: SlotProps<ComponentPropsWithoutRef<'div'>>;
}

/* -------------------------------------------------------------------------- */
/*  Rows                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The leading tile of a row.
 *
 * `kind` says what the library would draw: `avatar` when the notification has an
 * author (an image, or initials when the image is missing or broken), `icon` for
 * the notification's own icon (the bell glyph when it is broken), and `none`
 * when the row has neither. The default returns `null` for `none`; a replacement
 * may draw its own fallback instead. The tile is decorative because the author
 * and the title are already in the row text, which is why `slotProps` is
 * `aria-hidden`.
 */
export interface AvatarPartProps<TData = unknown> {
  item: InboxItemView<TData>;
  kind: 'avatar' | 'icon' | 'none';
  /** Spread on your own tile. Carries `aria-hidden`, the slot class and its override. */
  slotProps: SlotProps<ComponentPropsWithoutRef<'span'>>;
}

/**
 * One notification row.
 *
 * The row is a native list item holding two sibling buttons and no third one:
 * the activation button (`activateProps`) and the read/unread action
 * (`readProps`). They must never be nested inside each other; the default row
 * renders the activation content in a button when `activatable` is true and as
 * plain content otherwise, and always renders the action button.
 *
 * `slotProps` carries the row class, the `data-il-unread`/`pending`/`unknown`/
 * `error` states and the consumer's class override. `activateProps` and
 * `readProps` carry their click, `aria-busy`, the read action's accessible name
 * (`Mark as read: {title}` / `Mark as unread: {title}`), the disabled mirror and
 * the `ref`s the surface uses to move focus when the row leaves the unread
 * filter. `status` is the already localised text line for a pending or lost
 * operation, with its own `role`; `avatar` is the tile already rendered through
 * the `Avatar` part. Both may be placed anywhere or dropped.
 *
 * A row is keyed by `item.id`, so a replacement may keep its own state for the
 * row as long as it does not try to derive the read status itself: `item.read`,
 * `item.unread`, `item.pending` and `item.unknown` are the flow's values.
 *
 * @typeParam TData — Application data carried by every notification.
 */
export interface NotificationItemPartProps<TData = unknown> {
  item: InboxItemView<TData>;
  messages: InboxMessages;
  /** Zero-based position in the rendered list; drives the entrance delay. */
  index: number;
  /**
   * The row is leaving the unread selection and is only still mounted for its
   * exit. It is already `aria-hidden` and out of the tab order; render it without
   * interactive controls and do not activate it.
   */
  exiting: boolean;
  /** Whether the row should render `activateProps` on a button. */
  activatable: boolean;
  /** Spread on your own `<li>`. */
  slotProps: SlotProps<ComponentPropsWithoutRef<'li'>>;
  /** Spread on your own activation button when `activatable` is true. */
  activateProps: SlotProps<ComponentPropsWithRef<'button'>>;
  /** Spread on your own read/unread button. */
  readProps: SlotProps<ComponentPropsWithRef<'button'>>;
  /** The prepared tile, already rendered through the `Avatar` part. */
  avatar: ReactNode;
  /** The prepared status line for a pending, lost or refused operation. */
  status: ReactNode;
}

/* -------------------------------------------------------------------------- */
/*  States                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The first page is loading.
 *
 * The default draws three skeleton rows and a visually hidden status label. A
 * replacement receives the localised `label` for its own live text.
 */
export interface LoadingPartProps {
  label: string;
  /** Spread on your own container: `role="status"` and the slot class live here. */
  slotProps: SlotProps<ComponentPropsWithoutRef<'div'>>;
}

/** The loaded list is empty under the current filter. */
export interface EmptyPartProps {
  label: string;
  /** Spread on your own element: the slot class lives here. */
  slotProps: SlotProps<ComponentPropsWithoutRef<'p'>>;
}

/**
 * A list or page load failed.
 *
 * `onRetry` repeats only the failed load through the controller; a replacement
 * must keep it on a native button so the retry stays keyboard-operable.
 */
export interface ErrorPartProps {
  message: string;
  retryLabel: string;
  onRetry(): void;
  /** Spread on your own container: `role="alert"` and the slot class live here. */
  slotProps: SlotProps<ComponentPropsWithoutRef<'div'>>;
}

/** The next page failed while the loaded rows stay on screen. */
export type PageErrorPartProps = ErrorPartProps;

/* -------------------------------------------------------------------------- */
/*  The map                                                                    */
/* -------------------------------------------------------------------------- */

/** Every part an application may replace; anything absent keeps its default. */
export interface InboxComponents<TData = unknown> {
  Trigger?: PartComponent<TriggerPartProps>;
  Header?: PartComponent<HeaderPartProps>;
  Filters?: PartComponent<FiltersPartProps>;
  NotificationItem?: PartComponent<NotificationItemPartProps<TData>>;
  Avatar?: PartComponent<AvatarPartProps<TData>>;
  Loading?: PartComponent<LoadingPartProps>;
  Empty?: PartComponent<EmptyPartProps>;
  Error?: PartComponent<ErrorPartProps>;
  PageError?: PartComponent<PageErrorPartProps>;
}

/* Every default, so an application can wrap rather than re-implement. */

export {
  DefaultAvatar,
  DefaultEmpty,
  DefaultError,
  DefaultFilters,
  DefaultHeader,
  DefaultLoading,
  DefaultNotificationItem,
  DefaultPageError,
  DefaultTrigger,
};

/** What the widget renders when the application replaces nothing. */
export const DEFAULT_INBOX_COMPONENTS: Required<InboxComponents> = {
  Trigger: DefaultTrigger,
  Header: DefaultHeader,
  Filters: DefaultFilters,
  NotificationItem: DefaultNotificationItem,
  Avatar: DefaultAvatar,
  Loading: DefaultLoading,
  Empty: DefaultEmpty,
  Error: DefaultError,
  PageError: DefaultPageError,
};
