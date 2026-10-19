/**
 * The ready-made feed, tested through the public provider and DOM only.
 *
 * These checks are about what a visitor and assistive technology observe: the
 * list semantics, the states of the filter buttons, the paging controls, the
 * external-update banner and the fallbacks for missing data. They do not mirror
 * the component's implementation.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { InboxNotification } from '@nickkupriyanov/inboxline-core';
import { Inbox, InboxProvider } from './index';
import {
  CONTEXT_A,
  createFixtureAdapter,
  notification,
  NOTIFICATIONS_A,
  testClock,
} from './test/fixtures';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function renderFeed(
  options: Parameters<typeof createFixtureAdapter>[0] = {},
  theme: 'dark' | 'light' = 'dark',
) {
  const adapter = createFixtureAdapter(options);
  const view = render(
    <InboxProvider
      adapter={adapter}
      context={CONTEXT_A}
      clock={testClock}
      theme={theme}
      config={{ locale: 'en', timeZone: 'UTC' }}
    >
      <Inbox />
    </InboxProvider>,
  );
  return { adapter, ...view };
}

function adapterWith(
  notifications: readonly InboxNotification[],
  pageSize = notifications.length || 1,
) {
  return {
    pageSize,
    contexts: [{ context: CONTEXT_A, notifications }],
  };
}

/* -------------------------------------------------------------------------- */
/*  Content                                                                    */
/* -------------------------------------------------------------------------- */

describe('Inbox feed', () => {
  it('renders the feed as a labelled list of day groups and rows', async () => {
    const { container } = renderFeed({ pageSize: 4 });

    const list = await screen.findByRole('list', { name: 'Notifications' });
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(within(list).getByText('Fourth')).toBeTruthy();
    expect(within(list).getByText('Third')).toBeTruthy();
    expect(within(list).getByText('Second')).toBeTruthy();
    expect(within(list).getByText('First')).toBeTruthy();
    expect(container.querySelector('.il-root')?.getAttribute('data-il-layout')).toBe('feed');
    expect(container.querySelector('.il-root')?.getAttribute('data-il-theme')).toBe('dark');
    expect(container.querySelector('.il-root')?.getAttribute('data-il-filter')).toBe('all');
  });

  it('shows time, unread state and the server counter live region', async () => {
    renderFeed({ pageSize: 4 });

    await screen.findByRole('list', { name: 'Notifications' });

    const fourth = screen.getByText('Fourth').closest('li');
    expect(fourth?.getAttribute('data-il-unread')).toBe('true');
    expect(fourth?.textContent).toContain('Unread');
    expect(fourth?.textContent).toContain('1 hour ago');

    const second = screen.getByText('Second').closest('li');
    expect(second?.getAttribute('data-il-unread')).toBeNull();

    const live = screen.getByText('3 unread notifications');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.getAttribute('aria-atomic')).toBe('true');
  });

  it('renders an avatar, initials and the icon fallback without optional data', async () => {
    const { container } = renderFeed(
      adapterWith([
        notification('avatar', {
          title: 'Avatar',
          author: { name: 'Mira Petrova', avatarUrl: 'https://example.test/mira.png' },
        }),
        notification('initials', { title: 'Initials', author: { name: 'Oleg Ivanov' } }),
        notification('icon', { title: 'Icon', icon: 'https://example.test/icon.png' }),
        notification('plain', { title: 'Plain' }),
      ]),
    );

    await screen.findByText('Avatar');

    const avatar = container.querySelectorAll('.il-item-avatar img');
    expect(avatar).toHaveLength(1);
    expect(avatar[0]?.getAttribute('alt')).toBe('');
    expect(screen.getByText('OI')).toBeTruthy();
    expect(container.querySelector('.il-item-icon img')?.getAttribute('src')).toBe(
      'https://example.test/icon.png',
    );

    const rows = container.querySelectorAll('.il-item');
    expect(rows[3]?.querySelector('.il-item-avatar, .il-item-icon')).toBeNull();
    expect(rows[3]?.querySelector('.il-item-body')).toBeNull();
  });

  it('falls back to initials when the avatar image fails', async () => {
    const { container } = renderFeed(
      adapterWith([
        notification('avatar', {
          title: 'Avatar',
          author: { name: 'Mira Petrova', avatarUrl: 'https://example.test/mira.png' },
        }),
      ]),
    );

    await screen.findByText('Avatar');
    const image = container.querySelector('.il-item-avatar img');
    expect(image).not.toBeNull();
    fireEvent.error(image as HTMLImageElement);

    await waitFor(() => expect(container.querySelector('.il-item-avatar img')).toBeNull());
    expect(container.querySelector('.il-item-avatar')?.textContent).toBe('MP');
  });

  it('falls back to the bell glyph when the notification icon fails', async () => {
    const { container } = renderFeed(
      adapterWith([notification('icon', { title: 'Icon', icon: 'https://example.test/icon.png' })]),
    );

    await screen.findByText('Icon');
    fireEvent.error(container.querySelector('.il-item-icon img') as HTMLImageElement);

    await waitFor(() => expect(container.querySelector('.il-item-icon img')).toBeNull());
    expect(container.querySelector('.il-item-icon svg')).not.toBeNull();
  });

  it('keeps long titles and bodies as plain wrapping text', async () => {
    const title = 'A'.repeat(240);
    const body = 'B'.repeat(600);
    renderFeed(adapterWith([notification('long', { title, body })]));

    expect(await screen.findByText(title)).toBeTruthy();
    expect(screen.getByText(body)).toBeTruthy();
    expect(screen.queryByText('Notification long')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*  Filters, paging and states                                                 */
/* -------------------------------------------------------------------------- */

describe('Inbox filters and paging', () => {
  it('renders native filter buttons with an applied pressed state', async () => {
    renderFeed({ pageSize: 4 });

    const all = await screen.findByRole('button', { name: 'All' });
    const unread = screen.getByRole('button', { name: 'Unread' });
    const group = screen.getByRole('group', { name: 'Filter notifications' });

    expect(group.contains(all)).toBe(true);
    expect(all.getAttribute('aria-pressed')).toBe('true');
    expect(unread.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(unread);

    await waitFor(() => expect(unread.getAttribute('aria-pressed')).toBe('true'));
    await waitFor(() => expect(screen.queryByText('Second')).toBeNull());
    expect(screen.getByText('Fourth')).toBeTruthy();
  });

  it('appends the next page and hides the control at the end', async () => {
    renderFeed({ pageSize: 2 });

    await screen.findByText('Third');
    const more = screen.getByRole('button', { name: 'Show more' });
    expect(screen.queryByText('Second')).toBeNull();

    fireEvent.click(more);

    await screen.findByText('Second');
    expect(screen.getByText('First')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull());
  });

  it('keeps the loaded rows when the next page fails and retries it', async () => {
    const { adapter } = renderFeed({ pageSize: 2 });

    await screen.findByText('Third');
    adapter.failNext('getNotifications');
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

    expect(await screen.findByText('The next notifications could not be loaded')).toBeTruthy();
    expect(screen.getByText('Third')).toBeTruthy();
    expect(screen.queryByText('Second')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByText('Second');
    expect(screen.queryByText('The next notifications could not be loaded')).toBeNull();
  });

  it('shows the first-page error with a retry and keeps retrying only the failure', async () => {
    const adapter = createFixtureAdapter({ pageSize: 2 });
    adapter.failNext('getNotifications');
    render(
      <InboxProvider adapter={adapter} context={CONTEXT_A} clock={testClock}>
        <Inbox />
      </InboxProvider>,
    );

    expect(await screen.findByText('The notifications could not be loaded')).toBeTruthy();
    expect(screen.queryByText('No notifications yet')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByText('Fourth');
    expect(screen.queryByText('The notifications could not be loaded')).toBeNull();
  });

  it('shows the loading state before the first rows and an empty state under a filter', async () => {
    const loading = renderFeed({ pageSize: 2, latencyMs: 40 });
    expect(screen.getByText('Loading notifications…')).toBeTruthy();
    await screen.findByText('Fourth');
    loading.unmount();

    renderFeed(adapterWith([]));
    expect(await screen.findByText('No notifications yet')).toBeTruthy();
  });

  it('offers the external update as an explicit action and keeps the list until it is used', async () => {
    const { adapter } = renderFeed({ pageSize: 2 });

    await screen.findByText('Third');
    adapter.addNotification(
      CONTEXT_A,
      notification('n5', { createdAt: '2026-10-19T11:30:00Z', title: 'Fifth' }),
    );
    adapter.invalidate(CONTEXT_A);

    const updates = await screen.findByRole('button', { name: 'Show updates' });
    expect(screen.queryByText('Fifth')).toBeNull();

    fireEvent.click(updates);

    await screen.findByText('Fifth');
    expect(screen.queryByRole('button', { name: 'Show updates' })).toBeNull();
    expect(screen.queryByText('Third')).toBeNull();
  });

  it('uses the explicit light theme on the root', async () => {
    const { container } = renderFeed({ pageSize: 4 }, 'light');
    await screen.findByRole('list', { name: 'Notifications' });
    expect(container.querySelector('.il-root')?.getAttribute('data-il-theme')).toBe('light');
  });
});

/* -------------------------------------------------------------------------- */
/*  Copy                                                                       */
/* -------------------------------------------------------------------------- */

describe('Inbox copy', () => {
  it('renders the Russian dictionary with plural counters', async () => {
    const adapter = createFixtureAdapter({
      pageSize: 4,
      contexts: [{ context: CONTEXT_A, notifications: NOTIFICATIONS_A }],
    });
    render(
      <InboxProvider
        adapter={adapter}
        context={CONTEXT_A}
        clock={testClock}
        config={{ locale: 'ru', timeZone: 'UTC' }}
      >
        <Inbox />
      </InboxProvider>,
    );

    await screen.findByRole('list', { name: 'Уведомления' });
    expect(screen.getByRole('button', { name: 'Все' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Непрочитанные' })).toBeTruthy();
    expect(screen.getByText('3 непрочитанных')).toBeTruthy();
    expect(screen.getByText('Сегодня')).toBeTruthy();
  });
});
