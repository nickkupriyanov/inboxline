/**
 * The copy layer: the shipped dictionaries, the per-key merge, the placeholder
 * substitution and the plural selection.
 */
import { describe, expect, it } from 'vitest';
import {
  defaultMessages,
  format,
  resolveMessageLocale,
  resolveMessages,
  selectPlural,
} from './i18n';
import type { InboxPluralMessage } from './types';

describe('shipped dictionaries', () => {
  it('declare the same keys for both locales', () => {
    expect(Object.keys(defaultMessages.ru).sort()).toEqual(Object.keys(defaultMessages.en).sort());
  });

  it('give every plural message an `other` form', () => {
    for (const messages of Object.values(defaultMessages)) {
      for (const value of Object.values(messages)) {
        if (typeof value === 'object') expect(typeof value.other).toBe('string');
      }
    }
  });
});

describe('resolveMessageLocale', () => {
  it('maps `ru*` to Russian and everything else to English', () => {
    expect(resolveMessageLocale('ru')).toBe('ru');
    expect(resolveMessageLocale('ru-RU')).toBe('ru');
    expect(resolveMessageLocale('RU')).toBe('ru');
    expect(resolveMessageLocale('en-GB')).toBe('en');
    expect(resolveMessageLocale('de')).toBe('en');
    expect(resolveMessageLocale(undefined)).toBe('en');
  });
});

describe('resolveMessages', () => {
  it('returns the built-in dictionary untouched when there is nothing to merge', () => {
    expect(resolveMessages('ru')).toBe(defaultMessages.ru);
  });

  it('overrides a single key and keeps the rest', () => {
    const messages = resolveMessages('en', { emptyLabel: 'Nothing here' });
    expect(messages.emptyLabel).toBe('Nothing here');
    expect(messages.todayLabel).toBe(defaultMessages.en.todayLabel);
  });

  it('lets an undefined override fall back to the default', () => {
    const messages = resolveMessages('en', { emptyLabel: undefined });
    expect(messages.emptyLabel).toBe(defaultMessages.en.emptyLabel);
  });

  it('replaces a whole plural group', () => {
    const forms: InboxPluralMessage = { one: 'один', other: 'много' };
    const messages = resolveMessages('ru', { relativeMinute: forms });
    expect(messages.relativeMinute).toBe(forms);
  });

  it('ignores a value that does not fit the key it names', () => {
    const broken = {
      emptyLabel: 42,
      todayLabel: null,
      relativeMinute: { one: 'без other' },
    } as unknown as Partial<typeof defaultMessages.en>;
    const messages = resolveMessages('en', broken);
    expect(messages.emptyLabel).toBe(defaultMessages.en.emptyLabel);
    expect(messages.todayLabel).toBe(defaultMessages.en.todayLabel);
    expect(messages.relativeMinute).toBe(defaultMessages.en.relativeMinute);
  });
});

describe('format', () => {
  it('substitutes the named placeholders', () => {
    expect(format('{count} unread', { count: 27 })).toBe('27 unread');
    expect(format('{a} and {b}', { a: 1, b: 2 })).toBe('1 and 2');
  });

  it('leaves an unknown placeholder in place', () => {
    expect(format('{count} of {total}', { count: 3 })).toBe('3 of {total}');
  });
});

describe('selectPlural', () => {
  const en: InboxPluralMessage = { one: '{count} item', other: '{count} items' };
  const ru: InboxPluralMessage = {
    one: '{count} штука',
    few: '{count} штуки',
    many: '{count} штук',
    other: '{count} штуки',
  };

  it('selects the English form', () => {
    expect(selectPlural(en, 1, 'en')).toBe('{count} item');
    expect(selectPlural(en, 2, 'en')).toBe('{count} items');
    expect(selectPlural(en, 21, 'en')).toBe('{count} items');
  });

  it('selects the Russian form', () => {
    expect(selectPlural(ru, 1, 'ru')).toBe('{count} штука');
    expect(selectPlural(ru, 21, 'ru')).toBe('{count} штука');
    expect(selectPlural(ru, 2, 'ru')).toBe('{count} штуки');
    expect(selectPlural(ru, 5, 'ru')).toBe('{count} штук');
    expect(selectPlural(ru, 0, 'ru')).toBe('{count} штук');
  });

  it('falls back to `other` for a category the dictionary omits', () => {
    expect(selectPlural({ other: 'fallback' }, 2, 'en')).toBe('fallback');
  });

  it('does not throw on an unsupported locale', () => {
    expect(selectPlural(en, 1, 'not a locale!')).toBe('{count} item');
  });
});
