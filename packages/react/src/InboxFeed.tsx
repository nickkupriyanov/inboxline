/**
 * The standalone feed composition.
 *
 * It is only the shared surface with `data-il-layout="feed"`; all behaviour and
 * every label come from the core through the provider.
 */
import type { JSX } from 'react';
import { InboxSurface } from './components/InboxSurface';

/** The feed layout: a page-level card that grows with its rows. */
export function InboxFeed(): JSX.Element {
  return <InboxSurface layout="feed" />;
}
