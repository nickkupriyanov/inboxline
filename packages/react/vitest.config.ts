import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Unit tests use authored core sources and work before the first build.
  // Packed-consumer checks separately verify the real package exports.
  resolve: {
    alias: [
      {
        find: '@nickkupriyanov/inboxline-core/dom',
        replacement: fileURLToPath(new URL('../core/src/dom/index.ts', import.meta.url)),
      },
      {
        find: '@nickkupriyanov/inboxline-core',
        replacement: fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
