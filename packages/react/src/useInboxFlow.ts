/**
 * The React lifecycle of one inbox controller.
 *
 * The binding owns nothing but the lifecycle and the two controlled UI values:
 * it creates one controller per provider, keeps it in step with the props and
 * subscribes with `useSyncExternalStore`. Everything the UI shows comes from the
 * controller's snapshot, so the React half never formats a counter, filters a
 * list or schedules a request on its own.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_FILTER,
  DEFAULT_INBOX_CONTEXT,
  createInboxController,
  isInboxFilter,
} from '@nickkupriyanov/inboxline-core';
import type { InboxContext, InboxController, InboxFilter, InboxProviderProps } from './types';

/* -------------------------------------------------------------------------- */
/*  Diagnostics                                                                */
/* -------------------------------------------------------------------------- */

/** Development warnings are silent in a production bundle. */
function isProduction(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  return env?.NODE_ENV === 'production';
}

/**
 * The mode of one UI value, fixed when the provider is created.
 *
 * A value that started uncontrolled stays uncontrolled even if a controlled
 * value appears later, and a controlled value that becomes `undefined` keeps the
 * last accepted value instead of quietly switching modes. Both cases are worth
 * one warning in development, because the application almost certainly made a
 * mistake.
 */
interface UiModes {
  filter: boolean;
  open: boolean;
}

function initialFilterOf<TData, TContextData>(
  props: InboxProviderProps<TData, TContextData>,
): InboxFilter {
  if (isInboxFilter(props.filter)) return props.filter;
  if (isInboxFilter(props.defaultFilter)) return props.defaultFilter;
  return DEFAULT_FILTER;
}

function initialOpenOf<TData, TContextData>(
  props: InboxProviderProps<TData, TContextData>,
): boolean {
  return props.open ?? props.defaultOpen ?? false;
}

/* -------------------------------------------------------------------------- */
/*  Hook                                                                       */
/* -------------------------------------------------------------------------- */

/** What the provider needs beyond the controller itself. */
export interface InboxControllerState<TData = unknown, TContextData = unknown> {
  controller: InboxController<TData, TContextData>;
  setFilter(filter: InboxFilter): void;
  open: boolean;
  setOpen(open: boolean): void;
}

/**
 * Creates the controller once and keeps it alive for as long as the provider is
 * mounted.
 *
 * Creating a core controller performs no request and no subscription, so doing
 * it during the first render is safe. The props-sync effect is declared before
 * the lifecycle effect, which means the first `start()` already sees the
 * adapter, context and configuration of that render.
 */
export function useInboxController<TData = unknown, TContextData = unknown>(
  props: InboxProviderProps<TData, TContextData>,
): InboxControllerState<TData, TContextData> {
  const propsRef = useRef(props);
  propsRef.current = props;

  const modesRef = useRef<UiModes | null>(null);
  if (modesRef.current === null) {
    modesRef.current = {
      filter: props.filter !== undefined,
      open: props.open !== undefined,
    };
  }
  const modes = modesRef.current;

  const initialFilter = initialFilterOf(props);
  const initialOpen = initialOpenOf(props);

  /** The last accepted controlled filter; a later `undefined` does not replace it. */
  const lastControlledFilterRef = useRef<InboxFilter>(initialFilter);
  if (modes.filter && isInboxFilter(props.filter)) lastControlledFilterRef.current = props.filter;

  /** The last accepted controlled open state, for the same reason. */
  const lastControlledOpenRef = useRef<boolean>(props.open ?? false);
  if (modes.open && props.open !== undefined) lastControlledOpenRef.current = props.open;

  /** The uncontrolled open state and its synchronous mirror for comparisons. */
  const [uncontrolledOpen, setUncontrolledOpen] = useState(initialOpen);
  const uncontrolledOpenRef = useRef(initialOpen);

  const warnedRef = useRef<Set<string>>(new Set());
  const warnOnce = useCallback((key: string, message: string) => {
    if (isProduction() || warnedRef.current.has(key)) return;
    warnedRef.current.add(key);
    console.warn(`[inboxline] ${message}`);
  }, []);

  const controllerRef = useRef<InboxController<TData, TContextData> | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createInboxController<TData, TContextData>({
      adapter: props.adapter,
      context: (props.context ?? DEFAULT_INBOX_CONTEXT) as InboxContext<TContextData>,
      filter: initialFilter,
      config: props.config,
      ...(props.clock === undefined ? {} : { clock: props.clock }),
      callbacks: {
        // Every callback reads the latest props, so re-rendering never leaves a
        // stale handler behind and no controller has to be recreated for it.
        onNotificationClick: (notification) => propsRef.current.onNotificationClick?.(notification),
        onError: (error) => propsRef.current.onError?.(error),
      },
    });
  }
  const controller = controllerRef.current;

  // Props are the source of truth on every render. The controller compares them
  // structurally, so re-supplying equal values costs nothing.
  useEffect(() => {
    const current = propsRef.current;
    controller.actions.setContext(
      (current.context ?? DEFAULT_INBOX_CONTEXT) as InboxContext<TContextData>,
    );
    controller.actions.setAdapter(current.adapter);
    controller.updateConfig(current.config ?? {});
  });

  // The UI values are fixed in mode; only the controlled ones have to be pushed
  // into the controller. The uncontrolled filter reaches it through `setFilter`.
  useEffect(() => {
    const current = propsRef.current;

    if (current.filter !== undefined && current.defaultFilter !== undefined) {
      warnOnce(
        'filter-both',
        '"filter" and "defaultFilter" were both passed. The controlled value wins; ' +
          'use one of them.',
      );
    }
    if (current.open !== undefined && current.defaultOpen !== undefined) {
      warnOnce(
        'open-both',
        '"open" and "defaultOpen" were both passed. The controlled value wins; ' +
          'use one of them.',
      );
    }

    if (modes.filter) {
      if (current.filter === undefined) {
        warnOnce(
          'filter-mode',
          '"filter" became undefined after the provider was created. The mode is fixed ' +
            'at creation, so the last accepted filter stays in effect.',
        );
      } else if (!isInboxFilter(current.filter)) {
        warnOnce(
          'filter-invalid',
          `"filter" received ${JSON.stringify(current.filter)}, which is not a known filter. ` +
            'The last accepted filter stays in effect.',
        );
      } else {
        lastControlledFilterRef.current = current.filter;
      }

      const desired = lastControlledFilterRef.current;
      if (controller.getSnapshot().state.filter !== desired) {
        controller.actions.setFilter(desired);
      }
    } else if (current.filter !== undefined) {
      warnOnce(
        'filter-mode',
        '"filter" appeared after the provider was created. The mode is fixed at creation, ' +
          'so the value is ignored: pass the controlled filter from the first render or ' +
          'use "defaultFilter".',
      );
    }

    if (modes.open) {
      if (current.open === undefined) {
        warnOnce(
          'open-mode',
          '"open" became undefined after the provider was created. The mode is fixed at ' +
            'creation, so the last accepted value stays in effect.',
        );
      } else {
        lastControlledOpenRef.current = current.open;
      }
    } else if (current.open !== undefined) {
      warnOnce(
        'open-mode',
        '"open" appeared after the provider was created. The mode is fixed at creation, so ' +
          'the value is ignored: pass the controlled value from the first render or use ' +
          '"defaultOpen".',
      );
    }
  });

  useEffect(() => {
    controller.start();
    return () => controller.stop();
  }, [controller]);

  const setFilter = useCallback(
    (next: InboxFilter) => {
      if (!isInboxFilter(next)) {
        warnOnce(
          'filter-invalid-request',
          `setFilter() received ${JSON.stringify(next)}, which is not a known filter.`,
        );
        return;
      }

      if (modes.filter) {
        // The application owns the value: ask it, and wait for the prop. No
        // echo when the value it wants is already the accepted one.
        if (next === lastControlledFilterRef.current) return;
        propsRef.current.onFilterChange?.(next);
        return;
      }

      if (next === controller.getSnapshot().state.filter) return;
      controller.actions.setFilter(next);
      propsRef.current.onFilterChange?.(next);
    },
    [controller, modes.filter, warnOnce],
  );

  const setOpen = useCallback(
    (next: boolean) => {
      if (typeof next !== 'boolean') return;

      if (modes.open) {
        if (next === lastControlledOpenRef.current) return;
        propsRef.current.onOpenChange?.(next);
        return;
      }

      if (next === uncontrolledOpenRef.current) return;
      uncontrolledOpenRef.current = next;
      setUncontrolledOpen(next);
      propsRef.current.onOpenChange?.(next);
    },
    [modes.open],
  );

  return {
    controller,
    setFilter,
    open: modes.open ? lastControlledOpenRef.current : uncontrolledOpen,
    setOpen,
  };
}
