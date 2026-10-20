/**
 * The ready-made widget.
 *
 * `layout="popover"` is the default: a bell trigger with the shared unread badge
 * and a non-modal panel. `layout="feed"` is the standalone, page-level list. Both
 * are the same surface fed by one provider controller, so a custom UI, the bell
 * and the feed can never disagree about a counter, a row or an action.
 *
 * ```tsx
 * <InboxProvider adapter={adapter}>
 *   <Inbox />                 {/* bell + panel *\/}
 *   <Inbox layout="feed" />   {/* the same counter and rows *\/}
 * </InboxProvider>
 * ```
 *
 * The binding does not add a second data layer here: opening the panel, focus,
 * the portal and the placement are UI decisions, while every request and label
 * comes from the core snapshot.
 */
import type { JSX } from 'react';
import type { InboxLayout } from '@nickkupriyanov/inboxline-core';
import { InboxBell } from './InboxBell';
import { InboxFeed } from './InboxFeed';

/** Everything the ready-made widget accepts. */
export interface InboxProps {
  /**
   * The composition to render. Default: `'popover'` — the bell and its panel.
   * `'feed'` renders the standalone list and does not open a panel.
   */
  layout?: InboxLayout;
}

/** The ready-made notification widget. */
export function Inbox({ layout = 'popover' }: InboxProps): JSX.Element {
  return layout === 'feed' ? <InboxFeed /> : <InboxBell />;
}
