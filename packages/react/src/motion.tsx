/**
 * `@nickkupriyanov/inboxline-react/motion` — the same widget, spring animations.
 *
 * `motion` is the only extra dependency and it is optional: the main entry point
 * (`@nickkupriyanov/inboxline-react`) never imports this module, so an
 * application that does not opt in never ships it.
 *
 * The provider from this entry defaults to `motionAnimations`; passing an
 * explicit `animations` prop still wins. The rest of the API is the same.
 *
 * ```tsx
 * import { Inbox, InboxProvider } from '@nickkupriyanov/inboxline-react/motion';
 * import '@nickkupriyanov/inboxline-react/styles.css';
 *
 * <InboxProvider adapter={adapter}>
 *   <Inbox />
 * </InboxProvider>;
 * ```
 */
import type { JSX } from 'react';
import { InboxProvider as BaseInboxProvider } from './provider';
import { motionAnimations } from './animations/motion';
import type { InboxProviderProps } from './types';

export * from './index';
export { motionAnimations };

/**
 * The provider bound to the Motion kit.
 *
 * It is the main provider with one default changed: the animation kit. Every
 * other prop, the controller lifecycle and the headless hooks stay identical.
 */
export function InboxProvider<TData = unknown, TContextData = unknown>(
  props: InboxProviderProps<TData, TContextData>,
): JSX.Element {
  return (
    <BaseInboxProvider {...props} animations={props.animations ?? motionAnimations}>
      {props.children}
    </BaseInboxProvider>
  );
}
