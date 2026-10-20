/**
 * A media query, as React state.
 *
 * The value the environment has *before* the first render is unknown — on the
 * server and in a test there is no `matchMedia` at all — so it starts at `false`
 * and the effect reports the real setting right after mounting. That keeps the
 * first paint deterministic and still lets the widget react while it is open
 * (the visitor can turn animations off without reloading).
 */
import { useEffect, useState } from 'react';
import { observeMediaQuery } from '@nickkupriyanov/inboxline-core/dom';

/** Whether the host currently matches `query`; never throws where there is no host. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => observeMediaQuery(query, setMatches), [query]);

  return matches;
}
