/**
 * The leading tile of a notification row.
 *
 * An author with an avatar URL gets a round image, and a missing or broken image
 * falls back to the author's initials. Without an author, the notification's own
 * icon is used; a broken icon falls back to the bell glyph. A row with neither
 * renders no tile at all, and the text column simply starts the grid.
 *
 * The tile is decorative: the author name and the notification title are already
 * part of the row's text. That is why every image has an empty `alt` and the
 * wrapper is hidden from assistive technology.
 */
import { useState } from 'react';
import { IL_CLASS } from '@nickkupriyanov/inboxline-core';
import type { InboxItemView } from '@nickkupriyanov/inboxline-core';
import { BellIcon } from './icons';

/** At most two initials, taken from the first letters of the words of a name. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('');
  return initials.toLocaleUpperCase();
}

export interface NotificationAvatarProps {
  item: InboxItemView;
}

/** The avatar, the notification icon or their fallback. */
export function NotificationAvatar({ item }: NotificationAvatarProps) {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const [failedIconUrl, setFailedIconUrl] = useState<string | null>(null);

  const avatarUrl = item.author?.avatarUrl;
  if (avatarUrl !== undefined && failedAvatarUrl !== avatarUrl) {
    return (
      <span className={IL_CLASS.itemAvatar} aria-hidden="true">
        <img
          src={avatarUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedAvatarUrl(avatarUrl)}
        />
      </span>
    );
  }

  if (item.author) {
    return (
      <span className={IL_CLASS.itemAvatar} aria-hidden="true">
        {initialsOf(item.author.name)}
      </span>
    );
  }

  if (item.icon !== null) {
    const iconUrl = item.icon;
    return (
      <span className={IL_CLASS.itemIcon} aria-hidden="true">
        {failedIconUrl === iconUrl ? (
          <BellIcon />
        ) : (
          <img
            src={iconUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailedIconUrl(iconUrl)}
          />
        )}
      </span>
    );
  }

  return null;
}
