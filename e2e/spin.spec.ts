import { test, expect } from '@playwright/test';

test('two-stage spin, browser-local no-repeat history, category switch and reset',async({page})=>{
  await page.goto('./');
  await expect(page.locator('#spin-button')).toBeEnabled();
  await expect(page.locator('#spin-button-label')).toHaveText('SPIN THE CATEGORY');
  await expect(page.locator('#discovered-count')).toHaveText('0');
  await page.locator('#spin-button').click();
  await expect(page.locator('#spin-button-label')).toHaveText('SPIN AN OPPORTUNITY');
  const category=await page.locator('#spin-title').innerText();
  expect(category).not.toBe('First, a category.');
  await page.locator('#spin-button').click();
  await expect(page.locator('#reveal')).toBeVisible();
  await expect(page.locator('#discovered-count')).toHaveText('1');
  await expect(page.locator('#reveal .primary-link')).toHaveAttribute('href',/^https:\/\//);
  const first=await page.locator('#reveal h2').innerText();
  const entries=await page.evaluate(()=>JSON.parse(localStorage.getItem('opportunity-orbit:history:v1')!));
  expect(entries.seen).toHaveLength(1);
  await page.reload();
  await expect(page.locator('#discovered-count')).toHaveText('1');
  await page.locator('#include-unconfirmed').check();
  // The completed draw may have exhausted a one-item category.
  await expect(page.locator('#spin-subtitle')).toContainText(/^(19|20) possible categories/);
  await page.locator('#reset-button').click();
  await expect(page.locator('#reset-dialog')).toBeVisible();
  await page.locator('.dialog-confirm').click();
  await expect(page.locator('#discovered-count')).toHaveText('0');
  await expect(page.locator('#reset-dialog')).toBeHidden();
  expect(first.length).toBeGreaterThan(2);
});

test('a second draw in the same category never repeats the first',async({page})=>{
  await page.goto('./');
  await page.locator('#include-unconfirmed').check();
  await page.locator('#spin-button').click();
  await expect(page.locator('#spin-button-label')).toHaveText('SPIN AN OPPORTUNITY');
  await page.locator('#spin-button').click();
  await expect(page.locator('#reveal')).toBeVisible();
  const one=await page.evaluate(()=>JSON.parse(localStorage.getItem('opportunity-orbit:history:v1')!).seen[0]);
  if(await page.locator('#next-in-category').isEnabled()){
    await page.locator('#next-in-category').click();
    await expect(page.locator('#reveal')).toBeHidden();
    await page.locator('#spin-button').click();
    await expect(page.locator('#reveal')).toBeVisible();
    const seen=await page.evaluate(()=>JSON.parse(localStorage.getItem('opportunity-orbit:history:v1')!).seen);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(one);
    expect(seen[1]).not.toBe(one);
  }
});

test('mobile layout has no horizontal scrolling',async({page})=>{
  await page.goto('./');await expect(page.locator('#spin-button')).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});
