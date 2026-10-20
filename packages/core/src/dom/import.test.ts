/**
 * Deliberately without a `@vitest-environment jsdom` docblock: this file runs in
 * node, which is the environment a server renders in.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as dom from './index';

/**
 * The entry point of the browser half: focus around a non-modal panel, size and
 * height observation, media queries and the viewport-constrained area around an
 * anchor. A new runtime export has to be listed here.
 */
const EXPECTED_EXPORTS: readonly string[] = [
  // available area
  'DEFAULT_VIEWPORT_MARGIN',
  'measureAvailableArea',
  'observeAvailableArea',
  // focus
  'captureFocus',
  'focusFirstWithin',
  'focusableWithin',
  'restoreFocus',
  // height
  'observeAnimatedHeight',
  // media
  'REDUCED_MOTION_QUERY',
  'canMatchMedia',
  'matchesMediaQuery',
  'observeMediaQuery',
  // size
  'measureHeight',
  'measureSize',
  'observeSize',
];

type TrapName = 'window' | 'document';

function trapHostAccess(): void {
  for (const name of ['window', 'document'] as const) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() {
        throw new Error(`the DOM entry point read ${name} while it was being imported`);
      },
    });
  }
}

function releaseHostAccess(): void {
  for (const name of ['window', 'document'] as const) {
    // `delete` on a global that only the trap defined leaves the environment as
    // it was.
    delete (globalThis as Record<string, unknown>)[name as TrapName];
  }
}

afterEach(() => {
  releaseHostAccess();
  vi.resetModules();
});

describe('importing the DOM entry point', () => {
  it('reads neither window nor document, so a server can load it', async () => {
    trapHostAccess();
    vi.resetModules();

    await expect(import('./index')).resolves.toBeDefined();
  });

  it('exports the browser helpers and nothing else', () => {
    expect(Object.keys(dom).sort()).toEqual([...EXPECTED_EXPORTS].sort());
  });

  it('degrades to doing nothing when there is no host to observe', () => {
    const element = {
      getBoundingClientRect: () => ({ width: 10, height: 20 }),
    } as unknown as Element;

    const sizes: number[] = [];
    const stopSize = dom.observeSize(element, (size) => sizes.push(size.height));
    expect(sizes).toEqual([20]);
    expect(() => stopSize()).not.toThrow();

    expect(dom.measureSize(null)).toEqual({ width: 0, height: 0 });
    expect(dom.measureHeight(null)).toBe(0);
    expect(dom.matchesMediaQuery(dom.REDUCED_MOTION_QUERY)).toBe(false);

    const heights: unknown[] = [];
    const stopHeight = dom.observeAnimatedHeight(element, {
      onChange: (state) => heights.push(state),
    });
    expect(heights).toEqual([{ height: 20, animating: false }]);
    expect(() => stopHeight()).not.toThrow();

    const media: boolean[] = [];
    const stopMedia = dom.observeMediaQuery(dom.REDUCED_MOTION_QUERY, (matches) =>
      media.push(matches),
    );
    expect(media).toEqual([false]);
    expect(() => stopMedia()).not.toThrow();

    const areas: Array<unknown> = [];
    const stopArea = dom.observeAvailableArea(element, (area) => areas.push(area));
    expect(areas).toEqual([null]);
    expect(dom.measureAvailableArea(element)).toBeNull();
    expect(() => stopArea()).not.toThrow();

    expect(dom.captureFocus()).toBeNull();
    expect(dom.restoreFocus(null)).toBe(false);

    const container = {
      querySelectorAll: () => [],
      tabIndex: -1,
    } as unknown as HTMLElement;
    expect(dom.focusableWithin(container)).toEqual([]);
    expect(dom.focusFirstWithin(container)).toBeNull();
  });
});
