import { test, expect } from '@playwright/test';

/**
 * Safe-by-design guardrails: writes/DDL require confirmation before running,
 * pure reads do not. Runs against the seeded SQLite demo fixture.
 */
test('confirms writes before executing, runs reads directly', async ({ page }) => {
  const demo = process.env.FLUENTDB_E2E_DEMO_DB!;
  await page.goto('/');

  await page.evaluate(async (file) => {
    await fetch('/api/connections', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Guard DB',
        engine: 'sqlite',
        file,
        color: 'green',
      }),
    });
  }, demo);
  await page.reload();
  await page.getByText('Guard DB').click();
  await page.getByRole('button', { name: /Nouvelle requête/ }).click();

  const cm = page.locator('.cm-content').first();

  // a pure read runs directly — no confirmation dialog
  await cm.click();
  await page.keyboard.type('SELECT * FROM albums');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByText('OK Computer')).toBeVisible();
  await expect(page.getByText("Confirmer l'exécution")).toHaveCount(0);

  // a DELETE without WHERE opens the confirmation dialog with a warning
  await cm.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('DELETE FROM albums');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByText("Confirmer l'exécution")).toBeVisible();
  await expect(page.getByText(/sans clause WHERE/i)).toBeVisible();

  // cancelling leaves the data intact
  await page.getByRole('button', { name: /^Annuler$/ }).click();
  await expect(page.getByText("Confirmer l'exécution")).toHaveCount(0);

  await cm.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('SELECT COUNT(*) AS n FROM albums');
  await page.keyboard.press('Control+Enter');
  // 3 seeded albums are still there
  await expect(page.locator('.mono', { hasText: /^3$/ }).first()).toBeVisible();
});
