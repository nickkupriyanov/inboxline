import { describe, expect, it } from 'vitest';
import * as core from './index';

describe('@nickkupriyanov/inboxline-core entry point', () => {
  it('imports without browser globals', () => {
    expect(core).toBeTypeOf('object');
  });

  it('exports nothing yet — the domain contract arrives in Iteration 1', () => {
    expect(Object.keys(core)).toEqual([]);
  });
});
