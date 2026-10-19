import { defineConfig } from 'tsup';

export default defineConfig({
  // One JavaScript entry point for now. The stylesheet is copied into `dist` by
  // the post-build step; the optional `/motion` entry arrives in Iteration 17.
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  minify: false,
  target: 'es2021',
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  banner: {
    js: "'use client';",
  },
});
