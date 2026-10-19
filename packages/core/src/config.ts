/**
 * The inbox configuration.
 *
 * Everything the derivation and every binding need to know about the application
 * is resolved once, so they all work from identical values.
 *
 * `locale` and `timeZone` fall back to deterministic constants rather than to the
 * browser: a binding applies the visitor's preference *after* mounting, which is
 * what keeps server rendering and hydration identical. An application that passes
 * them explicitly gets the same answer on both sides with no extra work.
 */
import { resolveMessages } from './i18n';
import type { InboxMessages } from './types';

/* -------------------------------------------------------------------------- */
/*  Defaults                                                                  */
/* -------------------------------------------------------------------------- */

/** Deterministic locale, replaced by a binding once it runs on the client. */
export const FALLBACK_LOCALE = 'en';

/** Deterministic zone for the same reason: a server has no visitor's zone. */
export const FALLBACK_TIME_ZONE = 'UTC';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

/** What an application may pass in; every field is optional. */
export interface InboxConfigInput {
  /** BCP 47 tag for `Intl` and for the copy layer. Default: {@link FALLBACK_LOCALE}. */
  locale?: string;
  /** IANA zone the day groups and the relative labels are computed in. */
  timeZone?: string;
  /** Per-key overrides merged over the built-in dictionary. */
  messages?: Partial<InboxMessages>;
}

/** The resolved configuration: every field is present and validated. */
export interface InboxConfig {
  locale: string;
  timeZone: string;
  messages: InboxMessages;
}

/* -------------------------------------------------------------------------- */
/*  Validation                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Whether a value is a locale tag this runtime can format with.
 *
 * The check is delegated to `Intl` on purpose: the set of supported tags belongs
 * to the platform, and a value it refuses would otherwise throw at render time.
 */
export function isSupportedInboxLocale(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    new Intl.DateTimeFormat(value);
    return true;
  } catch {
    return false;
  }
}

/** Whether a value is a time zone this runtime knows. */
export function isSupportedInboxTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*  Resolution                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Resolves an input into the configuration the rest of the core reads.
 *
 * Every fallback is a constant and every validation is local, so the same input
 * always resolves to the same output — the property SSR and hydration rely on. An
 * unsupported locale or zone is replaced rather than carried into `Intl`.
 */
export function resolveInboxConfig(input: InboxConfigInput = {}): InboxConfig {
  const locale = isSupportedInboxLocale(input.locale) ? input.locale : FALLBACK_LOCALE;
  const timeZone = isSupportedInboxTimeZone(input.timeZone) ? input.timeZone : FALLBACK_TIME_ZONE;
  return { locale, timeZone, messages: resolveMessages(locale, input.messages) };
}
