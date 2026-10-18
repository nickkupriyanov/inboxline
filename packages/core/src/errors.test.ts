import { describe, expect, it } from 'vitest';
import {
  INBOX_ERROR_CODES,
  INBOX_ERROR_OUTCOMES,
  INBOX_ERROR_PHASES,
  InboxError,
  createAbortError,
  createUnknownOutcomeError,
  isAbortError,
  isInboxError,
  isInboxErrorCode,
  isInboxErrorOutcome,
  isInboxErrorPhase,
  isUnknownOutcomeError,
  toInboxError,
} from './errors';

describe('INBOX_ERROR_CODES', () => {
  it('lists every code in the order of the specification', () => {
    expect(INBOX_ERROR_CODES).toEqual([
      'ADAPTER_FAILURE',
      'ADAPTER_CONTRACT_VIOLATION',
      'UNAUTHORIZED',
      'NOT_FOUND',
      'CONFLICT',
      'UNKNOWN',
    ]);
  });

  it('lists every phase and every outcome', () => {
    expect(INBOX_ERROR_PHASES).toEqual(['load', 'mutation']);
    expect(INBOX_ERROR_OUTCOMES).toEqual(['rejected', 'unknown']);
  });
});

describe('isInboxErrorCode', () => {
  it('accepts a known code', () => {
    expect(isInboxErrorCode('CONFLICT')).toBe(true);
  });

  it('rejects an unknown code, a non-string and a missing value', () => {
    expect(isInboxErrorCode('boom')).toBe(false);
    expect(isInboxErrorCode(409)).toBe(false);
    expect(isInboxErrorCode(undefined)).toBe(false);
  });
});

describe('isInboxErrorPhase and isInboxErrorOutcome', () => {
  it('accepts the shipped values of both vocabularies', () => {
    expect(isInboxErrorPhase('load')).toBe(true);
    expect(isInboxErrorPhase('mutation')).toBe(true);
    expect(isInboxErrorOutcome('rejected')).toBe(true);
    expect(isInboxErrorOutcome('unknown')).toBe(true);
  });

  it('rejects anything outside them, and does not confuse the two', () => {
    expect(isInboxErrorPhase('fetch')).toBe(false);
    expect(isInboxErrorPhase('unknown')).toBe(false);
    expect(isInboxErrorOutcome('load')).toBe(false);
    expect(isInboxErrorOutcome(undefined)).toBe(false);
  });
});

describe('InboxError', () => {
  it('carries the name, code, phase, outcome, message and cause', () => {
    const cause = new Error('fetch failed');
    const error = new InboxError({
      code: 'CONFLICT',
      phase: 'mutation',
      outcome: 'unknown',
      message: 'The server never answered',
      cause,
    });

    expect(error.name).toBe('InboxError');
    expect(error.code).toBe('CONFLICT');
    expect(error.phase).toBe('mutation');
    expect(error.outcome).toBe('unknown');
    expect(error.message).toBe('The server never answered');
    expect(error.cause).toBe(cause);
    expect(error).toBeInstanceOf(Error);
  });

  it('defaults to a confirmed rejection of a load', () => {
    const error = new InboxError({ code: 'ADAPTER_FAILURE', message: 'nope' });

    expect(error.phase).toBe('load');
    expect(error.outcome).toBe('rejected');
    expect(error.cause).toBeUndefined();
  });
});

describe('isInboxError', () => {
  it('recognises a real error', () => {
    expect(isInboxError(new InboxError({ code: 'UNKNOWN', message: 'nope' }))).toBe(true);
  });

  it('recognises a structurally identical object from another copy of the package', () => {
    const foreign = {
      name: 'InboxError',
      code: 'UNAUTHORIZED',
      phase: 'load',
      outcome: 'rejected',
      message: 'expired',
    };

    expect(isInboxError(foreign)).toBe(true);
  });

  it('rejects a plain error, a wrong name and an unknown code', () => {
    expect(isInboxError(new Error('nope'))).toBe(false);
    expect(isInboxError({ name: 'SomeError', code: 'UNKNOWN', message: 'nope' })).toBe(false);
    expect(isInboxError({ name: 'InboxError', code: 'BOOM', message: 'nope' })).toBe(false);
  });

  it('rejects a payload with a missing message, phase or outcome', () => {
    expect(isInboxError({ name: 'InboxError', code: 'UNKNOWN' })).toBe(false);
    expect(isInboxError({ name: 'InboxError', code: 'UNKNOWN', message: 'nope' })).toBe(false);
    expect(
      isInboxError({
        name: 'InboxError',
        code: 'UNKNOWN',
        message: 'nope',
        phase: 'fetch',
        outcome: 'rejected',
      }),
    ).toBe(false);
    expect(
      isInboxError({
        name: 'InboxError',
        code: 'UNKNOWN',
        message: 'nope',
        phase: 'load',
        outcome: 'maybe',
      }),
    ).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isInboxError(null)).toBe(false);
    expect(isInboxError('nope')).toBe(false);
  });
});

describe('isUnknownOutcomeError', () => {
  it('accepts an error whose outcome is unknown', () => {
    expect(isUnknownOutcomeError(createUnknownOutcomeError())).toBe(true);
    expect(
      isUnknownOutcomeError(new InboxError({ code: 'UNKNOWN', message: 'x', outcome: 'unknown' })),
    ).toBe(true);
  });

  it('rejects a confirmed rejection and anything that is not an error', () => {
    expect(isUnknownOutcomeError(new InboxError({ code: 'CONFLICT', message: 'x' }))).toBe(false);
    expect(isUnknownOutcomeError(new Error('nope'))).toBe(false);
    expect(isUnknownOutcomeError(undefined)).toBe(false);
  });
});

describe('toInboxError', () => {
  it('passes a classified error through untouched', () => {
    const original = new InboxError({ code: 'NOT_FOUND', message: 'gone' });

    expect(toInboxError(original, 'UNKNOWN')).toBe(original);
  });

  it('wraps a plain error with the fallback code and phase, and keeps the cause', () => {
    const cause = new TypeError('fetch failed');
    const error = toInboxError(cause, 'ADAPTER_FAILURE', 'mutation');

    expect(error.code).toBe('ADAPTER_FAILURE');
    expect(error.phase).toBe('mutation');
    expect(error.outcome).toBe('rejected');
    expect(error.message).toBe('fetch failed');
    expect(error.cause).toBe(cause);
  });

  it('wraps a thrown non-error value and defaults the phase to a load', () => {
    const error = toInboxError('boom', 'ADAPTER_CONTRACT_VIOLATION');

    expect(error.code).toBe('ADAPTER_CONTRACT_VIOLATION');
    expect(error.phase).toBe('load');
    expect(error.message).toBe('boom');
  });
});

describe('createUnknownOutcomeError', () => {
  it('classifies a lost answer as an unknown mutation outcome', () => {
    const cause = new Error('socket closed');
    const error = createUnknownOutcomeError(cause);

    expect(error.code).toBe('UNKNOWN');
    expect(error.phase).toBe('mutation');
    expect(error.outcome).toBe('unknown');
    expect(error.cause).toBe(cause);
    expect(isUnknownOutcomeError(error)).toBe(true);
  });

  it('takes a phase and a message', () => {
    const error = createUnknownOutcomeError(undefined, {
      phase: 'load',
      message: 'The counter never answered',
    });

    expect(error.phase).toBe('load');
    expect(error.message).toBe('The counter never answered');
  });

  it('says that the outcome is unknown instead of blaming the operation', () => {
    expect(createUnknownOutcomeError().message).toContain('unknown');
  });
});

describe('isAbortError', () => {
  it('recognises an abort and a timeout', () => {
    expect(isAbortError({ name: 'AbortError' })).toBe(true);
    expect(isAbortError({ name: 'TimeoutError' })).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isAbortError(new Error('AbortError'))).toBe(false);
    expect(isAbortError({ name: 'NetworkError' })).toBe(false);
    expect(isAbortError(new InboxError({ code: 'UNKNOWN', message: 'nope' }))).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});

describe('createAbortError', () => {
  it('builds an error that `isAbortError` recognises', () => {
    const error = createAbortError();

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AbortError');
    expect(isAbortError(error)).toBe(true);
  });

  it('takes a custom message', () => {
    expect(createAbortError('superseded').message).toBe('superseded');
  });

  it('is not dressed up as an Inboxline failure', () => {
    expect(isInboxError(createAbortError())).toBe(false);
  });
});
