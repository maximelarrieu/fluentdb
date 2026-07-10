import { test, expect } from '@playwright/test';

/**
 * Query cancellation in the UI, against the local PostgreSQL server.
 * Gated by FLUENTDB_E2E_PG_URL so it is skipped when no server is provided.
 */
const PG = process.env.FLUENTDB_E2E_PG_URL;

test.skip(!PG, 'no PostgreSQL provided (FLUENTDB_E2E_PG_URL)');

test('cancels a long-running query from the toolbar', async ({ page }) => {
  const url = new URL(PG!);
  await page.goto('/');

  const id = await page.evaluate(async (u) => {
    const r = await fetch('/api/connections', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'PG cancel',
        engine: 'postgres',
        host: u.host,
        port: Number(u.port),
        user: u.user,
        password: u.password,
        database: u.database,
      }),
    });
    return (await r.json()).id as string;
  }, {
    host: url.hostname,
    port: url.port,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
  });
  expect(id).toBeTruthy();

  await page.reload();
  await page.getByText('PG cancel').click();
  // no tab open yet → open the first query tab from the welcome state
  await page.getByRole('button', { name: /Nouvelle requête/ }).click();
  const cm = page.locator('.cm-content').first();
  await cm.click();
  await page.keyboard.type('SELECT pg_sleep(30)');
  await page.keyboard.press('Control+Enter');

  // the Cancel button appears while the query runs
  const cancelBtn = page.getByRole('button', { name: /Annuler/ });
  await expect(cancelBtn).toBeVisible();
  await cancelBtn.click();

  // the query ends quickly (cancelled) — PostgreSQL's cancellation error is
  // shown in the results pane, not a 30s hang
  await expect(page.getByText(/canceling statement/i)).toBeVisible({
    timeout: 8000,
  });
});
