/**
 * What an application may ask of a controller, and what the controller reports
 * back to it.
 *
 * Types only: this module declares the vocabulary so a binding and an
 * application can agree on it before the runtime exists. `createInboxController`
 * and the machinery behind these actions — request generations, the serialised
 * mutation queue, the unknown-outcome reconciliation — arrive in Iterations 5
 * to 9. Until then nothing here is callable.
 *
 * The controlled UI values are deliberately *not* part of this vocabulary. The
 * open state of the bell panel, the focus and the portal belong to the binding,
 * and the filter a visitor picked is a controlled value there
 * (`filter`/`defaultFilter`/`onFilterChange`). They reach the core through these
 * actions, which keeps one source of truth: the server data in the controller.
 */
import type { InboxAdapter } from './adapter';
import type { InboxError } from './errors';
import type { InboxContext, InboxFilter, InboxNotification } from './types';

/**
 * The operations a controller exposes.
 *
 * Every action that talks to the server is safe to call at any time: a load that
 * is superseded by a newer one is abandoned, a mutation is queued behind the
 * mutations already in flight, and a bulk mark-all runs on its own rather than
 * inside that queue.
 *
 * The promises resolve once the operation has settled, successfully or not, and
 * never reject: a failure is reported through {@link InboxCallbacks.onError} and
 * through the snapshot, so a binding never has to attach a `.catch()` to keep a
 * console clean.
 *
 * @typeParam TData — Application data carried by every notification.
 * @typeParam TContextData — Application data carried by the context.
 */
export interface InboxActions<TData = unknown, TContextData = unknown> {
  /** Selects the filter of the list. The unread counter is not affected. */
  setFilter(filter: InboxFilter): void;
  /** Reloads the first page and the counter, replacing the loaded list. */
  refresh(): Promise<void>;
  /** Appends the next page of the current filter and context, when there is one. */
  loadMore(): Promise<void>;
  /**
   * Sets one notification to the desired read state and keeps it in the queue
   * until the server confirms it. `read` is a state, not a toggle.
   */
  setRead(id: string, read: boolean): Promise<void>;
  /**
   * Marks every notification of the context read on the server, including the
   * ones that were never loaded. Refused while individual mutations are queued.
   */
  markAllRead(): Promise<void>;
  /** Reads the server state again after an unknown outcome, without retrying it. */
  reconcile(): Promise<void>;
  /** Replaces the context. In-flight work of the previous one is abandoned. */
  setContext(context: InboxContext<TContextData>): void;
  /** Replaces the adapter. In-flight work of the previous one is abandoned. */
  setAdapter(adapter: InboxAdapter<TData, TContextData>): void;
}

/**
 * The callbacks an application passes to a controller.
 *
 * They are invoked after the state has been updated, and an exception thrown
 * inside one is contained: it is not reported as a server failure and never
 * triggers a second mutation.
 *
 * @typeParam TData — Application data carried by every notification.
 */
export interface InboxCallbacks<TData = unknown> {
  /**
   * The visitor activated a notification. The application navigates from here —
   * the library never opens a link on its own — typically using the payload in
   * `notification.data`.
   */
  onNotificationClick?(notification: InboxNotification<TData>): void;
  /**
   * A request failed in a way the application may want to surface. A cancelled
   * request is not a failure and never arrives here.
   */
  onError?(error: InboxError): void;
}
