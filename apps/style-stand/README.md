# Inboxline — static style stand

A hand-written page for visual review of the token layer and the feed slots. It
has no framework, no data fetching and no build step of its own.

From the repository root:

```sh
pnpm build
pnpm stand
# http://localhost:4174/apps/style-stand/
```

The page links `packages/core/dist/inboxline.css`, the file a consumer installs,
so run the build after a stylesheet change. `pnpm stand` is a local Python static
server and is not part of the published packages.

What the page shows:

- the dark and light palettes;
- the feed at 800 px and inside a 320 px container;
- the popover at 400 px, including its scrolling list, and at 320 px;
- read, unread, pending, unknown and disabled rows;
- loading, empty, first-page error and next-page error blocks;
- focus on the “Show more” and retry controls (press Tab).

Screenshots belong in `.screenshots/`, which is ignored by Git. The comparison
with Slotline and Soundline is described in
[`docs/visual-reference.md`](../../docs/visual-reference.md).
