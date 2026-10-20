/**
 * The development server for the SSR example.
 *
 * Vite runs in middleware mode, so the same server transforms the client entry
 * and loads the server entry through `ssrLoadModule` — no separate build step is
 * needed to see the flow. In production an application would build both entries
 * and serve the client bundle as static files; that packaging belongs to the
 * consumer, not to this example.
 */
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const templatePath = new URL('./index.html', import.meta.url);
const port = Number(process.env.PORT ?? 4175);

const vite = await createViteServer({
  root,
  server: { middlewareMode: true },
  appType: 'custom',
});

const template = await readFile(templatePath, 'utf8');

/** Escapes the seed so it cannot close the inline script element. */
function serialiseSeed(seed) {
  return JSON.stringify(seed).replace(/</g, '\\u003c');
}

async function renderPage(request, response) {
  try {
    const url = request.url ?? '/';
    const html = await vite.transformIndexHtml(url, template);
    const { render } = await vite.ssrLoadModule('/src/entry-server.tsx');
    const { html: appHtml, seed } = await render();

    const page = html
      .replace('<!--ssr-outlet-->', appHtml)
      .replace(
        '<!--ssr-data-->',
        `<script>window.__INBOX_PRELOAD__ = ${serialiseSeed(seed)}</script>`,
      );

    response.statusCode = 200;
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(page);
  } catch (error) {
    vite.ssrFixStacktrace(error);
    response.statusCode = 500;
    response.setHeader('content-type', 'text/plain; charset=utf-8');
    response.end(error instanceof Error ? error.stack : String(error));
  }
}

const server = createServer((request, response) => {
  vite.middlewares(request, response, () => {
    void renderPage(request, response);
  });
});

server.listen(port, () => {
  console.log(`Inboxline SSR example: http://localhost:${port}/`);
});
