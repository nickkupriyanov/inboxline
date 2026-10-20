# Consumer templates

Each manifest pins one consumer environment; the application sources are shared
because the legs differ only in React (and, for the motion leg, the entry point).

```
react/            the React application, its Vite config, SSR/prerender scripts
react-18/         manifest pinned to React 18, no motion
react-19/         manifest pinned to React 19, no motion
motion/           the /motion app: React 19 + the optional motion peer
react-19-motion/  its manifest
```

`tools/verify-install.mjs` packs the libraries once, copies one template per leg
into `.verify/<leg>/`, injects `file:` references to the tarballs, runs
`npm install` with a cache **inside that copy**, and then:

- default legs: `tsc --noEmit`, `vite build`, CSS-token and bundle-marker
  assertions, `node scripts/ssr-check.mjs`, `node scripts/prerender.mjs` and the
  Chromium hydration check;
- the motion leg: `tsc --noEmit`, `vite build` and a `data-il-motion` marker in
  the bundle.

The versions in the manifests are exact and each copy resolves its own
`package-lock.json`; a consumer environment is not the workspace's.
