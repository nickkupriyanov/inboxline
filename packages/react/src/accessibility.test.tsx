/**
 * The accessibility audit of the finished widget.
 *
 * axe checks everything the DOM decides — names, roles, relationships, hidden
 * content — on the states the widget really renders. `color-contrast` is off
 * here on purpose: jsdom has no layout or paint, so the token contrast is
 * calculated in `packages/core/src/styles/styles.test.ts` and measured again in a
 * real browser during the review. Keyboard behaviour, live regions and focus
 * recovery are checked through the public provider and the DOM only.
 */
import axe from 'axe-core';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Inbox, InboxProvider } from './index';
import type { InboxProviderProps } from './index';
import {
  CONTEXT_A,
  createFixtureAdapter,
  notification,
  NOTIFICATIONS_A,
  testClock,
} from './test/fixtures';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type ProviderExtras = Omit<
  InboxProviderProps,
  'adapter' | 'context' | 'clock' | 'theme' | 'config' | 'children'
>;

function renderFeed(
  node: React.ReactNode = <Inbox layout="feed" />,
  options: Parameters<typeof createFixtureAdapter>[0] = { pageSize: 4 },
  theme: 'dark' | 'light' = 'dark',
  providerProps: ProviderExtras = {},
) {
  const adapter = createFixtureAdapter(options);
  return {
    adapter,
    ...render(
      <InboxProvider
        adapter={adapter}
        context={CONTEXT_A}
        clock={testClock}
        theme={theme}
        config={{ locale: 'en', timeZone: 'UTC' }}
        {...providerProps}
      >
        {node}
      </InboxProvider>,
    ),
  };
}

async function expectNoAxeViolations(context: Element): Promise<void> {
  const results = await axe.run(context, {
    // WCAG only: `region` and other best-practice rules depend on the page a
    // consumer embeds the feed into, not on the widget.
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    // Contrast cannot be judged without layout; see the file header.
    rules: { 'color-contrast': { enabled: false } },
  });
  const summary = results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help} :: ` +
      violation.nodes.map((node) => node.target.join(' ')).join(', '),
  );
  expect(summary, summary.join('\n')).toEqual([]);
}

/* -------------------------------------------------------------------------- */
/*  axe on the real states                                                     */
/* -------------------------------------------------------------------------- */

describe('axe audit', () => {
  it('passes on the feed in both explicit themes', async () => {
    const dark = renderFeed();
    await screen.findByText('Fourth');
    await expectNoAxeViolations(dark.container);
    dark.unmount();

    const light = renderFeed(undefined, { pageSize: 4 }, 'light');
    await screen.findByText('Fourth');
    await expectNoAxeViolations(light.container);
  });

  it('passes on the bell dialog and when both layouts share one provider', async () => {
    const view = renderFeed(
      <>
        <Inbox />
        <Inbox layout="feed" />
      </>,
    );

    await screen.findByText('Fourth');
    fireEvent.click(await screen.findByRole('button', { name: /Notifications\./ }));
    await screen.findByRole('dialog', { name: 'Notifications' });

    // The panel is portalled, so the audit covers the whole body.
    await expectNoAxeViolations(document.body);
    view.unmount();
  });

  it('passes while loading, empty and after a first-page failure', async () => {
    const loading = renderFeed(undefined, { pageSize: 2, latencyMs: 60 });
    expect(screen.getByText('Loading notifications…')).toBeTruthy();
    await expectNoAxeViolations(loading.container);
    await screen.findByText('Fourth');
    loading.unmount();

    const empty = renderFeed(undefined, {
      contexts: [{ context: CONTEXT_A, notifications: [] }],
    });
    await screen.findByText('No notifications yet');
    await expectNoAxeViolations(empty.container);
    empty.unmount();

    const failing = createFixtureAdapter({ pageSize: 2 });
    failing.failNext('getNotifications');
    const failure = render(
      <InboxProvider adapter={failing} context={CONTEXT_A} clock={testClock}>
        <Inbox layout="feed" />
      </InboxProvider>,
    );
    await screen.findByText('The notifications could not be loaded');
    await expectNoAxeViolations(failure.container);
  });

  it('passes while a read is pending, refused or lost', async () => {
    const pending = renderFeed(undefined, { pageSize: 4, latencyMs: 80 });
    await screen.findByText('Fourth');
    fireEvent.click(screen.getByRole('button', { name: 'Mark as read: Fourth' }));
    await screen.findByText('Saving…');
    await expectNoAxeViolations(pending.container);
    await waitFor(() => expect(screen.queryByText('Saving…')).toBeNull());
    pending.unmount();

    const refused = renderFeed(undefined, { pageSize: 4, latencyMs: 20 });
    await screen.findByText('Fourth');
    refused.adapter.failNext('setReadStatus');
    fireEvent.click(screen.getByRole('button', { name: 'Mark as read: Fourth' }));
    await screen.findByText('The notification could not be updated');
    await expectNoAxeViolations(refused.container);
    refused.unmount();

    const lost = renderFeed(undefined, { pageSize: 4, latencyMs: 20 });
    await screen.findByText('Fourth');
    lost.adapter.failNext('setReadStatus', { apply: true, outcome: 'unknown' });
    fireEvent.click(screen.getByRole('button', { name: 'Mark as read: Fourth' }));
    await screen.findByText('Checking with the server…');
    await expectNoAxeViolations(lost.container);
    await waitFor(() => expect(screen.queryByText('Checking with the server…')).toBeNull());
  });

  it('passes with the update banner and a refused bulk action', async () => {
    const updates = renderFeed(undefined, { pageSize: 2 });
    await screen.findByText('Third');
    updates.adapter.addNotification(
      CONTEXT_A,
      notification('n5', { createdAt: '2026-10-19T11:30:00Z', title: 'Fifth' }),
    );
    updates.adapter.invalidate(CONTEXT_A);
    await screen.findByRole('button', { name: 'Show updates' });
    await expectNoAxeViolations(updates.container);
    updates.unmount();

    const bulk = renderFeed(undefined, { pageSize: 2, latencyMs: 20 });
    await screen.findByText('Third');
    bulk.adapter.failNext('markAllRead');
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    await screen.findByText('The notifications could not be marked read');
    await expectNoAxeViolations(bulk.container);
  });
});

/* -------------------------------------------------------------------------- */
/*  Keyboard                                                                   */
/* -------------------------------------------------------------------------- */

describe('keyboard in the feed', () => {
  it('reaches every control in DOM order with Tab', async () => {
    const user = userEvent.setup();
    const notifications = [
      ...NOTIFICATIONS_A,
      notification('n0', { createdAt: '2026-10-16T10:00:00Z', title: 'Zeroth' }),
    ];
    renderFeed(undefined, {
      pageSize: 4,
      contexts: [{ context: CONTEXT_A, notifications }],
    });
    await screen.findByText('Fourth');

    const order: HTMLElement[] = [
      screen.getByRole('button', { name: 'All' }),
      screen.getByRole('button', { name: 'Unread' }),
      screen.getByRole('button', { name: 'Mark all as read' }),
      screen.getByRole('button', { name: /^Fourth/ }),
      screen.getByRole('button', { name: 'Mark as read: Fourth' }),
      screen.getByRole('button', { name: /^Third/ }),
      screen.getByRole('button', { name: 'Mark as read: Third' }),
      screen.getByRole('button', { name: 'Mark as unread: Second' }),
      screen.getByRole('button', { name: /^First/ }),
      screen.getByRole('button', { name: 'Mark as read: First' }),
      screen.getByRole('button', { name: 'Show more' }),
    ];

    for (const control of order) {
      await user.tab();
      expect(document.activeElement, control.textContent ?? '').toBe(control);
    }

    // The tab order ends with the controls that can leave the surface; it does
    // not wander into the hidden live region.
    await user.tab();
    expect(order).not.toContain(document.activeElement);
  });

  it('switches the unread filter from the keyboard and keeps the filter focused', async () => {
    const user = userEvent.setup();
    renderFeed();
    await screen.findByText('Fourth');

    await user.tab();
    await user.tab();
    const unread = screen.getByRole('button', { name: 'Unread' });
    expect(document.activeElement).toBe(unread);

    await user.keyboard('{Enter}');

    await waitFor(() => expect(unread.getAttribute('aria-pressed')).toBe('true'));
    await waitFor(() => expect(screen.queryByText('Second')).toBeNull());
    expect(document.activeElement).toBe(unread);
  });

  it('marks a row read with the keyboard and moves focus to the next row', async () => {
    const user = userEvent.setup();
    renderFeed();
    await screen.findByText('Fourth');

    await user.tab();
    await user.tab();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByText('Second')).toBeNull());

    // All -> Unread -> Mark all as read -> the first activation -> its read action.
    for (let step = 0; step < 3; step += 1) await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Mark as read: Fourth' }),
    );

    await user.keyboard(' ');

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Mark as read: Third' }),
      ),
    );
  });

  it('announces row and bulk results through their own status roles', async () => {
    renderFeed(undefined, { pageSize: 4, latencyMs: 20 });
    await screen.findByText('Fourth');

    fireEvent.click(screen.getByRole('button', { name: 'Mark as read: Fourth' }));
    const saving = screen.getByText('Saving…');
    expect(saving.getAttribute('role')).toMatch(/^(status|alert)$/);
    expect(saving.closest('[data-il-kind]')?.getAttribute('data-il-kind')).toBe('pending');
    await waitFor(() => expect(screen.queryByText('Saving…')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    const pendingBulk = await screen.findByText('Marking all as read…');
    expect(pendingBulk.closest('button')?.getAttribute('aria-busy')).toBe('true');
    await waitFor(() => expect(screen.queryByText('Marking all as read…')).toBeNull());
  });
});

describe('keyboard in the bell', () => {
  it('opens from the trigger, tabs into the panel and returns focus on Escape', async () => {
    const user = userEvent.setup();
    renderFeed(<Inbox />);
    const trigger = await screen.findByRole('button', {
      name: 'Notifications. 3 unread notifications',
    });

    await user.tab();
    expect(document.activeElement).toBe(trigger);

    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'Notifications' });
    expect(document.activeElement).toBe(dialog);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe(dialog.id);

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'All' }));

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes from the keyboard when the close button has focus', async () => {
    const user = userEvent.setup();
    renderFeed(<Inbox />);
    const trigger = await screen.findByRole('button', { name: /Notifications\./ });
    await user.tab();
    await user.keyboard('{Enter}');
    await screen.findByRole('dialog', { name: 'Notifications' });

    // Dialog -> All -> Unread -> close.
    await user.tab();
    await user.tab();
    await user.tab();
    const close = screen.getByRole('button', { name: 'Close notifications' });
    expect(document.activeElement).toBe(close);

    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});

/* -------------------------------------------------------------------------- */
/*  Focus recovery                                                             */
/* -------------------------------------------------------------------------- */

describe('focus recovery when a control completes its job', () => {
  it('returns focus to the active filter after “mark all as read”', async () => {
    const user = userEvent.setup();
    renderFeed();
    await screen.findByText('Fourth');

    const markAll = screen.getByRole('button', { name: 'Mark all as read' });
    markAll.focus();
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Mark all as read' })).toBeNull(),
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('0 unread notifications')).toBeTruthy();
  });

  it('returns focus to the active filter after “show updates”', async () => {
    const user = userEvent.setup();
    const view = renderFeed(undefined, { pageSize: 2 });
    await screen.findByText('Third');

    view.adapter.addNotification(
      CONTEXT_A,
      notification('n5', { createdAt: '2026-10-19T11:30:00Z', title: 'Fifth' }),
    );
    view.adapter.invalidate(CONTEXT_A);

    const updates = await screen.findByRole('button', { name: 'Show updates' });
    updates.focus();
    await user.keyboard('{Enter}');

    await screen.findByText('Fifth');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Show updates' })).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'All' }));
  });

  it('keeps focus on “show more” while it loads and recovers it at the end', async () => {
    const user = userEvent.setup();
    const notifications = [
      ...NOTIFICATIONS_A,
      notification('n0', { createdAt: '2026-10-16T10:00:00Z', title: 'Zeroth' }),
    ];
    renderFeed(undefined, {
      pageSize: 2,
      latencyMs: 20,
      contexts: [{ context: CONTEXT_A, notifications }],
    });
    await screen.findByText('Third');

    const more = screen.getByRole('button', { name: 'Show more' });
    more.focus();
    await user.keyboard('{Enter}');

    expect(more.getAttribute('aria-disabled')).toBe('true');
    expect(more.getAttribute('aria-busy')).toBe('true');
    expect(document.activeElement).toBe(more);

    await screen.findByText('First');
    expect(document.activeElement).toBe(more);
    expect(more.getAttribute('aria-disabled')).toBeNull();

    await user.keyboard('{Enter}');
    await screen.findByText('Zeroth');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'All' }));
  });

  it('returns focus to the active filter after a successful retry', async () => {
    const user = userEvent.setup();
    const adapter = createFixtureAdapter({ pageSize: 2 });
    adapter.failNext('getNotifications');
    render(
      <InboxProvider adapter={adapter} context={CONTEXT_A} clock={testClock}>
        <Inbox layout="feed" />
      </InboxProvider>,
    );

    const retry = await screen.findByRole('button', { name: 'Try again' });
    retry.focus();
    await user.keyboard('{Enter}');

    await screen.findByText('Fourth');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'All' }));
  });
});

/* -------------------------------------------------------------------------- */
/*  Live regions and names                                                     */
/* -------------------------------------------------------------------------- */

describe('live regions', () => {
  it('announces only the counter in a polite, atomic status', async () => {
    const { container } = renderFeed();
    await screen.findByText('Fourth');

    const live = screen.getByText('3 unread notifications');
    expect(live.getAttribute('role')).toBe('status');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.getAttribute('aria-atomic')).toBe('true');
    expect(live.querySelector('li, ul, button')).toBeNull();

    // The row statuses have their own roles, so this region is the only explicit
    // live region and a change cannot re-read the list.
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(1);
    expect(within(live).queryByRole('button')).toBeNull();
  });

  it('updates the counter without replacing the loaded rows', async () => {
    const view = renderFeed(undefined, { pageSize: 2 });
    await screen.findByText('Third');
    const rowsBefore = [...view.container.querySelectorAll('.il-item')];

    view.adapter.addNotification(
      CONTEXT_A,
      notification('n5', { createdAt: '2026-10-19T11:30:00Z', title: 'Fifth' }),
    );
    view.adapter.invalidate(CONTEXT_A);

    expect(await screen.findByText('4 unread notifications')).toBeTruthy();
    const rowsAfter = [...view.container.querySelectorAll('.il-item')];
    expect(rowsAfter).toHaveLength(rowsBefore.length);
    rowsAfter.forEach((row, index) => expect(row).toBe(rowsBefore[index]));
    expect(screen.queryByText('Fifth')).toBeNull();
  });
});

describe('names and relationships', () => {
  it('labels the trigger, the dialog, the filters, the list and the row actions', async () => {
    renderFeed(<Inbox />);
    const trigger = await screen.findByRole('button', {
      name: 'Notifications. 3 unread notifications',
    });

    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Notifications' });
    const heading = screen.getByRole('heading', { name: 'Notifications' });
    expect(dialog.getAttribute('aria-labelledby')).toBe(heading.id);

    const group = screen.getByRole('group', { name: 'Filter notifications' });
    const all = within(group).getByRole('button', { name: 'All' });
    const unread = within(group).getByRole('button', { name: 'Unread' });
    expect(all.getAttribute('aria-pressed')).toBe('true');
    expect(unread.getAttribute('aria-pressed')).toBe('false');

    expect(within(dialog).getByRole('list', { name: 'Notifications' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Close notifications' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Mark as read: Fourth' })).toBeTruthy();
  });

  it('keeps the badge out of the tree while the trigger names the count once', async () => {
    renderFeed(<Inbox />);
    const trigger = await screen.findByRole('button', {
      name: 'Notifications. 3 unread notifications',
    });
    const badge = trigger.querySelector('.il-badge');
    expect(badge?.getAttribute('aria-hidden')).toBe('true');
    expect(trigger.getAttribute('aria-label')).not.toContain('3 3');
  });
});
