import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ServerNotificationRow } from './adapter.js';

export interface ExampleServerOptions {
  /** Injected clock, epoch milliseconds. Default: the system clock. */
  now?: () => number;
  /** Replaces the demo rows, keyed by workspace. */
  seed?: Record<string, readonly ServerNotificationRow[]>;
}

export interface ExampleServer {
  readonly server: Server;
  readonly state: { workspaces: Map<string, ServerNotificationRow[]> };
  addNotification(workspace: string, row: ServerNotificationRow): ServerNotificationRow;
  listen(port?: number, host?: string): Promise<AddressInfo>;
  close(): Promise<void>;
}

export function createExampleServer(options?: ExampleServerOptions): ExampleServer;

export function createDemoSeed(now?: number): Record<string, ServerNotificationRow[]>;
