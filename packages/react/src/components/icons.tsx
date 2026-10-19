/**
 * The small inline glyphs the ready-made parts need.
 *
 * They are drawn with `currentColor`, carry no text and are always rendered with
 * `aria-hidden` by the caller: the notification title and the accessible name of
 * its row carry the meaning.
 */
import type { JSX } from 'react';

/** A bell used when a notification has an icon URL that could not be loaded. */
export function BellIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M18 9a6 6 0 1 0-12 0c0 4.2-1.4 5.5-2 6.5h16c-.6-1-2-2.3-2-6.5Z" />
      <path d="M10 19a2.2 2.2 0 0 0 4 0" />
    </svg>
  );
}
