/**
 * The animation kit of the ready-made widget, tested through the public
 * provider and the DOM.
 *
 * jsdom has no layout engine, so these checks are about the contract the kits and
 * the surface share — class hooks, the index each row receives, and the moment a
 * row leaves the interaction tree — not about the painted transition. Geometry,
 * contrast and the actual motion are reviewed in the browser.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Inbox, InboxProvider } from './index';
import type { AnimationKit, InboxProviderProps, ItemProps } from './index';
import { CONTEXT_A, createFixtureAdapter, testClock } from './test/fixtures';

/** A host that answers every media query the same way. */
function stubReducedMotion(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderFeed(
  options: Parameters<typeof createFixtureAdapter>[0] = {},
  providerProps: Omit<
    InboxProviderProps,
    'adapter' | 'context' | 'clock' | 'theme' | 'config' | 'children'
  > = {},
) {
  const adapter = createFixtureAdapter(options);
  return {
    adapter,
    ...render(
      <InboxProvider
        adapter={adapter}
        context={CONTEXT_A}
        clock={testClock}
        theme="dark"
        config={{ locale: 'en', timeZone: 'UTC' }}
        {...providerProps}
      >
        <Inbox layout="feed" />
      </InboxProvider>,
    ),
  };
}

/** The row element of the notification with this title. */
function rowFor(title: string): HTMLElement {
  const row = screen.getByText(title).closest('li');
  if (row === null) throw new Error(`No row for ${title}`);
  return row as HTMLElement;
}

describe('the default animation kit', () => {
  it('renders every row through the kit with its place in the list', async () => {
    renderFeed({ pageSize: 4 });
    await screen.findByRole('list', { name: 'Notifications' });

    const rows = [...document.querySelectorAll('.il-item')] as HTMLElement[];
    expect(rows).toHaveLength(4);
    for (const [index, row] of rows.entries()) {
      // The stable slot class is still there; the kit only adds its hook.
      expect(row.classList.contains('il-item')).toBe(true);
      expect(row.classList.contains('il-row-animated')).toBe(true);
      expect(row.style.getPropertyValue('--il-index')).toBe(String(index));
    }
  });

  it('wraps the surface content in the container that follows its height', async () => {
    renderFeed({ pageSize: 4 });
    await screen.findByRole('list', { name: 'Notifications' });

    const box = document.querySelector('.il-height') as HTMLElement;
    const inner = box.querySelector('.il-height-inner') as HTMLElement;
    expect(box).not.toBeNull();
    expect(inner).not.toBeNull();
    // The wrapper adds a box, not a second rhythm: its content is the whole card.
    expect(inner.querySelector('.il-header')).not.toBeNull();
    expect(inner.querySelector('.il-list')).not.toBeNull();
    // Nothing is in flight in a test: the content sizes itself.
    expect(box.getAttribute('data-il-animating')).toBeNull();
  });

  it('holds a row it just marked read for the exit, already out of the tree', async () => {
    renderFeed({ pageSize: 4, latencyMs: 0 });
    await screen.findByText('Fourth');

    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    await waitFor(() => expect(screen.queryByText('Second')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Mark as read: Fourth' }));
    const row = rowFor('Fourth');

    await waitFor(() => expect(row.getAttribute('data-il-exiting')).toBe('true'));
    expect(row.getAttribute('aria-hidden')).toBe('true');
    expect(row.getAttribute('data-il-unread')).toBe('true');
    expect(row.style.getPropertyValue('--il-exit-duration')).toBe('240ms');
    // Both controls are gone from the row, so nothing in it can be activated.
    expect(within(row).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Fourth/ })).toBeNull();

    // The rows below stay usable while the ghost collapses.
    expect(screen.getByRole('button', { name: 'Mark as read: Third' })).toBeTruthy();

    await waitFor(() => expect(screen.queryByText('Fourth')).toBeNull());
  });

  it('lets the exiting row go at once when the filter changes under it', async () => {
    renderFeed({ pageSize: 4, latencyMs: 0 });
    await screen.findByText('Fourth');

    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    await waitFor(() => expect(screen.queryByText('Second')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Mark as read: Fourth' }));
    await waitFor(() => expect(document.querySelector('[data-il-exiting="true"]')).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => expect(screen.getAllByText('Fourth')).toHaveLength(1));

    expect(document.querySelector('[data-il-exiting="true"]')).toBeNull();
    expect(screen.getAllByText('Fourth')).toHaveLength(1);
  });

  it('does not play a cascade when a bulk action empties the unread selection', async () => {
    renderFeed({ pageSize: 4, latencyMs: 0 });
    await screen.findByText('Fourth');

    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    await waitFor(() => expect(screen.queryByText('Second')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));

    await waitFor(() => expect(screen.queryByText('Fourth')).toBeNull());
    expect(document.querySelector('[data-il-exiting="true"]')).toBeNull();
  });

  it('does not hold a row at all under prefers-reduced-motion', async () => {
    stubReducedMotion();
    renderFeed({ pageSize: 4, latencyMs: 0 });
    await screen.findByText('Fourth');

    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    await waitFor(() => expect(screen.queryByText('Second')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Mark as read: Fourth' }));

    // The exit window is 240 ms; with motion off the row must be gone well before
    // it, not merely before the end of the test.
    await waitFor(() => expect(screen.queryByText('Fourth')).toBeNull(), { timeout: 100 });
    expect(document.querySelector('[data-il-exiting="true"]')).toBeNull();
  });

  it('renders the surface through a kit the application passed', async () => {
    /** A kit that leaves its own mark, enough to prove the widget renders through it. */
    const markedKit: AnimationKit = {
      Item: ({ index, exiting, children, ...rest }: ItemProps) => (
        <li {...rest} data-testid="row" data-index={index} data-exiting={String(exiting)}>
          {children}
        </li>
      ),
      Height: ({ children }) => <div data-testid="height">{children}</div>,
    };

    renderFeed({ pageSize: 4 }, { animations: markedKit });
    await screen.findByRole('list', { name: 'Notifications' });

    expect(screen.getAllByTestId('row')).toHaveLength(4);
    expect(screen.getAllByTestId('row')[0]?.getAttribute('data-index')).toBe('0');
    expect(screen.getAllByTestId('row')[0]?.getAttribute('data-exiting')).toBe('false');
    expect(screen.getByTestId('height').querySelector('.il-list')).not.toBeNull();
  });
});
