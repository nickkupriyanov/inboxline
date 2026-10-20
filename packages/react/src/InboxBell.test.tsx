/**
 * The bell and its panel, tested through the public provider and the DOM.
 *
 * The checks describe what a visitor and assistive technology observe: the
 * shared counter on the trigger, the non-modal dialog and its relationships,
 * Escape and outside-click behaviour, re-opening, and the coexistence of the
 * bell with the feed under one provider. Real geometry is covered by the pure
 * placement tests; jsdom has no layout engine.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Inbox, InboxProvider } from './index';
import type { InboxProviderProps } from './index';
import { CONTEXT_A, createFixtureAdapter, notification, testClock } from './test/fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderBell(
  options: Parameters<typeof createFixtureAdapter>[0] = {},
  providerProps: Omit<
    InboxProviderProps,
    'adapter' | 'context' | 'clock' | 'theme' | 'config' | 'children'
  > = {},
  children?: ReactNode,
) {
  const adapter = createFixtureAdapter(options);
  const view = render(
    <InboxProvider
      adapter={adapter}
      context={CONTEXT_A}
      clock={testClock}
      theme="dark"
      config={{ locale: 'en', timeZone: 'UTC' }}
      {...providerProps}
    >
      {children ?? <Inbox />}
    </InboxProvider>,
  );
  return { adapter, ...view };
}

async function openBell(): Promise<{ trigger: HTMLElement; dialog: HTMLElement }> {
  const trigger = await screen.findByRole('button', {
    name: 'Notifications. 3 unread notifications',
  });
  fireEvent.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: 'Notifications' });
  return { trigger, dialog };
}

describe('Inbox bell', () => {
  it('is the default layout and shows the shared counter on the trigger', async () => {
    const { container } = renderBell({ pageSize: 4 });

    const trigger = await screen.findByRole('button', {
      name: 'Notifications. 3 unread notifications',
    });
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.il-bell')?.getAttribute('data-il-theme')).toBe('dark');

    const badge = trigger.querySelector('.il-badge');
    expect(badge?.textContent).toBe('3');
    expect(badge?.getAttribute('aria-hidden')).toBe('true');
  });

  it('opens a non-modal dialog in a portal with linked IDs and the same theme', async () => {
    const { container } = renderBell({ pageSize: 4 });
    const { trigger, dialog } = await openBell();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe(dialog.id);
    expect(dialog.getAttribute('aria-modal')).toBeNull();
    expect(dialog.getAttribute('data-il-layout')).toBe('popover');
    expect(dialog.getAttribute('data-il-theme')).toBe('dark');
    expect(dialog.getAttribute('role')).toBe('dialog');

    const heading = screen.getByRole('heading', { name: 'Notifications' });
    expect(dialog.getAttribute('aria-labelledby')).toBe(heading.id);

    // The panel belongs to the document body, not to the provider's container,
    // so an ancestor with `overflow: hidden` cannot clip it.
    expect(dialog.parentElement).toBe(document.body);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('moves focus into the dialog without trapping it and returns it on Escape', async () => {
    renderBell({ pageSize: 4 });
    const { trigger, dialog } = await openBell();

    expect(document.activeElement).toBe(dialog);

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('closes from its close button and returns focus to the trigger', async () => {
    renderBell({ pageSize: 4 });
    const { trigger } = await openBell();

    fireEvent.click(screen.getByRole('button', { name: 'Close notifications' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps the panel mounted for its exit, inert, then removes it', async () => {
    renderBell({ pageSize: 4 });
    await openBell();

    fireEvent.keyDown(document, { key: 'Escape' });

    // The role is already gone from the accessibility tree, but the card is still
    // in the DOM for the exit and cannot receive a pointer or the keyboard.
    const closing = document.querySelector('[data-il-closing="true"]') as HTMLElement | null;
    expect(closing).not.toBeNull();
    expect(closing?.getAttribute('aria-hidden')).toBe('true');
    expect(closing?.hasAttribute('inert')).toBe(true);
    expect(closing?.style.getPropertyValue('--il-exit-duration')).toBe('240ms');

    await waitFor(() => expect(document.querySelector('[data-il-closing="true"]')).toBeNull());
  });

  it('removes the panel at once under prefers-reduced-motion', async () => {
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

    renderBell({ pageSize: 4 });
    await openBell();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(document.querySelector('[data-il-closing="true"]')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('reopens during the exit without stacking a second panel', async () => {
    renderBell({ pageSize: 4 });
    const { trigger } = await openBell();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('[data-il-closing="true"]')).not.toBeNull();

    fireEvent.click(trigger);

    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(document.querySelector('[data-il-closing="true"]')).toBeNull();
  });

  it('closes on an outside pointer without taking focus from the clicked element', async () => {
    renderBell({ pageSize: 4 });
    await openBell();

    const outside = document.createElement('button');
    outside.textContent = 'Outside';
    document.body.append(outside);
    outside.focus();

    fireEvent.pointerDown(outside);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('closes from the trigger and keeps the provider and the feed alive', async () => {
    const { container } = renderBell(
      { pageSize: 4 },
      {},
      <>
        <Inbox />
        <Inbox layout="feed" />
      </>,
    );

    await screen.findByText('Fourth');
    const { trigger } = await openBell();

    // The feed and the panel render the same rows; the dialog is the extra one.
    expect(container.querySelector('[data-il-layout="feed"]')).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(container.querySelector('[data-il-layout="feed"]')).not.toBeNull();
    expect(screen.getAllByText('Fourth').length).toBeGreaterThan(0);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('refreshes the first page when the panel is reopened', async () => {
    const { adapter } = renderBell({ pageSize: 4 });

    await openBell();
    await screen.findByText('Fourth');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    adapter.addNotification(
      CONTEXT_A,
      notification('n5', { createdAt: '2026-10-19T11:30:00Z', title: 'Fifth' }),
    );

    fireEvent.click(screen.getByRole('button', { name: /^Notifications\./ }));
    expect(await screen.findByText('Fifth')).toBeTruthy();
  });

  it('does not invent a zero badge while the counter is unknown', async () => {
    const adapter = createFixtureAdapter({ pageSize: 4 });
    adapter.failNext('getUnreadCount');

    render(
      <InboxProvider
        adapter={adapter}
        context={CONTEXT_A}
        clock={testClock}
        config={{ locale: 'en' }}
      >
        <Inbox />
      </InboxProvider>,
    );

    const trigger = await screen.findByRole('button', {
      name: 'Notifications. Unread count unknown',
    });
    expect(trigger.querySelector('.il-badge')).toBeNull();
  });

  it('keeps IDs unique across two widgets', async () => {
    const adapter = createFixtureAdapter({ pageSize: 4 });
    render(
      <>
        <InboxProvider adapter={adapter} context={CONTEXT_A} clock={testClock}>
          <Inbox />
        </InboxProvider>
        <InboxProvider adapter={adapter} context={CONTEXT_A} clock={testClock}>
          <Inbox />
        </InboxProvider>
      </>,
    );

    const triggers = await screen.findAllByRole('button', {
      name: 'Notifications. 3 unread notifications',
    });
    expect(triggers).toHaveLength(2);

    fireEvent.click(triggers[0] as HTMLElement);
    const dialogs = await screen.findAllByRole('dialog', { name: 'Notifications' });
    expect(dialogs).toHaveLength(1);

    fireEvent.click(triggers[1] as HTMLElement);
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(2));

    const openDialogs = screen.getAllByRole('dialog');
    expect(openDialogs[0]?.id).not.toBe(openDialogs[1]?.id);
    expect(triggers[0]?.getAttribute('aria-controls')).toBe(openDialogs[0]?.id);
    expect(triggers[1]?.getAttribute('aria-controls')).toBe(openDialogs[1]?.id);
  });

  it('follows the anchor on scroll and caps itself to the free space', async () => {
    renderBell({ pageSize: 4 });
    const trigger = await screen.findByRole('button', {
      name: 'Notifications. 3 unread notifications',
    });

    let top = 100;
    vi.spyOn(trigger, 'getBoundingClientRect').mockImplementation(() => {
      const left = 800;
      const width = 44;
      const height = 44;
      return {
        top,
        left,
        right: left + width,
        bottom: top + height,
        width,
        height,
        x: left,
        y: top,
        toJSON: () => ({}),
      } as DOMRect;
    });

    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Notifications' });

    expect(dialog.style.position).toBe('fixed');
    expect(dialog.style.top).toBe('152px');
    expect(dialog.getAttribute('data-il-side')).toBe('bottom');
    expect(Number.parseInt(dialog.style.maxHeight, 10)).toBeGreaterThan(0);

    top = 300;
    fireEvent.scroll(window);

    await waitFor(() => expect(dialog.style.top).toBe('352px'));
  });

  it('follows the controlled open value owned by the application', async () => {
    const onOpenChange = vi.fn();
    const adapter = createFixtureAdapter({ pageSize: 4 });

    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <InboxProvider
          adapter={adapter}
          context={CONTEXT_A}
          clock={testClock}
          open={open}
          onOpenChange={(next) => {
            onOpenChange(next);
            setOpen(next);
          }}
        >
          <Inbox />
        </InboxProvider>
      );
    }

    render(<Host />);
    const trigger = await screen.findByRole('button', {
      name: 'Notifications. 3 unread notifications',
    });

    fireEvent.click(trigger);
    await screen.findByRole('dialog', { name: 'Notifications' });
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('renders the Russian close label from the shared dictionary', async () => {
    const adapter = createFixtureAdapter({ pageSize: 4 });
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

    const trigger = await screen.findByRole('button', {
      name: 'Уведомления. 3 непрочитанных',
    });
    fireEvent.click(trigger);

    await screen.findByRole('dialog', { name: 'Уведомления' });
    expect(screen.getByRole('button', { name: 'Закрыть уведомления' })).toBeTruthy();
  });
});
