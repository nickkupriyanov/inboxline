import { describe, expect, it } from 'vitest';
import * as react from './index';

describe('@nickkupriyanov/inboxline-react entry point', () => {
  it('imports in a DOM environment without touching the DOM at import time', () => {
    expect(react).toBeTypeOf('object');
  });

  it('exports nothing yet — the provider arrives in Iteration 12', () => {
    expect(Object.keys(react)).toEqual([]);
  });
});
