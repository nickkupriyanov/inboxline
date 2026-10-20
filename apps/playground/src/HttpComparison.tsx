/**
 * The same feed over the built-in mock and over the teaching HTTP server.
 *
 * The HTTP half is `createInboxHttpAdapter` from `tools/dev-server/adapter.ts`:
 * the server speaks `rows`/`cursor`/`count`/`headline`, and the adapter is the
 * only place that turns it into the core contract. The core, the React binding
 * and the UI do not know which adapter they received.
 *
 * Start the server with `pnpm dev-server` (or both with `pnpm demo:http`). The
 * mock column keeps working without it; the HTTP column shows its error and can
 * be retried.
 */
import { useMemo, useState } from 'react';
import { createMockAdapter } from '@nickkupriyanov/inboxline-core';
import type { InboxNotification } from '@nickkupriyanov/inboxline-core';
import {
  Inbox,
  InboxProvider,
  useInboxFlow,
  type InboxTheme,
} from '@nickkupriyanov/inboxline-react';
import { createInboxHttpAdapter } from '@inboxline/example-server';
import type { InboxHttpScenario } from '@inboxline/example-server';

export const EXAMPLE_SERVER_URL = 'http://127.0.0.1:8787';

const HTTP_CONTEXT = { key: 'demo-a' };

const SCENARIOS: readonly { value: InboxHttpScenario; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'load-refused', label: 'First page refused' },
  { value: 'page-refused', label: 'Next page refused' },
  { value: 'count-refused', label: 'Counter refused' },
  { value: 'read-refused', label: 'Read refused' },
  { value: 'read-lost', label: 'Read answer lost' },
  { value: 'bulk-refused', label: 'Mark all refused' },
  { value: 'bulk-lost', label: 'Mark-all answer lost' },
];

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function mockNotification(
  id: string,
  title: string,
  minutes: number,
  read = false,
): InboxNotification {
  return {
    id: `mock-${id}`,
    title,
    body: 'The mock adapter returns the core contract directly.',
    createdAt: minutesAgo(minutes),
    read,
    author: { name: 'Mock adapter' },
  };
}

const MOCK_NOTIFICATIONS: readonly InboxNotification[] = [
  mockNotification('1', 'Deploy finished', 4),
  mockNotification('2', 'New comment on “HTTP contract”', 18),
  mockNotification('3', 'Access request approved', 52, true),
  mockNotification('4', 'Weekly digest', 26 * 60, true),
  mockNotification('5', 'Backup finished', 2 * 24 * 60, true),
  mockNotification('6', 'Older mock event', 3 * 24 * 60),
];

function readScenario(): InboxHttpScenario {
  const value = new URLSearchParams(window.location.search).get('scenario');
  return SCENARIOS.some((scenario) => scenario.value === value)
    ? (value as InboxHttpScenario)
    : 'normal';
}

/** The HTTP provider's own controls: refresh, reconcile and another client's event. */
function HttpToolbar() {
  const { snapshot, actions } = useInboxFlow();
  const view = snapshot.view;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function addRemoteEvent(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(
        `${EXAMPLE_SERVER_URL}/api/demo/notifications?workspace=${encodeURIComponent(HTTP_CONTEXT.key)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            notificationId: `ui-${Date.now()}`,
            headline: 'Event added over HTTP',
            message: 'Another client wrote this row; refresh or reconciling reads it.',
            occurredAt: new Date().toISOString(),
            isRead: false,
            payload: { project: 'http', kind: 'comment' },
          }),
        },
      );
      if (!response.ok) throw new Error(`The example server answered ${response.status}`);
      setMessage('The server stored the event; refreshing the feed.');
      await actions.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not reach the example server');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pg-http-controls">
      <div className="pg-row">
        <button type="button" onClick={() => void actions.refresh()}>
          Refresh HTTP
        </button>
        <button type="button" onClick={() => void actions.reconcile()}>
          Reconcile
        </button>
        <button type="button" disabled={busy} onClick={() => void addRemoteEvent()}>
          Add event over HTTP
        </button>
      </div>
      <p className="pg-meta" aria-live="polite">
        list: <code>{view.list.status}</code> · counter:{' '}
        <code>{view.counter.known ? view.counter.unreadCount : 'unknown'}</code> · page:{' '}
        <code>{view.page.status}</code> · bulk: <code>{view.actions.bulkStatus}</code>
        {message === null ? null : (
          <>
            {' · '}
            {message}
          </>
        )}
      </p>
    </div>
  );
}

export function HttpSection({ theme }: { theme: InboxTheme }) {
  const [scenario, setScenario] = useState<InboxHttpScenario>(readScenario);
  const [reconnect, setReconnect] = useState(0);

  const mockAdapter = useMemo(
    () =>
      createMockAdapter({
        clock: { now: () => Date.now() },
        pageSize: 3,
        contexts: [{ context: HTTP_CONTEXT, notifications: MOCK_NOTIFICATIONS }],
      }),
    [],
  );

  // A new adapter instance on every scenario or explicit reconnect: the provider
  // treats it as a replaced source, abandons the old requests and starts again.
  const httpAdapter = useMemo(
    () =>
      createInboxHttpAdapter({
        baseUrl: EXAMPLE_SERVER_URL,
        pageSize: 3,
        scenario,
      }),
    [scenario, reconnect],
  );

  return (
    <section className="pg-section">
      <h2>Mock and HTTP adapters</h2>
      <p className="pg-meta">
        The left feed uses the mock adapter, the right one talks to <code>tools/dev-server</code>{' '}
        over HTTP. The server returns a deliberately different payload — <code>rows</code>,{' '}
        <code>headline</code>, <code>isRead</code>, <code>occurredAt</code>, <code>count</code> —
        and the adapter translates it into the same contract. Nothing in core, the provider or the
        feed changes between the two columns.
      </p>
      <div className="pg-row pg-http-toolbar">
        <label className="pg-field">
          <span>HTTP scenario</span>
          <select
            value={scenario}
            onChange={(event) => setScenario(event.target.value as InboxHttpScenario)}
          >
            {SCENARIOS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => setReconnect((value) => value + 1)}>
          Reconnect HTTP source
        </button>
        <a className="pg-link" href="./gallery.html">
          State gallery →
        </a>
      </div>
      <p className="pg-meta">
        Start the server with <code>pnpm dev-server</code> (or both the server and this page with{' '}
        <code>pnpm demo:http</code>). Without it the HTTP column shows a classified load error and
        the rest of the playground still works. The example server is a teaching aid: it has no
        authentication, recipients or persistence.
      </p>

      <div className="pg-http-grid">
        <div className="pg-http-column">
          <h3>Mock adapter</h3>
          <InboxProvider adapter={mockAdapter} context={HTTP_CONTEXT} theme={theme}>
            <Inbox layout="feed" />
          </InboxProvider>
          <p className="pg-meta">
            Synchronous mock, no server. The counter is computed from the mock store.
          </p>
        </div>
        <div className="pg-http-column">
          <h3>
            HTTP adapter · <code>{scenario}</code>
          </h3>
          <InboxProvider
            adapter={httpAdapter}
            context={HTTP_CONTEXT}
            theme={theme}
            config={{ locale: 'en', timeZone: 'UTC' }}
          >
            <Inbox layout="feed" />
            <HttpToolbar />
          </InboxProvider>
        </div>
      </div>
    </section>
  );
}
