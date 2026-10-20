/**
 * The measurement behind the `Height` primitive of every kit.
 *
 * Core decides what the new height is and when it is worth animating
 * (`observeAnimatedHeight`); this hook only holds the answer and hands it to the
 * kit, which is the half that owns the style. The duration is returned too, so
 * the transition the binding writes and the moment core stops clipping can never
 * drift apart.
 *
 * The hook is deliberately internal: a consumer changes the height animation by
 * replacing the animation kit, never by re-measuring here.
 */
import { useEffect, useState } from 'react';
import { REDUCED_MOTION_QUERY, observeAnimatedHeight } from '@nickkupriyanov/inboxline-core/dom';
import { useMediaQuery } from './useMediaQuery';

/** How long the height transition runs, in milliseconds. Mirrors `--il-duration`. */
export const ANIMATED_HEIGHT_DURATION = 240;

export interface AnimatedHeight {
  /** Goes on the element whose height is the one to follow — the content. */
  ref: (element: HTMLElement | null) => void;
  /** The height in flight, or `undefined` when there is nothing to render. */
  height: number | undefined;
  /** `true` while the height is changing: the moment the kit clips content. */
  animating: boolean;
  /** The length of the transition, in milliseconds. */
  durationMs: number;
}

/**
 * Follows the height of whatever `ref` is attached to.
 *
 * Under `prefers-reduced-motion: reduce` nothing is measured at all: the content
 * simply takes its natural height, which is what "no animation" has to mean.
 */
export function useAnimatedHeight(durationMs: number = ANIMATED_HEIGHT_DURATION): AnimatedHeight {
  const reduced = useMediaQuery(REDUCED_MOTION_QUERY);
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [state, setState] = useState<{ height: number | undefined; animating: boolean }>({
    height: undefined,
    animating: false,
  });

  useEffect(() => {
    if (element === null) return;
    return observeAnimatedHeight(element, {
      durationMs,
      disabled: reduced,
      onChange: setState,
    });
  }, [element, durationMs, reduced]);

  return { ref: setElement, height: state.height, animating: state.animating, durationMs };
}
