/**
 * Where the portalled bell panel goes.
 *
 * `observeAvailableArea()` from `@nickkupriyanov/inboxline-core/dom` measures the
 * anchor and the free space around it; this module is the pure decision that
 * follows. Keeping it separate from the component makes the edge cases — a
 * trigger at the bottom of the viewport, a 320 px window, a right-aligned bell —
 * testable without a layout engine.
 *
 * The panel is `position: fixed` and viewport-relative. The bottom side is
 * expressed by `top`, the top side by `bottom`: that way the panel does not have
 * to know its own height before it is rendered, and flipping sides cannot jump
 * by a measured pixel value that is one frame stale.
 */
import type { AvailableArea } from '@nickkupriyanov/inboxline-core/dom';

/** The design width of the popover, matching `--il-width-panel`. */
export const INBOX_PANEL_WIDTH = 400;

/** Space between the trigger and the panel. */
export const INBOX_PANEL_GAP = 8;

export interface InboxPanelPlacement {
  /** The side of the trigger the panel occupies. */
  side: 'top' | 'bottom';
  /** Distance from the viewport top; set on the bottom side only. */
  top: number | null;
  /** Distance from the viewport bottom; set on the top side only. */
  bottom: number | null;
  left: number;
  width: number;
  /** The free height on the chosen side, minus the gap. */
  maxHeight: number;
}

export interface InboxPanelPlacementOptions {
  /** Preferred width. Default: {@link INBOX_PANEL_WIDTH}. */
  width?: number;
  /** Space between the trigger and the panel. Default: {@link INBOX_PANEL_GAP}. */
  gap?: number;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/**
 * Turns a measurement into fixed-position coordinates.
 *
 * The panel keeps its right edge on the trigger, then shifts left only as far as
 * the viewport margin requires. Its width is capped by the viewport, so the
 * 400 px panel becomes 304 px on a 320 px screen instead of causing horizontal
 * scroll. The side with more free space wins; equal space keeps the preferred
 * bottom side.
 */
export function placeInboxPanel(
  area: AvailableArea,
  options: InboxPanelPlacementOptions = {},
): InboxPanelPlacement {
  const gap = finiteOr(options.gap ?? INBOX_PANEL_GAP, INBOX_PANEL_GAP);
  const preferredWidth = finiteOr(options.width ?? INBOX_PANEL_WIDTH, INBOX_PANEL_WIDTH);
  const margin = finiteOr(area.margin, 0);

  const width = Math.max(0, Math.min(preferredWidth, area.viewport.width - margin * 2));

  const rightmost = Math.max(margin, area.viewport.width - margin - width);
  const left = Math.min(Math.max(area.anchor.right - width, margin), rightmost);

  const side: InboxPanelPlacement['side'] = area.space.bottom >= area.space.top ? 'bottom' : 'top';

  if (side === 'bottom') {
    return {
      side,
      top: area.anchor.bottom + gap,
      bottom: null,
      left,
      width,
      maxHeight: Math.max(0, area.space.bottom - gap),
    };
  }

  return {
    side,
    top: null,
    bottom: area.viewport.height - area.anchor.top + gap,
    left,
    width,
    maxHeight: Math.max(0, area.space.top - gap),
  };
}
