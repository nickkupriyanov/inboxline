import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // The playground runs against the sources so the dev server hot-reloads
      // the library itself. A consumer imports the built packages instead.
      {
        find: '@nickkupriyanov/inboxline-react',
        replacement: source('../../packages/react/src/index.ts'),
      },
      {
        find: '@nickkupriyanov/inboxline-core',
        replacement: source('../../packages/core/src/index.ts'),
      },
    ],
  },
  server: {
    port: 5173,
  },
});
