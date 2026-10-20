/**
 * One notification row of the feed.
 *
 * The row has two independent controls and no third one: the activation button —
 * title, body, author and time — and the read/unread button next to it. They are
 * siblings, never nested, so pressing the read action with a keyboard can never
 * activate the notification, and a row without a click callback is plain text.
 *
 * The unread state is carried three ways, not one: the `data-il-unread`
 * attribute draws the surface, the marker draws the dot, and a visually hidden
 * “Unread” label makes the state part of the row's text for assistive technology.
 * A pending or lost read operation adds a text status; colour is never the only
 * signal.
 */
import { IL_CLASS } from '@nickkupriyanov/inboxline-core';
import type { InboxItemView, InboxMessages } from '@nickkupriyanov/inboxline-core';
import { NotificationAvatar } from './NotificationAvatar';
import { CheckIcon, UnreadDotIcon } from './icons';

export interface NotificationItemProps {
  item: InboxItemView;
  messages: InboxMessages;
  /** Whether the row's main surface is a button. */
  activatable: boolean;
  /** A bulk operation owns the context, so individual changes are refused. */
  readBlocked: boolean;
  onActivate(): void;
  onToggleRead(): void;
  registerActivate(element: HTMLButtonElement | null): void;
  registerRead(element: HTMLButtonElement | null): void;
}

/** One row, with the optional parts omitted rather than rendered empty. */
export function NotificationItem({
  item,
  messages,
  activatable,
  readBlocked,
  onActivate,
  onToggleRead,
  registerActivate,
  registerRead,
}: NotificationItemProps) {
  const actionLabel = item.read ? messages.markUnreadLabel : messages.markReadLabel;
  const readDisabled = readBlocked || item.pending || item.unknown;
  const status =
    item.actionError ??
    (item.pending ? messages.readPendingLabel : item.unknown ? messages.readUnknownLabel : null);
  const statusKind = item.actionError === null ? (item.unknown ? 'unknown' : 'pending') : 'error';

  const content = (
    <>
      <span className={IL_CLASS.itemTitle}>{item.title}</span>
      {item.body === null ? null : <span className={IL_CLASS.itemBody}>{item.body}</span>}

      <span className={IL_CLASS.itemMeta}>
        {item.author === null ? null : (
          <span className="il-visually-hidden">{item.author.name}</span>
        )}
        {item.unread ? (
          <span className="il-visually-hidden">{messages.unreadMarkerLabel}</span>
        ) : null}
        <span className={IL_CLASS.itemTime}>{item.timeLabel}</span>
      </span>
    </>
  );

  return (
    <li
      className={IL_CLASS.item}
      data-il-unread={item.unread ? 'true' : undefined}
      data-il-pending={item.pending ? 'true' : undefined}
      data-il-unknown={item.unknown ? 'true' : undefined}
      data-il-error={item.actionError === null ? undefined : 'true'}
    >
      <NotificationAvatar item={item} />

      <div className={IL_CLASS.itemContent}>
        {activatable ? (
          <button
            type="button"
            ref={registerActivate}
            className={IL_CLASS.itemActivate}
            aria-busy={item.pending ? 'true' : undefined}
            onClick={onActivate}
          >
            {content}
          </button>
        ) : (
          content
        )}

        {status === null ? null : (
          <span
            className={IL_CLASS.status}
            data-il-kind={statusKind}
            role={statusKind === 'error' ? 'alert' : 'status'}
          >
            {statusKind === 'pending' ? <span className="il-spinner" aria-hidden="true" /> : null}
            {status}
          </span>
        )}
      </div>

      <button
        type="button"
        ref={registerRead}
        className={IL_CLASS.itemAction}
        aria-label={`${actionLabel}: ${item.title}`}
        aria-busy={item.pending ? 'true' : undefined}
        aria-disabled={readDisabled ? 'true' : undefined}
        onClick={onToggleRead}
      >
        {item.read ? <UnreadDotIcon /> : <CheckIcon />}
      </button>

      <span className={IL_CLASS.itemUnreadMarker} aria-hidden="true" />
    </li>
  );
}
