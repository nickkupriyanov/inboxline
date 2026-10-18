import { defineConfig } from 'tsup';

export default defineConfig({
  // One entry point for now. The optional `/motion` entry (Iteration 17) and the
  // copied stylesheet (Iteration 11) are added once they exist.
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
