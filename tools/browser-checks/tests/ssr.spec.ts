import { expect, test } from '@playwright/test';

/**
 * Server rendering and hydration in a real browser.
 *
 * The raw response has to carry the seeded rows and the serialised seed; the
 * hydrated page then has to become interactive without React reporting a
 * mismatch. jsdom already checks the same contract, but only a browser runs the
 * real `hydrateRoot`.
 */
test('the server markup is seeded and hydrates without a mismatch', async ({ page, request }) => {
  const response = await request.get('http://localhost:4175/');
  expect(response.ok()).toBe(true);
  const html = await response.text();
  expect(html).toContain('Deploy finished');
  expect(html).toContain('__INBOX_PRELOAD__');
  expect(html).toContain('3 unread notifications');

  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));

  await page.goto('http://localhost:4175/');
  await expect(page.locator('.il-item').first()).toBeVisible();
  await page.waitForTimeout(500);

  expect(problems.filter((text) => /hydrat|mismatch|did not match/i.test(text))).toEqual([]);

  const live = page.locator('.il-live');
  await expect(live).toHaveText('3 unread notifications');
  await page.locator('.il-item-action').first().click();
  await expect(live).toHaveText('2 unread notifications');
  await expect(page.locator('.il-item[data-il-unread="true"]')).toHaveCount(2);
});

test('reduced motion removes the row animation and the panel exit frame', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/gallery.html');

  const duration = await page
    .locator('[data-il-case="feed-ready"] .il-row-animated')
    .first()
    .evaluate((element) => parseFloat(getComputedStyle(element).animationDuration));
  expect(duration).toBeLessThanOrEqual(0.002);

  // Bring the trigger into view first: the portalled panel is fixed to it and
  // cannot be clicked while the trigger sits below the viewport.
  const trigger = page.locator('[data-il-case="popover-open"] button.il-trigger');
  const top = await trigger.evaluate(
    (element) => element.getBoundingClientRect().top + window.scrollY,
  );
  await page.evaluate((scrollTo) => window.scrollTo(0, Math.max(0, scrollTo - 120)), top);
  await page.waitForTimeout(250);

  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: 'Close notifications' }).click();
  await expect(dialog).toHaveCount(0);
});
