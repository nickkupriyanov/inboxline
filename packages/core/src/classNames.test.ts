/**
 * The stable class map: the base class every slot renders, and the promise that a
 * slot name never changes once it is published.
 */
import { describe, expect, it } from 'vitest';
import { IL_CLASS } from './classNames';
import type { IlClassSlot } from './types';

describe('IL_CLASS', () => {
  it('covers every slot', () => {
    const slots = Object.keys(IL_CLASS) as IlClassSlot[];
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) expect(typeof IL_CLASS[slot]).toBe('string');
  });

  it('uses the `il-` prefix and no whitespace', () => {
    for (const value of Object.values(IL_CLASS)) {
      expect(value.startsWith('il-')).toBe(true);
      expect(value).not.toMatch(/\s/);
    }
  });

  it('never maps two slots to the same class', () => {
    const values = Object.values(IL_CLASS);
    expect(new Set(values).size).toBe(values.length);
  });
});
