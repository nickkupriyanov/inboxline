import { expect, test } from '@playwright/test';

/**
 * Layout, container and portal regressions in a real engine.
 *
 * The gallery gives every case a stable `data-il-*` hook; the checks read those
 * hooks instead of counting figures, so adding a state never edits this file.
 * Widths are set on the container, not the window, because that is the contract
 * the stylesheet promises.
 */
test.describe('layout and containers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/gallery.html');
    await expect(page.locator('[data-il-case="feed-ready"] .il-root')).toBeVisible();
  });

  test('the feed follows its container at 320/360/400/800 px', async ({ page }) => {
    const tile = page.locator('[data-il-case="feed-ready"]');
    const root = tile.locator('.il-root');
    const widths = [320, 360, 400, 800];

    for (const width of widths) {
      await tile.evaluate((element, next) => {
        (element as HTMLElement).style.width = `${next}px`;
      }, width);
      await expect.poll(async () => Math.round((await root.boundingBox())?.width ?? 0)).toBe(width);
      expect(
        await root.evaluate((element) => element.scrollWidth - element.clientWidth),
      ).toBeLessThanOrEqual(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBe(0);
    }

    await tile.evaluate((element) => {
      (element as HTMLElement).style.width = '';
    });
  });

  test('the document never scrolls horizontally at 320/360/400 px', async ({ page }) => {
    for (const width of [320, 360, 400]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole('heading', { name: 'Every state, fixed in time' })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `viewport ${width}px`).toBe(0);
      const roots = page.locator('.il-root');
      const count = await roots.count();
      for (let index = 0; index < Math.min(count, 6); index += 1) {
        const box = await roots.nth(index).boundingBox();
        expect(box?.width ?? 0, `root ${index} at ${width}px`).toBeLessThanOrEqual(width);
      }
    }
  });

  test('both explicit themes render and differ', async ({ page }) => {
    const dark = page.locator('[data-il-case="feed-ready"] .il-root');
    const light = page.locator('[data-il-case="feed-light"] .il-root');

    await expect(dark).toHaveAttribute('data-il-theme', 'dark');
    await expect(light).toHaveAttribute('data-il-theme', 'light');

    const backgrounds = await Promise.all(
      [dark, light].map((root) =>
        root.evaluate((element) => getComputedStyle(element).backgroundColor),
      ),
    );
    expect(backgrounds[0]).not.toBe(backgrounds[1]);
    expect(
      await light.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(0);
  });

  test('long content wraps without overflowing', async ({ page }) => {
    const root = page.locator('[data-il-case="long-content"] .il-root');
    await expect(root).toBeVisible();
    expect(
      await root.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(0);
    const documentOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(documentOverflow).toBe(0);
  });

  test('multiple instances keep their own widths', async ({ page }) => {
    const roots = page.locator('.il-root');
    expect(await roots.count()).toBeGreaterThan(10);
    const width = await page.evaluate(() => window.innerWidth);
    for (let index = 0; index < (await roots.count()); index += 1) {
      const box = await roots.nth(index).boundingBox();
      expect(box?.width ?? 0).toBeLessThanOrEqual(width);
    }
  });

  test('the portal stays inside the viewport on scroll and resize', async ({ page }) => {
    // The popover case lives below several feeds and is 1000 px tall, so put its
    // trigger near the top of the viewport instead of centring the whole tile.
    const trigger = page.locator('[data-il-case="popover-open"] button.il-trigger');
    const triggerTop = await trigger.evaluate(
      (element) => element.getBoundingClientRect().top + window.scrollY,
    );
    await page.evaluate((top) => window.scrollTo(0, Math.max(0, top - 120)), triggerTop);
    const panel = page.locator('[role="dialog"]');
    await expect(panel).toBeVisible();
    await page.waitForTimeout(250);

    const checkInside = async (label: string) => {
      const box = await panel.boundingBox();
      const viewport = page.viewportSize();
      expect(box, label).not.toBeNull();
      expect(box!.x, label).toBeGreaterThanOrEqual(0);
      expect(box!.y, label).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, label).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
      expect(box!.y + box!.height, label).toBeLessThanOrEqual((viewport?.height ?? 0) + 1);
    };

    await checkInside('initial');
    await page.evaluate(() => window.scrollBy(0, 80));
    await page.waitForTimeout(250);
    await checkInside('after scroll');

    await page.setViewportSize({ width: 320, height: 700 });
    await page.waitForTimeout(200);
    const box = await panel.boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(304);
    await checkInside('after resize to 320');

    await page.getByRole('button', { name: 'Close notifications' }).click();
    await expect(panel).toHaveCount(0);
  });

  test('the close action stays on the heading row at 400 and 320 px', async ({ page }) => {
    const trigger = page.locator('[data-il-case="popover-open"] button.il-trigger');
    const triggerTop = await trigger.evaluate(
      (element) => element.getBoundingClientRect().top + window.scrollY,
    );
    await page.evaluate((top) => window.scrollTo(0, Math.max(0, top - 120)), triggerTop);
    const panel = page.locator('[role="dialog"]');
    await expect(panel).toBeVisible();
    await page.waitForTimeout(250);

    const boxes = async () => {
      const heading = await panel.locator('.il-heading').boundingBox();
      const close = await panel.locator('.il-panel-close').boundingBox();
      const filters = await panel.locator('.il-filters').boundingBox();
      expect(heading).not.toBeNull();
      expect(close).not.toBeNull();
      expect(filters).not.toBeNull();
      return { heading: heading!, close: close!, filters: filters! };
    };

    // The standard 400 px card has three blocks on one row: the close action is
    // not pushed under the filters by the content-box container query.
    const standard = await boxes();
    expect(standard.close.y - standard.heading.y).toBeLessThan(6);
    expect(standard.close.x).toBeGreaterThan(standard.heading.x);
    expect(Math.abs(standard.close.y - standard.filters.y)).toBeLessThan(6);

    await page.setViewportSize({ width: 320, height: 700 });
    await page.waitForTimeout(250);

    // At 320 px the heading and close share the first row and the filters take
    // the next one; the close action is still top-right, never on a third line.
    const narrow = await boxes();
    expect(narrow.close.y - narrow.heading.y).toBeLessThan(6);
    expect(narrow.close.x).toBeGreaterThan(narrow.heading.x);
    expect(narrow.filters.y).toBeGreaterThanOrEqual(narrow.close.y + narrow.close.height - 1);
  });

  test('the panel follows the consumer --il-width-panel token and caps it to the viewport', async ({
    page,
  }) => {
    const trigger = page.locator('[data-il-case="popover-open"] button.il-trigger');
    const triggerTop = await trigger.evaluate(
      (element) => element.getBoundingClientRect().top + window.scrollY,
    );
    await page.evaluate((top) => window.scrollTo(0, Math.max(0, top - 120)), triggerTop);
    const panel = page.locator('[role="dialog"]');
    await expect(panel).toBeVisible();
    await page.waitForTimeout(250);

    const panelWidth = async (): Promise<number> =>
      Math.round((await panel.boundingBox())?.width ?? 0);

    // The token belongs to the panel scope (`.il-root`), which is also where a
    // `classNames.root` override lands. Setting it on the bell alone is not the
    // supported path and intentionally does not win.
    const reopenWithWidth = async (token: string): Promise<void> => {
      await page.addStyleTag({
        content: `.il-root[data-il-layout='popover'] { --il-width-panel: ${token}; }`,
      });
      await trigger.click();
      await expect(panel).toHaveCount(0);
      await trigger.click();
      await expect(panel).toBeVisible();
      await page.waitForTimeout(250);
    };

    await reopenWithWidth('520px');
    expect(await panelWidth()).toBe(520);

    await reopenWithWidth('340px');
    expect(await panelWidth()).toBe(340);

    await page.setViewportSize({ width: 320, height: 700 });
    await page.waitForTimeout(250);
    expect(await panelWidth()).toBeLessThanOrEqual(304);
    const box = await panel.boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
  });

  test('a 200% zoom is emulated by halving the CSS viewport', async ({ page }) => {
    // A 1280 px window at 200% has a 640 CSS px layout viewport. Browser-level
    // page zoom itself is not scriptable cross-browser; this is the documented
    // boundary, not a claim about the zoom UI.
    await page.setViewportSize({ width: 640, height: 900 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    const root = page.locator('[data-il-case="feed-ready"] .il-root');
    expect(
      await root.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(0);
  });
});
