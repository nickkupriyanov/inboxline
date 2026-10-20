/**
 * The visitor's language and time zone, read after mounting.
 *
 * The core deliberately resolves configuration against constants (`en`, `UTC`)
 * so a server render and its hydration agree. This module is the other half of
 * that decision: the binding may consult the browser, but only inside an effect,
 * so the first client render is still the server's. Nothing here runs at import
 * time, and a host without `navigator` or a usable `Intl` simply reports no
 * preference and keeps the deterministic fallback.
 */
import { isSupportedInboxLocale, isSupportedInboxTimeZone } from '@nickkupriyanov/inboxline-core';
import type { InboxConfigInput } from '@nickkupriyanov/inboxline-core';

/** What the browser could tell us; each field is absent when it is unknown. */
export interface InboxBrowserPreferences {
  /** The first `navigator` language tag this runtime can format with. */
  locale?: string;
  /** The IANA zone `Intl` resolves for this host. */
  timeZone?: string;
}

/**
 * Reads the visitor's preferences without throwing.
 *
 * `navigator.languages` is preferred in the order the visitor configured it,
 * with `navigator.language` first as a fallback for hosts that expose only that.
 * An unsupported tag is skipped rather than carried into `Intl`; the next one is
 * tried.
 */
export function detectInboxBrowserPreferences(): InboxBrowserPreferences {
  const preferences: InboxBrowserPreferences = {};

  if (typeof navigator !== 'undefined') {
    const tags: readonly string[] = [
      ...(typeof navigator.language === 'string' ? [navigator.language] : []),
      ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    ];
    for (const tag of tags) {
      if (isSupportedInboxLocale(tag)) {
        preferences.locale = tag;
        break;
      }
    }
  }

  try {
    const { timeZone } = new Intl.DateTimeFormat().resolvedOptions();
    if (isSupportedInboxTimeZone(timeZone)) preferences.timeZone = timeZone;
  } catch {
    // No usable `Intl`: the core fallback is the honest answer.
  }

  return preferences;
}

/**
 * Merges explicit configuration over detected preferences.
 *
 * A value the application passed always wins, including an invalid one: the
 * core then falls back to its constant instead of the binding quietly replacing
 * the application's intent with a guess. Only absent fields are detected.
 */
export function mergeInboxConfigInput(
  config: InboxConfigInput | undefined,
  preferences: InboxBrowserPreferences,
): InboxConfigInput {
  const locale = config?.locale ?? preferences.locale;
  const timeZone = config?.timeZone ?? preferences.timeZone;

  return {
    ...(locale === undefined ? {} : { locale }),
    ...(timeZone === undefined ? {} : { timeZone }),
    ...(config?.messages === undefined ? {} : { messages: config.messages }),
  };
}
