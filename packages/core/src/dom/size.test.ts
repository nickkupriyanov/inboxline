// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { measureSize, observeSize } from './size';

function rectOf(width: number, height: number): DOMRect {
  return {
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function elementWithHeight(read: () => number): HTMLElement {
  const element = document.createElement('div');
  element.getBoundingClientRect = () => rectOf(400, read());
  return element;
}

/**
 * Declared at module scope on purpose: a class declared inside a test would let
 * the compiler narrow the captured `trigger` to its initial `null`.
 */
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

function fireResize(): void {
  trigger?.();
}

afterEach(() => {
  vi.unstubAllGlobals();
  trigger = null;
  observed = [];
  disconnected = false;
});

describe('element size', () => {
  it('reports a zero size for nothing at all', () => {
    expect(measureSize(null)).toEqual({ width: 0, height: 0 });
    expect(measureSize(undefined)).toEqual({ width: 0, height: 0 });
  });

  it('measures the border box', () => {
    const element = elementWithHeight(() => 120);

    expect(measureSize(element)).toEqual({ width: 400, height: 120 });
  });

  it('reports once without an element and watches nothing', () => {
    const seen: number[] = [];
    const stop = observeSize(null, (size) => seen.push(size.height));

    expect(seen).toEqual([0]);
    expect(() => stop()).not.toThrow();
  });

  it('falls back to the window resize without a ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    let height = 100;
    const element = elementWithHeight(() => height);
    const seen: number[] = [];

    const stop = observeSize(element, (size) => seen.push(size.height));
    expect(seen).toEqual([100]);

    height = 150;
    window.dispatchEvent(new Event('resize'));
    expect(seen).toEqual([100, 150]);

    stop();
    height = 200;
    window.dispatchEvent(new Event('resize'));
    expect(seen).toEqual([100, 150]);
  });

  it('uses a ResizeObserver when the host has one, and disconnects it', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    const element = elementWithHeight(() => 80);
    const seen: number[] = [];

    const stop = observeSize(element, (size) => seen.push(size.height));

    expect(observed).toEqual([element]);
    expect(seen).toEqual([80]);

    fireResize();
    expect(seen).toEqual([80, 80]);

    stop();
    expect(disconnected).toBe(true);
  });

  it('starts a fresh observation after re-attaching', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    const element = elementWithHeight(() => 80);
    const first: number[] = [];
    const second: number[] = [];

    const stopFirst = observeSize(element, (size) => first.push(size.height));
    stopFirst();
    expect(disconnected).toBe(true);

    disconnected = false;
    observed = [];
    const stopSecond = observeSize(element, (size) => second.push(size.height));

    expect(first).toEqual([80]);
    expect(second).toEqual([80]);
    expect(observed).toEqual([element]);

    stopSecond();
    expect(disconnected).toBe(true);
  });
});
