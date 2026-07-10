import { test, expect } from '@playwright/test';

/**
 * End-to-end smoke: create a SQLite connection, browse the schema tree,
 * open a table, edit a cell and persist it, then run a SQL query and
 * see the results grid — the core FluentDB loop.
 */
test('core workflow: connect → browse → edit → query', async ({ page }) => {
  const demo = process.env.FLUENTDB_E2E_DEMO_DB!;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await expect(page).toHaveTitle(/FluentDB/);

  // Seed a connection through the API, then reload so the sidebar shows it.
  const id = await page.evaluate(async (file) => {
    const r = await fetch('/api/connections', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Demo SQLite',
        engine: 'sqlite',
        file,
        color: 'green',
      }),
    });
    return (await r.json()).id as string;
  }, demo);
  expect(id).toBeTruthy();

  await page.reload();
  await page.getByText('Demo SQLite').click();

  // schema tree
  await expect(page.getByText('artists', { exact: true })).toBeVisible();
  await expect(page.getByText('albums', { exact: true })).toBeVisible();

  // open albums and see data
  await page.getByText('albums', { exact: true }).first().click();
  await expect(page.getByText('OK Computer')).toBeVisible();

  // inline edit: Discovery -> Homework
  await page.getByText('Discovery').first().dblclick();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Homework');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/cellule\(s\) modifiée/)).toBeVisible();

  await page.getByRole('button', { name: /Enregistrer/ }).click();
  await expect(page.getByText(/Enregistré/)).toBeVisible();
  await expect(page.getByText('Homework')).toBeVisible();

  // run a query — open a new SQL tab from the tab bar "+"
  await page.getByTitle('Nouvel onglet SQL').click();
  const cm = page.locator('.cm-content').first();
  await cm.click();
  await page.keyboard.type('SELECT title, year FROM albums ORDER BY year');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByText('Cross')).toBeVisible();
  await expect(page.getByText(/ligne\(s\)/)).toBeVisible();

  expect(errors).toEqual([]);
});
