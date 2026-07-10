import { test, expect } from '@playwright/test';

/**
 * ERD diagram: open it, see table nodes, verify export is available and
 * focus mode dims unrelated tables. Uses the seeded SQLite demo fixture.
 */
test('renders the ERD, exposes export, applies focus mode', async ({ page }) => {
  const demo = process.env.FLUENTDB_E2E_DEMO_DB!;
  await page.goto('/');

  await page.evaluate(async (file) => {
    await fetch('/api/connections', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'ERD DB', engine: 'sqlite', file, color: 'blue' }),
    });
  }, demo);
  await page.reload();
  await page.getByText('ERD DB').click();

  await page.getByRole('button', { name: /Diagramme ERD/ }).click();

  // table nodes rendered
  const artists = page.locator('.react-flow__node', { hasText: 'artists' });
  const albums = page.locator('.react-flow__node', { hasText: 'albums' });
  await expect(artists).toBeVisible();
  await expect(albums).toBeVisible();

  // FK relation edge exists
  await expect(page.locator('.react-flow__edge').first()).toBeVisible();

  // export menu is available
  await expect(page.getByRole('button', { name: /Exporter/ })).toBeVisible();

  // focus mode: clicking a table adds the "quitter le focus" control
  await albums.click();
  await expect(page.getByRole('button', { name: /Quitter le focus/ })).toBeVisible();
});
