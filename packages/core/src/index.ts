/**
 * @nickkupriyanov/inboxline-core — the framework-free half of Inboxline.
 *
 * The notification and adapter contracts, the reducer, the derived view model,
 * the controller, errors, time helpers and copy. No React, no DOM access at
 * import time: every binding drives this same core.
 *
 * Iterations 1 and 2 publish the integration contract and the state machine:
 * the domain types, the context and filter helpers, the error vocabulary, the
 * timestamp check, the adapter boundary checks and the pure reducer with its
 * initial state — all of it without a single request. The derived view model
 * arrives in Iteration 3, the deterministic mock adapter in 4, and
 * `createInboxController()` in 5 — all of them through this same entry point.
 */

export * from './adapter';
export * from './context';
export * from './errors';
export * from './reducer';
export * from './time';
export type * from './controller';
export type * from './types';
