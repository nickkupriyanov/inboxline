import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Inbox, InboxProvider, useInboxFlow, type InboxTheme } from '../index';
import {
  CONTEXT_A,
  CONTEXT_B,
  DemoInbox,
  InvalidateDriver,
  LoadMoreDriver,
  MarkAllDriver,
  ReadDriver,
  brokenAvatarNotifications,
  demoAdapter,
  demoClock,
  demoNotifications,
  demoSeed,
  demoWorkspaceAdapter,
  firstPageFailureAdapter,
  longNotifications,
  nextPageFailureAdapter,
  noSubscriptionAdapter,
  pendingReadAdapter,
  refusedBulkAdapter,
  unknownReadAdapter,
} from './demo';

/**
 * Every state the two compositions can reach, reached the way an application
 * reaches it: a slow or failing adapter, a lost mutation answer, a server-side
 * bulk refusal, or an event announced by another client.
 */
const meta: Meta<typeof DemoInbox> = {
  title: 'States/Inbox',
  component: DemoInbox,
  parameters: {
    docs: {
      description: {
        component:
          'A state here is not a drawing. Each story hands the provider a different adapter or drives its public actions, and what you see is the widget’s own output for that input.',
      },
    },
  },
  args: {
    adapter: demoAdapter(),
    initialData: demoSeed(),
    layout: 'feed',
    locale: 'en',
    timeZone: 'UTC',
  },
  argTypes: {
    adapter: { control: false },
    initialData: { control: false },
    components: { control: false },
    classNames: { control: false },
    animations: { control: false },
    children: { control: false },
    theme: { control: 'inline-radio', options: ['dark', 'light'] },
    locale: { control: 'inline-radio', options: ['en', 'ru'] },
    layout: { control: 'inline-radio', options: ['feed', 'popover'] },
    timeZone: { control: 'text' },
    defaultOpen: { control: false },
  },
  render: (args, context) => (
    <DemoInbox {...args} theme={(context.globals.theme as InboxTheme) ?? 'dark'} />
  ),
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  name: 'Loading — slow first page',
  args: {
    adapter: demoAdapter({ latencyMs: 60_000 }),
    initialData: undefined,
  },
  parameters: {
    docs: {
      description: {
        story:
          'The adapter takes a minute, so the first paint is the loading skeleton with its polite live region. Nothing is invented as an empty inbox while the answer is unknown.',
      },
    },
  },
};

export const Empty: Story = {
  name: 'Empty — server returned no rows',
  args: {
    adapter: demoAdapter({ notifications: [] }),
    initialData: demoSeed({ notifications: [], unreadCount: 0 }),
  },
};

export const FirstPageError: Story = {
  name: 'Error — first page refused',
  args: {
    adapter: firstPageFailureAdapter(),
    initialData: undefined,
  },
  parameters: {
    docs: {
      description: {
        story:
          '`getNotifications` was refused, so the error block carries the localised message and a retry button. “Try again” asks for the same first page; nothing else is retried.',
      },
    },
  },
};

export const NextPageError: Story = {
  name: 'Error — next page refused',
  args: {
    adapter: nextPageFailureAdapter(),
    initialData: demoSeed({
      notifications: demoNotifications.slice(0, 2),
      nextCursor: 'story-next',
    }),
    layout: 'feed',
  },
  render: (args, context) => (
    <DemoInbox {...args} theme={(context.globals.theme as InboxTheme) ?? 'dark'}>
      <Inbox layout="feed" />
      <LoadMoreDriver />
    </DemoInbox>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The first page is on screen; the automatic “Show more” press fails. The loaded rows and the cursor stay, and the page error offers a retry of that same cursor instead of replacing the list.',
      },
    },
  },
};

export const ReadPending: Story = {
  name: 'Pending — read is saving',
  args: {
    adapter: pendingReadAdapter(),
    initialData: demoSeed(),
  },
  render: (args, context) => (
    <DemoInbox {...args} theme={(context.globals.theme as InboxTheme) ?? 'dark'}>
      <Inbox layout="feed" />
      <ReadDriver id="n-comment" />
    </DemoInbox>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The read request never settles in this story, so the row shows its optimistic state with `aria-busy` and a “Saving…” status. The counter is projected over the confirmed server number.',
      },
    },
  },
};

export const ReadUnknown: Story = {
  name: 'Unknown — the answer was lost',
  args: {
    adapter: unknownReadAdapter(),
    initialData: demoSeed(),
  },
  render: (args, context) => (
    <DemoInbox {...args} theme={(context.globals.theme as InboxTheme) ?? 'dark'}>
      <Inbox layout="feed" />
      <ReadDriver id="n-comment" />
    </DemoInbox>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The server applied the change but the answer never arrived. The row stays in the unknown state with “Checking with the server…”, and the automatic reconciliation cannot finish: this adapter never settles its second list request. No retry is sent.',
      },
    },
  },
};

export const BulkRefused: Story = {
  name: 'Refused — mark all read',
  args: {
    adapter: refusedBulkAdapter(),
    initialData: demoSeed(),
  },
  render: (args, context) => (
    <DemoInbox {...args} theme={(context.globals.theme as InboxTheme) ?? 'dark'}>
      <Inbox layout="feed" />
      <MarkAllDriver />
    </DemoInbox>
  ),
  parameters: {
    docs: {
      description: {
        story:
          '“Mark all as read” is refused by the server. The optimistic layer is rolled back, the rows return to unread and the bulk error is announced on its own status line.',
      },
    },
  },
};

export const UpdatesAvailable: Story = {
  name: 'Updates — another client wrote',
  args: { adapter: demoAdapter(), initialData: demoSeed() },
  render: (_args, context) => {
    const theme = (context.globals.theme as InboxTheme) ?? 'dark';
    return <UpdatesView theme={theme} />;
  },
  parameters: {
    docs: {
      description: {
        story:
          'Another client adds an event and calls `invalidate()`. The counter rises immediately and “Show updates” appears; the open list keeps its rows until the visitor asks for the new first page.',
      },
    },
  },
};

function UpdatesView({ theme }: { theme: InboxTheme }) {
  const adapter = useMemo(() => demoAdapter(), []);
  return (
    <DemoInbox adapter={adapter} initialData={demoSeed()} theme={theme}>
      <Inbox layout="feed" />
      <InvalidateDriver adapter={adapter} />
    </DemoInbox>
  );
}

export const LargeCounter: Story = {
  name: 'Large counter — 128 unread',
  args: {
    adapter: demoAdapter(),
    initialData: demoSeed({ unreadCount: 128, notifications: demoNotifications.slice(0, 4) }),
  },
  parameters: {
    docs: {
      description: {
        story:
          'The counter is server data and does not have to match the loaded page: four rows are loaded and 128 are unread. The plural form and the badge are the only places the number appears.',
      },
    },
  },
};

export const LongContent: Story = {
  name: 'Long content',
  args: {
    adapter: demoAdapter({ notifications: longNotifications }),
    initialData: demoSeed({ notifications: longNotifications }),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Long titles, bodies and author names wrap instead of overflowing. The row keeps its actions aligned and the list never scrolls horizontally.',
      },
    },
  },
};

export const BrokenAvatar: Story = {
  name: 'Broken avatar and icon',
  args: {
    adapter: demoAdapter({ notifications: brokenAvatarNotifications }),
    initialData: demoSeed({ notifications: brokenAvatarNotifications }),
  },
  parameters: {
    docs: {
      description: {
        story:
          'A failed avatar image falls back to the author initials; a failed notification icon falls back to the built-in glyph. Neither leaves a blank square or an empty alt element.',
      },
    },
  },
};

export const NoSubscription: Story = {
  name: 'No invalidation transport',
  args: {
    adapter: noSubscriptionAdapter(),
    initialData: demoSeed(),
  },
  parameters: {
    docs: {
      description: {
        story:
          'An adapter without `subscribe` is fully supported: the list, the counter, both mutations and the explicit refresh work, and the widget simply has no “another client changed something” signal.',
      },
    },
  },
};

export const WorkspaceSwitch: Story = {
  name: 'Workspace switch',
  args: { adapter: demoAdapter(), initialData: demoSeed() },
  render: (_args, context) => {
    const theme = (context.globals.theme as InboxTheme) ?? 'dark';
    return <WorkspaceSwitchView theme={theme} />;
  },
  parameters: {
    docs: {
      description: {
        story:
          'Switching the provider’s context abandons in-flight work, resets the list and loads the other workspace. The counter is scoped to the context, so workspace B has its own unread number.',
      },
    },
  },
};

function WorkspaceSwitchView({ theme }: { theme: InboxTheme }) {
  const adapter = useMemo(() => demoWorkspaceAdapter(), []);
  const [context, setContext] = useState(CONTEXT_A);
  return (
    <div className="sb-column">
      <div className="sb-controls">
        <button
          type="button"
          aria-pressed={context.key === CONTEXT_A.key}
          onClick={() => setContext(CONTEXT_A)}
        >
          Workspace A
        </button>
        <button
          type="button"
          aria-pressed={context.key === CONTEXT_B.key}
          onClick={() => setContext(CONTEXT_B)}
        >
          Workspace B
        </button>
      </div>
      <InboxProvider
        adapter={adapter}
        context={context}
        clock={demoClock}
        theme={theme}
        config={{ locale: 'en', timeZone: 'UTC' }}
        initialData={demoSeed()}
      >
        <WorkspaceProbe />
        <Inbox layout="feed" />
      </InboxProvider>
    </div>
  );
}

function WorkspaceProbe() {
  const { snapshot } = useInboxFlow();
  return (
    <p className="sb-note">
      Context <code>{snapshot.state.contextKey}</code> · unread{' '}
      <code>{snapshot.view.counter.unreadCount ?? 'unknown'}</code>
    </p>
  );
}
