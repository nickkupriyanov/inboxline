# @nickkupriyanov/inboxline-react

The React binding of **Inboxline**: a themable, accessible bell popover and a
standalone notification feed on top of the framework-free core.

```sh
pnpm add @nickkupriyanov/inboxline-react @nickkupriyanov/inboxline-core react react-dom
```

```tsx
import { Inbox, InboxProvider, createMockAdapter } from '@nickkupriyanov/inboxline-react';
import '@nickkupriyanov/inboxline-react/styles.css';

<InboxProvider adapter={adapter}>
  <Inbox />
  <Inbox layout="feed" />
</InboxProvider>;
```

Entry points:

| Entry                                        | Purpose                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `@nickkupriyanov/inboxline-react`            | Provider, hooks, the bell/feed widget and CSS kit.                           |
| `@nickkupriyanov/inboxline-react/motion`     | The same widget with spring animations; requires the optional `motion` peer. |
| `@nickkupriyanov/inboxline-react/styles.css` | The stylesheet.                                                              |

React 18.2 and 19 are supported. See the repository README and
`docs/specification.md` for the UI contract and the replaceable parts.
