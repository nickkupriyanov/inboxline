import { defineConfig } from 'tsup';

export default defineConfig({
  // One entry point for now. `index` must stay free of DOM code, so browser
  // helpers will land in a separate `dom` entry (Iteration 10) and the
  // stylesheet in Iteration 11.
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
});
