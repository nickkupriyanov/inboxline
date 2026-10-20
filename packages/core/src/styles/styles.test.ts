/**
 * The stylesheet is a public contract, so it is tested like one.
 *
 * Runs in the default node environment on purpose: it only reads files. The
 * contrast calculation is arithmetic over the authored tokens; jsdom and
 * screenshots do not prove it, and a browser measurement is still needed at the
 * visual review.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { IL_CLASS } from '../classNames';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '../..');
const repoRoot = resolve(packageRoot, '../..');

function read(relativePath: string): string {
  return readFileSync(resolve(here, relativePath), 'utf8');
}

const tokensCss = read('tokens.css');
const baseCss = read('base.css');
const inboxlineCss = read('inboxline.css');
const animationsCss = read('animations.css');
const indexCss = read('index.css');
const stylesheet = `${baseCss}\n${inboxlineCss}\n${animationsCss}`;
/** The same files without prose, so comments never satisfy a code assertion. */
const stylesheetCode = stylesheet.replace(/\/\*[\s\S]*?\*\//g, '');

/** `tokens.css` without its prose (the header shows tokens in a comment). */
const tokenDeclarations = tokensCss.replace(/\/\*[\s\S]*?\*\//g, '');
const lightStart = tokenDeclarations.indexOf("[data-il-theme='light']");

/** Custom properties `tokens.css` actually defines. */
function definedTokens(): Set<string> {
  const names = new Set<string>();
  for (const match of tokenDeclarations.matchAll(/(--il-[a-z0-9-]+)\s*:/g)) {
    names.add(match[1] as string);
  }
  return names;
}

describe('design tokens', () => {
  it('defines the layout and shape tokens the components read', () => {
    const defined = definedTokens();

    expect(defined).toContain('--il-width-panel');
    expect(defined).toContain('--il-width-feed');
    expect(defined).toContain('--il-radius-card');
    expect(defined).toContain('--il-radius-panel');
    expect(defined).toContain('--il-radius-control');
    expect(defined).toContain('--il-radius-pill');
    expect(defined).toContain('--il-font-size');
    expect(defined).toContain('--il-duration-fast');
    expect(defined).toContain('--il-duration');
    expect(defined).toContain('--il-duration-slow');
    expect(defined).toContain('--il-ease-soft');
    expect(defined).toContain('--il-ease-standard');
    expect(defined).toContain('--il-unread-surface');
    expect(defined).toContain('--il-warning');
    expect(defined).toContain('--il-danger-contrast');
  });

  it('uses the widths, radii, type and motion of the reference family', () => {
    const values = new Map<string, string>();
    for (const match of tokenDeclarations
      .slice(0, lightStart)
      .matchAll(/(--il-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      values.set(match[1] as string, (match[2] as string).trim());
    }

    expect(values.get('--il-width-panel')).toBe('400px');
    expect(values.get('--il-width-feed')).toBe('800px');
    expect(values.get('--il-radius-card')).toBe('28px');
    expect(values.get('--il-radius-panel')).toBe('22px');
    expect(values.get('--il-radius-control')).toBe('14px');
    expect(values.get('--il-radius-pill')).toBe('999px');
    expect(values.get('--il-font-size')).toBe('14px');
    expect(values.get('--il-duration-fast')).toBe('140ms');
    expect(values.get('--il-duration')).toBe('240ms');
    expect(values.get('--il-duration-slow')).toBe('420ms');
    expect(values.get('--il-accent')).toBe('#ff215a');
    expect(values.get('--il-surface')).toBe('#141419');
  });

  it('every var used by the component layers comes from the tokens', () => {
    const defined = definedTokens();
    const used = new Set(
      [...stylesheet.matchAll(/var\((--il-[a-z0-9-]+)/g)].map((match) => match[1] as string),
    );

    const unknown = [...used].filter((name) => !defined.has(name));
    expect(unknown).toEqual([]);
  });

  it('ships a light theme as the same palette variables', () => {
    const light = tokenDeclarations.slice(tokenDeclarations.indexOf("[data-il-theme='light']"));
    const overridden = new Set(
      [...light.matchAll(/(--il-[a-z0-9-]+)\s*:/g)].map((match) => match[1] as string),
    );

    expect(light).not.toBe('');
    for (const token of [
      '--il-surface',
      '--il-surface-raised',
      '--il-panel',
      '--il-control',
      '--il-control-hover',
      '--il-row-hover',
      '--il-row-press',
      '--il-unread-surface',
      '--il-unread-surface-hover',
      '--il-text',
      '--il-text-muted',
      '--il-text-subtle',
      '--il-border',
      '--il-border-strong',
      '--il-focus-ring',
      '--il-accent',
      '--il-accent-ink',
      '--il-accent-soft',
      '--il-danger',
      '--il-danger-ink',
      '--il-danger-soft',
      '--il-warning',
      '--il-warning-ink',
      '--il-warning-soft',
      '--il-skeleton-base',
      '--il-skeleton-shine',
      '--il-shadow-card',
    ]) {
      expect(overridden, `${token} is missing from the light theme`).toContain(token);
    }
  });

  it('does not switch an explicit theme by the system preference', () => {
    expect(tokenDeclarations).not.toContain('prefers-color-scheme');
  });

  it('keeps the panel and feed widths capped by their container', () => {
    expect(tokensCss).toContain('--il-width-panel: 400px');
    expect(tokensCss).toContain('--il-width-feed: 800px');
    expect(inboxlineCss).toMatch(/\.il-root\s*\{[\s\S]*?width:\s*var\(--il-width-current\);/);
    expect(inboxlineCss).toMatch(/\.il-root\s*\{[\s\S]*?max-width:\s*100%;/);
    expect(inboxlineCss).toMatch(
      /\.il-root\[data-il-layout='popover'\]\s*\{[^}]*--il-width-current:\s*var\(--il-width-panel\);/,
    );
    expect(inboxlineCss).toMatch(
      /\.il-root\[data-il-layout='feed'\]\s*\{[^}]*--il-width-current:\s*var\(--il-width-feed\);/,
    );
  });
});

describe('component layer', () => {
  it('styles every slot in IL_CLASS', () => {
    const missing = Object.values(IL_CLASS).filter(
      (className) => !new RegExp(`\\.${className}(?![\\w-])`).test(inboxlineCss),
    );

    expect(missing).toEqual([]);
  });

  it('keeps every class and custom property under the project prefix', () => {
    const classes = new Set(
      [...stylesheetCode.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((match) => match[1] as string),
    );
    const unknownClasses = [...classes].filter((name) => !name.startsWith('il-'));

    const customProperties = new Set(
      [...stylesheetCode.matchAll(/(--[a-zA-Z][\w-]*)/g)].map((match) => match[1] as string),
    );
    const unknownProperties = [...customProperties].filter((name) => !name.startsWith('--il-'));

    expect(unknownClasses).toEqual([]);
    expect(unknownProperties).toEqual([]);
  });

  it('leaves the consuming page alone', () => {
    // No page-level reset, no theme rule and no bare element selector: every
    // author rule is scoped by a class or by `.il-root`.
    expect(stylesheet).not.toMatch(/(^|\})\s*(html|body|:root|\*)\s*[,{]/);
    expect(stylesheet).not.toMatch(/(^|\})\s*(button|a|ul|li|p|h[1-6])\s*[,{]/);
    expect(baseCss).toContain(':where(.il-root) :where(button, input, select, textarea)');
    expect(baseCss).not.toMatch(/\.il-root button\s*\{/);
  });

  it('describes the row states without changing their text contrast', () => {
    // Pending must not fade the row: the text stays readable while the request
    // is in flight, and only the marker moves.
    const pending = /\.il-item\[data-il-pending='true'\]\s*\{([^}]*)\}/.exec(inboxlineCss);
    expect(pending?.[1]).toContain('cursor: progress');
    expect(pending?.[1]).not.toContain('opacity');

    // The lost answer is amber and has a ring; it is not the red of a rejection.
    expect(inboxlineCss).toContain(".il-item[data-il-unknown='true']");
    expect(inboxlineCss).toMatch(
      /\.il-item\[data-il-unknown='true'\]\s*\{[^}]*box-shadow:\s*inset 0 0 0 1px var\(--il-warning\);/,
    );
    expect(inboxlineCss).toMatch(
      /\.il-item\[data-il-unknown='true'\] \.il-item-meta\s*\{[^}]*color:\s*var\(--il-warning-ink\);/,
    );

    // Unread has a surface and a marker; colour is not the only signal.
    expect(inboxlineCss).toContain(".il-item[data-il-unread='true']");
    expect(inboxlineCss).toMatch(
      /\.il-item\[data-il-unread='true'\] \.il-item-unread-marker\s*\{[^}]*opacity:\s*1;/,
    );
  });

  it('styles the selected filter and the update banner through tokens', () => {
    expect(inboxlineCss).toMatch(
      /\.il-filter\[aria-pressed='true'\]\s*\{[^}]*color:\s*var\(--il-accent-ink\);[^}]*background:\s*var\(--il-accent-soft\);/,
    );
    expect(inboxlineCss).toMatch(
      /\.il-updates\s*\{[^}]*color:\s*var\(--il-accent-ink\);[^}]*background:\s*var\(--il-accent-soft\);/,
    );
  });

  it('keeps focus visible and disabled state explicit', () => {
    expect(baseCss).toContain('.il-root :focus-visible');
    expect(baseCss).toContain('outline: 2px solid var(--il-focus-ring)');
    expect(baseCss).toContain('outline-offset: 2px');
    expect(inboxlineCss).toContain(".il-root[data-il-disabled='true']");
    expect(inboxlineCss).toContain(".il-item[aria-disabled='true']");
  });

  it('honours the OS reduced-motion setting and animates at token durations', () => {
    expect(baseCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(baseCss).toContain('transition-duration: 1ms !important');
    expect(inboxlineCss).toContain('var(--il-duration-fast)');
    expect(inboxlineCss).toContain('var(--il-duration-slow)');
    expect(inboxlineCss).toContain('var(--il-ease-soft)');
    expect(animationsCss).toContain('var(--il-duration)');
    expect(animationsCss).toContain('var(--il-ease-soft)');
  });

  it('animates rows, the panel and the measured height through class hooks', () => {
    // Rows enter with a stagger and leave through one collapse.
    expect(animationsCss).toContain('.il-row-animated');
    expect(animationsCss).toContain(
      'animation-delay: calc(var(--il-index, 0) * var(--il-stagger-step))',
    );
    expect(animationsCss).toContain('@keyframes il-row-in');
    expect(animationsCss).toMatch(
      /\.il-row-animated\[data-il-exiting='true'\]\s*\{[^}]*pointer-events:\s*none;/,
    );
    expect(animationsCss).toContain('max-height: var(--il-row-max-height)');
    expect(animationsCss).toContain('@keyframes il-row-out');

    // The panel enters from the trigger and uses the binding's exit duration.
    expect(animationsCss).toContain('@keyframes il-panel-in');
    expect(animationsCss).toContain('@keyframes il-panel-out');
    expect(animationsCss).toContain('--il-exit-duration');
    expect(animationsCss).toMatch(
      /\.il-root\[data-il-layout='popover'\]\[data-il-closing='true'\]\s*\{[^}]*pointer-events:\s*none;/,
    );

    // The measured height clips only while it is changing.
    expect(animationsCss).toContain(".il-height[data-il-animating='true']");
    expect(animationsCss).toContain('.il-height-inner');

    // The Motion kit draws the same hooks and keeps the CSS keyframes out.
    expect(animationsCss).toContain("[data-il-motion='true']");
    expect(animationsCss).toMatch(
      /\.il-row-animated\[data-il-motion='true'\][\s\S]*animation:\s*none;/,
    );
  });

  it('concatenates the four authored files in order', () => {
    const imports = [...indexCss.matchAll(/@import\s+'\.\/([\w.-]+)'/g)].map(
      (match) => match[1] as string,
    );
    expect(imports).toEqual(['tokens.css', 'base.css', 'inboxline.css', 'animations.css']);
  });
});

describe('contrast', () => {
  type Rgba = readonly [number, number, number, number];

  function rgba(value: string): Rgba {
    const hex = /^#([0-9a-f]{6})$/i.exec(value);
    if (hex) {
      const number = Number.parseInt(hex[1] as string, 16);
      return [(number >> 16) & 255, (number >> 8) & 255, number & 255, 1];
    }
    const fn = /^rgba?\(([^)]+)\)$/i.exec(value);
    if (fn) {
      const parts = (fn[1] as string)
        .split(/[,\s/]+/)
        .filter(Boolean)
        .map(Number);
      return [parts[0] as number, parts[1] as number, parts[2] as number, parts[3] ?? 1];
    }
    throw new Error(`Unsupported colour: ${value}`);
  }

  /** Flattens a translucent layer onto an opaque one. */
  function over(foreground: string, background: string): Rgba {
    const [r, g, b, alpha] = rgba(foreground);
    const [br, bg, bb] = rgba(background);
    return [
      r * alpha + br * (1 - alpha),
      g * alpha + bg * (1 - alpha),
      b * alpha + bb * (1 - alpha),
      1,
    ];
  }

  function luminance([r, g, b]: Rgba): number {
    const channel = (value: number): number => {
      const s = value / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  }

  function contrast(a: Rgba, b: Rgba): number {
    const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
      number,
      number,
    ];
    return (lighter + 0.05) / (darker + 0.05);
  }

  type Theme = { name: string; tokens: Map<string, string> };

  function declarations(block: string): Map<string, string> {
    const found = new Map<string, string>();
    for (const match of block.matchAll(/(--il-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      found.set(match[1] as string, (match[2] as string).trim());
    }
    return found;
  }

  function themes(): Theme[] {
    const lightStart = tokenDeclarations.indexOf("[data-il-theme='light']");
    return [
      { name: 'dark', tokens: declarations(tokenDeclarations.slice(0, lightStart)) },
      { name: 'light', tokens: declarations(tokenDeclarations.slice(lightStart)) },
    ];
  }

  function colour(tokens: Map<string, string>, name: string): Rgba {
    const value = tokens.get(name);
    if (!value) throw new Error(`${name} is missing from tokens.css`);
    return rgba(value);
  }

  /** Every opaque surface a row or a caption can land on. */
  function surfaces(tokens: Map<string, string>): Array<{ where: string; colour: Rgba }> {
    return [
      '--il-surface',
      '--il-panel',
      '--il-control',
      '--il-control-hover',
      '--il-row-hover',
      '--il-row-press',
      '--il-unread-surface',
      '--il-unread-surface-hover',
    ].map((token) => ({ where: token, colour: colour(tokens, token) }));
  }

  it('keeps --il-text-muted and --il-text-subtle at 4.5:1 on every row surface', () => {
    const failures: string[] = [];

    for (const theme of themes()) {
      for (const token of ['--il-text-muted', '--il-text-subtle']) {
        for (const surface of surfaces(theme.tokens)) {
          const ratio = contrast(colour(theme.tokens, token), surface.colour);
          if (ratio < 4.5) {
            failures.push(
              `${theme.name} ${token} on ${surface.where}: ${ratio.toFixed(2)}:1 (needs 4.5:1)`,
            );
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('keeps the warning and danger text readable on their soft surfaces', () => {
    const failures: string[] = [];

    for (const theme of themes()) {
      const surface = theme.tokens.get('--il-surface') as string;
      const warningBackground = over(theme.tokens.get('--il-warning-soft') as string, surface);
      const dangerBackground = over(theme.tokens.get('--il-danger-soft') as string, surface);

      const warning = contrast(colour(theme.tokens, '--il-warning-ink'), warningBackground);
      if (warning < 4.5) {
        failures.push(`${theme.name} warning text: ${warning.toFixed(2)}:1 (needs 4.5:1)`);
      }

      const danger = contrast(colour(theme.tokens, '--il-danger-ink'), dangerBackground);
      if (danger < 4.5) {
        failures.push(`${theme.name} danger text: ${danger.toFixed(2)}:1 (needs 4.5:1)`);
      }

      for (const state of ['--il-unread-surface', '--il-unread-surface-hover']) {
        const ratio = contrast(
          colour(theme.tokens, '--il-warning-ink'),
          colour(theme.tokens, state),
        );
        if (ratio < 4.5) {
          failures.push(
            `${theme.name} warning text on ${state}: ${ratio.toFixed(2)}:1 (needs 4.5:1)`,
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('keeps the error retry button readable in both themes', () => {
    const failures: string[] = [];
    for (const theme of themes()) {
      const ratio = contrast(
        colour(theme.tokens, '--il-danger-contrast'),
        colour(theme.tokens, '--il-danger'),
      );
      if (ratio < 4.5) {
        failures.push(`${theme.name} retry: ${ratio.toFixed(2)}:1 (needs 4.5:1)`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('keeps the selected filter and the update banner readable in both themes', () => {
    const failures: string[] = [];
    for (const theme of themes()) {
      for (const surface of ['--il-surface', '--il-panel']) {
        const background = over(
          theme.tokens.get('--il-accent-soft') as string,
          theme.tokens.get(surface) as string,
        );
        const ratio = contrast(colour(theme.tokens, '--il-accent-ink'), background);
        if (ratio < 4.5) {
          failures.push(
            `${theme.name} accent text on ${surface}: ${ratio.toFixed(2)}:1 (needs 4.5:1)`,
          );
        }

        const hoverBackground = over(
          theme.tokens.get('--il-accent-soft-strong') as string,
          theme.tokens.get(surface) as string,
        );
        const hoverRatio = contrast(colour(theme.tokens, '--il-text'), hoverBackground);
        if (hoverRatio < 4.5) {
          failures.push(
            `${theme.name} update hover text on ${surface}: ${hoverRatio.toFixed(2)}:1 ` +
              '(needs 4.5:1)',
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('keeps the focus ring at 3:1 against every row surface', () => {
    const failures: string[] = [];
    for (const theme of themes()) {
      for (const surface of surfaces(theme.tokens)) {
        const ring = over(
          theme.tokens.get('--il-focus-ring') as string,
          theme.tokens.get(surface.where) as string,
        );
        const ratio = contrast(ring, surface.colour);
        if (ratio < 3) {
          failures.push(
            `${theme.name} focus ring on ${surface.where}: ${ratio.toFixed(2)}:1 (needs 3:1)`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('keeps the badge count readable on the accent fill in both themes', () => {
    const failures: string[] = [];
    for (const theme of themes()) {
      const ratio = contrast(
        colour(theme.tokens, '--il-badge-ink'),
        colour(theme.tokens, '--il-accent'),
      );
      if (ratio < 4.5) {
        failures.push(`${theme.name} badge count: ${ratio.toFixed(2)}:1 (needs 4.5:1)`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('keeps the unread marker distinguishable from its surface', () => {
    const failures: string[] = [];
    for (const theme of themes()) {
      for (const state of ['--il-unread-surface', '--il-unread-surface-hover']) {
        const ratio = contrast(colour(theme.tokens, '--il-accent'), colour(theme.tokens, state));
        if (ratio < 3) {
          failures.push(
            `${theme.name} unread marker on ${state}: ${ratio.toFixed(2)}:1 (needs 3:1)`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('packaging', () => {
  it('publishes the stylesheet from both packages', () => {
    const core = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
      exports: Record<string, unknown>;
      sideEffects: string[];
    };
    const react = JSON.parse(
      readFileSync(resolve(repoRoot, 'packages/react/package.json'), 'utf8'),
    ) as {
      exports: Record<string, unknown>;
      sideEffects: string[];
    };

    expect(core.exports['./styles.css']).toBe('./dist/inboxline.css');
    expect(react.exports['./styles.css']).toBe('./dist/inboxline.css');
    expect(core.sideEffects).toContain('**/*.css');
    expect(react.sideEffects).toContain('**/*.css');
  });
});

describe('documentation', () => {
  it('mentions every token in the visual reference', () => {
    const markdown = readFileSync(resolve(repoRoot, 'docs/visual-reference.md'), 'utf8');
    const mentioned = new Set(
      [...markdown.matchAll(/(--il-[a-z0-9-]+)/g)].map((match) => match[1] as string),
    );
    const defined = definedTokens();

    const undocumented = [...defined].filter((name) => !mentioned.has(name));
    expect(undocumented).toEqual([]);
  });
});
