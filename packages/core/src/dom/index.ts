/**
 * @nickkupriyanov/inboxline-core/dom — the DOM half of the core.
 *
 * Framework-free browser utilities a binding wires to its own lifecycle: focus
 * around a non-modal panel, size and height observation, media queries and the
 * viewport-constrained area around an anchor. The main entry point does not
 * import this module, and importing it does not touch `window` or `document`
 * until a function is called, so a server can load it safely.
 */

export * from './availableArea';
export * from './focus';
export * from './height';
export * from './media';
export * from './size';
