import { describe, expect, it } from 'vitest';
import {
  assertInboxMarkAllReadResult,
  assertInboxPage,
  assertInboxReadStatusResult,
  assertInboxUnreadCount,
  isInboxAuthor,
  isInboxMarkAllReadResult,
  isInboxNotification,
  isInboxPage,
  isInboxReadStatusResult,
  isInboxUnreadCount,
} from './adapter';
import { InboxError, createAbortError, isAbortError, isInboxError } from './errors';
import type { InboxNotification } from './types';

const notification: InboxNotification<{ orderId: number }> = {
  id: 'n-1',
  createdAt: '2026-10-18T12:00:00Z',
  title: 'Order 4210 shipped',
  body: 'It arrives on Tuesday.',
  author: { id: 'u-3', name: 'Warehouse', avatarUrl: 'https://cdn.example.com/u-3.png' },
  icon: 'https://cdn.example.com/box.svg',
  read: false,
  data: { orderId: 4210 },
};

describe('isInboxAuthor', () => {
  it('accepts a display name alone and a full author', () => {
    expect(isInboxAuthor({ name: 'Warehouse' })).toBe(true);
    expect(isInboxAuthor({ id: 'u-3', name: 'Warehouse', avatarUrl: 'https://x/y.png' })).toBe(
      true,
    );
  });

  it('rejects a missing or empty name, and an unusable id or avatar', () => {
    expect(isInboxAuthor({})).toBe(false);
    expect(isInboxAuthor({ name: '' })).toBe(false);
    expect(isInboxAuthor({ name: 3 })).toBe(false);
    expect(isInboxAuthor({ name: 'Warehouse', id: '' })).toBe(false);
    expect(isInboxAuthor({ name: 'Warehouse', avatarUrl: '' })).toBe(false);
    expect(isInboxAuthor(null)).toBe(false);
  });
});

describe('isInboxNotification', () => {
  it('accepts a minimal notification', () => {
    expect(
      isInboxNotification({
        id: 'n-1',
        createdAt: '2026-10-18T12:00:00Z',
        title: 'Hi',
        read: true,
      }),
    ).toBe(true);
  });

  it('accepts a full notification', () => {
    expect(isInboxNotification(notification)).toBe(true);
  });

  it('rejects a missing or empty id', () => {
    expect(
      isInboxNotification({ createdAt: '2026-10-18T12:00:00Z', title: 'Hi', read: false }),
    ).toBe(false);
    expect(
      isInboxNotification({ id: '', createdAt: '2026-10-18T12:00:00Z', title: 'Hi', read: false }),
    ).toBe(false);
    expect(
      isInboxNotification({ id: 1, createdAt: '2026-10-18T12:00:00Z', title: 'Hi', read: false }),
    ).toBe(false);
  });

  it('rejects an unusable timestamp', () => {
    expect(
      isInboxNotification({
        id: 'n-1',
        createdAt: '2026-10-18T12:00:00',
        title: 'Hi',
        read: false,
      }),
    ).toBe(false);
    expect(
      isInboxNotification({
        id: 'n-1',
        createdAt: '2026-02-31T00:00:00Z',
        title: 'Hi',
        read: false,
      }),
    ).toBe(false);
    expect(
      isInboxNotification({ id: 'n-1', createdAt: 1_792_324_800_000, title: 'Hi', read: false }),
    ).toBe(false);
  });

  it('rejects an unusable title and read state', () => {
    expect(
      isInboxNotification({ id: 'n-1', createdAt: '2026-10-18T12:00:00Z', title: '', read: false }),
    ).toBe(false);
    expect(isInboxNotification({ id: 'n-1', createdAt: '2026-10-18T12:00:00Z', title: 'Hi' })).toBe(
      false,
    );
    expect(
      isInboxNotification({
        id: 'n-1',
        createdAt: '2026-10-18T12:00:00Z',
        title: 'Hi',
        read: 'yes',
      }),
    ).toBe(false);
  });

  it('rejects an unusable optional body, icon or author', () => {
    const base = { id: 'n-1', createdAt: '2026-10-18T12:00:00Z', title: 'Hi', read: false };

    expect(isInboxNotification({ ...base, body: 3 })).toBe(false);
    expect(isInboxNotification({ ...base, icon: '' })).toBe(false);
    expect(isInboxNotification({ ...base, author: { name: '' } })).toBe(false);
  });

  it('leaves application data alone: it belongs to the consumer', () => {
    const base = { id: 'n-1', createdAt: '2026-10-18T12:00:00Z', title: 'Hi', read: false };

    expect(isInboxNotification({ ...base, data: { orderId: 4210 } })).toBe(true);
    expect(isInboxNotification({ ...base, data: 'anything' })).toBe(true);
    expect(isInboxNotification({ ...base, data: null })).toBe(true);
  });

  it('rejects non-objects', () => {
    expect(isInboxNotification(null)).toBe(false);
    expect(isInboxNotification([])).toBe(false);
    expect(isInboxNotification('n-1')).toBe(false);
  });
});

describe('isInboxPage', () => {
  it('accepts a page with a cursor and the last page', () => {
    expect(isInboxPage({ items: [notification], nextCursor: 'c-2' })).toBe(true);
    expect(isInboxPage({ items: [notification], nextCursor: null })).toBe(true);
    expect(isInboxPage({ items: [], nextCursor: null })).toBe(true);
  });

  it('rejects a payload without a usable cursor', () => {
    expect(isInboxPage({ items: [] })).toBe(false);
    expect(isInboxPage({ items: [], nextCursor: '' })).toBe(false);
    expect(isInboxPage({ items: [], nextCursor: 2 })).toBe(false);
  });

  it('rejects a payload whose items are not notifications', () => {
    expect(isInboxPage({ items: {}, nextCursor: null })).toBe(false);
    expect(isInboxPage({ items: [{ id: 'n-1' }], nextCursor: null })).toBe(false);
    expect(isInboxPage(null)).toBe(false);
  });
});

describe('isInboxUnreadCount', () => {
  it('accepts a non-negative integer, including zero', () => {
    expect(isInboxUnreadCount({ unreadCount: 0 })).toBe(true);
    expect(isInboxUnreadCount({ unreadCount: 27 })).toBe(true);
  });

  it('rejects a negative, fractional or missing counter', () => {
    expect(isInboxUnreadCount({ unreadCount: -1 })).toBe(false);
    expect(isInboxUnreadCount({ unreadCount: 1.5 })).toBe(false);
    expect(isInboxUnreadCount({ unreadCount: '27' })).toBe(false);
    expect(isInboxUnreadCount({})).toBe(false);
    expect(isInboxUnreadCount(27)).toBe(false);
  });
});

describe('isInboxReadStatusResult', () => {
  it('accepts a confirmed notification and the current counter', () => {
    expect(isInboxReadStatusResult({ notification, unreadCount: 26 })).toBe(true);
  });

  it('rejects a missing notification or an unusable counter', () => {
    expect(isInboxReadStatusResult({ unreadCount: 26 })).toBe(false);
    expect(isInboxReadStatusResult({ notification: { id: 'n-1' }, unreadCount: 26 })).toBe(false);
    expect(isInboxReadStatusResult({ notification, unreadCount: -1 })).toBe(false);
  });
});

describe('isInboxMarkAllReadResult', () => {
  it('accepts a boundary with an explicit offset and the counter that followed it', () => {
    expect(isInboxMarkAllReadResult({ boundary: '2026-10-18T12:00:00Z', unreadCount: 0 })).toBe(
      true,
    );
    expect(
      isInboxMarkAllReadResult({ boundary: '2026-10-18T12:00:00+02:00', unreadCount: 3 }),
    ).toBe(true);
  });

  it('rejects a boundary that is not an instant', () => {
    expect(isInboxMarkAllReadResult({ boundary: '2026-10-18T12:00:00' })).toBe(false);
    expect(isInboxMarkAllReadResult({ unreadCount: 0 })).toBe(false);
    expect(isInboxMarkAllReadResult({ boundary: '2026-10-18T12:00:00Z', unreadCount: 1.5 })).toBe(
      false,
    );
  });
});

describe('the boundary checks an adapter wraps its payload in', () => {
  it('returns the page it was given', () => {
    const page = { items: [notification], nextCursor: 'c-2' };

    expect(assertInboxPage(page)).toBe(page);
  });

  it('raises a load-phase contract violation for an unusable page', () => {
    let thrown: unknown;

    try {
      assertInboxPage({ items: [{ id: 'n-1' }], nextCursor: null });
    } catch (error) {
      thrown = error;
    }

    expect(isInboxError(thrown)).toBe(true);
    expect((thrown as InboxError).code).toBe('ADAPTER_CONTRACT_VIOLATION');
    expect((thrown as InboxError).phase).toBe('load');
    expect((thrown as InboxError).message).toContain('getNotifications');
  });

  it('raises a load-phase contract violation for an unusable counter', () => {
    expect(() => assertInboxUnreadCount({ unreadCount: -1 })).toThrow(InboxError);
    expect(assertInboxUnreadCount({ unreadCount: 27 })).toEqual({ unreadCount: 27 });

    try {
      assertInboxUnreadCount({});
    } catch (error) {
      expect((error as InboxError).phase).toBe('load');
      expect((error as InboxError).message).toContain('getUnreadCount');
    }
  });

  it('raises a mutation-phase contract violation for an unusable read-status result', () => {
    expect(assertInboxReadStatusResult({ notification, unreadCount: 26 })).toEqual({
      notification,
      unreadCount: 26,
    });

    try {
      assertInboxReadStatusResult({ notification });
    } catch (error) {
      expect((error as InboxError).code).toBe('ADAPTER_CONTRACT_VIOLATION');
      expect((error as InboxError).phase).toBe('mutation');
      expect((error as InboxError).message).toContain('setReadStatus');
    }
  });

  it('raises a mutation-phase contract violation for an unusable mark-all result', () => {
    expect(
      assertInboxMarkAllReadResult({ boundary: '2026-10-18T12:00:00Z', unreadCount: 3 }),
    ).toEqual({
      boundary: '2026-10-18T12:00:00Z',
      unreadCount: 3,
    });

    try {
      assertInboxMarkAllReadResult({ boundary: '2026-10-18T12:00:00' });
    } catch (error) {
      expect((error as InboxError).code).toBe('ADAPTER_CONTRACT_VIOLATION');
      expect((error as InboxError).phase).toBe('mutation');
      expect((error as InboxError).message).toContain('markAllRead');
    }
  });
});

describe('a cancelled load', () => {
  it('is rejected with an abort that is not an Inboxline failure', async () => {
    const load = () => Promise.reject(createAbortError('The page was superseded'));
    const error = await load().catch((reason: unknown) => reason);

    expect(isAbortError(error)).toBe(true);
    expect(isInboxError(error)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  Two backends, one contract                                                */
/* -------------------------------------------------------------------------- */

/**
 * The first payload shape: a REST endpoint that already uses the library's
 * vocabulary, one page of ten rows under a global counter of 27.
 */
const restPage: unknown = {
  data: Array.from({ length: 10 }, (_, index) => {
    const position = index + 1;
    return {
      id: `n-${position}`,
      createdAt: `2026-10-18T12:${String(position).padStart(2, '0')}:00Z`,
      title: `Order 42${position} shipped`,
      body: null,
      isRead: position > 3,
      actor: { id: 'u-3', displayName: 'Warehouse', avatar: 'https://cdn.example.com/u-3.png' },
    };
  }),
  cursor: 'c-2',
};

/** The second shape: a GraphQL payload with epoch milliseconds and nested nodes. */
const graphPayload: unknown = {
  nodes: Array.from({ length: 10 }, (_, index) => {
    const position = index + 1;
    return {
      nodeId: `n-${position}`,
      createdAtMs: 1_792_324_800_000 + position * 60_000,
      headline: `Order 42${position} shipped`,
      seen: position > 3,
      actor: { login: 'u-3', name: 'Warehouse' },
    };
  }),
  pageInfo: { hasNextPage: true, endCursor: 'c-2' },
};

/** Every adapter turns its own payload into the same page, or is rejected here. */
function toPage(payload: unknown): { items: InboxNotification[]; nextCursor: string | null } {
  if (typeof payload !== 'object' || payload === null) {
    return assertInboxPage(payload);
  }

  if ('data' in payload) {
    const rest = payload as { data: readonly Record<string, unknown>[]; cursor: string | null };
    return assertInboxPage({
      items: rest.data.map((row) => ({
        id: String(row.id),
        createdAt: row.createdAt,
        title: row.title,
        read: row.isRead === true,
        author: {
          id: String((row.actor as { id: string }).id),
          name: String((row.actor as { displayName: string }).displayName),
          avatarUrl: String((row.actor as { avatar: string }).avatar),
        },
      })),
      nextCursor: rest.cursor,
    });
  }

  const graph = payload as {
    nodes: readonly Record<string, unknown>[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
  return assertInboxPage({
    items: graph.nodes.map((node) => ({
      id: String(node.nodeId),
      createdAt: new Date(Number(node.createdAtMs)).toISOString(),
      title: node.headline,
      read: node.seen === true,
      author: {
        id: String((node.actor as { login: string }).login),
        name: String((node.actor as { name: string }).name),
      },
    })),
    nextCursor: graph.pageInfo.hasNextPage ? graph.pageInfo.endCursor : null,
  });
}

describe('two server payloads, one contract', () => {
  it('maps the REST payload into a page of ten', () => {
    const page = toPage(restPage);

    expect(page.items).toHaveLength(10);
    expect(page.items.every(isInboxNotification)).toBe(true);
    expect(page.items[0]?.title).toBe('Order 421 shipped');
    expect(page.nextCursor).toBe('c-2');
  });

  it('maps the GraphQL payload into the same page', () => {
    const page = toPage(graphPayload);

    expect(page.items).toHaveLength(10);
    expect(page.items.every(isInboxNotification)).toBe(true);
    expect(page.items[0]?.createdAt).toBe('2026-10-18T12:01:00.000Z');
    expect(page.nextCursor).toBe('c-2');
  });

  it('keeps the server counter independent of the page length', () => {
    const page = toPage(restPage);
    const counter = assertInboxUnreadCount({ unreadCount: 27 });

    expect(page.items).toHaveLength(10);
    expect(counter.unreadCount).toBe(27);
  });
});
