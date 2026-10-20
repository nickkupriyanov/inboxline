/**
 * The default leading tile of a notification row.
 *
 * An author with an avatar URL gets a round image, and a missing or broken image
 * falls back to the author's initials. Without an author, the notification's own
 * icon is used; a broken icon falls back to the bell glyph. The surface decides
 * which `kind` applies and passes the prepared tile props; a row with neither
 * author nor icon gets `kind="none"`, for which the default renders nothing.
 *
 * The tile is decorative: the author name and the notification title are already
 * part of the row's text. That is why every image has an empty `alt`, and the
 * wrapper's `aria-hidden` arrives in `slotProps`.
 */
import { useState } from 'react';
import type { JSX } from 'react';
import type { AvatarPartProps } from '../parts';
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

/** The avatar, the notification icon or nothing. */
export function NotificationAvatar({ item, kind, slotProps }: AvatarPartProps): JSX.Element | null {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const [failedIconUrl, setFailedIconUrl] = useState<string | null>(null);

  if (kind === 'avatar') {
    const avatarUrl = item.author?.avatarUrl;
    if (avatarUrl !== undefined && failedAvatarUrl !== avatarUrl) {
      return (
        <span {...slotProps}>
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
      return <span {...slotProps}>{initialsOf(item.author.name)}</span>;
    }

    return null;
  }

  if (kind === 'icon' && item.icon !== null) {
    const iconUrl = item.icon;
    return (
      <span {...slotProps}>
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
