/**
 * Built-in copy.
 *
 * Two locales ship in the box (`en`, `ru`). Any other language tag still works:
 * `Intl` formats the dates and selects the plural form, while the copy falls back
 * to English unless the application passes its own `messages`.
 *
 * `format()` is the single substitution mechanism: dictionaries hold plain text
 * with `{placeholder}` markers and no markup, and a binding renders the result as
 * text, so a dictionary can never inject HTML. Locale *detection* is not here on
 * purpose: it reads the browser and therefore belongs to a binding, which applies
 * it after mounting — that is what keeps server rendering and hydration
 * identical.
 */
import type { InboxLocale, InboxMessages, InboxPluralMessage } from './types';

const en: InboxMessages = {
  listLabel: 'Notifications',
  countLabel: {
    one: '{count} unread notification',
    other: '{count} unread notifications',
  },
  countUnknownLabel: 'Unread count unknown',
  emptyLabel: 'No notifications yet',
  emptyUnreadLabel: 'No unread notifications',
  loadingLabel: 'Loading notifications…',
  listErrorLabel: 'The notifications could not be loaded',
  pageErrorLabel: 'The next notifications could not be loaded',
  countErrorLabel: 'The unread count could not be loaded',
  retryLabel: 'Try again',
  loadMoreLabel: 'Show more',
  filtersLabel: 'Filter notifications',
  filterAllLabel: 'All',
  filterUnreadLabel: 'Unread',
  showUpdatesLabel: 'Show updates',
  markAllReadLabel: 'Mark all as read',
  todayLabel: 'Today',
  yesterdayLabel: 'Yesterday',
  unreadMarkerLabel: 'Unread',
  timeNow: 'just now',
  relativeMinute: { one: '{count} minute ago', other: '{count} minutes ago' },
  relativeHour: { one: '{count} hour ago', other: '{count} hours ago' },
};

const ru: InboxMessages = {
  listLabel: 'Уведомления',
  countLabel: {
    one: '{count} непрочитанное',
    few: '{count} непрочитанных',
    many: '{count} непрочитанных',
    other: '{count} непрочитанного',
  },
  countUnknownLabel: 'Число непрочитанных неизвестно',
  emptyLabel: 'Уведомлений пока нет',
  emptyUnreadLabel: 'Непрочитанных уведомлений нет',
  loadingLabel: 'Загружаем уведомления…',
  listErrorLabel: 'Не удалось загрузить уведомления',
  pageErrorLabel: 'Не удалось загрузить следующие уведомления',
  countErrorLabel: 'Не удалось загрузить число непрочитанных',
  retryLabel: 'Повторить',
  loadMoreLabel: 'Показать ещё',
  filtersLabel: 'Фильтр уведомлений',
  filterAllLabel: 'Все',
  filterUnreadLabel: 'Непрочитанные',
  showUpdatesLabel: 'Показать обновления',
  markAllReadLabel: 'Прочитать все',
  todayLabel: 'Сегодня',
  yesterdayLabel: 'Вчера',
  unreadMarkerLabel: 'Непрочитанное',
  timeNow: 'только что',
  relativeMinute: {
    one: '{count} минуту назад',
    few: '{count} минуты назад',
    many: '{count} минут назад',
    other: '{count} минуты назад',
  },
  relativeHour: {
    one: '{count} час назад',
    few: '{count} часа назад',
    many: '{count} часов назад',
    other: '{count} часа назад',
  },
};

const locales: Record<InboxLocale, InboxMessages> = { en, ru };

/** The dictionaries as shipped, keyed by built-in locale. */
export const defaultMessages: Record<InboxLocale, InboxMessages> = locales;

/** Locale tag for the copy layer: `ru*` → Russian, everything else → English. */
export function resolveMessageLocale(locale: string | undefined): InboxLocale {
  return locale && locale.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

function isPluralMessage(value: unknown): value is InboxPluralMessage {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.other !== 'string') return false;
  for (const category of ['zero', 'one', 'two', 'few', 'many']) {
    if (candidate[category] !== undefined && typeof candidate[category] !== 'string') return false;
  }
  return true;
}

/**
 * Merges locale defaults with consumer overrides, key by key.
 *
 * A value that does not fit the key it names — a number where a message is
 * expected, a plural group without its `other` form — is ignored instead of
 * reaching a binding. `undefined` never wins over a default, so a partially
 * filled override object is safe to pass.
 */
export function resolveMessages(
  locale: string | undefined,
  overrides?: Partial<InboxMessages>,
): InboxMessages {
  const base = locales[resolveMessageLocale(locale)];
  if (!overrides) return base;

  const merged: InboxMessages = { ...base };
  for (const key of Object.keys(base) as (keyof InboxMessages)[]) {
    const value = (overrides as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (typeof base[key] === 'string') {
      if (typeof value === 'string') Object.assign(merged, { [key]: value });
      continue;
    }
    if (isPluralMessage(value)) Object.assign(merged, { [key]: value });
  }
  return merged;
}

/** `format('{count} unread', { count })` — an unknown placeholder stays put. */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

const pluralRulesCache = new Map<string, Intl.PluralRules>();

function getPluralRules(locale: string): Intl.PluralRules {
  let rules = pluralRulesCache.get(locale);
  if (!rules) {
    try {
      rules = new Intl.PluralRules(locale);
    } catch {
      rules = new Intl.PluralRules('en-US');
    }
    pluralRulesCache.set(locale, rules);
  }
  return rules;
}

/**
 * The form of `forms` the locale uses for `count`.
 *
 * The rule comes from `Intl.PluralRules`, so English gets `one`/`other` and
 * Russian `one`/`few`/`many` without a table of exceptions here. A category the
 * dictionary does not list falls back to `other`, which every message declares.
 */
export function selectPlural(forms: InboxPluralMessage, count: number, locale: string): string {
  const category = getPluralRules(locale).select(count);
  return forms[category] ?? forms.other;
}
