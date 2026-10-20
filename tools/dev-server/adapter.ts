/**
 * The client half of the teaching server: an `InboxAdapter` over HTTP.
 *
 * The server's payload is deliberately not the core contract. This file is the
 * only place that translates it:
 *
 * | Server                         | Core                              |
 * | ------------------------------ | --------------------------------- |
 * | `rows` / `cursor`              | `items` / `nextCursor`            |
 * | `notificationId` / `headline`  | `id` / `title`                    |
 * | `occurredAt` / `isRead`        | `createdAt` / `read`              |
 * | `count`                        | `unreadCount`                     |
 * | `through`                      | `boundary`                        |
 * | `{ error: { code, message } }` | `InboxError`                      |
 *
 * `context.key` becomes the `workspace` query parameter. That is the whole
 * multi-tenancy model of the example; a real backend decides who may read a
 * workspace, and the browser never carries that decision.
 *
 * A classified HTTP refusal becomes an `InboxError` with the matching phase and
 * a `rejected` outcome. A network failure is left as the `TypeError` the fetch
 * produced: for a mutation that is an unknown outcome, and the core reconciles
 * it instead of guessing. `AbortError` is passed through untouched.
 */
import { InboxError, isInboxErrorCode, isInboxTimestamp } from '@nickkupriyanov/inboxline-core';
import type {
  InboxAdapter,
  InboxErrorCode,
  InboxErrorPhase,
  InboxNotification,
} from '@nickkupriyanov/inboxline-core';

/** The notification shape the example server returns. */
export interface ServerNotificationRow {
  notificationId: string;
  headline: string;
  message?: string;
  actor?: {
    id?: string;
    displayName: string;
    avatar?: string;
  };
  iconUrl?: string;
  isRead: boolean;
  occurredAt: string;
  /** Application data carried through `TData`. */
  payload?: unknown;
}

/** A scenario the example server understands through `x-inbox-scenario`. */
export type InboxHttpScenario =
  | 'normal'
  | 'load-refused'
  | 'page-refused'
  | 'count-refused'
  | 'read-refused'
  | 'read-lost'
  | 'bulk-refused'
  | 'bulk-lost';

export interface InboxHttpAdapterOptions {
  /** Where the example server listens, for example `http://127.0.0.1:8787`. */
  baseUrl: string;
  /** Rows per page. Default: 10, the server's own default. */
  pageSize?: number;
  /**
   * A scripted server response for the demo. Default: `normal`.
   *
   * The header is sent only on the operation the scenario belongs to, so a lost
   * read answer still reconciles through a normal refresh.
   */
  scenario?: InboxHttpScenario;
  /** Injectable for tests; defaults to the global `fetch` at call time. */
  fetch?: typeof globalThis.fetch;
}

/** The HTTP adapter. It implements the same interface as the mock. */
export type InboxHttpAdapter<TData = unknown, TContextData = unknown> = InboxAdapter<
  TData,
  TContextData
>;

interface ErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isServerRow(value: unknown): value is ServerNotificationRow {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Partial<ServerNotificationRow>;
  if (!isNonEmptyString(row.notificationId) || !isNonEmptyString(row.headline)) return false;
  if (typeof row.isRead !== 'boolean' || !isInboxTimestamp(row.occurredAt)) return false;
  if (row.message !== undefined && typeof row.message !== 'string') return false;
  if (row.iconUrl !== undefined && typeof row.iconUrl !== 'string') return false;
  if (row.actor !== undefined) {
    if (typeof row.actor !== 'object' || row.actor === null) return false;
    if (!isNonEmptyString(row.actor.displayName)) return false;
    if (row.actor.avatar !== undefined && typeof row.actor.avatar !== 'string') return false;
  }
  return true;
}

function toNotification<TData>(row: ServerNotificationRow): InboxNotification<TData> {
  return {
    id: row.notificationId,
    title: row.headline,
    createdAt: row.occurredAt,
    read: row.isRead,
    ...(row.message === undefined ? {} : { body: row.message }),
    ...(row.iconUrl === undefined ? {} : { icon: row.iconUrl }),
    ...(row.actor === undefined
      ? {}
      : {
          author: {
            name: row.actor.displayName,
            ...(row.actor.id === undefined ? {} : { id: row.actor.id }),
            ...(row.actor.avatar === undefined ? {} : { avatarUrl: row.actor.avatar }),
          },
        }),
    ...(row.payload === undefined ? {} : { data: row.payload as TData }),
  };
}

function codeFor(status: number, candidate: string | undefined): InboxErrorCode {
  if (isInboxErrorCode(candidate)) return candidate;
  if (status === 401 || status === 403) return 'UNAUTHORIZED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  return 'ADAPTER_FAILURE';
}

function violation(message: string, phase: InboxErrorPhase): InboxError {
  return new InboxError({ code: 'ADAPTER_CONTRACT_VIOLATION', phase, message });
}

/**
 * Builds an adapter for the example server.
 *
 * ```ts
 * const adapter = createInboxHttpAdapter<ProjectData>({
 *   baseUrl: 'http://127.0.0.1:8787',
 *   pageSize: 10,
 *   scenario: 'read-lost',
 * });
 * ```
 */
export function createInboxHttpAdapter<TData = unknown, TContextData = unknown>(
  options: InboxHttpAdapterOptions,
): InboxHttpAdapter<TData, TContextData> {
  const base = options.baseUrl.replace(/\/$/, '');
  const pageSize = options.pageSize ?? 10;
  const scenario = options.scenario ?? 'normal';
  const doFetch: typeof globalThis.fetch =
    options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  function headersFor(
    operation: 'list' | 'count' | 'read' | 'bulk',
    cursor?: string | null,
  ): Record<string, string> {
    const applies =
      (operation === 'list' && scenario === 'load-refused' && (cursor ?? null) === null) ||
      (operation === 'list' && scenario === 'page-refused' && (cursor ?? null) !== null) ||
      (operation === 'count' && scenario === 'count-refused') ||
      (operation === 'read' && (scenario === 'read-refused' || scenario === 'read-lost')) ||
      (operation === 'bulk' && (scenario === 'bulk-refused' || scenario === 'bulk-lost'));

    return applies ? { 'x-inbox-scenario': scenario } : {};
  }

  async function failure(response: Response, phase: InboxErrorPhase): Promise<InboxError> {
    let body: ErrorPayload = {};
    try {
      body = (await response.json()) as ErrorPayload;
    } catch {
      body = {};
    }
    return new InboxError({
      code: codeFor(response.status, body.error?.code),
      phase,
      message:
        body.error?.message ??
        `The example server answered ${response.status} ${response.statusText}`,
    });
  }

  async function jsonOf<T>(response: Response, phase: InboxErrorPhase): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch {
      throw violation('The example server sent a body that is not JSON', phase);
    }
  }

  return {
    async getNotifications(query) {
      const params = new URLSearchParams({
        workspace: query.context.key,
        filter: query.filter,
        limit: String(pageSize),
      });
      if (query.cursor !== null) params.set('cursor', query.cursor);

      const response = await doFetch(`${base}/api/notifications?${params}`, {
        method: 'GET',
        signal: query.signal,
        headers: headersFor('list', query.cursor),
      });
      if (!response.ok) throw await failure(response, 'load');

      const payload = await jsonOf<{ rows?: unknown; cursor?: unknown }>(response, 'load');
      if (!Array.isArray(payload.rows)) {
        throw violation('GET /api/notifications must return a rows array', 'load');
      }
      if (
        payload.cursor !== null &&
        payload.cursor !== undefined &&
        !isNonEmptyString(payload.cursor)
      ) {
        throw violation('GET /api/notifications returned an invalid cursor', 'load');
      }

      return {
        items: payload.rows.map((row) => {
          if (!isServerRow(row)) {
            throw violation('GET /api/notifications returned an invalid row', 'load');
          }
          return toNotification<TData>(row);
        }),
        nextCursor: (payload.cursor as string | null | undefined) ?? null,
      };
    },

    async getUnreadCount(query) {
      const params = new URLSearchParams({ workspace: query.context.key });
      const response = await doFetch(`${base}/api/unread-count?${params}`, {
        method: 'GET',
        signal: query.signal,
        headers: headersFor('count'),
      });
      if (!response.ok) throw await failure(response, 'load');

      const payload = await jsonOf<{ count?: unknown }>(response, 'load');
      if (
        typeof payload.count !== 'number' ||
        !Number.isInteger(payload.count) ||
        payload.count < 0
      ) {
        throw violation('GET /api/unread-count must return a non-negative integer count', 'load');
      }
      return { unreadCount: payload.count };
    },

    async setReadStatus(query) {
      const params = new URLSearchParams({ workspace: query.context.key });
      const response = await doFetch(
        `${base}/api/notifications/${encodeURIComponent(query.id)}?${params}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', ...headersFor('read') },
          body: JSON.stringify({ read: query.read }),
        },
      );
      if (!response.ok) throw await failure(response, 'mutation');

      const payload = await jsonOf<{ row?: unknown; count?: unknown }>(response, 'mutation');
      if (!isServerRow(payload.row)) {
        throw violation('PATCH /api/notifications must return a valid row', 'mutation');
      }
      if (
        typeof payload.count !== 'number' ||
        !Number.isInteger(payload.count) ||
        payload.count < 0
      ) {
        throw violation('PATCH /api/notifications must return a valid count', 'mutation');
      }

      return {
        notification: toNotification<TData>(payload.row),
        unreadCount: payload.count,
      };
    },

    async markAllRead(query) {
      const params = new URLSearchParams({ workspace: query.context.key });
      const response = await doFetch(`${base}/api/notifications/read-all?${params}`, {
        method: 'POST',
        headers: headersFor('bulk'),
      });
      if (!response.ok) throw await failure(response, 'mutation');

      const payload = await jsonOf<{ through?: unknown; count?: unknown }>(response, 'mutation');
      if (!isInboxTimestamp(payload.through)) {
        throw violation(
          'POST /api/notifications/read-all must return an RFC 3339 boundary',
          'mutation',
        );
      }
      if (
        typeof payload.count !== 'number' ||
        !Number.isInteger(payload.count) ||
        payload.count < 0
      ) {
        throw violation('POST /api/notifications/read-all must return a valid count', 'mutation');
      }

      return { boundary: payload.through, unreadCount: payload.count };
    },
  };
}
