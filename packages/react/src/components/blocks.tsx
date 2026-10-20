/**
 * The default state blocks of the surface.
 *
 * Each block receives its prepared container props — the slot class, the
 * consumer's override and the `role` that makes a failure an alert or a load a
 * status. The localised copy and the retry handler come from the surface, so a
 * replacement never formats a message or invents a request of its own.
 */
import type { JSX } from 'react';
import type {
  EmptyPartProps,
  ErrorPartProps,
  LoadingPartProps,
  PageErrorPartProps,
} from '../parts';

/** Three skeleton rows with a visually hidden status label. */
export function Loading({ label, slotProps }: LoadingPartProps): JSX.Element {
  return (
    <div {...slotProps}>
      <span className="il-visually-hidden">{label}</span>
      <div className="il-loading-row" aria-hidden="true" />
      <div className="il-loading-row" aria-hidden="true" />
      <div className="il-loading-row" aria-hidden="true" />
    </div>
  );
}

/** The loaded list is empty. */
export function Empty({ label, slotProps }: EmptyPartProps): JSX.Element {
  return <p {...slotProps}>{label}</p>;
}

/** A first-page or next-page failure with a retry. */
export function ErrorState({
  message,
  retryLabel,
  onRetry,
  slotProps,
}: ErrorPartProps): JSX.Element {
  return (
    <div {...slotProps}>
      <span>{message}</span>
      <button type="button" onClick={onRetry}>
        {retryLabel}
      </button>
    </div>
  );
}

/** The next-page failure keeps the loaded rows on screen. */
export function PageErrorState({
  message,
  retryLabel,
  onRetry,
  slotProps,
}: PageErrorPartProps): JSX.Element {
  return (
    <div {...slotProps}>
      <span>{message}</span>
      <button type="button" onClick={onRetry}>
        {retryLabel}
      </button>
    </div>
  );
}
