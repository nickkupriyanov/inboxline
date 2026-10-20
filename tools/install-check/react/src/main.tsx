/**
 * A throwaway consumer app used by `tools/verify-install.mjs`.
 *
 * It imports only the packed public entries: the core and its `/dom` subpath, the
 * React binding and its stylesheet. The base entry must build without `motion`,
 * which is an optional peer. `#root` hydrates the server's markup placed there by
 * `scripts/prerender.mjs`; `#extra` holds client-only probes.
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { observeMediaQuery } from '@nickkupriyanov/inboxline-core/dom';
import { InboxProvider, useInboxFlow } from '@nickkupriyanov/inboxline-react';
import '@nickkupriyanov/inboxline-react/styles.css';
import { createApp } from './app.mjs';
import { CONTEXT, FIXED_NOW, createAdapter, createSeed } from './fixtures.mjs';

const problems: string[] = [];
for (const level of ['error', 'warn'] as const) {
  const original = console[level];
  console[level] = (...values: unknown[]) => {
    problems.push(`${level}: ${values.map((value) => String(value)).join(' ')}`);
    original(...values);
  };
}
(window as unknown as { __problems: string[] }).__problems = problems;

function StyleProbe() {
  const [state, setState] = useState('pending');

  useEffect(() => {
    const probe = document.createElement('div');
    probe.className = 'il-root';
    document.body.appendChild(probe);
    const style = getComputedStyle(probe);
    const accent = style.getPropertyValue('--il-accent').trim();
    const radius = style.getPropertyValue('--il-radius-card').trim();
    probe.remove();
    setState(accent && radius ? 'ok' : 'missing');
  }, []);

  return <p data-styles={state}>stylesheet: {state}</p>;
}

function DomProbe() {
  const [state, setState] = useState('pending');

  useEffect(() => {
    const stop = observeMediaQuery('(prefers-reduced-motion: reduce)', () => setState('ok'));
    return stop;
  }, []);

  return <p data-dom={state === 'ok' ? 'ok' : 'pending'}>dom: {state}</p>;
}

function HeadlessProbe() {
  const { snapshot } = useInboxFlow();
  return (
    <p data-headless={snapshot.view.counter.known ? 'ok' : 'pending'}>
      headless counter: {snapshot.view.counter.unreadCount ?? 'unknown'}
    </p>
  );
}

function Probes() {
  return (
    <StrictMode>
      <StyleProbe />
      <DomProbe />
      <InboxProvider
        adapter={createAdapter()}
        context={CONTEXT}
        clock={{ now: () => FIXED_NOW }}
        config={{ locale: 'en', timeZone: 'UTC' }}
        initialData={createSeed()}
      >
        <HeadlessProbe />
      </InboxProvider>
    </StrictMode>
  );
}

const root = document.getElementById('root');
const extra = document.getElementById('extra');
if (!root || !extra) throw new Error('missing #root or #extra');

hydrateRoot(root, createApp());
createRoot(extra).render(<Probes />);
