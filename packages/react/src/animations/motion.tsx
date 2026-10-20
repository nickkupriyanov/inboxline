/**
 * The Motion kit: the same two primitives, driven by springs.
 *
 * This module is the only place in the package that imports `motion` — the main
 * entry point never reaches it, and `motion` stays an optional peer. Use it
 * through `@nickkupriyanov/inboxline-react/motion`, or by passing
 * `motionAnimations` to `<InboxProvider animations={…} />` if `motion` is already
 * in the application.
 */
import type { CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cx } from '@nickkupriyanov/inboxline-core';
import { useAnimatedHeight } from '../hooks/useAnimatedHeight';
import type { AnimationKit, HeightProps, ItemProps } from '../types';

/** The spring behind the entering rows: quick, no overshoot, no bounce. */
const SPRING = { type: 'spring', stiffness: 320, damping: 30 } as const;

/** The exit is a collapse, not a spring: it must finish within the exit window. */
const EXIT = { duration: 0.24, ease: [0.22, 1, 0.36, 1] } as const;

/** Rows past this one share the last delay, so a long feed does not crawl in. */
const MAX_STAGGER = 12;

/**
 * The event props Motion owns on the element it renders, with signatures of its
 * own — the drag gesture and the animation lifecycle. The surface passes none of
 * them, so they are dropped rather than handed to Motion to reinterpret.
 */
function withoutMotionOwnedEvents({
  index,
  exiting,
  onDrag,
  onDragStart,
  onDragEnd,
  onAnimationStart,
  onAnimationEnd,
  onAnimationIteration,
  ...rest
}: ItemProps) {
  return rest;
}

/**
 * One notification row.
 *
 * It is still the `<li>` of the list: the prepared slot props spread straight
 * onto Motion's list item, so the layout and the accessibility attributes are the
 * library's. `data-il-motion='true'` is what tells the stylesheet to leave the
 * keyframes to Motion. A leaving row fades and collapses itself; the surface
 * unmounts it when the same exit window closes.
 */
function Item(props: ItemProps) {
  const { index, exiting, className, style, children } = props;
  const reduced = useReducedMotion();
  const delay = Math.min(Math.max(index, 0), MAX_STAGGER) * 0.04;

  return (
    <motion.li
      {...withoutMotionOwnedEvents(props)}
      className={cx('il-row-animated', className)}
      data-il-motion="true"
      data-il-exiting={exiting ? 'true' : undefined}
      style={
        {
          ...style,
          '--il-index': Math.min(Math.max(index, 0), MAX_STAGGER),
          ...(exiting ? { overflow: 'hidden' } : null),
        } as CSSProperties
      }
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={
        exiting
          ? {
              opacity: 0,
              height: 0,
              marginTop: 0,
              marginBottom: 0,
              paddingTop: 0,
              paddingBottom: 0,
            }
          : { opacity: 1, y: 0, height: 'auto' }
      }
      transition={
        exiting
          ? reduced
            ? { duration: 0 }
            : EXIT
          : reduced
            ? { duration: 0 }
            : { ...SPRING, delay }
      }
    >
      {children}
    </motion.li>
  );
}

/**
 * The height, animated by the same measurement the CSS kit uses.
 *
 * The difference is only in who carries it out: Motion springs the height while
 * it is known and lets it fall back to `auto` once it has settled.
 */
function Height({ className, children }: HeightProps) {
  const { ref, height, animating, durationMs } = useAnimatedHeight();
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={cx('il-height', className)}
      data-il-motion="true"
      data-il-animating={animating ? 'true' : undefined}
      initial={false}
      animate={{ height: animating && height !== undefined ? height : 'auto' }}
      transition={
        reduced ? { duration: 0 } : { type: 'spring', bounce: 0, duration: durationMs / 1000 }
      }
    >
      <div className="il-height-inner" ref={ref}>
        {children}
      </div>
    </motion.div>
  );
}

/** The spring kit, bound to the `InboxProvider` of the `/motion` entry point. */
export const motionAnimations: AnimationKit = {
  Item,
  Height,
};
