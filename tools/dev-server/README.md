# The teaching HTTP server

A small in-memory server that speaks a deliberately different payload from the
core contract, so the HTTP adapter has something real to translate:

```bash
pnpm dev-server          # the example server on http://127.0.0.1:8787
pnpm demo:http           # the server and the playground together
```

The playground page is at <http://localhost:5173>; the HTTP comparison is the
section “Mock and HTTP adapters”. The mock column works without the server.

## Routes

| Route                                                  | What it does                                               |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| `GET /api/notifications?workspace&filter&cursor&limit` | One page of `rows` and an opaque `cursor`.                 |
| `GET /api/unread-count?workspace`                      | The unread counter of the whole workspace.                 |
| `PATCH /api/notifications/:id?workspace`               | Sets `{ read }` and returns the row and the new counter.   |
| `POST /api/notifications/read-all?workspace`           | Marks the workspace read and returns `{ through, count }`. |
| `POST /api/demo/notifications?workspace`               | Adds a row, playing “another client”.                      |
| `GET /api/health`                                      | Whether the example server is running.                     |

Everything is in memory: no database, auth, recipients, delivery or
persistence. Restarting the process resets the two demo workspaces (`demo-a` and
`demo-b`).

## The payload translation

The server uses the names on the left; `adapter.ts` is the only place that knows
about the right one:

| Server                         | Core                   |
| ------------------------------ | ---------------------- |
| `rows` / `cursor`              | `items` / `nextCursor` |
| `notificationId` / `headline`  | `id` / `title`         |
| `occurredAt` / `isRead`        | `createdAt` / `read`   |
| `count`                        | `unreadCount`          |
| `through`                      | `boundary`             |
| `{ error: { code, message } }` | `InboxError`           |

`context.key` becomes the `workspace` query parameter. A real backend decides
who may read a workspace: **authorisation, recipients and tenancy belong to the
backend**, not to the browser, the adapter or this server.

## Scenario header

The client may send `x-inbox-scenario` with one of:

| Value           | Effect                                                   |
| --------------- | -------------------------------------------------------- |
| `load-refused`  | The first page answers 503, no rows.                     |
| `page-refused`  | Only a request with a cursor answers 503.                |
| `count-refused` | The counter answers 503 while the list works.            |
| `read-refused`  | `PATCH` answers 409 and changes nothing.                 |
| `read-lost`     | `PATCH` applies the change and then drops the socket.    |
| `bulk-refused`  | `read-all` answers 500 and changes nothing.              |
| `bulk-lost`     | `read-all` applies the change and then drops the socket. |

The lost-answer scenarios are real: the response never arrives, so the client
cannot know whether the mutation happened. The core records an unknown outcome
and reconciles with a refresh; it never retries the mutation automatically.

`read-all` marks every row of the workspace with `occurredAt <= boundary`,
including rows this client never loaded. A row inserted after that boundary stays
unread; the playground's “Add event over HTTP” button demonstrates it after a
successful “Mark all as read”.

## Tests

```bash
pnpm test:server
```

The tests start the server on an ephemeral port and drive both the adapter and
the real controller: translation, pagination, two workspaces, partial errors,
abort, a lost read answer and a lost bulk answer, and a new event after the bulk
boundary.
