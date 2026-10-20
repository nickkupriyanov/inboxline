/**
 * The client entry.
 *
 * It hydrates the server markup with exactly the seed the server used. React
 * compares the first client render with the HTML, so the seed has to be
 * identical on both sides; after hydration the controller starts its own
 * request and the adapter confirms what the page already shows.
 */
import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import '@nickkupriyanov/inboxline-react/styles.css';
import type { InboxInitialData } from '@nickkupriyanov/inboxline-react';
import { App } from './App';
import './app.css';

declare global {
  interface Window {
    __INBOX_PRELOAD__?: InboxInitialData;
  }
}

const container = document.getElementById('root');
if (container === null) throw new Error('Inboxline SSR example: #root is missing');

hydrateRoot(
  container,
  <StrictMode>
    <App initialData={window.__INBOX_PRELOAD__} />
  </StrictMode>,
);
