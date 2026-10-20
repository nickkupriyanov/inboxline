import { expect, test } from '@playwright/test';

/**
 * The states and the real scenarios behind them.
 *
 * The gallery renders fixed loading/empty/error/optimistic states; the feed case
 * is then driven through the public UI — filter, read, bulk — and the playground
 * covers a workspace switch, an invalidation and an HTTP refresh.
 */
test.describe('fixed states', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/gallery.html');
  });

  test('loading and empty are rendered as their own states', async ({ page }) => {
    const loading = page.locator('[data-il-case="loading"]');
    await expect(loading.locator('.il-loading')).toBeVisible();
    await expect(loading.getByText('Loading notifications…')).toBeAttached();

    const empty = page.locator('[data-il-case="empty"]');
    await expect(empty.locator('.il-empty')).toHaveText('No notifications yet');
  });

  test('a refused first page keeps its error and retry recovers', async ({ page }) => {
    const caseBlock = page.locator('[data-il-case="first-page-error"]');
    await expect(caseBlock.locator('.il-error')).toContainText(
      'The notifications could not be loaded',
    );
    await caseBlock.getByRole('button', { name: 'Try again' }).click();
    await expect(caseBlock.locator('.il-item').first()).toBeVisible();
    await expect(caseBlock.locator('.il-error')).toHaveCount(0);
  });

  test('a refused next page keeps the loaded rows and offers a retry', async ({ page }) => {
    const caseBlock = page.locator('[data-il-case="next-page-error"]');
    await expect(caseBlock.locator('.il-page-error')).toContainText(
      'The next notifications could not be loaded',
    );
    await expect(caseBlock.locator('.il-item')).toHaveCount(2);
  });

  test('pending and unknown rows explain themselves without hiding the title', async ({ page }) => {
    const pending = page.locator('[data-il-case="read-pending"]');
    await expect(pending.locator('.il-item[data-il-pending="true"]')).toBeVisible();
    await expect(pending.getByText('Saving…')).toBeVisible();
    await expect(pending.locator('.il-item').first()).toContainText('Deploy finished');

    const unknown = page.locator('[data-il-case="read-unknown"]');
    await expect(unknown.locator('.il-item[data-il-unknown="true"]')).toBeVisible();
    await expect(unknown.getByText('Checking with the server…')).toBeVisible();
  });

  test('a refused bulk action is announced and rolls back', async ({ page }) => {
    const caseBlock = page.locator('[data-il-case="bulk-refused"]');
    await expect(caseBlock.getByText('The notifications could not be marked read')).toBeVisible();
    await expect(caseBlock.locator('.il-item[data-il-unread="true"]').first()).toBeVisible();
  });

  test('an external update waits for the visitor and then replaces the list', async ({ page }) => {
    const caseBlock = page.locator('[data-il-case="updates-available"]');
    const updates = caseBlock.getByRole('button', { name: 'Show updates', exact: true });
    await expect(updates).toBeVisible();
    await updates.click();
    await expect(updates).toHaveCount(0);
    await expect(caseBlock.getByText('Another client added this event')).toBeVisible();
    await expect(caseBlock.locator('.il-live')).toHaveText('4 unread notifications');
  });

  test('the large counter is server data and is shown once', async ({ page }) => {
    const caseBlock = page.locator('[data-il-case="large-counter"]');
    await expect(caseBlock.locator('.il-live')).toHaveText('128 unread notifications');
    await expect(caseBlock.locator('.il-item')).toHaveCount(3);
  });

  test('an adapter without subscribe simply has no updates banner', async ({ page }) => {
    const caseBlock = page.locator('[data-il-case="no-subscribe"]');
    await expect(caseBlock.locator('.il-item').first()).toBeVisible();
    await expect(caseBlock.getByRole('button', { name: 'Show updates', exact: true })).toHaveCount(
      0,
    );
  });
});

test.describe('real interactions', () => {
  test('filter, read and bulk work through the UI and keep focus', async ({ page }) => {
    await page.goto('/gallery.html');
    const caseBlock = page.locator('[data-il-case="feed-ready"]');
    const unreadFilter = caseBlock.getByRole('button', { name: 'Unread', exact: true });
    await unreadFilter.click();

    const unreadRows = caseBlock.locator('.il-item');
    const before = await unreadRows.count();
    expect(before).toBe(3);

    await caseBlock.locator('.il-item-action').first().click();
    await expect(unreadRows).toHaveCount(before - 1);
    await expect(caseBlock.locator('.il-live')).toHaveText('2 unread notifications');

    // Focus moved with the disappearing selection instead of falling to body.
    const focused = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      return {
        className: active?.className ?? '',
        inRoot: active?.closest('.il-root') !== null,
      };
    });
    expect(focused.inRoot).toBe(true);
    expect(focused.className).toContain('il-item-action');

    await caseBlock.getByRole('button', { name: 'Mark all as read' }).click();
    await expect(caseBlock.locator('.il-live')).toHaveText('0 unread notifications');
    await expect(
      page.locator('[data-il-case="feed-ready"] .il-item[data-il-unread="true"]'),
    ).toHaveCount(0);
  });

  test('a workspace switch resets the scope and loads the other context', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('section', {
      has: page.getByRole('heading', { name: 'Switch workspace' }),
    });
    await expect(section.getByText('New comment on «Release notes»')).toBeVisible();

    await section.getByRole('button', { name: 'Workspace B' }).click();

    await expect(section.getByText('Ticket assigned to you')).toBeVisible();
    await expect(section.getByText('New comment on «Release notes»')).toHaveCount(0);
    await expect(section.locator('.il-live')).toHaveText('1 unread notification');
  });

  test('an invalidation raises the counter and the updates banner', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('section', {
      has: page.getByRole('heading', { name: 'One provider, three views' }),
    });
    await expect(section.locator('.il-item').first()).toBeVisible();

    await section
      .getByRole('button', { name: 'Another client adds an event to workspace A' })
      .click();

    const updates = section.getByRole('button', { name: 'Show updates' }).first();
    await expect(updates).toBeVisible();
    await expect(section.locator('.il-live').first()).toHaveText('3 unread notifications');
    await updates.click();
    await expect(section.getByText('Event from another client #1')).toBeVisible();
  });

  test('the HTTP adapter refreshes the same UI from the teaching server', async ({ page }) => {
    await page.goto('/?scenario=normal');
    const section = page.locator('section', {
      has: page.getByRole('heading', { name: 'Mock and HTTP adapters' }),
    });
    const httpColumn = section.locator('.pg-http-column').nth(1);
    await expect(httpColumn.locator('.il-item').first()).toBeVisible();
    await expect(httpColumn.getByText('could not be loaded')).toHaveCount(0);

    await httpColumn.getByRole('button', { name: 'Refresh HTTP' }).click();
    await expect(httpColumn.getByRole('button', { name: 'Add event over HTTP' })).toBeEnabled();
    await expect(httpColumn.locator('.il-item')).toHaveCount(3);
  });
});
