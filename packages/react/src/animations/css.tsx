/**
 * The default animation kit: no runtime, no dependencies.
 *
 * Every primitive is the plain element the widget would render anyway — the
 * movement itself is in the stylesheet (`animations.css` in the core), keyed on
 * the class hooks these components write. That is why the kit can be the default:
 * without the CSS the inbox renders and behaves exactly the same, it just does
 * not move, and `prefers-reduced-motion` is honoured by the stylesheet rather
 * than by a branch in here.
 */
import type { CSSProperties } from 'react';
import { cx } from '@nickkupriyanov/inboxline-core';
import type { AnimationKit, HeightProps, ItemProps } from '../types';
import { useAnimatedHeight } from '../hooks/useAnimatedHeight';

/** Rows past this one share the last delay, so a long feed does not crawl in. */
const MAX_STAGGER = 12;

/**
 * One notification row.
 *
 * This is the `<li>` of the list itself, not a wrapper around one: the prepared
 * slot props (the slot class, the state attributes and the consumer's override)
 * spread straight onto it, so the layout stays exactly what it would be without a
 * kit.
 */
function Item({ index, exiting, className, style, children, ...rest }: ItemProps) {
  return (
    <li
      {...rest}
      className={cx('il-row-animated', className)}
      data-il-animated="true"
      data-il-exiting={exiting ? 'true' : undefined}
      style={
        {
          ...style,
          '--il-index': Math.min(Math.max(index, 0), MAX_STAGGER),
        } as CSSProperties
      }
    >
      {children}
    </li>
  );
}

/**
 * A container that follows the height of what it holds.
 *
 * Core measures the content and says when a change is worth a transition; the
 * inline `height` (only while a change is in flight) and the inline duration are
 * this half. Once the height settles the inline height is dropped, so the box
 * goes back to sizing itself.
 */
function Height({ className, children }: HeightProps) {
  const { ref, height, animating, durationMs } = useAnimatedHeight();

  return (
    <div
      className={cx('il-height', className)}
      data-il-animating={animating ? 'true' : undefined}
      style={{
        ...(animating && height !== undefined ? { height } : null),
        transitionDuration: `${durationMs}ms`,
      }}
    >
      <div className="il-height-inner" ref={ref}>
        {children}
      </div>
    </div>
  );
}

/** The default kit, bound to the main `InboxProvider`. */
export const cssAnimations: AnimationKit = {
  Item,
  Height,
};
