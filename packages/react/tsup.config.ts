import { defineConfig } from 'tsup';

export default defineConfig({
  // Two JavaScript entry points: the CSS kit and the optional Motion kit. The
  // stylesheet is copied into `dist` by the post-build step.
  entry: {
    index: 'src/index.ts',
    motion: 'src/motion.tsx',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  // Kept off so `'use client'` survives: the tree-shaking pass reads the
  // generated bundle and drops a module-level directive banner, which would
  // make the published entry unusable in a React Server Components tree.
  // Consumers bundle the ESM output themselves, so nothing is lost here.
  treeshake: false,
  splitting: false,
  minify: false,
  target: 'es2021',
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
  external: ['react', 'react-dom', 'react/jsx-runtime', 'motion', 'motion/react'],
  banner: {
    js: "'use client';",
  },
});
