---
'@nickkupriyanov/inboxline-react': minor
---

Add the React provider and the headless API: `InboxProvider` owns one core
controller, `useInboxFlow()` exposes its snapshot and actions, and
`useInboxUI()` exposes the theme, copy, filter and panel state. The provider
creates no controller work before mounting, starts and stops the core lifecycle,
keeps adapter/context/config props in step, and isolates independent providers.
`filter` and `open` support controlled and uncontrolled modes, fixed at creation
with development warnings on a mode change. The package also ships a minimal Vite
playground under `apps/playground` that demonstrates two custom views under one
provider and two isolated providers.
