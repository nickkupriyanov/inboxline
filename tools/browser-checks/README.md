# Browser regressions

Playwright checks for the things jsdom cannot see: layout, containers, the
portalled panel, real interactions, hydration and reduced motion. They run in
Chromium, Firefox and WebKit and start the playground, the SSR example and the
teaching HTTP server themselves.

```bash
pnpm install:browsers   # downloads the three builds into .playwright-browsers/
pnpm test:browser       # starts the servers and runs 22 tests per engine
```

The builds live inside the workspace (`.playwright-browsers/`, ignored by git) so
the check needs no global browser cache. The suite covers:

- the feed in containers of 320/360/400/800 px and no horizontal overflow at
  320/360/400/640 px;
- both themes, long content, many instances and the portal after scroll/resize;
- loading, empty, both page errors, pending/unknown, refused bulk, updates,
  a 128-unread counter and an adapter without `subscribe`;
- filter → read → focus hand-off → bulk, a workspace switch, an invalidation and
  an HTTP refresh;
- server markup + hydration with no mismatch, and `prefers-reduced-motion`;
- full-page screenshots for review in `.screenshots/browser-*`.

These are not image-diff baselines. Font rendering differs per engine, so the
files are evidence, while the assertions are numeric (widths, overflow, state
text, focus, console warnings). WebKit is Playwright's build, not the Safari
application; the real zoom UI and system browser settings are out of scope.
Firefox is launched with `MOZ_DISABLE_CONTENT_SANDBOX=1` because its content
process crashes under the macOS sandbox of this test environment — a harness
workaround, not a product setting.
