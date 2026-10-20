/**
 * The page both entries render.
 *
 * It owns the provider and the ready-made feed. Everything that makes SSR work —
 * the adapter, the fixed clock and the serialisable seed — is passed in from the
 * entry point, so the component itself is the same on the server and in the
 * browser.
 */
import { useMemo } from 'react';
import type { JSX } from 'react';
import type { InboxInitialData } from '@nickkupriyanov/inboxline-react';
import { Inbox, InboxProvider } from '@nickkupriyanov/inboxline-react';
import { DEMO_CONTEXT, DEMO_NOW, createDemoAdapter } from './fixtures';

export interface AppProps {
  /** The first page, counter and time anchor produced by the server. */
  initialData?: InboxInitialData;
}

export function App({ initialData }: AppProps): JSX.Element {
  // One adapter per mounted page: a new instance on every render would look like
  // a replaced source and make the provider reload.
  const adapter = useMemo(createDemoAdapter, []);
  const clock = useMemo(() => ({ now: () => DEMO_NOW }), []);

  return (
    <main className="ssr-example">
      <header className="ssr-example__header">
        <p className="ssr-example__eyebrow">Inboxline · SSR</p>
        <h1 className="ssr-example__title">Server-rendered notifications</h1>
        <p className="ssr-example__lead">
          The markup below arrives from the server with real rows and a counter. The client hydrates
          it with the same seed, then confirms the data through the adapter.
        </p>
      </header>

      <InboxProvider
        adapter={adapter}
        context={DEMO_CONTEXT}
        clock={clock}
        initialData={initialData}
      >
        <Inbox layout="feed" />
      </InboxProvider>
    </main>
  );
}
