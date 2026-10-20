import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: '@nickkupriyanov/inboxline-react/styles.css',
        replacement: source('../../packages/core/src/styles/index.css'),
      },
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
});
