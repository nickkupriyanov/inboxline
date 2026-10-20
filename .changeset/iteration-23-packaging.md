---
'@nickkupriyanov/inboxline-core': patch
'@nickkupriyanov/inboxline-react': patch
---

Ship the package README in both tarballs and add a packaging check.

- `files` in both manifests now includes `README.md`, so the published tarball
  carries the package documentation next to its `LICENSE` and `dist` build.
- `tools/verify-install.mjs` packs the libraries, asserts the export maps,
  `sideEffects`, README/LICENSE/CSS/declarations and absence of sources, then
  installs and builds React 18, React 19 and an optional-motion consumer from
  the tarballs (including SSR hydration and a Chromium check).

No runtime API changes; the published JavaScript is unchanged.
