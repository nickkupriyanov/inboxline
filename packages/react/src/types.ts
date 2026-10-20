/**
 * React-facing types of Inboxline.
 *
 * The framework-free half — the domain contract, the controller, the derived
 * view model and the copy — lives in `@nickkupriyanov/inboxline-core` and is
 * re-exported here, so a binding imports one package without a second copy of
 * the types.
 */
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import type {
  IlClassSlot,
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
import type { InboxComponents } from './parts';

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

/**
 * Per-slot class overrides, added alongside the library's own classes.
 *
 * The keys are the stable `IlClassSlot` names from the core; an omitted slot
 * keeps only its base class. `className` is the simpler whole-widget override.
 */
export type InboxClassNames = Partial<Record<IlClassSlot, string>>;

/* -------------------------------------------------------------------------- */
/*  Animation kit                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The animation primitives the ready-made widget renders through.
 *
 * The markup stays the library's — the two primitives are the only thing a kit
 * replaces, so the widget's DOM, accessibility contract and class hooks are the
 * same whichever kit is in use. The default kit is pure CSS and ships in the main
 * entry point; `@nickkupriyanov/inboxline-react/motion` swaps in spring-based
 * variants and is the only entry point that pulls `motion` in.
 *
 * A custom kit is expected to keep two promises:
 *
 * - render the same class hooks (`il-row-animated`, `il-height`/`il-height-inner`)
 *   and the `data-il-exiting`/`data-il-motion` attributes, so the stylesheet and
 *   the visual states keep working;
 * - keep `Item` the row element itself — an `<li>` inside the list of its day —
 *   and honour `exiting` by rendering the row without interactive controls.
 */
export interface AnimationKit {
  /** The row element of a notification list; the default part renders through it. */
  Item: (props: ItemProps) => ReactNode;
  /**
   * A container that follows the height of the content it holds. Measuring is
   * the binding's half; the kit only decides how the change is carried out.
   */
  Height: (props: HeightProps) => ReactNode;
}

/**
 * A notification row drawn by an animation kit.
 *
 * The prepared slot props of `NotificationItem` are spread on this element, so it
 * stays the `<li>` of the list rather than a wrapper around one.
 */
export interface ItemProps extends ComponentPropsWithoutRef<'li'> {
  /** Zero-based position in the rendered list; drives the entrance delay. */
  index: number;
  /**
   * The row is leaving the unread selection. It is already `aria-hidden` and out
   * of the tab order; a kit must not make it interactive again, only let it go.
   */
  exiting: boolean;
}

/** The measured container of a section whose content height changes. */
export interface HeightProps {
  className?: string;
  children: ReactNode;
}

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
   * Extra class on the outermost element of every composition.
   *
   * The bell's panel is portalled out of the trigger wrapper, so the class is
   * applied to both `.il-bell` and the panel's `.il-root`: a CSS theme declared
   * by that class reaches the trigger and the panel alike. In the feed it lands
   * on `.il-root`.
   */
  className?: string;
  /** Per-slot class overrides, added alongside the library's own classes. */
  classNames?: InboxClassNames;
  /**
   * Replace individual parts of every composition under this provider; anything
   * absent keeps its default. The parts are provider-level on purpose: the bell
   * and the feed share one surface, so one override applies to both and two
   * widgets under one provider cannot drift apart.
   */
  components?: InboxComponents<TData>;
  /**
   * Replace the built-in animation kit. Default: `cssAnimations`, the pure-CSS
   * kit from the main entry point. Pass `motionAnimations` from
   * `@nickkupriyanov/inboxline-react/motion` (or a kit of your own) to change how
   * rows and the measured sections move; behaviour and accessibility stay the
   * library's.
   */
  animations?: AnimationKit;

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
  /** Extra class applied to the outer root of each composition. */
  className?: string | undefined;
  /** Per-slot class overrides, added alongside the library's classes. */
  classNames?: InboxClassNames | undefined;
  /** Parts the application replaced; anything absent falls back to the default. */
  components?: InboxComponents<TData> | undefined;
  /** The animation kit the built-in parts render through. */
  animations: AnimationKit;
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
