/**
 * The surface shared by both ready-made compositions.
 *
 * The feed and the bell panel show the same data and offer the same actions, so
 * they are the same component with a different `data-il-layout`: the feed is a
 * page-level card, the popover is the same card in a portalled dialog. Keeping
 * one surface means a new filter, state or action cannot exist in one layout and
 * be missing in the other.
 *
 * The surface is presentation only: every date, group, counter and availability
 * flag comes from `snapshot.view`, and every request goes through `actions` or
 * the controlled `setFilter`. Its sections are the replaceable parts from
 * `InboxComponents`; each part receives prepared slot props so the library keeps
 * focus, handlers and the accessibility contract even after a replacement.
 */
import { useCallback, useEffect, useId, useRef } from 'react';
import type { ComponentPropsWithRef, CSSProperties, JSX, ReactNode, Ref } from 'react';
import type { InboxFilter, InboxItemView, InboxLayout } from '@nickkupriyanov/inboxline-core';
import {
  useAnimations,
  useClassNames,
  useInboxComponents,
  useInboxFlow,
  useInboxUI,
} from '../context';
import { useExitingRows } from '../hooks/useExitingRows';
import type { AvatarPartProps, FilterOption, SlotProps } from '../parts';
import { CloseIcon } from './icons';

/** One row to render: a live row, or one that is only still mounted for its exit. */
interface RenderedRow<TData> {
  item: InboxItemView<TData>;
  leaving: boolean;
}

/** A day group of rendered rows, including a group that emptied out. */
interface RenderedGroup<TData> {
  key: string;
  label: string;
  items: RenderedRow<TData>[];
}

/** Where focus goes after the row the visitor used has left the unread selection. */
interface FocusRequest {
  /** The row to focus, or `null` to return to the unread filter. */
  id: string | null;
  control: 'activate' | 'read';
  /** The control that is about to disappear; focus moves only if it still owns it. */
  removed: HTMLElement | null;
}

export interface InboxSurfaceProps {
  layout: InboxLayout;
  /** Stable id of the root, used by the trigger's `aria-controls` when portalled. */
  id?: string;
  /** Lets the bell focus the dialog and keep it measured. */
  rootRef?: Ref<HTMLElement>;
  /** Inline fixed-position coordinates of the portalled panel. */
  style?: CSSProperties;
  /** Which side of the trigger the panel occupies. */
  side?: 'top' | 'bottom';
  /** The panel is only still mounted for its exit; it is inert and `aria-hidden`. */
  closing?: boolean;
  /** The length of the panel's exit, written as `--il-exit-duration`. */
  exitDurationMs?: number;
  /** Renders the panel's close action when supplied. */
  onClose?: () => void;
}

/** One complete notification surface. */
export function InboxSurface({
  layout,
  id,
  rootRef,
  style,
  side,
  closing = false,
  exitDurationMs: panelExitDurationMs,
  onClose,
}: InboxSurfaceProps): JSX.Element {
  const { snapshot, actions } = useInboxFlow();
  const ui = useInboxUI();
  const cls = useClassNames();
  const { Height } = useAnimations();
  const {
    Avatar,
    Empty,
    Error: ErrorState,
    Filters,
    Header,
    Loading,
    NotificationItem,
    PageError,
  } = useInboxComponents();
  const view = snapshot.view;
  const loadingFirstPage = view.list.loading && view.list.items.length === 0;
  const headingId = useId();
  const panel = layout === 'popover';

  // The root is also the element the panel marks inert while it leaves. The ref
  // callback keeps the bell's own ref working, and the effect sets the DOM
  // property rather than relying on a React version that knows the attribute.
  const rootElementRef = useRef<HTMLElement | null>(null);
  const assignRootRef = useCallback(
    (element: HTMLElement | null) => {
      rootElementRef.current = element;
      if (typeof rootRef === 'function') rootRef(element);
      else if (rootRef !== null && rootRef !== undefined) {
        (rootRef as { current: HTMLElement | null }).current = element;
      }
    },
    [rootRef],
  );

  useEffect(() => {
    const element = rootElementRef.current;
    if (element === null) return;
    element.inert = panel && closing;
    // The property is the behaviour; the attribute keeps it observable in hosts
    // that do not implement `inert` as a reflected property (including jsdom).
    if (panel && closing) element.setAttribute('inert', '');
    else element.removeAttribute('inert');
  }, [panel, closing]);

  // Rows leave only when the visitor asked for a single read: a filter change,
  // a page replacement or “mark all as read” must not play a cascade.
  const { exiting, markLeaving, exitDurationMs } = useExitingRows<InboxItemView>(
    `${view.settings.filter}\u0000${view.settings.contextKey}`,
  );

  const activateRefs = useRef(new Map<string, HTMLButtonElement>());
  const readRefs = useRef(new Map<string, HTMLButtonElement>());
  const filterRefs = useRef(new Map<InboxFilter, HTMLButtonElement>());
  const focusRequestRef = useRef<FocusRequest | null>(null);

  const bulkActive = view.actions.bulkStatus !== 'idle';
  const showMarkAllRead =
    bulkActive ||
    view.actions.bulkError !== null ||
    (view.counter.known && (view.counter.unreadCount ?? 0) > 0);

  /**
   * Moves focus after the visitor's action removes the row from the unread
   * selection: to the same control of the next row, then the previous one, and
   * finally to the filter that owns the empty selection.
   *
   * The row controls register their refs through the prepared props, so a
   * replaced `NotificationItem` keeps this behaviour as long as it spreads
   * `activateProps` and `readProps`.
   */
  useEffect(() => {
    const request = focusRequestRef.current;
    if (request === null) return;
    focusRequestRef.current = null;

    const active = document.activeElement;
    if (active !== null && active !== document.body && active !== request.removed) return;

    if (request.id !== null) {
      const target =
        request.control === 'activate'
          ? (activateRefs.current.get(request.id) ?? readRefs.current.get(request.id))
          : readRefs.current.get(request.id);
      if (target !== undefined) {
        target.focus();
        return;
      }
    }

    filterRefs.current.get('unread')?.focus();
  }, [view.list.items]);

  function requestFocus(item: InboxItemView, control: FocusRequest['control']): void {
    if (view.settings.filter !== 'unread') return;
    const index = view.list.items.findIndex((candidate) => candidate.id === item.id);
    if (index === -1) return;
    const next = view.list.items[index + 1] ?? view.list.items[index - 1] ?? null;
    focusRequestRef.current = {
      id: next?.id ?? null,
      control,
      removed:
        (control === 'activate'
          ? activateRefs.current.get(item.id)
          : readRefs.current.get(item.id)) ??
        readRefs.current.get(item.id) ??
        null,
    };
  }

  /**
   * Keeps the row on screen for its exit. Only the unread selection drops a row
   * on a single read, so only there is there something to animate.
   */
  function holdForExit(item: InboxItemView): void {
    if (view.settings.filter !== 'unread') return;
    const group = view.list.groups.find((candidate) =>
      candidate.items.some((row) => row.id === item.id),
    );
    if (group === undefined) return;
    markLeaving({
      item,
      groupKey: group.key,
      groupLabel: group.label,
      groupIndex: group.items.findIndex((row) => row.id === item.id),
    });
  }

  function handleActivate(item: InboxItemView): void {
    const marksRead =
      !bulkActive && ui.markReadOnOpen && item.unread && !item.pending && !item.unknown;
    if (marksRead) {
      requestFocus(item, 'activate');
      holdForExit(item);
      // Navigation and the read request are independent: the click callback is
      // called immediately and never waits for the server.
      void actions.setRead(item.id, true);
    }

    if (ui.onNotificationClick === undefined) return;
    try {
      ui.onNotificationClick(item.notification);
    } catch {
      // The application's callback is contained: the read request has already
      // left, and a broken navigation handler must not turn it into a failure.
    }
  }

  function handleToggleRead(item: InboxItemView): void {
    if (bulkActive || item.pending || item.unknown) return;
    const read = !item.read;
    if (read) {
      requestFocus(item, 'read');
      holdForExit(item);
    }
    void actions.setRead(item.id, read);
  }

  function handleMarkAllRead(): void {
    if (!view.actions.canMarkAllRead) return;
    void actions.markAllRead();
  }

  function registerActivate(id: string, element: HTMLButtonElement | null): void {
    if (element === null) activateRefs.current.delete(id);
    else activateRefs.current.set(id, element);
  }

  function registerRead(id: string, element: HTMLButtonElement | null): void {
    if (element === null) readRefs.current.delete(id);
    else readRefs.current.set(id, element);
  }

  function registerFilter(filter: InboxFilter, element: HTMLButtonElement | null): void {
    if (element === null) filterRefs.current.delete(filter);
    else filterRefs.current.set(filter, element);
  }

  const filterOptions: readonly FilterOption[] = [
    {
      value: 'all',
      label: ui.messages.filterAllLabel,
      selected: view.settings.filter === 'all',
      props: {
        type: 'button',
        ref: (element) => registerFilter('all', element),
        className: cls('filter'),
        'aria-pressed': view.settings.filter === 'all',
        onClick: () => ui.setFilter('all'),
      },
    },
    {
      value: 'unread',
      label: ui.messages.filterUnreadLabel,
      selected: view.settings.filter === 'unread',
      props: {
        type: 'button',
        ref: (element) => registerFilter('unread', element),
        className: cls('filter'),
        'aria-pressed': view.settings.filter === 'unread',
        onClick: () => ui.setFilter('unread'),
      },
    },
  ];

  const filters = (
    <Filters
      label={ui.messages.filtersLabel}
      options={filterOptions}
      slotProps={{
        className: cls('filters'),
        role: 'group',
        'aria-label': ui.messages.filtersLabel,
      }}
    />
  );

  const close =
    panel && onClose !== undefined ? (
      <button
        type="button"
        className={cls('panelClose')}
        aria-label={ui.messages.closeLabel}
        onClick={onClose}
      >
        <CloseIcon />
      </button>
    ) : null;

  function avatarProps(kind: AvatarPartProps['kind']): SlotProps<ComponentPropsWithRef<'span'>> {
    if (kind === 'none') return {};
    return {
      className: cls(kind === 'avatar' ? 'itemAvatar' : 'itemIcon'),
      'aria-hidden': 'true',
    };
  }

  function statusOf(item: InboxItemView): ReactNode {
    const text =
      item.actionError ??
      (item.pending
        ? ui.messages.readPendingLabel
        : item.unknown
          ? ui.messages.readUnknownLabel
          : null);
    if (text === null) return null;

    const kind = item.actionError === null ? (item.unknown ? 'unknown' : 'pending') : 'error';
    return (
      <span
        className={cls('status')}
        data-il-kind={kind}
        role={kind === 'error' ? 'alert' : 'status'}
      >
        {kind === 'pending' ? <span className="il-spinner" aria-hidden="true" /> : null}
        {text}
      </span>
    );
  }

  const bulkStatusText =
    view.actions.bulkStatus === 'unknown' ? ui.messages.bulkUnknownLabel : view.actions.bulkError;
  const bulkStatusKind = view.actions.bulkStatus === 'unknown' ? 'unknown' : 'error';

  // The rendered list is the live one plus the rows on their way out, put back
  // where they stood. A row that came back — a refused or rolled-back read — is
  // live again, so its ghost is skipped rather than duplicated.
  const visibleIds = new Set(view.list.items.map((item) => item.id));
  const renderedGroups: RenderedGroup<unknown>[] = view.list.groups.map((group) => ({
    key: group.key,
    label: group.label,
    items: group.items.map((item) => ({ item, leaving: false })),
  }));
  for (const ghost of exiting) {
    if (visibleIds.has(ghost.item.id)) continue;

    let group = renderedGroups.find((candidate) => candidate.key === ghost.groupKey);
    if (group === undefined) {
      group = { key: ghost.groupKey, label: ghost.groupLabel, items: [] };
      // Day keys sort newest first, which is the order the groups are rendered in.
      const at = renderedGroups.findIndex((candidate) => candidate.key < ghost.groupKey);
      if (at === -1) renderedGroups.push(group);
      else renderedGroups.splice(at, 0, group);
    }
    group.items.splice(Math.min(ghost.groupIndex, group.items.length), 0, {
      item: ghost.item,
      leaving: true,
    });
  }
  const hasRenderedRows = renderedGroups.some((group) => group.items.length > 0);
  let rowIndex = 0;

  return (
    <section
      id={id}
      ref={assignRootRef}
      className={cls('root', ui.className, panel && cls('panel'))}
      data-il-layout={layout}
      data-il-theme={ui.theme}
      data-il-filter={view.settings.filter}
      data-il-side={panel ? side : undefined}
      data-il-closing={panel && closing ? 'true' : undefined}
      role={panel ? 'dialog' : undefined}
      aria-labelledby={panel ? headingId : undefined}
      aria-hidden={panel && closing ? 'true' : undefined}
      tabIndex={panel && !closing ? -1 : undefined}
      style={
        panelExitDurationMs === undefined
          ? style
          : ({
              ...style,
              '--il-exit-duration': `${panelExitDurationMs}ms`,
            } as CSSProperties)
      }
    >
      <Height>
        <Header
          title={ui.messages.listLabel}
          headingId={headingId}
          slotProps={{ className: cls('header') }}
          headingProps={{ id: headingId, className: cls('heading') }}
          filters={filters}
          close={close}
        />

        {!showMarkAllRead ? null : (
          <div className={cls('actions')}>
            {bulkStatusText === null ? null : (
              <span
                className={cls('status')}
                data-il-kind={bulkStatusKind}
                role={bulkStatusKind === 'error' ? 'alert' : 'status'}
              >
                {bulkStatusText}
              </span>
            )}
            <button
              type="button"
              className={cls('markAllRead')}
              aria-disabled={view.actions.canMarkAllRead ? undefined : 'true'}
              aria-busy={view.actions.bulkStatus === 'pending' ? 'true' : undefined}
              onClick={handleMarkAllRead}
            >
              {view.actions.bulkStatus === 'pending' ? (
                <span className="il-spinner" aria-hidden="true" />
              ) : null}
              {view.actions.bulkStatus === 'pending'
                ? ui.messages.bulkPendingLabel
                : ui.messages.markAllReadLabel}
            </button>
          </div>
        )}

        {view.updates.available ? (
          <button
            type="button"
            className={cls('updates')}
            onClick={() => void actions.showUpdates()}
          >
            {view.updates.label}
          </button>
        ) : null}

        {view.list.error === null ? null : (
          <ErrorState
            message={view.list.error}
            retryLabel={ui.messages.retryLabel}
            onRetry={() => void actions.retry()}
            slotProps={{ className: cls('error'), role: 'alert' }}
          />
        )}

        {loadingFirstPage ? (
          <Loading
            label={view.list.loadingLabel}
            slotProps={{ className: cls('loading'), role: 'status' }}
          />
        ) : null}

        {!loadingFirstPage && hasRenderedRows ? (
          <ul
            className={cls('list')}
            aria-label={view.list.label}
            data-il-status={view.list.status}
            data-il-empty={view.list.empty ? 'true' : undefined}
          >
            {renderedGroups.map((group) => (
              <li className={cls('group')} key={group.key}>
                <p className={cls('groupLabel')}>{group.label}</p>
                <ul className="il-group-list">
                  {group.items.map(({ item, leaving }) => {
                    const index = rowIndex;
                    rowIndex += 1;
                    const activatable =
                      !leaving &&
                      (ui.onNotificationClick !== undefined ||
                        (!bulkActive &&
                          ui.markReadOnOpen &&
                          item.unread &&
                          !item.pending &&
                          !item.unknown));
                    const actionLabel = item.read
                      ? ui.messages.markUnreadLabel
                      : ui.messages.markReadLabel;
                    const avatarKind: AvatarPartProps['kind'] = item.author
                      ? 'avatar'
                      : item.icon === null
                        ? 'none'
                        : 'icon';

                    return (
                      <NotificationItem
                        key={item.id}
                        item={item}
                        messages={ui.messages}
                        index={index}
                        exiting={leaving}
                        activatable={activatable}
                        slotProps={{
                          className: cls('item'),
                          'data-il-unread': item.unread ? 'true' : undefined,
                          'data-il-pending': item.pending ? 'true' : undefined,
                          'data-il-unknown': item.unknown ? 'true' : undefined,
                          'data-il-error': item.actionError === null ? undefined : 'true',
                          ...(leaving
                            ? {
                                'data-il-exiting': 'true',
                                'aria-hidden': 'true',
                                style: {
                                  '--il-exit-duration': `${exitDurationMs}ms`,
                                } as CSSProperties,
                              }
                            : null),
                        }}
                        activateProps={{
                          type: 'button',
                          ...(leaving
                            ? { tabIndex: -1, 'aria-disabled': 'true' }
                            : {
                                ref: (element) => registerActivate(item.id, element),
                                onClick: () => handleActivate(item),
                              }),
                          className: cls('itemActivate'),
                          'aria-busy': item.pending ? 'true' : undefined,
                        }}
                        readProps={{
                          type: 'button',
                          ...(leaving
                            ? { tabIndex: -1 }
                            : {
                                ref: (element) => registerRead(item.id, element),
                                onClick: () => handleToggleRead(item),
                              }),
                          className: cls('itemAction'),
                          'aria-label': `${actionLabel}: ${item.title}`,
                          'aria-busy': item.pending ? 'true' : undefined,
                          'aria-disabled':
                            leaving || bulkActive || item.pending || item.unknown
                              ? 'true'
                              : undefined,
                        }}
                        avatar={
                          <Avatar
                            item={item}
                            kind={avatarKind}
                            slotProps={avatarProps(avatarKind)}
                          />
                        }
                        status={statusOf(item)}
                      />
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        ) : null}

        {!loadingFirstPage && !hasRenderedRows && view.list.empty ? (
          <Empty label={view.list.emptyLabel} slotProps={{ className: cls('empty') }} />
        ) : null}

        {view.page.error === null ? null : (
          <PageError
            message={view.page.error}
            retryLabel={view.page.retryLabel}
            onRetry={() => void actions.retry()}
            slotProps={{ className: cls('pageError'), role: 'alert' }}
          />
        )}

        {view.page.hasMore && view.page.error === null ? (
          <button
            type="button"
            className={cls('loadMore')}
            disabled={!view.page.canLoadMore}
            aria-busy={view.page.loading ? 'true' : undefined}
            onClick={() => void actions.loadMore()}
          >
            {view.page.loading ? <span className="il-spinner" aria-hidden="true" /> : null}
            {view.page.label}
          </button>
        ) : null}

        <p className={cls('live')} aria-live="polite" aria-atomic="true">
          {view.live.message}
        </p>
      </Height>
    </section>
  );
}
