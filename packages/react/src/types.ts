/**
 * React-facing types of Inboxline.
 *
 * The framework-free half — the domain contract, the controller, the derived
 * view model and the copy — lives in `@nickkupriyanov/inboxline-core` and is
 * re-exported here, so a binding imports one package without a second copy of
 * the types.
 */
import type { ReactNode } from 'react';
import type {
  InboxActions,
  InboxAdapter,
  InboxClock,
  InboxConfigInput,
  InboxContext,
  InboxError,
  InboxFilter,
  InboxMessages,
  InboxNotification,
  InboxSnapshot,
} from '@nickkupriyanov/inboxline-core';

export type * from '@nickkupriyanov/inboxline-core';

/* -------------------------------------------------------------------------- */
/*  Presentation                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The appearance of every part under one provider.
 *
 * Dark is the default. The system preference is deliberately not consulted: an
 * application that asked for a theme keeps it, and a server render and its
 * hydration therefore agree.
 */
export type InboxTheme = 'dark' | 'light';

/* -------------------------------------------------------------------------- */
/*  Provider props                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Everything `<InboxProvider>` accepts.
 *
 * The provider owns exactly one core controller. It is created on the first
 * render, started after mounting and stopped on unmount, so a Strict Mode double
 * mount never leaves a subscription or a request behind.
 *
 * `filter`/`defaultFilter` and `open`/`defaultOpen` are the two controlled UI
 * values. Passing the controlled member fixes that value's mode when the
 * provider is created; an update coming from the application is applied without
 * echoing a change event back. A mode change after creation is reported once in
 * development and ignored, while its last accepted value stays in effect.
 *
 * The notification list and the shared counter are *not* controllable props:
 * they are server data owned by the controller.
 *
 * @typeParam TData — Application data carried by every notification.
 * @typeParam TContextData — Application data carried by the context.
 */
export interface InboxProviderProps<TData = unknown, TContextData = unknown> {
  /** The notification source. Required — the inbox cannot know a list on its own. */
  adapter: InboxAdapter<TData, TContextData>;
  /** The user/workspace to read. Default: the implicit context (`'default'`). */
  context?: InboxContext<TContextData>;
  /** Presentation settings: locale, time zone and message overrides. */
  config?: InboxConfigInput;
  /** Time source for the derived view. Default: the system clock. */
  clock?: InboxClock;
  /** Colour theme of every part under the provider. Default: `'dark'`. */
  theme?: InboxTheme;

  /**
   * Controlled list filter. Fixes the filter's mode when the provider is
   * created; a later `undefined` does not make it uncontrolled.
   */
  filter?: InboxFilter;
  /** Uncontrolled initial filter. Ignored when `filter` is passed. Default: `'all'`. */
  defaultFilter?: InboxFilter;
  /** Called when the visitor asks for another filter, in either mode. */
  onFilterChange?(filter: InboxFilter): void;

  /**
   * Controlled open state of the bell panel. Fixes the value's mode when the
   * provider is created; a later `undefined` keeps the last accepted value.
   */
  open?: boolean;
  /** Uncontrolled initial open state. Ignored when `open` is passed. Default: `false`. */
  defaultOpen?: boolean;
  /** Called when the visitor asks to open or close the panel, in either mode. */
  onOpenChange?(open: boolean): void;

  /**
   * The visitor activated a notification. The prepared handler is handed to the
   * replaceable parts; the application navigates from here.
   */
  onNotificationClick?(notification: InboxNotification<TData>): void;
  /**
   * Whether activating an unread notification asks the controller to mark it
   * read. Default: `true`. The request does not delay the click callback.
   */
  markReadOnOpen?: boolean;
  /** A request failed in a way the application may want to surface. */
  onError?(error: InboxError): void;

  children?: ReactNode;
}

/* -------------------------------------------------------------------------- */
/*  What the provider hands down                                               */
/* -------------------------------------------------------------------------- */

/**
 * The headless flow: one immutable snapshot and the controller's actions.
 *
 * Every consumer under the same provider sees the same snapshot object, and a
 * second provider — even with the same adapter — has its own controller.
 *
 * @typeParam TData — Application data carried by every notification.
 * @typeParam TContextData — Application data carried by the context.
 */
export interface InboxFlow<TData = unknown, TContextData = unknown> {
  snapshot: InboxSnapshot<TData>;
  actions: InboxActions<TData, TContextData>;
}

/**
 * Presentation values and the controlled UI state shared by the built-in parts.
 *
 * `filter` is the filter the controller actually loaded, so a controlled prop
 * that the application has not accepted yet is not reported as applied. The
 * setters are stable: calling them asks for a change, and in controlled mode the
 * application decides whether to accept it.
 *
 * @typeParam TData — Application data carried by every notification.
 */
export interface InboxUI<TData = unknown> {
  theme: InboxTheme;
  /** The resolved locale, matching the one the derived view formatted with. */
  locale: string;
  /** The resolved copy, including the application's overrides. */
  messages: InboxMessages;
  /** The filter the loaded rows belong to. */
  filter: InboxFilter;
  /** Asks for another filter; in controlled mode this only calls `onFilterChange`. */
  setFilter(filter: InboxFilter): void;
  /** Whether the bell panel is open. */
  open: boolean;
  /** Asks to open or close the panel; in controlled mode this only calls `onOpenChange`. */
  setOpen(open: boolean): void;
  /** Whether activating an unread row also marks it read. */
  markReadOnOpen: boolean;
  /** The prepared activation handler for the replaceable notification part. */
  onNotificationClick?(notification: InboxNotification<TData>): void;
}
