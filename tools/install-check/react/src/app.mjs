import { createElement } from 'react';
import { Inbox, InboxProvider } from '@nickkupriyanov/inboxline-react';
import { CONTEXT, FIXED_NOW, createAdapter, createSeed } from './fixtures.mjs';

/**
 * The one element tree both the server and the client use.
 *
 * Hydration needs the exact same tree and seed on both sides; keeping the
 * element factory in one module is what makes this a real hydration check rather
 * than two similar renders.
 */
export function createApp() {
  return createElement(
    InboxProvider,
    {
      adapter: createAdapter(),
      context: CONTEXT,
      clock: { now: () => FIXED_NOW },
      config: { locale: 'en', timeZone: 'UTC' },
      initialData: createSeed(),
    },
    createElement(Inbox, { layout: 'feed' }),
  );
}
