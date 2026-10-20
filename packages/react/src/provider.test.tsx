import { StrictMode, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InboxAdapter, InboxContext, InboxSnapshot } from '@nickkupriyanov/inboxline-core';
import { InboxProvider, useInboxFlow, useInboxUI } from './index';
import type { InboxProviderProps, InboxUI } from './index';
import {
  CONTEXT_A,
  CONTEXT_B,
  createFixtureAdapter,
  notification,
  testClock,
} from './test/fixtures';

/* -------------------------------------------------------------------------- */
/*  Probes                                                                     */
/* -------------------------------------------------------------------------- */

interface Sink {
  snapshot?: InboxSnapshot<unknown>;
  ui?: InboxUI<unknown>;
}

function Probe({ id = 'main', sink }: { id?: string; sink?: Sink }) {
  const { snapshot, actions } = useInboxFlow();
  const ui = useInboxUI();

  if (sink) {
    sink.snapshot = snapshot as InboxSnapshot<unknown>;
    sink.ui = ui as InboxUI<unknown>;
  }

  const firstId = snapshot.view.list.items[0]?.id;

  return (
    <section>
      <span data-testid={`${id}-count`}>{snapshot.view.counter.unreadCount ?? 'unknown'}</span>
      <span data-testid={`${id}-filter`}>{snapshot.state.filter}</span>
      <span data-testid={`${id}-open`}>{String(ui.open)}</span>
      <span data-testid={`${id}-theme`}>{ui.theme}</span>
      <span data-testid={`${id}-locale`}>{ui.locale}</span>
      <span data-testid={`${id}-titles`}>
        {snapshot.view.list.items.map((item) => item.title).join(',')}
      </span>
      <span data-testid={`${id}-revision`}>{snapshot.revision}</span>
      <span data-testid={`${id}-empty`}>{ui.messages.emptyLabel}</span>
      <button data-testid={`${id}-filter-unread`} onClick={() => ui.setFilter('unread')}>
        unread
      </button>
      <button data-testid={`${id}-filter-all`} onClick={() => ui.setFilter('all')}>
        all
      </button>
      <button data-testid={`${id}-open-true`} onClick={() => ui.setOpen(true)}>
        open
      </button>
      <button data-testid={`${id}-open-false`} onClick={() => ui.setOpen(false)}>
        close
      </button>
      <button data-testid={`${id}-refresh`} onClick={() => void actions.refresh()}>
        refresh
      </button>
      <button data-testid={`${id}-show-updates`} onClick={() => void actions.showUpdates()}>
        updates
      </button>
      <button data-testid={`${id}-mark-all`} onClick={() => void actions.markAllRead()}>
        mark all
      </button>
      <button data-testid={`${id}-load-more`} onClick={() => void actions.loadMore()}>
        more
      </button>
      <button
        data-testid={`${id}-read-first`}
        onClick={() => void actions.setRead(firstId ?? '', true)}
      >
        read first
      </button>
    </section>
  );
}

function renderProvider(props: Omit<InboxProviderProps, 'children'> & { children?: ReactNode }) {
  const { children, ...rest } = props;
  return render(
    <InboxProvider {...rest} context={rest.context ?? CONTEXT_A} clock={testClock}>
      {children ?? <Probe />}
    </InboxProvider>,
  );
}

async function waitForCount(value: string, id = 'main'): Promise<void> {
  await waitFor(() => expect(screen.getByTestId(`${id}-count`).textContent).toBe(value));
}

/* -------------------------------------------------------------------------- */
/*  Loading and shared flow                                                    */
/* -------------------------------------------------------------------------- */

describe('InboxProvider loading', () => {
  it('loads the first page and the counter through one controller', async () => {
    renderProvider({ adapter: createFixtureAdapter() });

    await waitForCount('3');
    expect(screen.getByTestId('main-titles').textContent).toBe('Fourth,Third');
    expect(screen.getByTestId('main-filter').textContent).toBe('all');
    expect(screen.getByTestId('main-theme').textContent).toBe('dark');
    // With no explicit config the browser language replaces the server fallback
    // after mounting; jsdom reports `en-US`.
    expect(screen.getByTestId('main-locale').textContent).toBe('en-US');
  });

  it('shares one snapshot between two consumers of the same provider', async () => {
    const adapter = createFixtureAdapter();
    const getUnreadCount = vi.spyOn(adapter, 'getUnreadCount');
    const first: Sink = {};
    const second: Sink = {};

    renderProvider({
      adapter,
      children: (
        <>
          <Probe id="bell" sink={first} />
          <Probe id="feed" sink={second} />
        </>
      ),
    });

    await waitForCount('3', 'bell');
    await waitFor(() => expect(screen.getByTestId('feed-count').textContent).toBe('3'));

    expect(first.snapshot).toBe(second.snapshot);
    // Two consumers, one counter request: the provider owns one controller.
    expect(getUnreadCount).toHaveBeenCalledTimes(1);
  });

  it('keeps two providers isolated even with the same adapter', async () => {
    const adapter = createFixtureAdapter();

    render(
      <>
        <InboxProvider adapter={adapter} context={CONTEXT_A} clock={testClock}>
          <Probe id="a" />
        </InboxProvider>
        <InboxProvider adapter={adapter} context={CONTEXT_B} clock={testClock}>
          <Probe id="b" />
        </InboxProvider>
      </>,
    );

    await waitForCount('3', 'a');
    await waitForCount('1', 'b');
    expect(screen.getByTestId('b-titles').textContent).toBe('Only B');

    fireEvent.click(screen.getByTestId('a-mark-all'));
    await waitFor(() => expect(screen.getByTestId('a-count').textContent).toBe('0'));
    // The other context still has its own unread row.
    expect(screen.getByTestId('b-count').textContent).toBe('1');
  });

  it('keeps the snapshot object stable across an unrelated re-render', async () => {
    const adapter = createFixtureAdapter();
    const sink: Sink = {};

    const view = renderProvider({ adapter, children: <Probe sink={sink} /> });
    await waitForCount('3');
    const before = sink.snapshot;

    view.rerender(
      <InboxProvider adapter={adapter} context={CONTEXT_A} clock={testClock}>
        <Probe sink={sink} />
      </InboxProvider>,
    );

    expect(sink.snapshot).toBe(before);
  });
});

/* -------------------------------------------------------------------------- */
/*  Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

interface CountingAdapter {
  adapter: InboxAdapter;
  stats(): { active: number; subscribed: number; unsubscribed: number; list: number };
}

function countingAdapter(adapter: InboxAdapter): CountingAdapter {
  let active = 0;
  let subscribed = 0;
  let unsubscribed = 0;
  let list = 0;

  return {
    adapter: {
      ...adapter,
      getNotifications: (query) => {
        list += 1;
        return adapter.getNotifications(query);
      },
      subscribe: (query) => {
        subscribed += 1;
        active += 1;
        const unsubscribe = adapter.subscribe?.(query);
        return () => {
          active -= 1;
          unsubscribed += 1;
          unsubscribe?.();
        };
      },
    },
    stats: () => ({ active, subscribed, unsubscribed, list }),
  };
}

describe('InboxProvider lifecycle', () => {
  it('subscribes on mount and releases the subscription on unmount', async () => {
    const counting = countingAdapter(createFixtureAdapter());

    const view = renderProvider({ adapter: counting.adapter });
    await waitForCount('3');
    expect(counting.stats()).toMatchObject({ active: 1, subscribed: 1, unsubscribed: 0 });

    view.unmount();
    expect(counting.stats()).toMatchObject({ active: 0, unsubscribed: 1 });
  });

  it('survives a Strict Mode double mount without a leaked subscription', async () => {
    const counting = countingAdapter(createFixtureAdapter());

    render(
      <StrictMode>
        <InboxProvider adapter={counting.adapter} context={CONTEXT_A} clock={testClock}>
          <Probe />
        </InboxProvider>
      </StrictMode>,
    );

    await waitForCount('3');
    const stats = counting.stats();
    expect(stats.active).toBe(1);
    expect(stats.subscribed - stats.unsubscribed).toBe(1);
    expect(screen.getByTestId('main-titles').textContent).toBe('Fourth,Third');
  });

  it('starts a fresh load after an unmount/remount without duplicating subscriptions', async () => {
    const counting = countingAdapter(createFixtureAdapter());

    const view = renderProvider({ adapter: counting.adapter });
    await waitForCount('3');
    view.unmount();
    expect(counting.stats().active).toBe(0);

    renderProvider({ adapter: counting.adapter });
    await waitForCount('3');

    const stats = counting.stats();
    expect(stats.active).toBe(1);
    expect(stats.subscribed).toBe(2);
    expect(stats.unsubscribed).toBe(1);
    expect(stats.list).toBeGreaterThanOrEqual(2);
  });

  it('reloads when the context key changes and ignores the previous data', async () => {
    const adapter = createFixtureAdapter();
    const view = renderProvider({ adapter, context: CONTEXT_A });
    await waitForCount('3');

    view.rerender(
      <InboxProvider adapter={adapter} context={CONTEXT_B} clock={testClock}>
        <Probe />
      </InboxProvider>,
    );

    await waitForCount('1');
    expect(screen.getByTestId('main-titles').textContent).toBe('Only B');
  });

  it('keeps the context data updated without resetting the loaded rows', async () => {
    const adapter = createFixtureAdapter();
    const seen: unknown[] = [];
    const wrapped: InboxAdapter = {
      ...adapter,
      getNotifications: (query) => {
        seen.push(query.context.data);
        return adapter.getNotifications(query);
      },
    };

    const view = renderProvider({ adapter: wrapped, context: { key: 'user-a', data: 'one' } });
    await waitForCount('3');
    const titles = screen.getByTestId('main-titles').textContent;

    view.rerender(
      <InboxProvider adapter={wrapped} context={{ key: 'user-a', data: 'two' }} clock={testClock}>
        <Probe />
      </InboxProvider>,
    );

    expect(screen.getByTestId('main-titles').textContent).toBe(titles);
    // Replacing `context.data` under the same key updates the following
    // requests only; it does not reset or reload the open list by itself.
    expect(seen).toEqual(['one']);

    fireEvent.click(screen.getByTestId('main-refresh'));
    await waitFor(() => expect(seen).toContain('two'));
  });

  it('reloads from a replacement adapter', async () => {
    const first = createFixtureAdapter();
    const second = createFixtureAdapter({
      contexts: [
        {
          context: CONTEXT_A,
          notifications: [notification('z1', { title: 'From the second adapter', read: false })],
        },
      ],
    });

    const view = renderProvider({ adapter: first });
    await waitForCount('3');

    view.rerender(
      <InboxProvider adapter={second} context={CONTEXT_A} clock={testClock}>
        <Probe />
      </InboxProvider>,
    );

    await waitForCount('1');
    expect(screen.getByTestId('main-titles').textContent).toBe('From the second adapter');
  });

  it('uses the latest error callback without recreating the controller', async () => {
    const adapter = createFixtureAdapter();
    const firstError = vi.fn();
    const secondError = vi.fn();

    const view = renderProvider({ adapter, onError: firstError });
    await waitForCount('3');

    view.rerender(
      <InboxProvider adapter={adapter} context={CONTEXT_A} clock={testClock} onError={secondError}>
        <Probe />
      </InboxProvider>,
    );

    adapter.failNext('getUnreadCount');
    fireEvent.click(screen.getByTestId('main-refresh'));

    await waitFor(() => expect(secondError).toHaveBeenCalledTimes(1));
    expect(firstError).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/*  Configuration and presentation                                             */
/* -------------------------------------------------------------------------- */

describe('InboxProvider presentation', () => {
  it('applies config changes without reloading server data', async () => {
    const adapter = createFixtureAdapter();
    const getNotifications = vi.spyOn(adapter, 'getNotifications');

    const view = renderProvider({ adapter, config: { locale: 'ru' } });
    await waitForCount('3');
    expect(screen.getByTestId('main-locale').textContent).toBe('ru');
    expect(screen.getByTestId('main-empty').textContent).toBe('Уведомлений пока нет');
    const requests = getNotifications.mock.calls.length;

    view.rerender(
      <InboxProvider
        adapter={adapter}
        context={CONTEXT_A}
        clock={testClock}
        config={{ locale: 'en', timeZone: 'Europe/Moscow' }}
      >
        <Probe />
      </InboxProvider>,
    );

    expect(screen.getByTestId('main-locale').textContent).toBe('en');
    expect(getNotifications).toHaveBeenCalledTimes(requests);
  });

  it('defaults to the dark theme and accepts an explicit light one', async () => {
    renderProvider({ adapter: createFixtureAdapter(), theme: 'light' });
    await waitForCount('3');
    expect(screen.getByTestId('main-theme').textContent).toBe('light');
  });
});

/* -------------------------------------------------------------------------- */
/*  Controlled and uncontrolled values                                         */
/* -------------------------------------------------------------------------- */

describe('filter as a controlled value', () => {
  it('asks the application and applies the prop without echoing a change', async () => {
    const adapter = createFixtureAdapter();
    const onFilterChange = vi.fn();
    const view = renderProvider({ adapter, filter: 'all', onFilterChange });
    await waitForCount('3');

    fireEvent.click(screen.getByTestId('main-filter-unread'));
    // The request reaches the application; the controller still shows "all".
    expect(onFilterChange).toHaveBeenCalledWith('unread');
    expect(screen.getByTestId('main-filter').textContent).toBe('all');

    view.rerender(
      <InboxProvider
        adapter={adapter}
        context={CONTEXT_A}
        clock={testClock}
        filter="unread"
        onFilterChange={onFilterChange}
      >
        <Probe />
      </InboxProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('main-filter').textContent).toBe('unread'));
    // The external update is not echoed back.
    expect(onFilterChange).toHaveBeenCalledTimes(1);

    view.rerender(
      <InboxProvider
        adapter={adapter}
        context={CONTEXT_A}
        clock={testClock}
        filter="all"
        onFilterChange={onFilterChange}
      >
        <Probe />
      </InboxProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('main-filter').textContent).toBe('all'));
    expect(onFilterChange).toHaveBeenCalledTimes(1);
  });

  it('does not ask for the filter it already accepted', async () => {
    const adapter = createFixtureAdapter();
    const onFilterChange = vi.fn();
    renderProvider({ adapter, filter: 'all', onFilterChange });
    await waitForCount('3');

    fireEvent.click(screen.getByTestId('main-filter-all'));
    expect(onFilterChange).not.toHaveBeenCalled();
  });
});

describe('filter as an uncontrolled value', () => {
  it('changes the controller itself and reports the change once', async () => {
    const adapter = createFixtureAdapter();
    const onFilterChange = vi.fn();
    renderProvider({ adapter, defaultFilter: 'all', onFilterChange });
    await waitForCount('3');

    fireEvent.click(screen.getByTestId('main-filter-unread'));

    await waitFor(() => expect(screen.getByTestId('main-filter').textContent).toBe('unread'));
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith('unread');
    await waitForCount('3');
    expect(screen.getByTestId('main-titles').textContent).toBe('Fourth,Third');
  });

  it('ignores a controlled filter that appears later, with one warning', async () => {
    const adapter = createFixtureAdapter();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const view = renderProvider({ adapter, defaultFilter: 'all' });
    await waitForCount('3');

    view.rerender(
      <InboxProvider adapter={adapter} context={CONTEXT_A} clock={testClock} filter="unread">
        <Probe />
      </InboxProvider>,
    );
    view.rerender(
      <InboxProvider adapter={adapter} context={CONTEXT_A} clock={testClock} filter="unread">
        <Probe />
      </InboxProvider>,
    );

    expect(screen.getByTestId('main-filter').textContent).toBe('all');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('"filter" appeared');
    warn.mockRestore();
  });

  it('keeps the last accepted value when a controlled filter becomes undefined', async () => {
    const adapter = createFixtureAdapter();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const view = renderProvider({ adapter, filter: 'unread' });
    await waitFor(() => expect(screen.getByTestId('main-filter').textContent).toBe('unread'));

    view.rerender(
      <InboxProvider adapter={adapter} context={CONTEXT_A} clock={testClock}>
        <Probe />
      </InboxProvider>,
    );

    expect(screen.getByTestId('main-filter').textContent).toBe('unread');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('"filter" became undefined');
    warn.mockRestore();
  });

  it('warns when both the controlled and the default value are passed', async () => {
    const adapter = createFixtureAdapter();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    renderProvider({ adapter, filter: 'unread', defaultFilter: 'all' });
    await waitFor(() => expect(screen.getByTestId('main-filter').textContent).toBe('unread'));

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('both passed'));
    warn.mockRestore();
  });
});

describe('open as a controlled value', () => {
  it('updates an uncontrolled value and reports the change', async () => {
    const adapter = createFixtureAdapter();
    const onOpenChange = vi.fn();
    renderProvider({ adapter, defaultOpen: false, onOpenChange });
    await waitForCount('3');

    fireEvent.click(screen.getByTestId('main-open-true'));
    expect(screen.getByTestId('main-open').textContent).toBe('true');
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByTestId('main-open-false'));
    expect(screen.getByTestId('main-open').textContent).toBe('false');
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(onOpenChange).toHaveBeenCalledTimes(2);
  });

  it('asks the application in controlled mode and applies the prop without echo', async () => {
    const adapter = createFixtureAdapter();
    const onOpenChange = vi.fn();
    const view = renderProvider({ adapter, open: false, onOpenChange });
    await waitForCount('3');

    fireEvent.click(screen.getByTestId('main-open-true'));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.getByTestId('main-open').textContent).toBe('false');

    view.rerender(
      <InboxProvider
        adapter={adapter}
        context={CONTEXT_A}
        clock={testClock}
        open
        onOpenChange={onOpenChange}
      >
        <Probe />
      </InboxProvider>,
    );

    expect(screen.getByTestId('main-open').textContent).toBe('true');
    expect(onOpenChange).toHaveBeenCalledTimes(1);
  });

  it('keeps the last value when a controlled open becomes undefined', async () => {
    const adapter = createFixtureAdapter();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const view = renderProvider({
      adapter,
      open: true,
      onOpenChange: vi.fn(),
    });
    await waitForCount('3');

    view.rerender(
      <InboxProvider adapter={adapter} context={CONTEXT_A} clock={testClock}>
        <Probe />
      </InboxProvider>,
    );

    expect(screen.getByTestId('main-open').textContent).toBe('true');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"open" became undefined'));
    warn.mockRestore();
  });

  it('ignores a controlled open that appears later', async () => {
    const adapter = createFixtureAdapter();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const view = renderProvider({ adapter, defaultOpen: false });
    await waitForCount('3');

    view.rerender(
      <InboxProvider adapter={adapter} context={CONTEXT_A} clock={testClock} open>
        <Probe />
      </InboxProvider>,
    );

    expect(screen.getByTestId('main-open').textContent).toBe('false');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"open" appeared'));
    warn.mockRestore();
  });
});

/* -------------------------------------------------------------------------- */
/*  Headless API boundaries                                                    */
/* -------------------------------------------------------------------------- */

describe('headless hooks', () => {
  it('throws a helpful error outside a provider', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    function Outside() {
      useInboxFlow();
      return null;
    }

    expect(() => render(<Outside />)).toThrow(/useInboxFlow\(\) must be used inside/);
    error.mockRestore();
  });

  it('hands the latest activation handler to custom parts', async () => {
    const adapter = createFixtureAdapter();
    const first = vi.fn();
    const second = vi.fn();
    const sink: Sink = {};

    const view = renderProvider({
      adapter,
      onNotificationClick: first,
      children: <Probe sink={sink} />,
    });
    await waitForCount('3');

    sink.ui?.onNotificationClick?.(notification('n4', { title: 'Fourth' }));
    expect(first).toHaveBeenCalledTimes(1);

    view.rerender(
      <InboxProvider
        adapter={adapter}
        context={CONTEXT_A}
        clock={testClock}
        onNotificationClick={second}
      >
        <Probe sink={sink} />
      </InboxProvider>,
    );

    sink.ui?.onNotificationClick?.(notification('n4', { title: 'Fourth' }));
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('exposes updates through the shared flow after an invalidation', async () => {
    const adapter = createFixtureAdapter();
    renderProvider({ adapter });
    await waitForCount('3');

    adapter.addNotification(CONTEXT_A, {
      ...notification('n5', { createdAt: '2026-10-19T11:30:00Z', title: 'Fifth' }),
    });
    adapter.invalidate(CONTEXT_A as InboxContext);

    await waitForCount('4');
    // The open list is unchanged until the visitor asks for the update.
    expect(screen.getByTestId('main-titles').textContent).toBe('Fourth,Third');

    fireEvent.click(screen.getByTestId('main-show-updates'));
    await waitFor(() => expect(screen.getByTestId('main-titles').textContent).toBe('Fifth,Fourth'));
  });
});
