/**
 * The error contract between an adapter and the core.
 *
 * An adapter throws `InboxError` to state what it knows: the code classifies the
 * failure, the phase says whether a load or a mutation failed, and the outcome
 * separates a confirmed refusal from a change whose result was never learned.
 * Anything else that is thrown is normalised by the core through
 * `toInboxError()`, which keeps the original value as the cause.
 *
 * Cancellation is not a failure and has no code: a request the library itself
 * aborted is rejected with an `AbortError`, `isAbortError()` recognises it, and
 * the core drops it before it can reach `onError`.
 */
import type { InboxErrorCode, InboxErrorOutcome, InboxErrorPhase } from './types';

/** Every code, in the order of the specification table. */
export const INBOX_ERROR_CODES: readonly InboxErrorCode[] = [
  'ADAPTER_FAILURE',
  'ADAPTER_CONTRACT_VIOLATION',
  'UNAUTHORIZED',
  'NOT_FOUND',
  'CONFLICT',
  'UNKNOWN',
];

/** Every phase, in the order of the specification table. */
export const INBOX_ERROR_PHASES: readonly InboxErrorPhase[] = ['load', 'mutation'];

/** Every outcome, in the order of the specification table. */
export const INBOX_ERROR_OUTCOMES: readonly InboxErrorOutcome[] = ['rejected', 'unknown'];

const CODE_SET: ReadonlySet<string> = new Set<string>(INBOX_ERROR_CODES);
const PHASE_SET: ReadonlySet<string> = new Set<string>(INBOX_ERROR_PHASES);
const OUTCOME_SET: ReadonlySet<string> = new Set<string>(INBOX_ERROR_OUTCOMES);

/** What an adapter, the core or the controller states about one failure. */
export interface InboxErrorOptions {
  code: InboxErrorCode;
  message: string;
  /** Default: `load`, the phase most failures come from. */
  phase?: InboxErrorPhase;
  /** Default: `rejected`, a server answer that confirms the change did not happen. */
  outcome?: InboxErrorOutcome;
  /** The failure that caused this one: a `TypeError` from `fetch`, a backend payload. */
  cause?: unknown;
}

/**
 * Classifies one failure of one request.
 *
 * Use it in an adapter:
 *
 * ```ts
 * throw new InboxError({ code: 'UNAUTHORIZED', message: 'The session expired' });
 * ```
 *
 * And use the outcome when the answer never arrived:
 *
 * ```ts
 * throw new InboxError({
 *   code: 'UNKNOWN',
 *   phase: 'mutation',
 *   outcome: 'unknown',
 *   message: 'No answer to the mark-read call',
 * });
 * ```
 */
export class InboxError extends Error {
  readonly code: InboxErrorCode;
  readonly phase: InboxErrorPhase;
  readonly outcome: InboxErrorOutcome;

  constructor(options: InboxErrorOptions) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'InboxError';
    this.code = options.code;
    this.phase = options.phase ?? 'load';
    this.outcome = options.outcome ?? 'rejected';
  }
}

/** Narrows an unknown value to an `InboxErrorCode`. */
export function isInboxErrorCode(value: unknown): value is InboxErrorCode {
  return typeof value === 'string' && CODE_SET.has(value);
}

/** Narrows an unknown value to an `InboxErrorPhase`. */
export function isInboxErrorPhase(value: unknown): value is InboxErrorPhase {
  return typeof value === 'string' && PHASE_SET.has(value);
}

/** Narrows an unknown value to an `InboxErrorOutcome`. */
export function isInboxErrorOutcome(value: unknown): value is InboxErrorOutcome {
  return typeof value === 'string' && OUTCOME_SET.has(value);
}

/**
 * Structural check, deliberately not `instanceof`: an adapter may hold a second
 * copy of this package, and a real failure must not be downgraded to `UNKNOWN`
 * because of that.
 */
export function isInboxError(value: unknown): value is InboxError {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
    phase?: unknown;
    outcome?: unknown;
  };
  return (
    candidate.name === 'InboxError' &&
    isInboxErrorCode(candidate.code) &&
    typeof candidate.message === 'string' &&
    isInboxErrorPhase(candidate.phase) &&
    isInboxErrorOutcome(candidate.outcome)
  );
}

/**
 * Whether the change may or may not have been applied.
 *
 * The core never retries such a failure on its own: a lost response does not
 * prove that the server changed nothing, so the client reconciles first and only
 * a new user request may repeat the operation.
 */
export function isUnknownOutcomeError(value: unknown): value is InboxError {
  return isInboxError(value) && value.outcome === 'unknown';
}

/**
 * Turns anything an adapter threw into an `InboxError`.
 *
 * The fallback code belongs to the caller: only it knows what the failure means
 * — a missing row becomes `NOT_FOUND`, an unusable payload becomes
 * `ADAPTER_CONTRACT_VIOLATION`, an unclassified rejection becomes
 * `ADAPTER_FAILURE`. A value that already is an `InboxError` passes through
 * untouched, so a classification an adapter made is never lost.
 */
export function toInboxError(
  value: unknown,
  fallbackCode: InboxErrorCode,
  phase: InboxErrorPhase = 'load',
): InboxError {
  if (isInboxError(value)) return value;

  const message = value instanceof Error ? value.message : String(value);
  return new InboxError({ code: fallbackCode, phase, message, cause: value });
}

/**
 * Builds the error a mutation is reported with when its result was never
 * learned — a lost response, a timeout, a connection closed mid-flight.
 *
 * The message says that the outcome is unknown rather than that the operation
 * failed, because presenting a lost answer as a refusal would be a lie the
 * application might act on.
 */
export function createUnknownOutcomeError(
  cause?: unknown,
  options: { phase?: InboxErrorPhase; message?: string } = {},
): InboxError {
  return new InboxError({
    code: 'UNKNOWN',
    phase: options.phase ?? 'mutation',
    outcome: 'unknown',
    message: options.message ?? 'Inboxline: the outcome of the request is unknown',
    cause,
  });
}

/**
 * `true` for a cancellation the library itself triggered.
 *
 * A cancelled load is not a failure and must not reach `onError`; it is the
 * normal result of a superseded request, a changed context or a stopped
 * controller.
 */
export function isAbortError(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const name = (value as { name?: unknown }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

/**
 * Creates the cancellation error a superseded request is rejected with.
 *
 * The library builds it itself instead of relying on `DOMException`, so an
 * adapter and the controller mean the same thing by "aborted" on the server as
 * in a browser, and `isAbortError()` recognises it.
 */
export function createAbortError(message = 'The request was aborted'): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}
