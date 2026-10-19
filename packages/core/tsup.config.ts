import { defineConfig } from 'tsup';

export default defineConfig({
  // Two JavaScript entry points on purpose: `index` stays free of DOM code, and a
  // bundler only pulls `dom` in when a binding imports it. The stylesheet is
  // concatenated into `dist/inboxline.css` by the post-build step.
  entry: {
    index: 'src/index.ts',
    dom: 'src/dom/index.ts',
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
