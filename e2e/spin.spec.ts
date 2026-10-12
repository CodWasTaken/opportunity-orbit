import {test,expect} from '@playwright/test';

async function chooseCategory(page:import('@playwright/test').Page,id='fellowships'){
  await page.locator('#category-open-button').click();
  await expect(page.locator('#category-dialog')).toBeVisible();
  await page.locator('#category-dialog-grid [data-category-id="'+id+'"]').click();
  await expect(page.locator('#category-dialog')).toBeHidden();
  await expect(page.locator('#spin-button')).toBeEnabled();
}

test('manual selection replaces the random category spin',async({page})=>{
  await page.goto('./');
  await expect(page.locator('#total-count')).toHaveText('736');
  await expect(page.locator('#spin-button')).toBeDisabled();
  await expect(page.locator('#category-strip button')).toHaveCount(18);
  await expect(page.locator('#category-strip [data-category-id="discounts-perks"]')).toHaveCount(0);
  await expect(page.locator('#category-strip [data-category-id="early-access"]')).toHaveCount(0);
  await chooseCategory(page);
  await expect(page.locator('.sector-label')).toHaveCount(57);
  await expect(page.locator('#wheel-segments path')).toHaveCount(57);
  await expect(page.locator('#spin-button-label')).toHaveText('SPIN MY OPPORTUNITY ✳');
  await expect(page.locator('#category-strip [data-category-id="fellowships"]')).toHaveAttribute('aria-pressed','true');
});

test('one spin produces source-grounded result and prevents repeats',async({page})=>{
  await page.goto('./'); await chooseCategory(page);
  await page.locator('#spin-button').click();
  await expect(page.locator('#reveal')).toBeVisible();
  await expect(page.locator('#discovered-count')).toHaveText('1');
  await expect(page.locator('#reveal .result-category')).toHaveText('Fellowships');
  await expect(page.locator('#reveal .primary-link')).toHaveAttribute('href',/^https:\/\//);
  const desc=await page.locator('.result-story p').innerText();
  expect(desc.length).toBeGreaterThan(15); expect(desc.length).toBeLessThanOrEqual(185);
  const seen=await page.evaluate(()=>JSON.parse(localStorage.getItem('opportunity-orbit:history:v2')!).seen);
  expect(seen).toHaveLength(1);
  await page.locator('#next-in-category').click();
  await expect(page.locator('.sector-label')).toHaveCount(56);
  await page.locator('#spin-button').click();
  await expect(page.locator('#reveal')).toBeVisible();
  const next=await page.evaluate(()=>JSON.parse(localStorage.getItem('opportunity-orbit:history:v2')!).seen);
  expect(next).toHaveLength(2);expect(next[1]).not.toBe(next[0]);
  await page.reload();
  await expect(page.locator('#discovered-count')).toHaveText('2');
  await expect(page.locator('.sector-label')).toHaveCount(55);
});

test('switching category directly and from the result works',async({page})=>{
  await page.goto('./');await chooseCategory(page);
  await chooseCategory(page,'funding');
  await expect(page.locator('.sector-label')).toHaveCount(46);
  await page.locator('#spin-button').click();
  await expect(page.locator('#reveal .result-category')).toHaveText('Funding');
  await page.locator('#next-category').click();
  await expect(page.locator('#category-dialog')).toBeVisible();
  await expect(page.locator('#spin-button')).toBeDisabled();
});

test('privacy-friendly browser history, filter and reset remain functional',async({page})=>{
  await page.goto('./'); await chooseCategory(page);
  await page.locator('#spin-button').click();
  await expect(page.locator('#discovered-count')).toHaveText('1');
  await page.locator('#include-unconfirmed').uncheck();
  await expect(page.locator('#total-count')).toHaveText('100');
  await expect(page.locator('#spin-button')).toBeDisabled();
  await page.locator('#reset-button').click();
  await page.locator('.dialog-confirm').click();
  await expect(page.locator('#discovered-count')).toHaveText('0');
  await page.locator('#include-unconfirmed').check();
  await expect(page.locator('#category-strip button')).toHaveCount(18);
});

test('square 9:16 frame, flat colors and anchored winning labels',async({page})=>{
  await page.goto('./');
  const ratio=await page.locator('#recording-canvas').evaluate(el=>{const r=el.getBoundingClientRect();return r.width/r.height;});
  expect(Math.abs(ratio-9/16)).toBeLessThan(.015);
  await expect(page.locator('#recording-canvas')).toHaveCSS('border-radius','0px');
  await expect(page.locator('#spin-button')).toHaveCSS('border-radius','0px');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  const backgrounds=await page.evaluate(()=>Array.from(document.querySelectorAll<HTMLElement>('#recording-canvas, #recording-canvas *')).map(el=>getComputedStyle(el).backgroundImage).filter(s=>s.includes('gradient(')));
  expect(backgrounds).toEqual([]);
  await chooseCategory(page);
  const allSolid=await page.locator('#wheel-segments path').evaluateAll(els=>els.every(el=>/^#[0-9a-fA-F]{6}$/.test(el.getAttribute('fill')||'')));
  expect(allSolid).toBe(true);
  const bounded=await page.evaluate(()=>{
    const canvas=document.querySelector('#recording-canvas')!.getBoundingClientRect();
    return ['.video-head','.category-picker','.wheel-shell','.spin-footer'].every(s=>{const r=document.querySelector(s)!.getBoundingClientRect();return r.left>=canvas.left-3&&r.right<=canvas.right+3;});
  });expect(bounded).toBe(true);
  await page.locator('#spin-button').click();
  await expect(page.locator('#reveal')).toBeVisible();
  const title=await page.locator('#reveal h2').innerText();
  const aligned=await page.evaluate(winner=>{
    const label=Array.from(document.querySelectorAll<HTMLElement>('.sector-label')).find(el=>el.title===winner);
    const wheel=document.querySelector('#wheel-disc')!.getBoundingClientRect();
    if(!label)return false;
    const r=label.getBoundingClientRect();
    return Math.abs((r.left+r.width/2)-(wheel.left+wheel.width/2))<40 && r.top+r.height/2<wheel.top+wheel.height/2;
  },title);
  expect(aligned).toBe(true);
  await expect(page.locator('.result-story')).toHaveCSS('border-radius','0px');
});

test('saved progress migration preserves already-seen items',async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('opportunity-orbit:history:v1',JSON.stringify({version:1,seen:['apple-scholars-ai-ml'],history:[],includeUnconfirmed:false}));
  });
  await page.goto('./');
  await expect(page.locator('#discovered-count')).toHaveText('1');
  await expect(page.locator('#total-count')).toHaveText('736');
  expect(await page.evaluate(()=>localStorage.getItem('opportunity-orbit:history:v1'))).toBeNull();
});
