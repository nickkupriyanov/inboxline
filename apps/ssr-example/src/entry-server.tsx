/**
 * The server entry.
 *
 * It reads the data the page needs, builds the serialisable seed and renders the
 * same `<App>` the browser will hydrate. The seed contains only the first page,
 * the counter and the time anchor — no pending operation, callback or
 * credential — so it can be embedded in the response as JSON.
 */
import { renderToString } from 'react-dom/server';
import type { InboxInitialData } from '@nickkupriyanov/inboxline-react';
import { App } from './App';
import { DEMO_CONTEXT, DEMO_NOW, createDemoAdapter } from './fixtures';

export interface RenderResult {
  html: string;
  seed: InboxInitialData;
}

export async function render(): Promise<RenderResult> {
  const adapter = createDemoAdapter();
  const signal = new AbortController().signal;

  const [page, counter] = await Promise.all([
    adapter.getNotifications({ context: DEMO_CONTEXT, filter: 'all', cursor: null, signal }),
    adapter.getUnreadCount({ context: DEMO_CONTEXT, signal }),
  ]);

  const seed: InboxInitialData = {
    page,
    unreadCount: counter.unreadCount,
    now: DEMO_NOW,
  };

  return { html: renderToString(<App initialData={seed} />), seed };
}
