/**
 * The provider that owns one inbox controller.
 *
 * It is the only place where the React lifecycle meets the framework-free core:
 * one controller is created, kept in step with the props, started after mounting
 * and stopped on unmount. Everything below it — the ready-made widget or a
 * custom headless UI — reads the same snapshot and the same actions.
 */
import { useMemo, useSyncExternalStore } from 'react';
import type { JSX } from 'react';
import { resolveInboxConfig } from '@nickkupriyanov/inboxline-core';
import { cssAnimations } from './animations/css';
import { InboxFlowContext, InboxUIContext } from './context';
import type { InboxFlow, InboxProviderProps, InboxUI } from './types';
import { useInboxController } from './useInboxFlow';

/**
 * Provides one inbox flow and its presentation values to any UI.
 *
 * ```tsx
 * <InboxProvider adapter={adapter} config={{ locale: 'ru' }} theme="light">
 *   <MyCounter />
 *   <MyFeed />
 * </InboxProvider>
 * ```
 *
 * The same provider can serve the bell and the feed together, because both read
 * one controller and one server counter. Two providers are independent even
 * when they receive the same adapter.
 *
 * @typeParam TData — Application data carried by every notification.
 * @typeParam TContextData — Application data carried by the context.
 */
export function InboxProvider<TData = unknown, TContextData = unknown>(
  props: InboxProviderProps<TData, TContextData>,
): JSX.Element {
  const { children } = props;
  const theme = props.theme ?? 'dark';
  const markReadOnOpen = props.markReadOnOpen ?? true;
  const { controller, setFilter, open, setOpen } = useInboxController(props);

  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  const flow = useMemo<InboxFlow<TData, TContextData>>(
    () => ({ snapshot, actions: controller.actions }),
    [snapshot, controller],
  );

  // The provider resolves the same configuration the controller does, so the
  // copy a custom part receives cannot drift from the copy the derived view used.
  const config = useMemo(() => resolveInboxConfig(props.config), [props.config]);

  const ui = useMemo<InboxUI<TData>>(
    () => ({
      theme,
      locale: config.locale,
      messages: config.messages,
      animations: props.animations ?? cssAnimations,
      ...(props.className === undefined ? {} : { className: props.className }),
      ...(props.classNames === undefined ? {} : { classNames: props.classNames }),
      ...(props.components === undefined ? {} : { components: props.components }),
      filter: snapshot.state.filter,
      setFilter,
      open,
      setOpen,
      markReadOnOpen,
      ...(props.onNotificationClick === undefined
        ? {}
        : { onNotificationClick: props.onNotificationClick }),
    }),
    [
      theme,
      config,
      props.animations,
      props.className,
      props.classNames,
      props.components,
      snapshot.state.filter,
      setFilter,
      open,
      setOpen,
      markReadOnOpen,
      props.onNotificationClick,
    ],
  );

  return (
    <InboxFlowContext.Provider value={flow as InboxFlow<unknown, unknown>}>
      <InboxUIContext.Provider value={ui as InboxUI<unknown>}>{children}</InboxUIContext.Provider>
    </InboxFlowContext.Provider>
  );
}
