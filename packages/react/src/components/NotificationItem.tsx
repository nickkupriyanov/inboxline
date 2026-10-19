/**
 * One notification row of the feed.
 *
 * The row is a plain list item: Iteration 13 presents the data, while activation
 * and the read/unread controls arrive with the actions in Iteration 14. Nothing
 * inside it is interactive yet, so no nested control has to be guessed at.
 *
 * The unread state is carried three ways, not one: the `data-il-unread`
 * attribute draws the surface, the marker draws the dot, and a visually hidden
 * “Unread” label makes the state part of the row's text for assistive technology.
 */
import { IL_CLASS } from '@nickkupriyanov/inboxline-core';
import type { InboxItemView, InboxMessages } from '@nickkupriyanov/inboxline-core';
import { NotificationAvatar } from './NotificationAvatar';

export interface NotificationItemProps {
  item: InboxItemView;
  messages: InboxMessages;
}

/** One row, with the optional parts omitted rather than rendered empty. */
export function NotificationItem({ item, messages }: NotificationItemProps) {
  return (
    <li
      className={IL_CLASS.item}
      data-il-unread={item.unread ? 'true' : undefined}
      data-il-pending={item.pending ? 'true' : undefined}
      data-il-unknown={item.unknown ? 'true' : undefined}
    >
      <NotificationAvatar item={item} />

      <div className={IL_CLASS.itemContent}>
        <p className={IL_CLASS.itemTitle}>{item.title}</p>
        {item.body === null ? null : <p className={IL_CLASS.itemBody}>{item.body}</p>}

        <div className={IL_CLASS.itemMeta}>
          {item.author === null ? null : (
            <span className="il-visually-hidden">{item.author.name}</span>
          )}
          {item.unread ? (
            <span className="il-visually-hidden">{messages.unreadMarkerLabel}</span>
          ) : null}
          <span className={IL_CLASS.itemTime}>{item.timeLabel}</span>
        </div>
      </div>

      <span className={IL_CLASS.itemUnreadMarker} aria-hidden="true" />
    </li>
  );
}
