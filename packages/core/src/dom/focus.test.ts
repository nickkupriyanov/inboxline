// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { captureFocus, focusableWithin, focusFirstWithin, restoreFocus } from './focus';

function buildContainer(count = 2) {
  const container = document.createElement('div');
  const buttons = Array.from({ length: count }, (_, index) => {
    const button = document.createElement('button');
    button.textContent = `button ${index}`;
    container.appendChild(button);
    return button;
  });
  document.body.appendChild(container);
  return { container, buttons };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('focusableWithin', () => {
  it('finds the tabbable controls in document order', () => {
    const { container, buttons } = buildContainer(3);

    expect(focusableWithin(container)).toEqual(buttons);
  });

  it('skips a disabled control', () => {
    const { container, buttons } = buildContainer(2);
    buttons[0]!.disabled = true;

    expect(focusableWithin(container)).toEqual([buttons[1]]);
  });

  it('skips an element that opted out of the tab order', () => {
    const { container } = buildContainer(1);
    const skipped = document.createElement('div');
    skipped.tabIndex = -1;
    container.appendChild(skipped);

    expect(focusableWithin(container)).not.toContain(skipped);
  });
});

describe('focusFirstWithin', () => {
  it('focuses the first control and reports it', () => {
    const { container, buttons } = buildContainer(2);

    expect(focusFirstWithin(container)).toBe(buttons[0]);
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('focuses the container when nothing inside can take focus', () => {
    const container = document.createElement('section');
    container.tabIndex = -1;
    document.body.appendChild(container);

    expect(focusFirstWithin(container)).toBe(container);
    expect(document.activeElement).toBe(container);
  });

  it('reports null when there is nowhere to put focus', () => {
    const container = document.createElement('section');
    document.body.appendChild(container);

    expect(focusFirstWithin(container)).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });
});

describe('captureFocus', () => {
  it('remembers the focused control', () => {
    const { buttons } = buildContainer(2);
    buttons[1]!.focus();

    expect(captureFocus()).toBe(buttons[1]);
  });

  it('reports null while the document itself has focus', () => {
    expect(captureFocus()).toBeNull();
  });
});

describe('restoreFocus', () => {
  it('returns focus to a connected element', () => {
    const trigger = document.createElement('button');
    const elsewhere = document.createElement('button');
    document.body.append(trigger, elsewhere);
    elsewhere.focus();

    expect(restoreFocus(trigger)).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it('does not move focus when the target was removed', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.remove();

    expect(restoreFocus(trigger)).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it('leaves the page alone when there is no target', () => {
    expect(restoreFocus(null)).toBe(false);
    expect(restoreFocus(undefined)).toBe(false);
  });

  it('reports success without a redundant call when focus is already there', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    expect(restoreFocus(trigger)).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });
});
