// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { measureHeight, observeSize } from './size';
import { observeAnimatedHeight } from './height';
import type { AnimatedHeightState } from './height';

function rectOf(height: number): DOMRect {
  return {
    width: 400,
    height,
    top: 0,
    left: 0,
    right: 400,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

/** Declared at module scope so the compiler does not narrow the captured callback. */
let trigger: (() => void) | null = null;
let disconnected = false;

class FakeResizeObserver {
  constructor(callback: () => void) {
    trigger = callback;
  }
  observe() {}
  disconnect() {
    disconnected = true;
  }
}

function fireResize(): void {
  trigger?.();
}

/** An element whose height the test controls. */
function elementWithHeight(read: () => number): HTMLElement {
  const element = document.createElement('div');
  element.getBoundingClientRect = () => rectOf(read());
  return element;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  trigger = null;
  disconnected = false;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  trigger = null;
  disconnected = false;
});

describe('animated height', () => {
  it('measures the border-box height', () => {
    expect(measureHeight(null)).toBe(0);
    expect(measureHeight(elementWithHeight(() => 42))).toBe(42);
  });

  it('does not animate the first measurement', () => {
    const seen: AnimatedHeightState[] = [];
    const stop = observeAnimatedHeight(
      elementWithHeight(() => 100),
      {
        onChange: (state) => seen.push(state),
      },
    );

    expect(seen).toEqual([{ height: 100, animating: false }]);
    stop();
  });

  it('reports the new height as animating and settles after the duration', () => {
    let height = 100;
    const seen: AnimatedHeightState[] = [];
    const stop = observeAnimatedHeight(
      elementWithHeight(() => height),
      {
        durationMs: 240,
        onChange: (state) => seen.push(state),
      },
    );

    height = 160;
    fireResize();
    expect(seen.at(-1)).toEqual({ height: 160, animating: true });

    vi.advanceTimersByTime(239);
    expect(seen.at(-1)).toEqual({ height: 160, animating: true });

    vi.advanceTimersByTime(1);
    expect(seen.at(-1)).toEqual({ height: 160, animating: false });

    stop();
    expect(disconnected).toBe(true);
  });

  it('ignores sub-pixel changes', () => {
    let height = 100;
    const seen: AnimatedHeightState[] = [];
    const stop = observeAnimatedHeight(
      elementWithHeight(() => height),
      {
        onChange: (state) => seen.push(state),
      },
    );

    height = 100.4;
    fireResize();

    expect(seen.at(-1)).toEqual({ height: 100.4, animating: false });
    stop();
  });

  it('does not report a zero height, such as a hidden element', () => {
    let height = 100;
    const seen: AnimatedHeightState[] = [];
    const stop = observeAnimatedHeight(
      elementWithHeight(() => height),
      {
        onChange: (state) => seen.push(state),
      },
    );

    height = 0;
    fireResize();

    expect(seen).toEqual([{ height: 100, animating: false }]);
    stop();
  });

  it('does nothing under reduced motion, leaving the natural height in place', () => {
    const seen: AnimatedHeightState[] = [];
    const element = elementWithHeight(() => 120);
    const stop = observeAnimatedHeight(element, {
      disabled: true,
      onChange: (state) => seen.push(state),
    });

    expect(seen).toEqual([{ height: undefined, animating: false }]);
    expect(trigger).toBeNull();
    expect(() => stop()).not.toThrow();
  });

  it('clears its timer on removal so a late settle is never delivered', () => {
    let height = 100;
    const seen: AnimatedHeightState[] = [];
    const stop = observeAnimatedHeight(
      elementWithHeight(() => height),
      {
        durationMs: 240,
        onChange: (state) => seen.push(state),
      },
    );

    height = 160;
    fireResize();
    stop();
    vi.advanceTimersByTime(1000);

    expect(seen).toEqual([
      { height: 100, animating: false },
      { height: 160, animating: true },
    ]);
  });

  it('can be attached again to a fresh element', () => {
    const first: AnimatedHeightState[] = [];
    const stopFirst = observeAnimatedHeight(
      elementWithHeight(() => 100),
      {
        onChange: (state) => first.push(state),
      },
    );
    stopFirst();

    disconnected = false;
    const second: AnimatedHeightState[] = [];
    const stopSecond = observeAnimatedHeight(
      elementWithHeight(() => 80),
      {
        onChange: (state) => second.push(state),
      },
    );

    expect(first).toEqual([{ height: 100, animating: false }]);
    expect(second).toEqual([{ height: 80, animating: false }]);

    stopSecond();
    expect(disconnected).toBe(true);
  });

  it('is the same size observation a binding already uses', () => {
    const sizes: number[] = [];
    const stop = observeSize(
      elementWithHeight(() => 55),
      (size) => sizes.push(size.height),
    );
    expect(sizes).toEqual([55]);
    stop();
  });
});
