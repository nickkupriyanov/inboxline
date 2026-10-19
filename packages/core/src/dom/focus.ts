/**
 * Keyboard focus.
 *
 * The bell panel is a non-modal dialog: the rest of the page stays reachable, so
 * there is deliberately no focus trap here. These helpers answer the two
 * questions a binding asks around opening and closing such a panel — which
 * control should take focus now, and where should focus return afterwards.
 *
 * Nothing touches `document` until a function is called, so importing the
 * module is safe on a server.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * The elements inside `container` that can take focus right now, in document
 * order. A candidate either has a layout box, is the focused element, or
 * declares a non-negative tab index — the last part keeps test environments and
 * styled custom controls, which have no layout box, usable.
 */
export function focusableWithin(container: HTMLElement): HTMLElement[] {
  const activeElement = typeof document === 'undefined' ? null : document.activeElement;

  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      element.offsetParent !== null || element === activeElement || element.tabIndex >= 0,
  );
}

/**
 * Focuses the first focusable element inside `container`, or the container
 * itself when it is focusable and nothing inside is. Returns the element that
 * received focus, or `null` when there was nowhere to put it.
 *
 * Scrolling is suppressed: the panel is already inside the viewport when this is
 * called, and opening it must not move the page underneath.
 */
export function focusFirstWithin(container: HTMLElement): HTMLElement | null {
  const fallback =
    container.tabIndex >= 0 ||
    (typeof container.hasAttribute === 'function' && container.hasAttribute('tabindex'))
      ? container
      : null;
  const target = focusableWithin(container)[0] ?? fallback;
  if (!target) return null;

  target.focus({ preventScroll: true });
  return typeof document !== 'undefined' && document.activeElement === target ? target : null;
}

/**
 * Remembers the element that has focus right now so it can be restored when the
 * panel closes. Returns `null` when there is no document or focus rests on the
 * document itself.
 */
export function captureFocus(): HTMLElement | null {
  if (typeof document === 'undefined') return null;

  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) return null;
  if (activeElement === document.body || activeElement === document.documentElement) return null;
  return activeElement;
}

/**
 * Returns focus to `target` when it is still in the document. Returns whether
 * focus actually moved there.
 *
 * The binding decides *when* to restore: closing the panel after a click
 * elsewhere must not steal focus from the element the visitor chose, and that
 * rule belongs to the UI layer rather than here. Scrolling is suppressed for the
 * same reason as in {@link focusFirstWithin}.
 */
export function restoreFocus(target: Element | null | undefined): boolean {
  if (typeof document === 'undefined') return false;
  if (!(target instanceof HTMLElement) || !target.isConnected) return false;
  if (document.activeElement === target) return true;

  target.focus({ preventScroll: true });
  return document.activeElement === target;
}
