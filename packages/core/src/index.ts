/**
 * @nickkupriyanov/inboxline-core — the framework-free half of Inboxline.
 *
 * The notification and adapter contracts, the reducer, the derived view model,
 * the controller, errors, time helpers and copy. No React, no DOM access at
 * import time: every binding drives this same core.
 *
 * Iterations 1 to 9 publish the integration contract, the state machine, the
 * derived view, the deterministic mock and the controller runtime: the domain
 * types, the context and filter helpers, the error vocabulary, the timestamp and
 * calendar-day helpers, the adapter boundary checks, the pure reducer with its
 * initial state, the resolved configuration, the copy and plural rules, the
 * stable class slots, `deriveInboxView()` with its memo, `createMockAdapter()`
 * with its scenario controls, and `createInboxController()` with its first-page,
 * counter, filter, paging, individual read-status, bulk mark-all and external
 * invalidation lifecycle. Iteration 10 adds the separate `inboxline-core/dom`
 * entry next to this one; it is deliberately not re-exported here.
 */

export * from './adapter';
export * from './classNames';
export * from './config';
export * from './context';
export * from './controller';
export * from './derive';
export * from './errors';
export * from './i18n';
export * from './mock';
export * from './reducer';
export * from './time';
export type * from './types';
