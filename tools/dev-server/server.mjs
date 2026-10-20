#!/usr/bin/env node
/**
 * The teaching server for the Inboxline HTTP example.
 *
 * It is deliberately not a notification backend: there is no authentication, no
 * recipient model, no delivery and no persistence. It exists to show the
 * semantics the adapter contract relies on with real HTTP:
 *
 *   GET   /api/notifications?workspace=&filter=&cursor=&limit=
 *   GET   /api/unread-count?workspace=
 *   PATCH /api/notifications/:id?workspace=      body { read }
 *   POST  /api/notifications/read-all?workspace=
 *   POST  /api/demo/notifications?workspace=     (seed another client's event)
 *   GET   /api/health
 *
 * The payload is deliberately different from `InboxNotification`: the adapter in
 * `adapter.ts` is the only place that knows how to translate `headline`,
 * `isRead`, `occurredAt`, `rows`/`cursor` and the other server names.
 *
 * Two behaviours are the point of the exercise:
 *
 *   · `read-all` is applied to the whole workspace, including rows the client
 *     never loaded, and its boundary leaves later events unread.
 *   · The `x-inbox-scenario` header can commit a change and then drop the socket,
 *     so a mutation answer is genuinely lost. The client cannot know whether the
 *     change happened; a refresh is the only way to find out.
 *
 * Everything lives in memory. Restarting the process resets every workspace.
 *
 *   node tools/dev-server/server.mjs --port 8787
 */
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const SCENARIOS = new Set([
  'normal',
  'load-refused',
  'page-refused',
  'count-refused',
  'read-refused',
  'read-lost',
  'bulk-refused',
  'bulk-lost',
]);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

/**
 * The server's notification payload.
 *
 * `headline`, `isRead`, `occurredAt`, `rows` and `cursor` are the names the
 * adapter translates; none of them is the core's `title`, `read`, `createdAt`,
 * `items` or `nextCursor`.
 */
function isServerRow(value) {
  if (typeof value !== 'object' || value === null) return false;
  const row = value;
  if (!isNonEmptyString(row.notificationId) || !isNonEmptyString(row.headline)) return false;
  if (typeof row.isRead !== 'boolean' || !isTimestamp(row.occurredAt)) return false;
  if (row.message !== undefined && typeof row.message !== 'string') return false;
  if (row.iconUrl !== undefined && typeof row.iconUrl !== 'string') return false;
  if (row.actor !== undefined) {
    if (typeof row.actor !== 'object' || row.actor === null) return false;
    if (!isNonEmptyString(row.actor.displayName)) return false;
    if (row.actor.avatar !== undefined && typeof row.actor.avatar !== 'string') return false;
  }
  return true;
}

function cloneRow(row) {
  return {
    ...row,
    ...(row.actor === undefined ? {} : { actor: { ...row.actor } }),
  };
}

function compareRows(a, b) {
  const difference = Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
  if (difference !== 0) return difference;
  return a.notificationId.localeCompare(b.notificationId);
}

function cursorOf(row) {
  return Buffer.from(
    JSON.stringify([Date.parse(row.occurredAt), row.notificationId]),
    'utf8',
  ).toString('base64url');
}

function decodeCursor(value) {
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!Array.isArray(decoded) || decoded.length !== 2) return null;
    const [instant, id] = decoded;
    if (!Number.isFinite(instant) || !isNonEmptyString(id)) return null;
    return { instant, id };
  } catch {
    return null;
  }
}

/** True when `row` sorts strictly after the cursor position. */
function afterCursor(row, cursor) {
  const instant = Date.parse(row.occurredAt);
  if (instant !== cursor.instant) return instant < cursor.instant;
  return row.notificationId > cursor.id;
}

/** Twelve rows for the main demo and four for the second workspace. */
export function createDemoSeed(now = Date.now()) {
  const at = (minutes) => new Date(now - minutes * 60_000).toISOString();
  const avatar = (seed) => `https://picsum.photos/seed/inboxline-http-${seed}/96/96`;

  const row = (id, minutes, read, headline, extra = {}) => ({
    notificationId: id,
    occurredAt: at(minutes),
    isRead: read,
    headline,
    ...extra,
  });

  return {
    'demo-a': [
      row('a-12', 4, false, 'Deploy finished', {
        message: 'inboxline-web is live on production.',
        actor: { id: 'release-bot', displayName: 'Release bot', avatar: avatar('release') },
        payload: { project: 'inboxline-web', kind: 'deploy' },
      }),
      row('a-11', 26, false, 'New comment on “HTTP contract”', {
        message: 'Maria left a note about the lost-answer scenario.',
        actor: { id: 'maria', displayName: 'Maria Ivanova', avatar: avatar('maria') },
        payload: { project: 'inboxline-web', kind: 'comment' },
      }),
      row('a-10', 51, false, 'Access request approved', {
        message: 'Workspace analytics is now available to you.',
        payload: { project: 'analytics', kind: 'access' },
      }),
      row('a-9', 70, true, 'Weekly digest', {
        message: 'Four events happened in the last seven days.',
        payload: { project: 'workspace', kind: 'digest' },
      }),
      row('a-8', 3 * 60, false, 'Backup finished', {
        message: 'The nightly backup is stored and verified.',
        iconUrl: avatar('backup'),
        payload: { project: 'infrastructure', kind: 'deploy' },
      }),
      row('a-7', 5 * 60, false, 'Payment received', {
        message: 'Invoice #2041 is settled.',
        payload: { project: 'billing', kind: 'digest' },
      }),
      row('a-6', 24 * 60 + 20, true, 'Release notes published', {
        payload: { project: 'inboxline-web', kind: 'deploy' },
      }),
      row('a-5', 27 * 60, false, 'A very old unread row', {
        message: 'This row exists only to keep the counter above the loaded page.',
        payload: { project: 'workspace', kind: 'digest' },
      }),
      row('a-4', 2 * 24 * 60, false, 'Workspace member invited', {
        payload: { project: 'workspace', kind: 'access' },
      }),
      row('a-3', 3 * 24 * 60, true, 'Security review completed', {
        payload: { project: 'infrastructure', kind: 'access' },
      }),
      row('a-2', 4 * 24 * 60, false, 'Two-factor authentication enabled', {
        payload: { project: 'security', kind: 'access' },
      }),
      row('a-1', 5 * 24 * 60, true, 'Welcome to the demo workspace', {
        message: 'This row is the oldest page of the seeded list.',
        payload: { project: 'workspace', kind: 'digest' },
      }),
    ],
    'demo-b': [
      row('b-4', 7, false, 'Ticket assigned to you', {
        message: 'Support queue · #318',
        payload: { project: 'support', kind: 'comment' },
      }),
      row('b-3', 33, false, 'Billing contact updated', {
        payload: { project: 'billing', kind: 'access' },
      }),
      row('b-2', 6 * 60, true, 'Workspace B digest', {
        payload: { project: 'workspace-b', kind: 'digest' },
      }),
      row('b-1', 2 * 24 * 60, true, 'Welcome to workspace B', {
        payload: { project: 'workspace-b', kind: 'digest' },
      }),
    ],
  };
}

/**
 * The example server, its in-memory state and its scenario switch.
 *
 * `now` is injectable so a test can make the bulk boundary deterministic;
 * `seed` replaces the demo rows for a focused scenario.
 */
export function createExampleServer(options = {}) {
  const now = options.now ?? (() => Date.now());
  const seed = options.seed ?? createDemoSeed(now());

  /** workspace → rows, in no particular order. */
  const workspaces = new Map();
  for (const [workspace, rows] of Object.entries(seed)) {
    workspaces.set(workspace, rows.filter(isServerRow).map(cloneRow));
  }

  function rowsOf(workspace) {
    return workspaces.get(workspace) ?? [];
  }

  function orderedRows(workspace, filter) {
    const rows = rowsOf(workspace).filter((row) => filter !== 'unread' || !row.isRead);
    return [...rows].sort(compareRows);
  }

  function unreadOf(workspace) {
    return rowsOf(workspace).filter((row) => !row.isRead).length;
  }

  function json(response, status, body) {
    const payload = JSON.stringify(body);
    response.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(payload),
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, x-inbox-scenario',
      'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
      'cache-control': 'no-store',
    });
    response.end(payload);
  }

  function fail(response, status, code, message) {
    json(response, status, { error: { code, message } });
  }

  async function readBody(request) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (chunks.length === 0) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return null;
    }
  }

  function workspaceOf(url) {
    const workspace = url.searchParams.get('workspace') ?? '';
    return isNonEmptyString(workspace) ? workspace : null;
  }

  function scenarioOf(request) {
    const scenario = request.headers['x-inbox-scenario'];
    return typeof scenario === 'string' && SCENARIOS.has(scenario) ? scenario : 'normal';
  }

  function dropAnswer(response) {
    // Committed, then the answer never arrives: the client has to refresh.
    response.socket?.destroy();
  }

  function addNotification(workspace, row) {
    if (!isNonEmptyString(workspace)) throw new RangeError('workspace must be non-empty');
    if (!isServerRow(row)) throw new RangeError('a demo notification row is invalid');
    const rows = rowsOf(workspace);
    rows.push(cloneRow(row));
    workspaces.set(workspace, rows);
    return cloneRow(row);
  }

  const handler = async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const scenario = scenarioOf(request);

    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type, x-inbox-scenario',
        'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
      });
      response.end();
      return;
    }

    if (url.pathname === '/api/health' && request.method === 'GET') {
      json(response, 200, { ok: true, now: new Date(now()).toISOString() });
      return;
    }

    if (url.pathname === '/api/notifications' && request.method === 'GET') {
      const workspace = workspaceOf(url);
      if (workspace === null) {
        fail(response, 400, 'ADAPTER_CONTRACT_VIOLATION', 'workspace is required');
        return;
      }

      const filter = url.searchParams.get('filter') ?? 'all';
      if (filter !== 'all' && filter !== 'unread') {
        fail(response, 400, 'ADAPTER_CONTRACT_VIOLATION', 'filter must be all or unread');
        return;
      }

      const rawLimit = url.searchParams.get('limit');
      const limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        fail(
          response,
          400,
          'ADAPTER_CONTRACT_VIOLATION',
          `limit must be an integer between 1 and ${MAX_LIMIT}`,
        );
        return;
      }

      const rawCursor = url.searchParams.get('cursor');
      const cursor = rawCursor === null ? null : decodeCursor(rawCursor);
      if (rawCursor !== null && cursor === null) {
        fail(
          response,
          400,
          'ADAPTER_CONTRACT_VIOLATION',
          'cursor is not a cursor this server issued',
        );
        return;
      }

      if (
        (scenario === 'load-refused' && cursor === null) ||
        (scenario === 'page-refused' && cursor !== null)
      ) {
        fail(response, 503, 'ADAPTER_FAILURE', 'The example server refused this page');
        return;
      }

      const ordered = orderedRows(workspace, filter);
      const start = cursor === null ? ordered : ordered.filter((row) => afterCursor(row, cursor));
      const page = start.slice(0, limit);
      const remaining = start.length > page.length;
      const last = page[page.length - 1];

      json(response, 200, {
        rows: page,
        cursor: remaining && last !== undefined ? cursorOf(last) : null,
      });
      return;
    }

    if (url.pathname === '/api/unread-count' && request.method === 'GET') {
      const workspace = workspaceOf(url);
      if (workspace === null) {
        fail(response, 400, 'ADAPTER_CONTRACT_VIOLATION', 'workspace is required');
        return;
      }
      if (scenario === 'count-refused') {
        fail(response, 503, 'ADAPTER_FAILURE', 'The example server refused the counter');
        return;
      }
      json(response, 200, { count: unreadOf(workspace) });
      return;
    }

    const readMatch = /^\/api\/notifications\/([^/]+)$/.exec(url.pathname);
    if (readMatch !== null && request.method === 'PATCH') {
      const workspace = workspaceOf(url);
      if (workspace === null) {
        fail(response, 400, 'ADAPTER_CONTRACT_VIOLATION', 'workspace is required');
        return;
      }
      const body = await readBody(request);
      if (body === null || typeof body.read !== 'boolean') {
        fail(response, 400, 'ADAPTER_CONTRACT_VIOLATION', 'the read flag must be a boolean');
        return;
      }

      const rows = rowsOf(workspace);
      const row = rows.find((candidate) => candidate.notificationId === readMatch[1]);
      if (row === undefined) {
        fail(response, 404, 'NOT_FOUND', 'There is no notification with that id');
        return;
      }
      if (scenario === 'read-refused') {
        fail(response, 409, 'CONFLICT', 'The example server refused this read change');
        return;
      }

      row.isRead = body.read;
      if (scenario === 'read-lost') {
        dropAnswer(response);
        return;
      }
      json(response, 200, { row: cloneRow(row), count: unreadOf(workspace) });
      return;
    }

    if (url.pathname === '/api/notifications/read-all' && request.method === 'POST') {
      const workspace = workspaceOf(url);
      if (workspace === null) {
        fail(response, 400, 'ADAPTER_CONTRACT_VIOLATION', 'workspace is required');
        return;
      }
      if (scenario === 'bulk-refused') {
        fail(response, 500, 'ADAPTER_FAILURE', 'The example server refused to mark all as read');
        return;
      }

      const boundary = new Date(now()).toISOString();
      const instant = Date.parse(boundary);
      for (const row of rowsOf(workspace)) {
        if (Date.parse(row.occurredAt) <= instant) row.isRead = true;
      }
      if (scenario === 'bulk-lost') {
        dropAnswer(response);
        return;
      }
      json(response, 200, { through: boundary, count: unreadOf(workspace) });
      return;
    }

    if (url.pathname === '/api/demo/notifications' && request.method === 'POST') {
      const workspace = workspaceOf(url);
      if (workspace === null) {
        fail(response, 400, 'ADAPTER_CONTRACT_VIOLATION', 'workspace is required');
        return;
      }
      const body = await readBody(request);
      const row = {
        ...(body ?? {}),
        notificationId: isNonEmptyString(body?.notificationId)
          ? body.notificationId
          : `srv_${randomUUID().slice(0, 8)}`,
        occurredAt: isTimestamp(body?.occurredAt) ? body.occurredAt : new Date(now()).toISOString(),
        isRead: typeof body?.isRead === 'boolean' ? body.isRead : false,
      };
      if (!isServerRow(row)) {
        fail(response, 400, 'ADAPTER_CONTRACT_VIOLATION', 'the demo notification row is invalid');
        return;
      }
      addNotification(workspace, row);
      json(response, 201, { row });
      return;
    }

    fail(response, 404, 'NOT_FOUND', `no route for ${request.method} ${url.pathname}`);
  };

  const server = createServer((request, response) => {
    handler(request, response).catch((error) => {
      console.error('[dev-server]', error);
      if (!response.headersSent) {
        fail(response, 500, 'ADAPTER_FAILURE', 'unexpected example-server failure');
      } else {
        response.end();
      }
    });
  });

  return {
    server,
    state: { workspaces },
    addNotification,
    async listen(port = 8787, host = '127.0.0.1') {
      await new Promise((done, fail) => {
        server.once('error', fail);
        server.listen(port, host, done);
      });
      return server.address();
    },
    async close() {
      await new Promise((done) => server.close(done));
    },
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const portIndex = process.argv.indexOf('--port');
  const port = portIndex === -1 ? 8787 : Number(process.argv[portIndex + 1]);
  const example = createExampleServer();
  const address = await example.listen(port);
  console.log(`[dev-server] http://127.0.0.1:${address.port}`);
  console.log('[dev-server] demo workspaces: demo-a, demo-b');
  console.log('[dev-server] GET  /api/notifications?workspace=demo-a&filter=all');
  console.log('[dev-server] GET  /api/unread-count?workspace=demo-a');
  console.log('[dev-server] PATCH /api/notifications/:id?workspace=demo-a  { "read": true }');
  console.log('[dev-server] POST /api/notifications/read-all?workspace=demo-a');
  console.log(
    '[dev-server] scenario header: load-refused | page-refused | count-refused | read-refused | read-lost | bulk-refused | bulk-lost',
  );
}
