/**
 * The optional `/motion` entry point.
 *
 * The checks are the two halves of the promise: the main entry point never
 * reaches `motion`, and the entry that does renders the same widget with the same
 * class hooks, accessibility attributes and behaviour. jsdom cannot prove the
 * spring itself, so the visual motion is reviewed in the browser.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Inbox, InboxProvider, motionAnimations } from './motion';
import { CONTEXT_A, createFixtureAdapter, testClock } from './test/fixtures';

const here = dirname(fileURLToPath(import.meta.url));

/* -------------------------------------------------------------------------- */
/*  The main entry point stays free of Motion                                  */
/* -------------------------------------------------------------------------- */

const FROM = /\bfrom\s*['"]([^'"]+)['"]/g;
const SIDE_EFFECT_IMPORT = /\bimport\s*['"]([^'"]+)['"]/g;

/** Every module reachable from `entry` through the package's own relative imports. */
function moduleGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [resolve(here, entry)];

  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);

    const source = readFileSync(file, 'utf8');
    for (const pattern of [FROM, SIDE_EFFECT_IMPORT]) {
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1] as string;
        if (!specifier.startsWith('.')) {
          // A bare specifier: the tests below are about which ones are reachable.
          seen.add(specifier);
          continue;
        }
        const base = resolve(dirname(file), specifier);
        for (const candidate of [
          `${base}.ts`,
          `${base}.tsx`,
          `${base}/index.ts`,
          `${base}/index.tsx`,
        ]) {
          try {
            readFileSync(candidate);
            queue.push(candidate);
            break;
          } catch {
            // Not this one; try the next spelling.
          }
        }
      }
    }
  }

  return seen;
}

describe('the /motion entry point', () => {
  it('reaches `motion`, which is what makes the other half of this test worth having', () => {
    expect([...moduleGraph('motion.tsx')].some((module) => /^motion(\/|$)/.test(module))).toBe(
      true,
    );
  });

  it('is never reachable from the main entry point', () => {
    const graph = moduleGraph('index.ts');

    expect([...graph].some((module) => /^motion(\/|$)/.test(module))).toBe(false);
    expect([...graph].some((module) => module.endsWith('animations/motion.tsx'))).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  The spring kit itself                                                      */
/* -------------------------------------------------------------------------- */

function renderMotion() {
  return render(
    <InboxProvider
      adapter={createFixtureAdapter({ pageSize: 4 })}
      context={CONTEXT_A}
      clock={testClock}
      theme="dark"
      config={{ locale: 'en', timeZone: 'UTC' }}
    >
      <Inbox layout="feed" />
    </InboxProvider>,
  );
}

describe('the Motion kit', () => {
  it('renders the same widget, marked as driven by Motion', async () => {
    renderMotion();
    await screen.findByRole('list', { name: 'Notifications' });

    const rows = [...document.querySelectorAll('.il-item')] as HTMLElement[];
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      // The class hooks of the CSS kit stay, so the stylesheet still applies.
      expect(row.classList.contains('il-item')).toBe(true);
      expect(row.classList.contains('il-row-animated')).toBe(true);
      expect(row.getAttribute('data-il-motion')).toBe('true');
    }

    expect(document.querySelector('.il-height')?.getAttribute('data-il-motion')).toBe('true');
    expect(document.querySelector('.il-height-inner')).not.toBeNull();
  });

  it('keeps the widget working: a row leaves the unread selection through the kit', async () => {
    renderMotion();
    await screen.findByText('Fourth');

    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    await waitFor(() => expect(screen.queryByText('Second')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Mark as read: Fourth' }));
    const row = screen.getByText('Fourth').closest('li') as HTMLElement;
    await waitFor(() => expect(row.getAttribute('data-il-exiting')).toBe('true'));

    // Motion draws the exit itself; the CSS keyframes are switched off for it.
    expect(row.getAttribute('data-il-motion')).toBe('true');
    expect(row.getAttribute('aria-hidden')).toBe('true');
    await waitFor(() => expect(screen.queryByText('Fourth')).toBeNull());
  });

  it('is the kit the provider of this entry point binds', () => {
    expect(motionAnimations.Item).toBeTypeOf('function');
    expect(motionAnimations.Height).toBeTypeOf('function');
  });
});
