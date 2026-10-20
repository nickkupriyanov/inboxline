import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // The stylesheet subpath resolves to the authored files, so the dev server
      // hot-reloads the library CSS exactly as a consumer imports the built one.
      {
        find: '@nickkupriyanov/inboxline-react/styles.css',
        replacement: source('../../packages/core/src/styles/index.css'),
      },
      // The Motion entry is a separate module; it must win over the general
      // package alias below, which would otherwise treat it as a directory.
      {
        find: '@nickkupriyanov/inboxline-react/motion',
        replacement: source('../../packages/react/src/motion.tsx'),
      },
      // The playground runs against the sources so the dev server hot-reloads
      // the library itself. A consumer imports the built packages instead.
      {
        find: '@nickkupriyanov/inboxline-react',
        replacement: source('../../packages/react/src/index.ts'),
      },
      {
        find: '@nickkupriyanov/inboxline-core/dom',
        replacement: source('../../packages/core/src/dom/index.ts'),
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
  build: {
    rollupOptions: {
      input: {
        main: source('index.html'),
        gallery: source('gallery.html'),
      },
    },
  },
});
