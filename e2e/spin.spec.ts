import { test, expect } from '@playwright/test';

test('two-stage spin, browser-local no-repeat history, category switch and reset',async({page})=>{
  await page.goto('./');
  await expect(page.locator('#spin-button')).toBeEnabled();
  await expect(page.locator('#spin-button-label')).toHaveText('SPIN THE CATEGORY ✳');
  await expect(page.locator('#discovered-count')).toHaveText('0');
  await expect(page.locator('#total-count')).toHaveText('736');
  await expect(page.locator('.sector-label')).toHaveCount(18);
  await expect(page.locator('#spin-subtitle')).toContainText('categories ·');
  await expect(page.locator('#spin-subtitle')).toContainText('731 possible discoveries');
  await page.locator('#spin-button').click();
  await expect(page.locator('#spin-button-label')).toHaveText('SPIN MY OPPORTUNITY ✳');
  const category=await page.locator('#spin-title').innerText();
  const count = Number((await page.locator('#spin-subtitle').innerText()).split(' ')[0]);
  await expect(page.locator('.sector-label')).toHaveCount(count);
  await expect(page.locator('#wheel-choice-list li')).toHaveCount(count);
  expect(category).not.toBe('Where will we land?');
  await page.locator('#spin-button').click();
  await expect(page.locator('#reveal')).toBeVisible();
  await expect(page.locator('#discovered-count')).toHaveText('1');
  await expect(page.locator('#reveal .primary-link')).toHaveAttribute('href',/^https:\/\//);
  const first=await page.locator('#reveal h2').innerText();
  const entries=await page.evaluate(()=>JSON.parse(localStorage.getItem('opportunity-orbit:history:v2')!));
  expect(entries.seen).toHaveLength(1);
  await page.reload();
  await expect(page.locator('#discovered-count')).toHaveText('1');
  await page.locator('#include-unconfirmed').uncheck();
  // Confirmed-only mode retains the same minimum-eight threshold.
  await expect(page.locator('#total-count')).toHaveText('100');
  await page.locator('#reset-button').click();
  await expect(page.locator('#reset-dialog')).toBeVisible();
  await page.locator('.dialog-confirm').click();
  await expect(page.locator('#discovered-count')).toHaveText('0');
  await expect(page.locator('#reset-dialog')).toBeHidden();
  expect(first.length).toBeGreaterThan(2);
});

test('a second draw in the same category never repeats the first',async({page})=>{
  await page.goto('./');
  await page.locator('#include-unconfirmed').uncheck();
  await page.locator('#spin-button').click();
  await expect(page.locator('#spin-button-label')).toHaveText('SPIN MY OPPORTUNITY ✳');
  await page.locator('#spin-button').click();
  await expect(page.locator('#reveal')).toBeVisible();
  const one=await page.evaluate(()=>JSON.parse(localStorage.getItem('opportunity-orbit:history:v2')!).seen[0]);
  if(await page.locator('#next-in-category').isEnabled()){
    await page.locator('#next-in-category').click();
    await expect(page.locator('#reveal')).toBeHidden();
    await page.locator('#spin-button').click();
    await expect(page.locator('#reveal')).toBeVisible();
    const seen=await page.evaluate(()=>JSON.parse(localStorage.getItem('opportunity-orbit:history:v2')!).seen);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(one);
    expect(seen[1]).not.toBe(one);
  }
});

test('mobile layout has no horizontal scrolling',async({page})=>{
  await page.goto('./');await expect(page.locator('#spin-button')).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});

test('players from the former 100-listing version retain history but get the full 736 by default', async ({ page }) => {
  const response = await page.request.get('./catalog.json');
  expect(response.ok()).toBe(true);
  const catalog = await response.json() as { opportunities: { id: string }[] };
  const alreadySeen = catalog.opportunities[0].id;
  await page.addInitScript(id => {
    localStorage.setItem('opportunity-orbit:history:v1', JSON.stringify({
      version: 1, seen: [id], history: [{ id, at: new Date().toISOString() }], includeUnconfirmed: false,
    }));
  }, alreadySeen);
  await page.goto('./');
  await expect(page.locator('#total-count')).toHaveText('736');
  await expect(page.locator('#discovered-count')).toHaveText('1');
  await expect(page.locator('#remaining-label')).toContainText('735 still waiting');
  await expect(page.locator('#include-unconfirmed')).toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('opportunity-orbit:history:v1'))).toBeNull();
});

test('wheel labels remain attached to the drawn wedge and the wheel holds its final angle', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#total-count')).toHaveText('736');
  await page.locator('#spin-button').click();
  await expect(page.locator('#spin-button-label')).toHaveText('SPIN MY OPPORTUNITY ✳');
  await page.locator('#spin-button').click();
  await expect(page.locator('#reveal')).toBeVisible();
  const winningTitle = await page.locator('#reveal h2').innerText();
  const atRest = await page.evaluate((title) => {
    const labels = Array.from(document.querySelectorAll<HTMLElement>('.sector-label'));
    const winner = labels.find(label => label.title === title);
    const disc = document.querySelector<HTMLElement>('#wheel-disc')!;
    const rotator = document.querySelector<HTMLElement>('#wheel-rotator')!;
    if (!winner) return null;
    const discRect = disc.getBoundingClientRect();
    const labelRect = winner.getBoundingClientRect();
    return {
      rotation: getComputedStyle(rotator).transform,
      sectorAngle: winner.style.getPropertyValue('--sector-angle'),
      noCounterRotation: !winner.style.getPropertyValue('--counter-angle'),
      offsetFromPointer: Math.abs(labelRect.left + labelRect.width / 2 - (discRect.left + discRect.width / 2)),
      nearTop: labelRect.top + labelRect.height / 2 < discRect.top + discRect.height / 2,
    };
  }, winningTitle);
  expect(atRest).not.toBeNull();
  expect(atRest!.noCounterRotation).toBe(true);
  expect(atRest!.offsetFromPointer).toBeLessThan(35);
  expect(atRest!.nearTop).toBe(true);
  await page.waitForTimeout(250);
  expect(await page.locator('#wheel-rotator').evaluate(el => getComputedStyle(el).transform)).toBe(atRest!.rotation);
});


test('a 57-option category displays all 57 slices, full-name roster, and lands on the matching wedge', async ({ page }) => {
  // Fellowships currently contains 57 opportunities in the published catalog.
  const catalogResponse = await page.request.get('./catalog.json');
  const catalog = await catalogResponse.json() as {
    categories: { id:string }[]; opportunities: { category:string; title:string }[];
  };
  const grouped = new Map<string, number>();
  for (const o of catalog.opportunities) grouped.set(o.category, (grouped.get(o.category) ?? 0) + 1);
  const target = [...grouped.entries()].find(([, count]) => count === Math.max(...grouped.values()))!;
  expect(target[1]).toBeGreaterThan(50);
  const qualified = catalog.categories.filter(c => (grouped.get(c.id) ?? 0) >= 8);
  const targetIndex = qualified.findIndex(c => c.id === target[0]);
  expect(targetIndex).toBeGreaterThanOrEqual(0);
  await page.addInitScript(index => {
    let draws = 0;
    const original = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (array: Uint32Array) => {
      if (array instanceof Uint32Array && array.length === 1) {
        array[0] = draws++ === 0 ? index : 0;
        return array;
      }
      return original(array);
    };
  }, targetIndex);
  await page.goto('./');
  await expect(page.locator('.sector-label')).toHaveCount(qualified.length);
  await page.locator('#spin-button').click();
  await expect(page.locator('#spin-button-label')).toHaveText('SPIN MY OPPORTUNITY ✳');
  await expect(page.locator('.sector-label')).toHaveCount(target[1]);
  await expect(page.locator('#wheel-choice-list li')).toHaveCount(target[1]);
  await expect(page.locator('#wheel-choice-roster-summary')).toContainText(`all ${target[1]}`);
  await page.locator('#spin-button').click();
  await expect(page.locator('#reveal')).toBeVisible();
  const title = await page.locator('#reveal h2').innerText();
  expect((await page.locator('.sector-label').evaluateAll((els, winner) => els.filter(el => el.getAttribute('title') === winner).length, title))).toBe(1);
  await expect(page.locator('#discovered-count')).toHaveText('1');
  await page.locator('#next-in-category').click();
  await expect(page.locator('.sector-label')).toHaveCount(target[1] - 1);
});

test('portrait studio keeps result and short description inside a 9:16 recording frame', async ({page}) => {
  await page.goto('./');
  await expect(page.locator('#spin-button')).toBeEnabled();
  const rect = await page.locator('#recording-canvas').boundingBox();
  expect(rect).not.toBeNull();
  expect(Math.abs(rect!.width / rect!.height - 9 / 16)).toBeLessThan(.015);
  await page.locator('#spin-button').click();
  await expect(page.locator('#spin-button-label')).toHaveText('SPIN MY OPPORTUNITY ✳');
  await page.locator('#spin-button').click();
  await expect(page.locator('#reveal')).toBeVisible();
  await expect(page.locator('.result-story-label')).toHaveText('SO, WHAT IS IT?');
  const description = await page.locator('.result-story p').innerText();
  expect(description.length).toBeGreaterThan(20);
  expect(description.length).toBeLessThanOrEqual(185);
  await expect(page.locator('.result-benefit')).toBeVisible();
  const height = await page.locator('.result-main').evaluate(el => ({content:el.scrollHeight,viewport:el.clientHeight}));
  expect(height.content - height.viewport).toBeLessThanOrEqual(2);
  await expect(page.locator('#reveal .primary-link')).toHaveAttribute('href', /^https:\/\//);
  await page.locator('#next-category').click();
  await expect(page.locator('#reveal')).toBeHidden();
  await expect(page.locator('#spin-button-label')).toHaveText('SPIN THE CATEGORY ✳');
});
