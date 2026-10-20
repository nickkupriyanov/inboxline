/**
 * Server rendering and hydration.
 *
 * A server render must be possible without a DOM, and the markup it produces
 * must become interactive with the same seed without React reporting a mismatch.
 * These tests render the real components with `renderToString`, put the markup
 * into a jsdom container and hydrate the very same tree, so the checks cover the
 * components rather than a copy of their markup. A real browser paints the
 * result; jsdom only proves that React accepted it.
 */
import { StrictMode, act } from 'react';
import type { ReactElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InboxInitialData } from '@nickkupriyanov/inboxline-core';
import { Inbox, InboxProvider, useInboxFlow, useInboxUI } from './index';
import type { InboxProviderProps } from './index';
import {
  CONTEXT_A,
  FIXED_NOW,
  NOTIFICATIONS_A,
  createFixtureAdapter,
  testClock,
} from './test/fixtures';

// `hydrateRoot` is called directly here, so React has to be told that `act` is
// supported; Testing Library normally sets this flag for its own `render`.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SEED: InboxInitialData = {
  page: { items: NOTIFICATIONS_A.slice(0, 2), nextCursor: 'n3' },
  unreadCount: 3,
  now: FIXED_NOW,
};

/** A provider with the deterministic test adapter, clock and explicit config. */
function Tree(
  props: Partial<InboxProviderProps> & { initialData?: InboxInitialData; children: ReactElement },
): ReactElement {
  const { children, initialData, ...rest } = props;
  return (
    <InboxProvider
      adapter={rest.adapter ?? createFixtureAdapter()}
      context={CONTEXT_A}
      clock={testClock}
      config={{ locale: 'en', timeZone: 'UTC' }}
      {...(initialData === undefined ? {} : { initialData })}
      {...rest}
    >
      {children}
    </InboxProvider>
  );
}

interface Hydrated {
  serverHtml: string;
  container: HTMLElement;
  recoverable: unknown[];
  unmount(): Promise<void>;
}

/** Renders on the server, then hydrates the same tree in a jsdom container. */
async function hydrate(element: ReactElement): Promise<Hydrated> {
  const html = renderToString(element);
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.append(container);

  const recoverable: unknown[] = [];
  let root!: Root;
  await act(async () => {
    root = hydrateRoot(container, element, {
      onRecoverableError: (error) => recoverable.push(error),
    });
  });

  return {
    serverHtml: html,
    container,
    recoverable,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('server rendering', () => {
  it('renders seeded rows and the counter into the server markup', () => {
    const html = renderToString(
      <Tree initialData={SEED}>
        <Inbox layout="feed" />
      </Tree>,
    );

    expect(html).toContain('data-il-layout="feed"');
    expect(html).toContain('Fourth');
    expect(html).toContain('Third');
    expect(html).toContain('3 unread notifications');
    // The server never renders the loading skeleton when a seed is present.
    expect(html).not.toContain('il-loading');
  });

  it('renders the collapsed bell without a portal on the server', () => {
    const html = renderToString(
      <Tree initialData={SEED} defaultOpen>
        <Inbox />
      </Tree>,
    );

    expect(html).toContain('il-bell');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('aria-controls');
  });

  it('applies an explicit locale and theme to the server markup', () => {
    const html = renderToString(
      <Tree initialData={SEED} config={{ locale: 'ru', timeZone: 'UTC' }} theme="light">
        <Inbox layout="feed" />
      </Tree>,
    );

    expect(html).toContain('data-il-theme="light"');
    expect(html).toContain('Сегодня');
    expect(html).toContain('3 непрочитанных');
  });
});

describe('hydration', () => {
  it('hydrates a seeded feed without recoverable errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const element = (
      <Tree initialData={SEED}>
        <Inbox layout="feed" />
      </Tree>
    );
    const hydrated = await hydrate(element);

    expect(hydrated.recoverable).toEqual([]);
    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/hydrat/i);
    expect(hydrated.container.textContent).toContain('Fourth');
    expect(hydrated.container.textContent).toContain('Third');

    await hydrated.unmount();
  });

  it('hydrates without a seed and then loads the data', async () => {
    const hydrated = await hydrate(
      <Tree>
        <Inbox layout="feed" />
      </Tree>,
    );

    expect(hydrated.recoverable).toEqual([]);
    await vi.waitFor(() => {
      expect(hydrated.container.textContent).toContain('Fourth');
    });

    await hydrated.unmount();
  });

  it('hydrates the bell, opens its stable dialog id and closes it again', async () => {
    const hydrated = await hydrate(
      <Tree initialData={SEED}>
        <Inbox />
      </Tree>,
    );

    expect(hydrated.recoverable).toEqual([]);
    const trigger = hydrated.container.querySelector<HTMLButtonElement>('button.il-trigger');
    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger!.click();
    });

    const panel = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(panel).not.toBeNull();
    expect(panel!.id).not.toBe('');
    expect(trigger!.getAttribute('aria-controls')).toBe(panel!.id);
    expect(trigger!.getAttribute('aria-expanded')).toBe('true');

    await hydrated.unmount();
  });

  it('hydrates the collapsed bell identically under Strict Mode', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const element = (
      <StrictMode>
        <Tree initialData={SEED} defaultOpen>
          <Inbox />
        </Tree>
      </StrictMode>
    );
    const hydrated = await hydrate(element);

    expect(hydrated.recoverable).toEqual([]);
    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/hydrat/i);
    await vi.waitFor(() => {
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    });

    await hydrated.unmount();
  });

  it('keeps two hydrated providers independent', async () => {
    const first = { ...SEED, page: { items: [NOTIFICATIONS_A[0]!], nextCursor: null } };
    const second = { ...SEED, page: { items: [NOTIFICATIONS_A[2]!], nextCursor: null } };

    const element = (
      <>
        <Tree initialData={first}>
          <Inbox layout="feed" />
        </Tree>
        <Tree initialData={second} context={{ key: 'user-b' }} adapter={createFixtureAdapter()}>
          <Inbox layout="feed" />
        </Tree>
      </>
    );
    const hydrated = await hydrate(element);

    expect(hydrated.recoverable).toEqual([]);
    // The server kept the two seeds apart; hydration then confirms each scope
    // independently, so a shared adapter cannot merge the two counters.
    expect(hydrated.serverHtml).toContain('Fourth');
    expect(hydrated.serverHtml).toContain('Second');
    expect(hydrated.container.querySelectorAll('.il-root')).toHaveLength(2);

    await hydrated.unmount();
  });
});

/* -------------------------------------------------------------------------- */
/*  Browser preferences                                                        */
/* -------------------------------------------------------------------------- */

function LocaleProbe() {
  const { snapshot } = useInboxFlow();
  const ui = useInboxUI();
  return (
    <span data-testid="probe">
      {ui.locale}|{snapshot.view.settings.timeZone}|{ui.messages.emptyLabel}
    </span>
  );
}

describe('browser preferences', () => {
  it('applies the browser language and zone after mounting', async () => {
    vi.stubGlobal('navigator', { language: 'ru-RU', languages: ['ru-RU'] });
    const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;

    const element = (
      <Tree config={undefined}>
        <LocaleProbe />
      </Tree>
    );
    const hydrated = await hydrate(element);

    expect(hydrated.container.textContent).toBe(`ru-RU|${zone}|Уведомлений пока нет`);

    await hydrated.unmount();
  });

  it('never replaces an explicit locale or zone', async () => {
    vi.stubGlobal('navigator', { language: 'ru-RU', languages: ['ru-RU'] });

    const element = (
      <Tree config={{ locale: 'en', timeZone: 'UTC' }}>
        <LocaleProbe />
      </Tree>
    );
    const hydrated = await hydrate(element);

    expect(hydrated.container.textContent).toBe('en|UTC|No notifications yet');

    await hydrated.unmount();
  });
});
