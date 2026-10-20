import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  core: {
    disableTelemetry: true,
  },
  typescript: {
    reactDocgen: 'react-docgen-typescript',
  },
  /**
   * Stories run against the sources so the docs show the working tree — no prior
   * `pnpm build` and hot reload on a core change. A consumer imports `dist`
   * instead. The `/motion` subpath is matched before the prefix alias.
   */
  async viteFinal(viteConfig) {
    return {
      ...viteConfig,
      resolve: {
        ...viteConfig.resolve,
        alias: [
          {
            find: '@nickkupriyanov/inboxline-react/motion',
            replacement: source('../src/motion.tsx'),
          },
          {
            find: '@nickkupriyanov/inboxline-react',
            replacement: source('../src/index.ts'),
          },
          {
            find: '@nickkupriyanov/inboxline-core/dom',
            replacement: source('../../core/src/dom/index.ts'),
          },
          {
            find: '@nickkupriyanov/inboxline-core',
            replacement: source('../../core/src/index.ts'),
          },
          ...(Array.isArray(viteConfig.resolve?.alias) ? viteConfig.resolve.alias : []),
        ],
      },
    };
  },
};

export default config;
