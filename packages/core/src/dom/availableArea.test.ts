// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_VIEWPORT_MARGIN,
  measureAvailableArea,
  observeAvailableArea,
  type AvailableArea,
} from './availableArea';

interface RectInput {
  top: number;
  left: number;
  width: number;
  height: number;
}

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

function rectOf({ top, left, width, height }: RectInput): DOMRect {
  return {
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function anchorWith(rect: RectInput) {
  const element = document.createElement('button');
  let current = rect;
  element.getBoundingClientRect = () => rectOf(current);

  return {
    element,
    moveTo(next: RectInput) {
      current = next;
    },
  };
}

let trigger: (() => void) | null = null;
let observed: Element[] = [];
let disconnected = false;

class FakeResizeObserver {
  constructor(callback: () => void) {
    trigger = callback;
  }
  observe(element: Element) {
    observed.push(element);
  }
  disconnect() {
    disconnected = true;
  }
}

function fireResizeObserver(): void {
  trigger?.();
}

function scroll(): void {
  window.dispatchEvent(new Event('scroll'));
}

function resizeWindow(): void {
  window.dispatchEvent(new Event('resize'));
}

afterEach(() => {
  setViewport(1024, 768);
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  trigger = null;
  observed = [];
  disconnected = false;
});

describe('measureAvailableArea', () => {
  it('subtracts the default margin from every side', () => {
    setViewport(1000, 800);
    const { element } = anchorWith({ top: 100, left: 200, width: 50, height: 40 });

    expect(measureAvailableArea(element)).toEqual({
      anchor: { top: 100, left: 200, width: 50, height: 40, right: 250, bottom: 140 },
      viewport: { width: 1000, height: 800 },
      margin: DEFAULT_VIEWPORT_MARGIN,
      space: { top: 92, left: 192, right: 742, bottom: 652 },
    });
  });

  it('honours a custom margin', () => {
    setViewport(1000, 800);
    const { element } = anchorWith({ top: 100, left: 200, width: 50, height: 40 });

    const area = measureAvailableArea(element, { margin: 20 });

    expect(area?.margin).toBe(20);
    expect(area?.space).toEqual({ top: 80, left: 180, right: 730, bottom: 640 });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -5])(
    'falls back to the default margin for %s',
    (margin) => {
      setViewport(1000, 800);
      const { element } = anchorWith({ top: 100, left: 200, width: 50, height: 40 });

      expect(measureAvailableArea(element, { margin })?.margin).toBe(DEFAULT_VIEWPORT_MARGIN);
    },
  );

  it('never reports negative space for an anchor partly outside the viewport', () => {
    setViewport(1000, 800);
    const { element } = anchorWith({ top: 2, left: -50, width: 20, height: 10 });

    expect(measureAvailableArea(element)?.space).toEqual({
      top: 0,
      left: 0,
      right: 1022,
      bottom: 780,
    });

    const { element: bottomRight } = anchorWith({ top: 795, left: 990, width: 50, height: 20 });
    expect(measureAvailableArea(bottomRight)?.space).toEqual({
      top: 787,
      left: 982,
      right: 0,
      bottom: 0,
    });
  });

  it('reports null without an anchor or without a viewport', () => {
    expect(measureAvailableArea(null)).toBeNull();
    expect(measureAvailableArea(undefined)).toBeNull();
  });
});

describe('observeAvailableArea', () => {
  it('reports the current area immediately', () => {
    setViewport(1000, 800);
    const { element } = anchorWith({ top: 100, left: 200, width: 50, height: 40 });
    const seen: AvailableArea[] = [];

    const stop = observeAvailableArea(element, (area) => {
      if (area) seen.push(area);
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.space).toEqual({ top: 92, left: 192, right: 742, bottom: 652 });

    stop();
  });

  it('re-measures when the page scrolls', () => {
    setViewport(1000, 800);
    const anchor = anchorWith({ top: 100, left: 200, width: 50, height: 40 });
    const seen: AvailableArea[] = [];
    const stop = observeAvailableArea(anchor.element, (area) => {
      if (area) seen.push(area);
    });

    anchor.moveTo({ top: 60, left: 200, width: 50, height: 40 });
    scroll();

    expect(seen).toHaveLength(2);
    expect(seen[1]?.anchor.top).toBe(60);
    expect(seen[1]?.space.top).toBe(52);

    stop();
  });

  it('re-measures when the window resizes', () => {
    setViewport(1000, 800);
    const { element } = anchorWith({ top: 100, left: 200, width: 50, height: 40 });
    const seen: AvailableArea[] = [];
    const stop = observeAvailableArea(element, (area) => {
      if (area) seen.push(area);
    });

    setViewport(1200, 900);
    resizeWindow();

    expect(seen).toHaveLength(2);
    expect(seen[1]?.viewport).toEqual({ width: 1200, height: 900 });
    expect(seen[1]?.space.right).toBe(942);

    stop();
  });

  it('does not report an unchanged measurement twice', () => {
    setViewport(1000, 800);
    const { element } = anchorWith({ top: 100, left: 200, width: 50, height: 40 });
    const listener = vi.fn();
    const stop = observeAvailableArea(element, listener);

    scroll();
    scroll();
    resizeWindow();

    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stops listening after cleanup', () => {
    setViewport(1000, 800);
    const anchor = anchorWith({ top: 100, left: 200, width: 50, height: 40 });
    const listener = vi.fn();
    const stop = observeAvailableArea(anchor.element, listener);

    stop();
    anchor.moveTo({ top: 10, left: 10, width: 50, height: 40 });
    scroll();
    setViewport(500, 500);
    resizeWindow();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(() => stop()).not.toThrow();
  });

  it('starts from a fresh measurement when re-attached', () => {
    setViewport(1000, 800);
    const { element } = anchorWith({ top: 100, left: 200, width: 50, height: 40 });
    const first = vi.fn();
    const second = vi.fn();

    const stopFirst = observeAvailableArea(element, first);
    stopFirst();
    const stopSecond = observeAvailableArea(element, second);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    stopSecond();
  });

  it('keeps several anchors independent', () => {
    setViewport(1000, 800);
    const first = anchorWith({ top: 100, left: 100, width: 40, height: 40 });
    const second = anchorWith({ top: 300, left: 500, width: 40, height: 40 });
    const firstListener = vi.fn();
    const secondListener = vi.fn();

    const stopFirst = observeAvailableArea(first.element, firstListener);
    const stopSecond = observeAvailableArea(second.element, secondListener);

    first.moveTo({ top: 80, left: 100, width: 40, height: 40 });
    scroll();

    expect(firstListener).toHaveBeenCalledTimes(2);
    expect(secondListener).toHaveBeenCalledTimes(1);

    stopSecond();
    second.moveTo({ top: 320, left: 500, width: 40, height: 40 });
    scroll();

    expect(firstListener).toHaveBeenCalledTimes(2);
    expect(secondListener).toHaveBeenCalledTimes(1);

    first.moveTo({ top: 70, left: 100, width: 40, height: 40 });
    scroll();

    expect(firstListener).toHaveBeenCalledTimes(3);
    expect(secondListener).toHaveBeenCalledTimes(1);

    stopFirst();
  });

  it('uses a ResizeObserver when the host has one, and disconnects it', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    setViewport(1000, 800);
    const anchor = anchorWith({ top: 100, left: 200, width: 50, height: 40 });
    const listener = vi.fn();

    const stop = observeAvailableArea(anchor.element, listener);

    expect(observed).toEqual([anchor.element]);
    expect(listener).toHaveBeenCalledTimes(1);

    anchor.moveTo({ top: 120, left: 200, width: 50, height: 80 });
    fireResizeObserver();

    expect(listener).toHaveBeenCalledTimes(2);

    stop();
    expect(disconnected).toBe(true);
  });

  it('reports null once when there is nothing to observe', () => {
    const seen: Array<AvailableArea | null> = [];
    const stop = observeAvailableArea(null, (area) => seen.push(area));

    expect(seen).toEqual([null]);
    expect(() => stop()).not.toThrow();
  });
});
