/**
 * The default notification row.
 *
 * The row has two independent controls and no third one: the activation button
 * (`activateProps`) — title, body, author and time — and the read/unread button
 * (`readProps`) next to it. They are siblings, never nested, so pressing the
 * read action with a keyboard can never activate the notification, and a row
 * without an activation button is plain text.
 *
 * Everything behavioural arrives prepared. The part draws the content, places
 * the ready avatar and status line, and spreads the row's own props, which carry
 * the unread state, the operation state and the consumer's class overrides.
 *
 * The unread state is carried three ways, not one: the `data-il-unread`
 * attribute draws the surface, the marker draws the dot, and a visually hidden
 * “Unread” label makes the state part of the row's text for assistive technology.
 * A pending or lost read operation adds a text status; colour is never the only
 * signal.
 */
import type { JSX } from 'react';
import { useClassNames } from '../context';
import type { NotificationItemPartProps } from '../parts';
import { CheckIcon, UnreadDotIcon } from './icons';

/** One row, with the optional parts omitted rather than rendered empty. */
export function NotificationItem<TData = unknown>({
  item,
  messages,
  activatable,
  slotProps,
  activateProps,
  readProps,
  avatar,
  status,
}: NotificationItemPartProps<TData>): JSX.Element {
  const cls = useClassNames();

  const content = (
    <>
      <span className={cls('itemTitle')}>{item.title}</span>
      {item.body === null ? null : <span className={cls('itemBody')}>{item.body}</span>}

      <span className={cls('itemMeta')}>
        {item.author === null ? null : (
          <span className="il-visually-hidden">{item.author.name}</span>
        )}
        {item.unread ? (
          <span className="il-visually-hidden">{messages.unreadMarkerLabel}</span>
        ) : null}
        <span className={cls('itemTime')}>{item.timeLabel}</span>
      </span>
    </>
  );

  return (
    <li {...slotProps}>
      {avatar}

      <div className={cls('itemContent')}>
        {activatable ? <button {...activateProps}>{content}</button> : content}
        {status}
      </div>

      <button {...readProps}>{item.read ? <UnreadDotIcon /> : <CheckIcon />}</button>

      <span className={cls('itemUnreadMarker')} aria-hidden="true" />
    </li>
  );
}
