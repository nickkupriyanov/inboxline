import type { Meta, StoryObj } from '@storybook/react-vite';
import type {
  EmptyPartProps,
  FiltersPartProps,
  HeaderPartProps,
  InboxTheme,
  LoadingPartProps,
  NotificationItemPartProps,
} from '../index';
import { DemoInbox, demoAdapter, demoSeed, type DemoData } from './demo';

/**
 * Three ways to fit the widget to an application without forking it: replace a
 * part, add slot classes, or restyle through the published tokens. None of them
 * reaches into the controller or the read queue.
 */
const meta: Meta<typeof DemoInbox> = {
  title: 'Customization/Inbox',
  component: DemoInbox,
  parameters: {
    docs: {
      description: {
        component:
          'Every part receives prepared slot props, so a replacement keeps the accessible names, the handlers, the focus hand-off and the `aria-*` contract; only the markup around them belongs to the application.',
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

/**
 * A row that reads `item.data` and draws a project chip.
 *
 * The prepared `slotProps`, `activateProps` and `readProps` are spread rather
 * than re-created: the library keeps the click, the read action, the busy state
 * and the focus hand-off.
 */
function ProjectRow({
  item,
  messages,
  slotProps,
  activateProps,
  readProps,
  avatar,
  status,
}: NotificationItemPartProps<DemoData>) {
  const data = item.data;
  return (
    <li {...slotProps}>
      {avatar}
      <div className="sb-row-main">
        <button {...activateProps} className={`${activateProps.className} sb-row-title`}>
          {item.title}
        </button>
        {item.body === null ? null : <p className="sb-row-body">{item.body}</p>}
        <p className="sb-row-meta">
          {data === undefined ? null : (
            <span className="sb-chip">
              {data.project} · {data.kind}
            </span>
          )}
          <span>{item.timeLabel}</span>
          {item.unread ? <span>{messages.unreadMarkerLabel}</span> : null}
        </p>
        {status}
      </div>
      <button {...readProps} className={`${readProps.className} sb-row-action`}>
        {item.read ? messages.markUnreadLabel : messages.markReadLabel}
      </button>
    </li>
  );
}

export const CustomRow: Story = {
  name: 'Typed row with TData',
  args: {
    components: { NotificationItem: ProjectRow },
  },
  parameters: {
    docs: {
      description: {
        story:
          '`components.NotificationItem` receives `TData` together with the prepared activation button, read action, avatar and status node. Marking read, the unread filter and the focus hand-off still run through the library.',
      },
    },
  },
};

function ProjectHeader({ headingProps, filters, slotProps, close }: HeaderPartProps) {
  return (
    <header {...slotProps}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 {...headingProps} className={`${headingProps.className} sb-heading-underline`}>
          Project inbox
        </h2>
        {close}
      </div>
      <p className="sb-caption" style={{ margin: '4px 0 0' }}>
        A replacement header, the library’s title id
      </p>
      {filters}
    </header>
  );
}

function PillFilters({ options, slotProps }: FiltersPartProps) {
  return (
    <div {...slotProps} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map((option) => (
        <button
          {...option.props}
          key={option.value}
          className={`${option.props.className} sb-pill`}
          data-selected={option.selected ? 'true' : undefined}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export const CustomHeaderAndFilters: Story = {
  name: 'Alternative header and filter pills',
  args: {
    components: { Header: ProjectHeader, Filters: PillFilters },
  },
  parameters: {
    docs: {
      description: {
        story:
          'The header owns its layout but places the prepared `headingProps`, so the dialog keeps its accessible name. The pills spread `option.props`, so the selection still belongs to the provider and the focus fallback still finds the active filter.',
      },
    },
  },
};

export const ClassOverrides: Story = {
  name: 'CSS theme through classes',
  args: {
    className: 'sb-lilac',
    classNames: {
      root: 'sb-lilac-surface',
      header: 'sb-lilac-header',
      item: 'sb-highlight',
      itemTitle: 'sb-lilac-title',
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          '`className` lands on the widget root (and on the portalled panel in the popover); `classNames` adds per-slot hooks next to the stable `il-*` classes. The lilac accent is a set of published `--il-*` variables, not a second styling system.',
      },
    },
  },
};

function EmptyState({ label, slotProps }: EmptyPartProps) {
  return (
    <div {...slotProps} className={`${slotProps.className} sb-empty`}>
      <p style={{ margin: 0, fontWeight: 600 }}>Nothing needs your attention</p>
      <p className="sb-note" style={{ margin: '4px 0 0' }}>
        {label} — this block is the application’s replacement for the default empty state.
      </p>
    </div>
  );
}

function LoadingState({ label, slotProps }: LoadingPartProps) {
  return (
    <div {...slotProps} className={`${slotProps.className} sb-loading`}>
      <span className="sb-loading-dot" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export const CustomLoading: Story = {
  name: 'Custom loading block',
  args: {
    adapter: demoAdapter({ latencyMs: 60_000 }),
    initialData: undefined,
    components: { Loading: LoadingState },
  },
  parameters: {
    docs: {
      description: {
        story:
          '`Loading` receives the localised label and the prepared status role. The replacement is a real status region, so a screen reader hears why the list is empty without the three skeleton rows.',
      },
    },
  },
};

export const CustomStates: Story = {
  name: 'Custom empty block',
  args: {
    adapter: demoAdapter({ notifications: [] }),
    initialData: demoSeed({ notifications: [], unreadCount: 0 }),
    components: { Empty: EmptyState },
  },
  parameters: {
    docs: {
      description: {
        story:
          'State parts are replaceable too. `Empty` receives the localised label and the prepared class hook; a replacement keeps the element the slot contract expects. The default loading and empty parts remain exported (`DefaultLoading`, `DefaultEmpty`) so a wrapper can build on them instead of starting over.',
      },
    },
  },
};
