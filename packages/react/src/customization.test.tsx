/**
 * Replaceable parts and class overrides, tested through the public provider.
 *
 * These checks are about the contract a consumer actually receives: a prepared
 * props bundle keeps the library's behaviour and accessibility when a part is
 * replaced, a class override lands next to the stable slot class, a custom part
 * can read `TData`, and changing parts never recreates the controller or reloads
 * the list.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { createMockAdapter } from '@nickkupriyanov/inboxline-core';
import type { InboxNotification } from '@nickkupriyanov/inboxline-core';
import {
  DEFAULT_INBOX_COMPONENTS,
  DefaultFilters,
  DefaultHeader,
  DefaultNotificationItem,
  Inbox,
  InboxProvider,
} from './index';
import type {
  AvatarPartProps,
  EmptyPartProps,
  ErrorPartProps,
  FiltersPartProps,
  HeaderPartProps,
  InboxProviderProps,
  LoadingPartProps,
  NotificationItemPartProps,
  PageErrorPartProps,
  TriggerPartProps,
} from './index';
import { CONTEXT_A, createFixtureAdapter, testClock } from './test/fixtures';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

type ProviderExtras = Partial<Pick<InboxProviderProps, 'adapter'>> &
  Omit<InboxProviderProps, 'adapter' | 'context' | 'clock' | 'theme' | 'config' | 'children'>;

function providerProps(extras: ProviderExtras = {}): InboxProviderProps {
  const { adapter = createFixtureAdapter({ pageSize: 4 }), ...rest } = extras;
  return {
    adapter,
    context: CONTEXT_A,
    clock: testClock,
    config: { locale: 'en', timeZone: 'UTC' },
    ...rest,
  };
}

function renderFeed(extras: ProviderExtras = {}) {
  return render(
    <InboxProvider {...providerProps(extras)}>
      <Inbox layout="feed" />
    </InboxProvider>,
  );
}

function renderBell(extras: ProviderExtras = {}) {
  return render(
    <InboxProvider {...providerProps(extras)}>
      <Inbox />
    </InboxProvider>,
  );
}

/* -------------------------------------------------------------------------- */
/*  Classes                                                                    */
/* -------------------------------------------------------------------------- */

describe('className and classNames', () => {
  it('adds the whole-widget class and per-slot overrides next to the stable classes', async () => {
    const { container } = renderFeed({
      className: 'app-theme',
      classNames: {
        root: 'app-root',
        header: 'app-header',
        filters: 'app-filters',
        filter: 'app-filter',
        item: 'app-item',
        itemTitle: 'app-title',
      },
    });

    await screen.findByText('Fourth');

    const root = container.querySelector('.il-root');
    expect(root?.className).toBe('il-root app-root app-theme');
    expect(container.querySelector('.il-header')?.className).toBe('il-header app-header');
    expect(container.querySelector('.il-filters')?.className).toBe('il-filters app-filters');
    expect(container.querySelector('.il-filter')?.className).toBe('il-filter app-filter');
    expect(container.querySelector('.il-item')?.className).toBe('il-item app-item');
    expect(container.querySelector('.il-item-title')?.className).toBe('il-item-title app-title');
  });

  it('applies the whole-widget class to the trigger and the portalled panel alike', async () => {
    const { container } = renderBell({
      className: 'app-theme',
      classNames: { bell: 'app-bell', root: 'app-root', panel: 'app-panel' },
    });

    const trigger = await screen.findByRole('button', {
      name: 'Notifications. 3 unread notifications',
    });
    expect(container.querySelector('.il-bell')?.className).toBe('il-bell app-bell app-theme');

    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Notifications' });
    expect(dialog.className).toBe('il-root app-root app-theme il-panel app-panel');
  });
});

/* -------------------------------------------------------------------------- */
/*  Parts                                                                      */
/* -------------------------------------------------------------------------- */

function CustomTrigger({ slotProps, open, unreadCount }: TriggerPartProps) {
  return (
    <button {...slotProps} data-testid="custom-trigger">
      {open ? 'Open' : 'Closed'} · {unreadCount ?? 'unknown'}
    </button>
  );
}

function CustomHeader({ title, headingProps, slotProps, filters, close }: HeaderPartProps) {
  return (
    <header {...slotProps} data-testid="custom-header">
      <h2 {...headingProps}>{title} · custom</h2>
      <div data-testid="custom-header-filters">{filters}</div>
      {close}
    </header>
  );
}

function CustomFilters({ slotProps, options }: FiltersPartProps) {
  return (
    <div {...slotProps} data-testid="custom-filters">
      {options.map((option) => (
        <button key={option.value} {...option.props} data-testid={`custom-filter-${option.value}`}>
          {option.label.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function CustomRow({
  item,
  activatable,
  slotProps,
  activateProps,
  readProps,
  avatar,
  status,
}: NotificationItemPartProps) {
  return (
    <li {...slotProps} data-testid={`custom-row-${item.id}`}>
      {avatar}
      <div>
        {activatable ? (
          <button {...activateProps}>Open {item.title}</button>
        ) : (
          <span>{item.title}</span>
        )}
        {status}
      </div>
      <button {...readProps}>
        <span aria-hidden="true">R</span>
      </button>
    </li>
  );
}

describe('custom parts', () => {
  it('replaces the trigger and keeps the dialog, focus and counter contract', async () => {
    renderBell({ components: { Trigger: CustomTrigger } });

    const trigger = await screen.findByTestId('custom-trigger');
    expect(trigger.className).toBe('il-trigger');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.textContent).toContain('3');

    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: 'Notifications' });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe(dialog.id);
    expect(document.activeElement).toBe(dialog);

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('replaces the header and filters while keeping the dialog name and filtering', async () => {
    renderBell({
      components: { Header: CustomHeader, Filters: CustomFilters },
      classNames: { header: 'app-header', filter: 'app-filter' },
    });

    const trigger = await screen.findByRole('button', {
      name: 'Notifications. 3 unread notifications',
    });
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: 'Notifications · custom' });
    const heading = screen.getByRole('heading', { name: 'Notifications · custom' });
    expect(dialog.getAttribute('aria-labelledby')).toBe(heading.id);

    const header = screen.getByTestId('custom-header');
    expect(header.className).toBe('il-header app-header');
    expect(
      screen.getByTestId('custom-header-filters').contains(screen.getByTestId('custom-filters')),
    ).toBe(true);

    const unread = screen.getByTestId('custom-filter-unread');
    expect(unread.className).toBe('il-filter app-filter');
    expect(unread.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(unread);

    await waitFor(() => expect(unread.getAttribute('aria-pressed')).toBe('true'));
    await waitFor(() => expect(screen.queryByText('Second')).toBeNull());
    expect(screen.getByText('Fourth')).toBeTruthy();
  });

  it('replaces a row while its prepared activation, read action and ref stay wired', async () => {
    const onNotificationClick = vi.fn();
    renderFeed({
      components: { NotificationItem: CustomRow },
      onNotificationClick,
    });

    await screen.findByTestId('custom-row-n4');
    fireEvent.click(screen.getByRole('button', { name: 'Open Fourth' }));
    expect(onNotificationClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'n4' }));

    await waitFor(() =>
      expect(screen.getByTestId('custom-row-n4').getAttribute('data-il-unread')).toBeNull(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    await waitFor(() => expect(screen.queryByTestId('custom-row-n2')).toBeNull());
    await waitFor(() => expect(screen.queryByTestId('custom-row-n4')).toBeNull());

    const third = screen.getByRole('button', { name: 'Mark as read: Third' });
    const first = screen.getByRole('button', { name: 'Mark as read: First' });
    third.focus();
    fireEvent.click(third);

    await waitFor(() => expect(document.activeElement).toBe(first));
  });

  it('replaces the loading, empty, error and page-error blocks', async () => {
    // Loading.
    const loading = renderFeed({
      adapter: createFixtureAdapter({ pageSize: 2, latencyMs: 40 }),
      components: {
        Loading: ({ label, slotProps }: LoadingPartProps) => (
          <div {...slotProps} data-testid="custom-loading">
            {label}
          </div>
        ),
      },
    });
    expect(screen.getByTestId('custom-loading')).toBeTruthy();
    await screen.findByText('Fourth');
    loading.unmount();

    // Empty.
    const empty = renderFeed({
      adapter: createFixtureAdapter({ pageSize: 2, contexts: [] }),
      components: {
        Empty: ({ label, slotProps }: EmptyPartProps) => (
          <p {...slotProps} data-testid="custom-empty">
            {label}
          </p>
        ),
      },
    });
    expect(await screen.findByTestId('custom-empty')).toBeTruthy();
    empty.unmount();

    // First-page error, then retry through the prepared handler.
    const failing = createFixtureAdapter({ pageSize: 2 });
    failing.failNext('getNotifications');
    const errorView = render(
      <InboxProvider
        adapter={failing}
        context={CONTEXT_A}
        clock={testClock}
        components={{
          Error: ({ message, retryLabel, onRetry, slotProps }: ErrorPartProps) => (
            <div {...slotProps} data-testid="custom-error">
              <span>{message}</span>
              <button type="button" onClick={onRetry}>
                {retryLabel}
              </button>
            </div>
          ),
        }}
      >
        <Inbox layout="feed" />
      </InboxProvider>,
    );
    const error = await screen.findByTestId('custom-error');
    fireEvent.click(within(error).getByRole('button', { name: 'Try again' }));
    await screen.findByText('Fourth');
    errorView.unmount();

    // Next-page error, then retry of the same page.
    const paged = createFixtureAdapter({ pageSize: 2 });
    render(
      <InboxProvider
        adapter={paged}
        context={CONTEXT_A}
        clock={testClock}
        components={{
          PageError: ({ message, retryLabel, onRetry, slotProps }: PageErrorPartProps) => (
            <div {...slotProps} data-testid="custom-page-error">
              <span>{message}</span>
              <button type="button" onClick={onRetry}>
                {retryLabel}
              </button>
            </div>
          ),
        }}
      >
        <Inbox layout="feed" />
      </InboxProvider>,
    );
    await screen.findByText('Third');
    paged.failNext('getNotifications');
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

    const pageError = await screen.findByTestId('custom-page-error');
    fireEvent.click(within(pageError).getByRole('button', { name: 'Try again' }));
    await screen.findByText('Second');
  });

  it('replaces the avatar while a custom row reads its TData', async () => {
    interface ProjectData {
      project: string;
      badge: string;
    }

    const rows: readonly InboxNotification<ProjectData>[] = [
      {
        id: 'p1',
        createdAt: '2026-10-19T11:00:00Z',
        title: 'Deployment finished',
        read: false,
        author: { name: 'Mira Petrova' },
        data: { project: 'Apollo', badge: 'AP' },
      },
      {
        id: 'p2',
        createdAt: '2026-10-19T10:00:00Z',
        title: 'Payment received',
        read: true,
        author: { name: 'Oleg Ivanov' },
        data: { project: 'Borealis', badge: 'BO' },
      },
    ];

    const adapter = createMockAdapter<ProjectData>({
      clock: testClock,
      pageSize: 4,
      contexts: [{ context: CONTEXT_A, notifications: rows }],
    });

    function ProjectRow({
      item,
      slotProps,
      activateProps,
      readProps,
      avatar,
      status,
      activatable,
    }: NotificationItemPartProps<ProjectData>) {
      return (
        <li {...slotProps} data-testid={`project-${item.id}`}>
          {avatar}
          <div>
            {activatable ? <button {...activateProps}>{item.title}</button> : item.title}
            <span data-testid={`project-of-${item.id}`}>{item.data?.project}</span>
          </div>
          <button {...readProps}>
            <span aria-hidden="true">R</span>
          </button>
          {status}
        </li>
      );
    }

    function ProjectAvatar({ item, kind, slotProps }: AvatarPartProps<ProjectData>) {
      return (
        <span {...slotProps} data-testid={`avatar-${kind}`}>
          {item.data?.badge}
        </span>
      );
    }

    render(
      <InboxProvider<ProjectData>
        adapter={adapter}
        context={CONTEXT_A}
        clock={testClock}
        config={{ locale: 'en', timeZone: 'UTC' }}
        components={{ NotificationItem: ProjectRow, Avatar: ProjectAvatar }}
      >
        <Inbox layout="feed" />
      </InboxProvider>,
    );

    expect((await screen.findByTestId('project-of-p1')).textContent).toBe('Apollo');
    expect(screen.getByTestId('project-of-p2').textContent).toBe('Borealis');
    expect(within(screen.getByTestId('project-p1')).getByTestId('avatar-avatar').textContent).toBe(
      'AP',
    );
  });

  it('wraps the default parts instead of re-implementing them', async () => {
    renderFeed({
      components: {
        Header: (props) => (
          <div data-testid="wrapped-header">
            <DefaultHeader {...props} />
          </div>
        ),
        Filters: (props) => (
          <div data-testid="wrapped-filters">
            <DefaultFilters {...props} />
          </div>
        ),
        NotificationItem: (props) => <DefaultNotificationItem {...props} />,
      },
    });

    expect(await screen.findByTestId('wrapped-header')).toBeTruthy();
    expect(screen.getByTestId('wrapped-filters')).toBeTruthy();
    expect(screen.getByText('Fourth')).toBeTruthy();
    expect(DEFAULT_INBOX_COMPONENTS.Header).toBe(DefaultHeader);
  });
});

/* -------------------------------------------------------------------------- */
/*  Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

describe('custom parts and the controller', () => {
  it('changes parts, classNames and className without recreating the controller or reloading', async () => {
    const adapter = createFixtureAdapter({ pageSize: 4 });
    const getNotifications = vi.spyOn(adapter, 'getNotifications');

    const base = {
      adapter,
      context: CONTEXT_A,
      clock: testClock,
      config: { locale: 'en', timeZone: 'UTC' } as const,
    };

    function HeaderA({ slotProps, headingProps, filters }: HeaderPartProps): ReactNode {
      return (
        <header {...slotProps} data-testid="header-a">
          <h2 {...headingProps}>First header</h2>
          <div>{filters}</div>
        </header>
      );
    }

    function HeaderB({ slotProps, headingProps, filters }: HeaderPartProps): ReactNode {
      return (
        <header {...slotProps} data-testid="header-b">
          <h2 {...headingProps}>Second header</h2>
          <div>{filters}</div>
        </header>
      );
    }

    const { rerender } = render(
      <InboxProvider {...base} components={{ Header: HeaderA }}>
        <Inbox layout="feed" />
      </InboxProvider>,
    );

    await screen.findByText('Fourth');
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    await waitFor(() => expect(screen.queryByText('Second')).toBeNull());

    const calls = getNotifications.mock.calls.length;

    rerender(
      <InboxProvider
        {...base}
        className="next-theme"
        classNames={{ root: 'next-root' }}
        components={{ Header: HeaderB }}
      >
        <Inbox layout="feed" />
      </InboxProvider>,
    );

    expect(await screen.findByTestId('header-b')).toBeTruthy();
    expect(screen.queryByTestId('header-a')).toBeNull();
    expect(getNotifications).toHaveBeenCalledTimes(calls);
    expect(screen.getByRole('button', { name: 'Unread' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.queryByText('Second')).toBeNull();
    expect(document.querySelector('.il-root.next-root.next-theme')).not.toBeNull();
  });
});
