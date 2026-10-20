// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REDUCED_MOTION_QUERY, canMatchMedia, matchesMediaQuery, observeMediaQuery } from './media';

type Listener = (event: MediaQueryListEvent) => void;

/** A minimal `matchMedia` whose value the test changes. */
function stubMatchMedia(initial: boolean): {
  set(matches: boolean): void;
  listeners: Set<Listener>;
} {
  const listeners = new Set<Listener>();
  let matches = initial;

  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return matches;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
      addListener: (listener: Listener) => listeners.add(listener),
      removeListener: (listener: Listener) => listeners.delete(listener),
      dispatchEvent: () => true,
    })),
  );

  return {
    listeners,
    set(next: boolean) {
      matches = next;
      for (const listener of [...listeners]) {
        listener({ matches: next } as MediaQueryListEvent);
      }
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('media queries', () => {
  it('reports that it cannot match without a host implementation', () => {
    vi.stubGlobal('matchMedia', undefined);

    expect(canMatchMedia()).toBe(false);
    expect(matchesMediaQuery(REDUCED_MOTION_QUERY)).toBe(false);

    const seen: boolean[] = [];
    const stop = observeMediaQuery(REDUCED_MOTION_QUERY, (matches) => seen.push(matches));

    expect(seen).toEqual([false]);
    expect(() => stop()).not.toThrow();
  });

  it('reads the current value', () => {
    stubMatchMedia(true);

    expect(canMatchMedia()).toBe(true);
    expect(matchesMediaQuery(REDUCED_MOTION_QUERY)).toBe(true);
  });

  it('reports the value now and on every change, then stops', () => {
    const media = stubMatchMedia(false);
    const seen: boolean[] = [];

    const stop = observeMediaQuery(REDUCED_MOTION_QUERY, (matches) => seen.push(matches));
    expect(seen).toEqual([false]);

    media.set(true);
    expect(seen).toEqual([false, true]);
    expect(media.listeners.size).toBe(1);

    stop();
    expect(media.listeners.size).toBe(0);

    media.set(false);
    expect(seen).toEqual([false, true]);
  });
});
