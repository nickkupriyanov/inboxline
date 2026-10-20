// @vitest-environment node
/**
 * The binding has to be importable on a server.
 *
 * This file runs in the Node environment, where neither `window` nor `document`
 * exists: importing the package and rendering it with `renderToString` proves
 * that no browser object is touched at module scope or during a server render.
 * A jsdom test cannot make that claim, because the globals exist there.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { InboxInitialData } from '@nickkupriyanov/inboxline-core';
import { Inbox, InboxProvider } from './index';
import {
  CONTEXT_A,
  FIXED_NOW,
  NOTIFICATIONS_A,
  createFixtureAdapter,
  testClock,
} from './test/fixtures';

const SEED: InboxInitialData = {
  page: { items: NOTIFICATIONS_A.slice(0, 2), nextCursor: null },
  unreadCount: 3,
  now: FIXED_NOW,
};

describe('importing on a server', () => {
  it('has no browser globals in the Node environment', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });

  it('renders the feed with a seed without a DOM', () => {
    const html = renderToString(
      <InboxProvider
        adapter={createFixtureAdapter()}
        context={CONTEXT_A}
        clock={testClock}
        config={{ locale: 'en', timeZone: 'UTC' }}
        initialData={SEED}
      >
        <Inbox layout="feed" />
      </InboxProvider>,
    );

    expect(html).toContain('il-root');
    expect(html).toContain('Fourth');
    expect(html).toContain('3 unread notifications');
  });

  it('renders the loading state instead of requesting without a seed', () => {
    const html = renderToString(
      <InboxProvider
        adapter={createFixtureAdapter()}
        context={CONTEXT_A}
        clock={testClock}
        config={{ locale: 'en', timeZone: 'UTC' }}
      >
        <Inbox layout="feed" />
      </InboxProvider>,
    );

    expect(html).toContain('Loading notifications');
    expect(html).not.toContain('Fourth');
  });
});
