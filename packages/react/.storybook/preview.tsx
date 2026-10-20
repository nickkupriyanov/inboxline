import type { Decorator, Preview } from '@storybook/react-vite';
import '../../core/src/styles/index.css';
import './preview.css';

/**
 * The page background follows the theme toolbar so the widget always sits on the
 * surface its palette was designed for. The toolbar is the single source of the
 * theme in every story: `data-sb-theme` drives the backdrop and the same global
 * is passed to the widget by each story's `render`.
 */
const withSurface: Decorator = (Story, context) => (
  <div className="sb-surface" data-sb-theme={String(context.globals.theme ?? 'dark')}>
    <Story />
  </div>
);

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    controls: { expanded: true, sort: 'requiredFirst' },
    options: {
      storySort: {
        order: ['Layouts', 'States', 'Customization', 'Headless'],
      },
    },
    a11y: { test: 'todo' },
  },
  globalTypes: {
    theme: {
      description: 'Theme applied to the widget and the story backdrop',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'dark', title: 'Dark' },
          { value: 'light', title: 'Light' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'dark' },
  decorators: [withSurface],
};

export default preview;
