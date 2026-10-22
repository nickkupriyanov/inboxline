import { expect, test, type Page } from '@playwright/test';

/** Let the engine commit two frames, so a hover/focus transition is not measured mid-flight. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/**
 * Put the popover trigger near the top of the viewport.
 *
 * The panel follows the anchor through a scroll listener, so the scroll itself
 * must be committed before geometry is read; a fixed timeout is not enough on a
 * loaded Linux WebKit runner.
 */
async function scrollPopoverTriggerIntoView(page: Page): Promise<void> {
  const trigger = page.locator('[data-il-case="popover-open"] button.il-trigger');
  const top = await trigger.evaluate(
    (element) => element.getBoundingClientRect().top + window.scrollY,
  );
  const target = Math.max(0, Math.round(top - 120));
  await page.evaluate((next) => window.scrollTo(0, next), target);
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(target);
  await settle(page);
}

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
    // A late font swap moves every tile below it; measurements taken before the
    // fallback font is replaced are not the layout the visitor eventually sees.
    await page.evaluate(() => document.fonts?.ready);
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
    await scrollPopoverTriggerIntoView(page);
    const panel = page.locator('[role="dialog"]');
    await expect(panel).toBeVisible();

    /** Poll the invariant, not a fixed delay: placement follows scroll and resize. */
    const checkInside = async (label: string): Promise<void> => {
      await expect
        .poll(
          async () => {
            const box = await panel.boundingBox();
            const viewport = page.viewportSize();
            if (box === null) return 'missing panel';
            if (box.x < -1) return `left ${box.x}`;
            if (box.y < -1) return `top ${box.y}`;
            if (box.x + box.width > (viewport?.width ?? 0) + 1) {
              return `right ${box.x + box.width}`;
            }
            if (box.y + box.height > (viewport?.height ?? 0) + 1) {
              return `bottom ${box.y + box.height}`;
            }
            return 'inside';
          },
          { message: label },
        )
        .toBe('inside');
    };

    await checkInside('initial');
    await page.evaluate(() => window.scrollBy(0, 80));
    await settle(page);
    await checkInside('after scroll');

    await page.setViewportSize({ width: 320, height: 700 });
    await expect
      .poll(async () => Math.round((await panel.boundingBox())?.width ?? 0))
      .toBeLessThanOrEqual(304);
    await checkInside('after resize to 320');

    await page.getByRole('button', { name: 'Close notifications' }).click();
    await expect(panel).toHaveCount(0);
  });

  test('the close action stays on the heading row at 400 and 320 px', async ({ page }) => {
    await scrollPopoverTriggerIntoView(page);
    const panel = page.locator('[role="dialog"]');
    await expect(panel).toBeVisible();

    const boxes = async (): Promise<{
      heading: NonNullable<Awaited<ReturnType<typeof panel.boundingBox>>>;
      close: NonNullable<Awaited<ReturnType<typeof panel.boundingBox>>>;
      filters: NonNullable<Awaited<ReturnType<typeof panel.boundingBox>>>;
    }> => {
      const [heading, close, filters] = await Promise.all([
        panel.locator('.il-heading').boundingBox(),
        panel.locator('.il-panel-close').boundingBox(),
        panel.locator('.il-filters').boundingBox(),
      ]);
      expect(heading).not.toBeNull();
      expect(close).not.toBeNull();
      expect(filters).not.toBeNull();
      return { heading: heading!, close: close!, filters: filters! };
    };

    // The standard 400 px card has three blocks on one row: the close action is
    // not pushed under the filters by the content-box container query.
    await expect
      .poll(async () => {
        const standard = await boxes();
        return (
          standard.close.y - standard.heading.y < 6 &&
          standard.close.x > standard.heading.x &&
          Math.abs(standard.close.y - standard.filters.y) < 6
        );
      })
      .toBe(true);

    await page.setViewportSize({ width: 320, height: 700 });

    // At 320 px the heading and close share the first row and the filters take
    // the next one; the close action is still top-right, never on a third line.
    await expect
      .poll(async () => {
        const narrow = await boxes();
        return (
          narrow.close.y - narrow.heading.y < 6 &&
          narrow.close.x > narrow.heading.x &&
          narrow.filters.y >= narrow.close.y + narrow.close.height - 1
        );
      })
      .toBe(true);
  });

  test('the panel follows the consumer --il-width-panel token and caps it to the viewport', async ({
    page,
  }) => {
    const trigger = page.locator('[data-il-case="popover-open"] button.il-trigger');
    await scrollPopoverTriggerIntoView(page);
    const panel = page.locator('[role="dialog"]');
    await expect(panel).toBeVisible();

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
      await settle(page);
    };

    await reopenWithWidth('520px');
    await expect.poll(panelWidth).toBe(520);

    await reopenWithWidth('340px');
    await expect.poll(panelWidth).toBe(340);

    await page.setViewportSize({ width: 320, height: 700 });
    await expect.poll(panelWidth).toBeLessThanOrEqual(304);
    await expect
      .poll(async () => {
        const box = await panel.boundingBox();
        return (box?.x ?? 0) + (box?.width ?? 0);
      })
      .toBeLessThanOrEqual(320);
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
