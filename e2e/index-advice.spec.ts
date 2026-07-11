import { test, expect } from '@playwright/test';

/**
 * Index advice entry point: a plan with a sequential scan shows a
 * "Suggérer un index" button that opens the AI assistant. Without a Gemini
 * key the assistant shows its "not configured" state — we assert the button
 * appears and the panel opens (streaming is covered by the API tests).
 */
test('plan offers "Suggérer un index" which opens the assistant', async ({ page }) => {
  const demo = process.env.FLUENTDB_E2E_DEMO_DB!;
  await page.goto('/');
  await page.evaluate(async (file) => {
    await fetch('/api/connections', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Idx DB', engine: 'sqlite', file, color: 'blue' }),
    });
  }, demo);
  await page.reload();
  await page.getByText('Idx DB').click();
  await page.getByRole('button', { name: /Nouvelle requête/ }).click();

  const cm = page.locator('.cm-content').first();
  await cm.click();
  // a filter on a non-indexed column produces a SCAN → warning → suggest button
  await page.keyboard.type('SELECT * FROM albums WHERE title = \'x\'');
  await page.getByRole('button', { name: /Analyser/ }).click();

  await expect(page.getByText(/Plan estimé/)).toBeVisible();
  const suggest = page.getByRole('button', { name: /Suggérer un index/ });
  await expect(suggest).toBeVisible();
  await suggest.click();

  // the AI assistant panel opens
  await expect(page.getByText('Assistant IA')).toBeVisible();
});
