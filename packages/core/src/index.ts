/**
 * @nickkupriyanov/inboxline-core — the framework-free half of Inboxline.
 *
 * The notification and adapter contracts, the reducer, the derived view model,
 * the controller, errors, time helpers and copy. No React, no DOM access at
 * import time: every binding drives this same core.
 *
 * Iteration 1 publishes the integration contract and nothing that runs a
 * request: the domain types, the context and filter helpers, the error
 * vocabulary, the timestamp check and the adapter boundary checks. The reducer
 * and the derived view model arrive in Iterations 2 and 3, the deterministic
 * mock adapter in 4, and `createInboxController()` in 5 — all of them through
 * this same entry point.
 */

export * from './adapter';
export * from './context';
export * from './errors';
export * from './time';
export type * from './controller';
export type * from './types';
