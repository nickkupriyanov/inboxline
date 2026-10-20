import { test } from '@playwright/test';

/**
 * Captures the two review surfaces for the record.
 *
 * These are not image-diff baselines: cross-browser font rendering differs, so a
 * pixel comparison would either need one baseline per engine or a tolerance
 * large enough to hide the bugs worth catching. Layout and states are asserted
 * in the other files; the screenshots are visual evidence, stored in the ignored
 * `.screenshots/` directory with the engine in the file name.
 */
test('capture the gallery and the playground', async ({ page }, testInfo) => {
  const engine = testInfo.project.name;

  await page.goto('/gallery.html');
  await page.waitForSelector('[data-il-case="feed-ready"] .il-item');
  await page.screenshot({
    path: `../../.screenshots/browser-gallery-${engine}.png`,
    fullPage: true,
  });

  await page.goto('/gallery.html?theme=light&locale=ru');
  await page.waitForSelector('[data-il-case="feed-ready"] .il-item');
  await page.screenshot({
    path: `../../.screenshots/browser-gallery-light-ru-${engine}.png`,
    fullPage: true,
  });

  await page.goto('/?scenario=normal');
  const httpSection = page.locator('section', {
    has: page.getByRole('heading', { name: 'Mock and HTTP adapters' }),
  });
  await httpSection.scrollIntoViewIfNeeded();
  await httpSection.getByRole('button', { name: 'Refresh HTTP' }).waitFor();
  await page.screenshot({
    path: `../../.screenshots/browser-http-${engine}.png`,
    fullPage: true,
  });
});
