import { useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { InboxTheme } from '../index';
import { Inbox, InboxProvider } from '../index';
import { motionAnimations } from '../motion';
import { CONTEXT_A, DemoInbox, demoAdapter, demoClock, demoSeed, demoNotifications } from './demo';

/**
 * The two compositions and the containers they have to survive.
 *
 * Every story is the real `<Inbox />` behind a real provider; the theme toolbar
 * switches the designed palettes, and the narrow/wide stories put the same
 * surface into a container instead of resizing the window.
 */
const meta: Meta<typeof DemoInbox> = {
  title: 'Layouts/Inbox',
  component: DemoInbox,
  parameters: {
    docs: {
      description: {
        component:
          '`<Inbox />` is the bell popover, `<Inbox layout="feed" />` is the standalone list. Both read one controller, so a shared provider shows the same counter and the same rows in both.',
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

export const Feed: Story = {
  name: 'Feed — ready',
  parameters: {
    docs: {
      description: {
        story:
          'Six rows over three days, three unread. Day headings come from the injected clock and time zone; the counter is server data and stays independent of the filter.',
      },
    },
  },
};

export const PopoverClosed: Story = {
  name: 'Popover — closed',
  args: { layout: 'popover' },
};

export const PopoverOpen: Story = {
  name: 'Popover — open',
  args: { layout: 'popover', defaultOpen: true },
  parameters: {
    docs: {
      description: {
        story:
          'The panel is portalled to the document body and placed against the trigger. It is a non-modal dialog: Tab reaches the filters and rows, Escape closes it and returns focus to the bell.',
      },
    },
  },
};

export const BothLayouts: Story = {
  name: 'Both layouts — one provider',
  args: { layout: 'feed' },
  render: (_args, context) => {
    const theme = (context.globals.theme as InboxTheme) ?? 'dark';
    return <BothLayoutsView theme={theme} />;
  },
  parameters: {
    docs: {
      description: {
        story:
          'One provider serves the bell and the feed at the same time: the badge, the rows and every read action agree, and closing the panel never stops the provider.',
      },
    },
  },
};

function BothLayoutsView({ theme }: { theme: InboxTheme }) {
  const adapter = useMemo(() => demoAdapter(), []);
  return (
    <InboxProvider
      adapter={adapter}
      context={CONTEXT_A}
      clock={demoClock}
      theme={theme}
      config={{ locale: 'en', timeZone: 'UTC' }}
      initialData={demoSeed()}
    >
      <div className="sb-stack">
        <div className="sb-column">
          <p className="sb-caption">Bell</p>
          <Inbox />
        </div>
        <div className="sb-column sb-frame">
          <p className="sb-caption">Feed</p>
          <Inbox layout="feed" />
        </div>
      </div>
    </InboxProvider>
  );
}

export const Narrow: Story = {
  name: 'Container 320 px',
  render: (args, context) => (
    <div className="sb-narrow">
      <DemoInbox
        {...args}
        theme={(context.globals.theme as InboxTheme) ?? 'dark'}
        initialData={demoSeed({ notifications: demoNotifications.slice(0, 3) })}
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The feed is 800 px by design but capped by its container: at 320 px it reflows without horizontal scrolling, the filters move to their own line and the row actions stay reachable.',
      },
    },
  },
};

export const Widths: Story = {
  name: 'Widths — 320 / 400 / 800',
  render: (_args, context) => {
    const theme = (context.globals.theme as InboxTheme) ?? 'dark';
    const seed = demoSeed({ notifications: demoNotifications.slice(0, 3) });
    return (
      <div className="sb-stack" style={{ alignItems: 'flex-start' }}>
        {[320, 400, 800].map((width) => (
          <div key={width} className="sb-column" style={{ width, maxWidth: '100%', minWidth: 0 }}>
            <p className="sb-caption">{width} px container</p>
            <DemoInbox
              adapter={demoAdapter({ notifications: demoNotifications.slice(0, 3) })}
              initialData={seed}
              theme={theme}
              locale="en"
              timeZone="UTC"
            />
          </div>
        ))}
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'The container decides the width, not the browser window. 400 px is the designed panel width; 320 px is the smallest supported viewport.',
      },
    },
  },
};

export const Russian: Story = {
  name: 'Locale — ru',
  args: { locale: 'ru' },
  parameters: {
    docs: {
      description: {
        story:
          'The copy comes from the built-in `ru` dictionary, including plural forms, day headings and the counter sentence. Dates still follow the configured time zone.',
      },
    },
  },
};

export const Motion: Story = {
  name: 'Motion kit',
  args: { layout: 'feed' },
  render: (args, context) => (
    <DemoInbox
      {...args}
      theme={(context.globals.theme as InboxTheme) ?? 'dark'}
      animations={motionAnimations}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The optional `/motion` entry swaps only the two animation primitives. Rows spring in, the measured height follows its content and a row leaving the unread filter collapses; the DOM, classes and accessibility contract are the same as the CSS kit.',
      },
    },
  },
};

export const CustomSeed: Story = {
  name: 'Server seed — no loading flash',
  args: { adapter: demoAdapter(), initialData: demoSeed() },
  parameters: {
    docs: {
      description: {
        story:
          'The story passes the same `InboxInitialData` a server render would embed: rows and counter are present in the first paint, and the provider still confirms them through the adapter after mounting.',
      },
    },
  },
};
