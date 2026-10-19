/**
 * The area a floating panel can use around an anchor.
 *
 * Coordinates are viewport-relative, exactly as `getBoundingClientRect()` and a
 * `position: fixed` panel use them. The module measures space; it does not decide
 * where the panel goes. Choosing a side, aligning an edge and flipping when the
 * preferred side does not fit remain the UI layer's decisions.
 *
 * Nothing touches `window` or `document` until a function is called, so importing
 * the module is safe on a server.
 */

/** The layout viewport, without scrollbars. */
export interface ViewportSize {
  width: number;
  height: number;
}

/** A viewport-relative anchor rectangle, derived from `getBoundingClientRect()`. */
export interface AnchorRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

/** Free space on each side of the anchor, with the margin already subtracted. */
export interface AvailableSpace {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface AvailableArea {
  /** The anchor's viewport-relative rectangle at the moment of measurement. */
  anchor: AnchorRect;
  /** The layout viewport at the moment of measurement. */
  viewport: ViewportSize;
  /** Space between the anchor and the viewport edge, never negative. */
  space: AvailableSpace;
  /** The margin that was subtracted from each side. */
  margin: number;
}

export interface AvailableAreaOptions {
  /**
   * Space kept between the anchor and the viewport edge, in CSS pixels.
   * Default: `8`. Negative or non-finite values fall back to the default.
   */
  margin?: number;
}

/** The default gap between an anchor and the viewport edge. */
export const DEFAULT_VIEWPORT_MARGIN = 8;

function resolveMargin(margin: number | undefined): number {
  if (margin === undefined || !Number.isFinite(margin) || margin < 0) {
    return DEFAULT_VIEWPORT_MARGIN;
  }
  return margin;
}

function readViewport(): ViewportSize | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  const root = document.documentElement;
  return {
    width: root?.clientWidth || window.innerWidth || 0,
    height: root?.clientHeight || window.innerHeight || 0,
  };
}

function nonNegative(value: number): number {
  return value > 0 ? value : 0;
}

function rectOf(anchor: Element): AnchorRect {
  const rect = anchor.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
  };
}

/**
 * Measures the anchor and the space around it inside the viewport. Returns `null`
 * when there is no viewport to measure against — a server, a test running in
 * Node — rather than inventing a screen.
 */
export function measureAvailableArea(
  anchor: Element | null | undefined,
  options: AvailableAreaOptions = {},
): AvailableArea | null {
  if (!anchor) return null;

  const viewport = readViewport();
  if (!viewport) return null;

  const margin = resolveMargin(options.margin);
  const rect = rectOf(anchor);

  return {
    anchor: rect,
    viewport,
    margin,
    space: {
      top: nonNegative(rect.top - margin),
      left: nonNegative(rect.left - margin),
      right: nonNegative(viewport.width - margin - rect.right),
      bottom: nonNegative(viewport.height - margin - rect.bottom),
    },
  };
}

function sameArea(left: AvailableArea, right: AvailableArea): boolean {
  return (
    left.margin === right.margin &&
    left.anchor.top === right.anchor.top &&
    left.anchor.left === right.anchor.left &&
    left.anchor.width === right.anchor.width &&
    left.anchor.height === right.anchor.height &&
    left.viewport.width === right.viewport.width &&
    left.viewport.height === right.viewport.height
  );
}

/**
 * Reports the available area now and whenever it can change: the page or a
 * nested container scrolls, the window resizes, or the anchor itself changes
 * size. Identical measurements are not reported twice, so a scroll that does not
 * move the anchor does not cause a render. Returns the remover.
 *
 * Without a host, the listener receives `null` once and nothing is watched.
 * Every subscription owns its listeners, so several anchors can be observed at
 * the same time and re-subscribing after `stop()` starts from a fresh
 * measurement.
 */
export function observeAvailableArea(
  anchor: Element | null | undefined,
  listener: (area: AvailableArea | null) => void,
  options: AvailableAreaOptions = {},
): () => void {
  if (!anchor || typeof window === 'undefined' || typeof document === 'undefined') {
    listener(null);
    return () => {};
  }

  let stopped = false;
  let last: AvailableArea | null = null;

  const update = () => {
    if (stopped) return;

    const area = measureAvailableArea(anchor, options);
    if (area === null) {
      if (last === null) return;
      last = null;
      listener(null);
      return;
    }
    if (last && sameArea(last, area)) return;

    last = area;
    listener(area);
  };

  update();

  // Capture sees a scroll of any ancestor, not only the window's own scroll.
  window.addEventListener('scroll', update, true);
  window.addEventListener('resize', update);

  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(update);
    observer.observe(anchor);
  }

  return () => {
    if (stopped) return;
    stopped = true;

    window.removeEventListener('scroll', update, true);
    window.removeEventListener('resize', update);
    observer?.disconnect();
    observer = null;
  };
}
