/**
 * Element size.
 *
 * `ResizeObserver` where it exists, a window resize listener where it does not,
 * and a plain measurement where there is no host at all. A binding uses this to
 * follow a panel whose height changes with its content.
 */

export interface ElementSize {
  /** Border-box width in CSS pixels; `0` when it cannot be read. */
  width: number;
  /** Border-box height in CSS pixels; `0` when it cannot be read. */
  height: number;
}

/** The border-box size of an element, or a zero size when it cannot be read. */
export function measureSize(element: Element | null | undefined): ElementSize {
  if (!element) return { width: 0, height: 0 };

  const rect = element.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

/** The border-box height of an element, or `0` when it cannot be read. */
export function measureHeight(element: Element | null | undefined): number {
  return measureSize(element).height;
}

/**
 * Reports an element's size now and whenever it changes. Returns the remover.
 *
 * Nothing is watched without a host (a server) or without an element: the
 * listener still receives one measurement, so the caller has a stable value to
 * render. With no `ResizeObserver` the window's own resize event is used, which
 * is what an inline widget actually follows in older browsers.
 */
export function observeSize(
  element: Element | null | undefined,
  listener: (size: ElementSize) => void,
): () => void {
  if (!element) {
    listener({ width: 0, height: 0 });
    return () => {};
  }

  const read = () => listener(measureSize(element));
  read();

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }

  if (typeof window === 'undefined') return () => {};

  window.addEventListener('resize', read);
  return () => window.removeEventListener('resize', read);
}
