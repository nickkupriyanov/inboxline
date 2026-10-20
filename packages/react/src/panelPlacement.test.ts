/**
 * Placement is a pure decision, tested without a layout engine.
 *
 * jsdom has no real geometry, so these cases build the measurement that
 * `observeAvailableArea()` would return in a browser: an anchor at the bottom,
 * at the right edge, and a 320 px viewport.
 */
import { describe, expect, it } from 'vitest';
import type { AvailableArea } from '@nickkupriyanov/inboxline-core/dom';
import { INBOX_PANEL_GAP, INBOX_PANEL_WIDTH, placeInboxPanel } from './components/panelPlacement';

function area(
  anchor: { top: number; left: number; width: number; height: number },
  viewport = { width: 1024, height: 768 },
  margin = 8,
): AvailableArea {
  const right = anchor.left + anchor.width;
  const bottom = anchor.top + anchor.height;
  return {
    anchor: { ...anchor, right, bottom },
    viewport,
    margin,
    space: {
      top: Math.max(0, anchor.top - margin),
      left: Math.max(0, anchor.left - margin),
      right: Math.max(0, viewport.width - margin - right),
      bottom: Math.max(0, viewport.height - margin - bottom),
    },
  };
}

describe('placeInboxPanel', () => {
  it('opens below the trigger and aligns its right edge when there is room', () => {
    const placement = placeInboxPanel(area({ top: 100, left: 860, width: 40, height: 40 }));

    expect(placement.side).toBe('bottom');
    expect(placement.width).toBe(INBOX_PANEL_WIDTH);
    expect(placement.left).toBe(500);
    expect(placement.top).toBe(100 + 40 + INBOX_PANEL_GAP);
    expect(placement.bottom).toBeNull();
    expect(placement.maxHeight).toBe(620 - INBOX_PANEL_GAP);
  });

  it('flips above the trigger when the space below is smaller', () => {
    const placement = placeInboxPanel(area({ top: 600, left: 400, width: 40, height: 40 }));

    expect(placement.side).toBe('top');
    expect(placement.top).toBeNull();
    expect(placement.bottom).toBe(768 - 600 + INBOX_PANEL_GAP);
    expect(placement.maxHeight).toBe(592 - INBOX_PANEL_GAP);
  });

  it('keeps the panel inside the viewport at the right edge', () => {
    const placement = placeInboxPanel(area({ top: 100, left: 984, width: 40, height: 40 }));

    expect(placement.left).toBe(1024 - 8 - INBOX_PANEL_WIDTH);
    expect(placement.left + placement.width).toBe(1024 - 8);
  });

  it('caps the width to a 320 px viewport instead of causing horizontal scroll', () => {
    const placement = placeInboxPanel(
      area({ top: 8, left: 270, width: 40, height: 40 }, { width: 320, height: 480 }),
    );

    expect(placement.width).toBe(304);
    expect(placement.left).toBe(8);
    expect(placement.left + placement.width).toBe(312);
  });

  it('honours a custom gap and width', () => {
    const placement = placeInboxPanel(area({ top: 100, left: 200, width: 40, height: 40 }), {
      gap: 2,
      width: 300,
    });

    expect(placement.width).toBe(300);
    expect(placement.top).toBe(142);
    expect(placement.maxHeight).toBe(620 - 2);
  });

  it('never returns negative height or a panel wider than the viewport', () => {
    const placement = placeInboxPanel(
      area(
        { top: 4, left: 0, width: 40, height: 40 },
        {
          width: 320,
          height: 60,
        },
      ),
    );

    expect(placement.maxHeight).toBeGreaterThanOrEqual(0);
    expect(placement.width).toBeLessThanOrEqual(320);
  });
});
