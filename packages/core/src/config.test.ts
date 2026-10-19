/**
 * The configuration: the deterministic fallbacks, the validation of a locale and
 * a zone, and the per-key merge of the copy overrides.
 */
import { describe, expect, it } from 'vitest';
import {
  FALLBACK_LOCALE,
  FALLBACK_TIME_ZONE,
  isSupportedInboxLocale,
  isSupportedInboxTimeZone,
  resolveInboxConfig,
} from './config';
import { defaultMessages } from './i18n';

describe('isSupportedInboxLocale', () => {
  it('accepts a tag this runtime can format with', () => {
    expect(isSupportedInboxLocale('en')).toBe(true);
    expect(isSupportedInboxLocale('ru-RU')).toBe(true);
    expect(isSupportedInboxLocale('de-AT')).toBe(true);
  });

  it('rejects an empty string, a non-string and a malformed tag', () => {
    expect(isSupportedInboxLocale('')).toBe(false);
    expect(isSupportedInboxLocale(undefined)).toBe(false);
    expect(isSupportedInboxLocale(42)).toBe(false);
    expect(isSupportedInboxLocale('not a locale!')).toBe(false);
  });
});

describe('isSupportedInboxTimeZone', () => {
  it('accepts a zone the runtime knows', () => {
    expect(isSupportedInboxTimeZone('UTC')).toBe(true);
    expect(isSupportedInboxTimeZone('Europe/Berlin')).toBe(true);
    expect(isSupportedInboxTimeZone('America/New_York')).toBe(true);
  });

  it('rejects an empty string, a non-string and an unknown zone', () => {
    expect(isSupportedInboxTimeZone('')).toBe(false);
    expect(isSupportedInboxTimeZone(undefined)).toBe(false);
    expect(isSupportedInboxTimeZone('Mars/Phobos')).toBe(false);
  });
});

describe('resolveInboxConfig', () => {
  it('falls back to the deterministic constants, never to the browser', () => {
    const config = resolveInboxConfig();
    expect(config.locale).toBe(FALLBACK_LOCALE);
    expect(config.timeZone).toBe(FALLBACK_TIME_ZONE);
    expect(config.messages).toBe(defaultMessages.en);
  });

  it('keeps an explicit locale and zone', () => {
    const config = resolveInboxConfig({ locale: 'ru-RU', timeZone: 'Asia/Tokyo' });
    expect(config.locale).toBe('ru-RU');
    expect(config.timeZone).toBe('Asia/Tokyo');
    expect(config.messages.countLabel.other).toBe('{count} непрочитанного');
  });

  it('replaces an unusable locale or zone instead of passing it to Intl', () => {
    const config = resolveInboxConfig({ locale: 'not a locale!', timeZone: 'Mars/Phobos' });
    expect(config.locale).toBe(FALLBACK_LOCALE);
    expect(config.timeZone).toBe(FALLBACK_TIME_ZONE);
  });

  it('merges message overrides key by key', () => {
    const config = resolveInboxConfig({ messages: { listLabel: 'Мои уведомления' } });
    expect(config.messages.listLabel).toBe('Мои уведомления');
    expect(config.messages.todayLabel).toBe(defaultMessages.en.todayLabel);
  });

  it('resolves the same input to an equal object every time', () => {
    const input = { locale: 'ru', timeZone: 'Europe/Berlin' } as const;
    expect(resolveInboxConfig(input)).toEqual(resolveInboxConfig(input));
  });
});
