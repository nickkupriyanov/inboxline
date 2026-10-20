/**
 * The two React contexts of the binding.
 *
 * `InboxFlowContext` is the framework-free half as React sees it: one snapshot
 * and the controller's actions. `InboxUIContext` holds presentation values and
 * the controlled UI state shared by the parts. Keeping them apart lets a future
 * headless consumer re-render on data without receiving a new presentation
 * object, and the built-in parts read both.
 */
import { createContext, useCallback, useContext, useMemo } from 'react';
import { IL_CLASS, cx } from '@nickkupriyanov/inboxline-core';
import type { ClassValue, IlClassSlot } from '@nickkupriyanov/inboxline-core';
import { cssAnimations } from './animations/css';
import { DEFAULT_INBOX_COMPONENTS } from './parts';
import type { InboxComponents } from './parts';
import type { AnimationKit, InboxFlow, InboxUI } from './types';

/** Internal: `null` until a provider supplies the flow. */
export const InboxFlowContext = createContext<InboxFlow<unknown, unknown> | null>(null);

/** Internal: `null` until a provider supplies the presentation values. */
export const InboxUIContext = createContext<InboxUI<unknown> | null>(null);

/**
 * Reads the notification flow from the nearest `<InboxProvider>`.
 *
 * This is the hook for a fully custom UI on top of the library:
 *
 * ```tsx
 * const { snapshot, actions } = useInboxFlow();
 * ```
 *
 * @typeParam TData — Application data carried by every notification.
 * @typeParam TContextData — Application data carried by the context.
 */
export function useInboxFlow<TData = unknown, TContextData = unknown>(): InboxFlow<
  TData,
  TContextData
> {
  const flow = useContext(InboxFlowContext);
  if (flow === null) {
    throw new Error('[inboxline] useInboxFlow() must be used inside <InboxProvider>.');
  }
  return flow as InboxFlow<TData, TContextData>;
}

/**
 * Reads the presentation values and the controlled UI state from the nearest
 * `<InboxProvider>`.
 *
 * ```tsx
 * const { theme, messages, filter, setFilter, open, setOpen } = useInboxUI();
 * ```
 *
 * @typeParam TData — Application data carried by every notification.
 */
export function useInboxUI<TData = unknown>(): InboxUI<TData> {
  const ui = useContext(InboxUIContext);
  if (ui === null) {
    throw new Error('[inboxline] useInboxUI() must be used inside <InboxProvider>.');
  }
  return ui as InboxUI<TData>;
}

/**
 * The parts the widget renders, with the defaults filled in.
 *
 * Internal to the built-in components: a replacement is per part and independent
 * of `classNames`, so a custom part keeps the library's classes unless it
 * chooses otherwise.
 *
 * @typeParam TData — Application data carried by every notification.
 */
export function useInboxComponents<TData = unknown>(): Required<InboxComponents<TData>> {
  const { components } = useInboxUI<TData>();
  return useMemo(
    () => ({ ...DEFAULT_INBOX_COMPONENTS, ...components }) as Required<InboxComponents<TData>>,
    [components],
  );
}

/**
 * The animation kit the built-in parts render through.
 *
 * Internal to the built-in components: an application swaps the kit through the
 * provider, never by re-implementing a row or a height container here.
 */
export function useAnimations(): AnimationKit {
  return useInboxUI().animations;
}

/**
 * Builds one element's class list: the stable slot class, the consumer's
 * per-slot override and any state class, in that order.
 *
 * ```tsx
 * const cls = useClassNames();
 * <span className={cls('itemTitle')} />
 * ```
 */
export function useClassNames(): (slot: IlClassSlot, ...extra: ClassValue[]) => string {
  const { classNames } = useInboxUI();
  return useCallback(
    (slot: IlClassSlot, ...extra: ClassValue[]) => cx(IL_CLASS[slot], classNames?.[slot], ...extra),
    [classNames],
  );
}
