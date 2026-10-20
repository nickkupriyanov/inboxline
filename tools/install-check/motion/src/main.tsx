/**
 * The optional `/motion` entry with its peer installed.
 *
 * The default consumer legs must build without `motion`; this leg proves the
 * separate entry builds when the peer is present. The bundle check looks for the
 * kit's `data-il-motion` marker, which only the Motion implementation renders.
 */
import { createRoot } from 'react-dom/client';
import { createMockAdapter } from '@nickkupriyanov/inboxline-core';
import { Inbox, InboxProvider } from '@nickkupriyanov/inboxline-react/motion';
import '@nickkupriyanov/inboxline-react/styles.css';

const now = Date.UTC(2026, 9, 21, 12, 0, 0);
const adapter = createMockAdapter({
  clock: { now: () => now },
  contexts: [
    {
      context: { key: 'motion-install-check' },
      notifications: [
        {
          id: 'motion-1',
          title: 'Motion install check',
          body: 'The spring kit rendered this row.',
          createdAt: new Date(now - 5 * 60_000).toISOString(),
          read: false,
        },
      ],
    },
  ],
});

const container = document.getElementById('root');
if (container === null) throw new Error('missing #root');

createRoot(container).render(
  <InboxProvider adapter={adapter} context={{ key: 'motion-install-check' }}>
    <Inbox layout="feed" />
  </InboxProvider>,
);
