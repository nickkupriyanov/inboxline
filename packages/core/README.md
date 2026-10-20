# @nickkupriyanov/inboxline-core

Framework-free core of **Inboxline**: the notification and adapter contracts, the
pure reducer, the derived view model, the controller, errors and copy.

```sh
pnpm add @nickkupriyanov/inboxline-core
```

```ts
import { createInboxController, createMockAdapter } from '@nickkupriyanov/inboxline-core';

const inbox = createInboxController({ adapter });
inbox.start();
inbox.subscribe(() => render(inbox.getSnapshot()));
```

Entry points:

| Entry                                       | Purpose                                              |
| ------------------------------------------- | ---------------------------------------------------- |
| `@nickkupriyanov/inboxline-core`            | Contracts, reducer, controller, mock, copy and time. |
| `@nickkupriyanov/inboxline-core/dom`        | Browser helpers used by a binding; no DOM at import. |
| `@nickkupriyanov/inboxline-core/styles.css` | The authored stylesheet.                             |

The core has no React, no DOM access at import time and no runtime dependencies.
See the repository README and `docs/specification.md` for the full contract.
