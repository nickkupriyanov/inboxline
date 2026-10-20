#!/usr/bin/env node
/**
 * One command for the HTTP demo: the teaching server and the playground.
 *
 * The server owns port 8787; the playground is started with its normal Vite
 * command. Ctrl-C closes both. This is a convenience for review, not a
 * deployment script — neither process is configured for production.
 */
import { spawn } from 'node:child_process';
import { createExampleServer } from './server.mjs';

const example = createExampleServer();
const address = await example.listen(8787);
console.log(`[http-demo] example server http://127.0.0.1:${address.port}`);
console.log('[http-demo] workspaces: demo-a, demo-b');

const child = spawn('pnpm', ['--filter', '@nickkupriyanov/inboxline-playground', 'dev'], {
  stdio: 'inherit',
  env: process.env,
});

let closing = false;
async function shutdown(code) {
  if (closing) return;
  closing = true;
  if (!child.killed) child.kill('SIGTERM');
  try {
    await example.close();
  } catch {
    // The server may already be closed by the signal that reached the process.
  }
  process.exit(code);
}

process.on('SIGINT', () => {
  void shutdown(0);
});
process.on('SIGTERM', () => {
  void shutdown(0);
});
child.on('exit', (code) => {
  void shutdown(code ?? 0);
});
