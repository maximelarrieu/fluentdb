import { test, expect } from '@playwright/test';

/**
 * EXPLAIN visualisé: "Analyser" renders the query plan as a node tree in the
 * bottom pane. Uses the seeded SQLite demo fixture.
 */
test('Analyser renders the execution plan as a visual tree', async ({ page }) => {
  const demo = process.env.FLUENTDB_E2E_DEMO_DB!;
  await page.goto('/');
  await page.evaluate(async (file) => {
    await fetch('/api/connections', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Plan DB', engine: 'sqlite', file, color: 'blue' }),
    });
  }, demo);
  await page.reload();
  await page.getByText('Plan DB').click();
  await page.getByRole('button', { name: /Nouvelle requête/ }).click();

  const cm = page.locator('.cm-content').first();
  await cm.click();
  await page.keyboard.type('SELECT * FROM albums WHERE year > 2000');
  await page.getByRole('button', { name: /Analyser/ }).click();

  // the plan pane header appears and at least one plan node is rendered
  await expect(page.getByText(/Plan estimé/)).toBeVisible();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await expect(page.locator('.react-flow__node', { hasText: /albums/i }).first()).toBeVisible();
});
