/**
 * Server render and client hydration of the packed React binding.
 *
 * The application imports only the tarball-installed packages. The same element
 * tree is rendered in Node and hydrated in jsdom; React mismatch reports fail the
 * check. That covers "no DOM access while importing" and "the first client render
 * matches the server" without a browser. The browser pass is
 * `tools/browser-checks/scripts/check-consumer.mjs`.
 */
import { JSDOM } from 'jsdom';
import { createApp } from '../src/app.mjs';

const element = createApp();

const { renderToString } = await import('react-dom/server');
const html = renderToString(element);

if (!html.includes('il-root') || !html.includes('Install check: newest')) {
  throw new Error(`the server render produced no seeded widget: ${html.slice(0, 240)}`);
}

const dom = new JSDOM(`<!doctype html><html><body><div id="root">${html}</div></body></html>`, {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});

const BOUND = new Set(['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']);
for (const name of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Element',
  'Node',
  'Event',
  'KeyboardEvent',
  'CustomEvent',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
]) {
  const value = dom.window[name];
  if (value === undefined) continue;
  Object.defineProperty(globalThis, name, {
    value: BOUND.has(name) ? value.bind(dom.window) : value,
    configurable: true,
    writable: true,
  });
}

globalThis.window.matchMedia ??= (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
});
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const problems = [];
const originalError = console.error;
console.error = (...args) => problems.push(args.map((value) => String(value)).join(' '));

try {
  const { hydrateRoot } = await import('react-dom/client');
  const root = hydrateRoot(dom.window.document.getElementById('root'), element);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const items = dom.window.document.querySelectorAll('.il-item').length;
  if (items !== 4) throw new Error(`hydration rendered ${items} rows, expected 4`);
  root.unmount();
} finally {
  console.error = originalError;
}

const mismatches = problems.filter((line) =>
  /hydrat|did not match|mismatch|server rendered|server html/i.test(line),
);
if (mismatches.length > 0) {
  throw new Error(`hydration reported mismatches:\n${mismatches.join('\n')}`);
}

console.log('✓ packed packages: server render and hydration agree');
