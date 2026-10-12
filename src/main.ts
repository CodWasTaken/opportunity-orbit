import './style.css';
import { availableCategories, draw, emptyState, normalizeState, pool, recordWin, secureIndex } from './game';
import type { Catalog, Category, Opportunity, SavedState } from './game';

const ROOT = document.querySelector<HTMLDivElement>('#app')!;
const STORAGE = 'opportunity-orbit:history:v2';
const OLD_STORAGE = 'opportunity-orbit:history:v1';
const BASE = import.meta.env.BASE_URL;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let catalog: Catalog;
let saved: SavedState = emptyState();
let canPersist = true;
let phase: 'category' | 'opportunity' = 'category';
let currentCategory: Category | null = null;
let latestResult: Opportunity | null = null;
let spinning = false;
let rotation = 0;
const selectedWheelColors = ['#C9C0FF','#AEF09A','#FFBAAC','#9DDDEA','#FFDFA4','#A8A9FF','#EDA8D9','#B5D5BA'];

const escape = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]!);
function loadState(): SavedState {
  try {
    const current = localStorage.getItem(STORAGE);
    if (current !== null) return normalizeState(JSON.parse(current));
    // Migrate past players to the full-catalog default while preserving their
    // already-drawn IDs. The old 100-only filter should never silently persist.
    const previous = localStorage.getItem(OLD_STORAGE);
    if (previous !== null) {
      const old = normalizeState(JSON.parse(previous));
      const migrated = { ...old, includeUnconfirmed: true };
      localStorage.setItem(STORAGE, JSON.stringify(migrated));
      localStorage.removeItem(OLD_STORAGE);
      return migrated;
    }
    return emptyState();
  } catch { canPersist = false; return emptyState(); }
}
function persist(): void {
  try { localStorage.setItem(STORAGE, JSON.stringify(saved)); }
  catch { canPersist = false; }
}
function moneyStatus(status: string): string { return status === 'active' ? 'Listed as active' : status === 'unconfirmed' ? 'Not yet confirmed' : status === 'limited' ? 'Limited availability' : status === 'waitlist' ? 'Waitlist / upcoming' : 'Check availability'; }
function number(n: number): string { return new Intl.NumberFormat('en').format(n); }
function $<T extends HTMLElement = HTMLElement>(selector: string): T { const el = ROOT.querySelector<T>(selector); if (!el) throw new Error(`Missing ${selector}`); return el; }

function shell(): void {
  ROOT.innerHTML = `
    <header class="topbar wrap">
      <a class="logo" href="${escape(BASE)}" aria-label="Opportunity Orbit home"><span class="logo-symbol" aria-hidden="true">✳</span><span>opportunity<span class="logo-accent">orbit</span><sup>↗</sup></span></a>
      <nav class="topnav" aria-label="External resources">
        <a href="https://github.com/PerkCommons/data" target="_blank" rel="noopener noreferrer">The open data <span aria-hidden="true">↗</span></a>
        <a class="github-link" href="https://github.com/CodWasTaken/opportunity-orbit" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
      </nav>
    </header>
    <main class="wrap">
      <section class="hero">
        <div class="hero-copy"><span class="eyebrow"><i></i> YOUR NEXT THING STARTS HERE</span>
          <h1>A little luck.<br/><em>A big possibility.</em></h1>
          <p>Don't know what opportunity to explore next? Spin for a category, then let the universe pick an opportunity for you. Every discovery is a one-time find.</p>
        </div>
        <div class="hero-sticker" aria-hidden="true"><span>FIND YOUR<br/>NEXT BIG</span><strong>WHAT IF?</strong><div>↗</div></div>
      </section>
      <section class="playground" aria-label="Opportunity spinner">
        <div class="spinner-panel">
          <div class="panel-top"><div class="step-count">THE DISCOVERY MACHINE <span> / 001</span></div><span class="live-pill"><span></span> READY TO EXPLORE</span></div>
          <div class="stage-toggle" aria-label="Steps"><div id="stage-one" class="stage current"><span>01</span> PICK A CATEGORY</div><div class="stage-separator">→</div><div id="stage-two" class="stage"><span>02</span> DISCOVER A FIND</div></div>
          <div class="wheel-shell">
            <div class="wheel-halo"></div><div class="wheel-pointer" aria-hidden="true"></div>
            <div id="wheel-rotator" class="wheel-rotator"><div id="wheel-disc" class="wheel-disc"><div class="wheel-core"><div class="wheel-core-ring">✳</div></div><div id="wheel-labels"></div></div></div>
          </div>
          <div class="spin-footer"><div class="spin-title" id="spin-title">First, a category.</div><p id="spin-subtitle">One spin. Endless possibilities.</p>
            <button type="button" id="spin-button" class="spin-button" disabled><span id="spin-button-label">Loading opportunities…</span><span class="button-arrow" aria-hidden="true">↗</span></button>
            <button type="button" id="switch-button" class="switch-button" hidden>← Choose a different category</button>
          </div>
        </div>
        <aside class="side-panel">
          <div class="side-header"><span>YOUR EXPEDITION</span><span class="small-star">✳</span></div>
          <section class="progress-card"><span class="overline">THE ADVENTURE SO FAR</span><div class="big-number"><span id="discovered-count">0</span><span class="metric-suffix"> / <span id="total-count">—</span></span></div><p>Opportunities discovered</p><div class="progress-track"><div id="progress-bar"></div></div><div class="progress-bottom"><span id="remaining-label">Loading pool…</span><span id="percent-label">0%</span></div></section>
          <section class="settings-card"><div class="settings-title">YOUR SPIN SETTINGS <span>⚙</span></div>
            <label class="switch-row" for="include-unconfirmed"><span><strong>Use the full catalog</strong><small>Includes unconfirmed opportunities. Check the provider before applying.</small></span><input type="checkbox" id="include-unconfirmed" role="switch"/><span class="toggle-track"></span></label>
            <div class="source-note">Includes all eligible opportunity records by default, even if their status is unconfirmed. Expired and excluded resources stay out.</div>
          </section>
          <section class="history-card"><div class="history-title"><span>RECENT DISCOVERIES</span><button type="button" id="reset-button">Reset history ↺</button></div><div id="history-list" class="history-list"><p class="empty-history">Nothing found just yet. Your adventure is about to begin.</p></div></section>
          <div class="privacy-card"><span aria-hidden="true">◇</span> Your spin history stays in this browser. No account, cookies, or analytics required.</div>
        </aside>
      </section>
      <section id="reveal" class="reveal" hidden aria-live="polite"></section>
      <section class="how-it-works"><div class="section-heading"><span>THE RULES ARE SIMPLE</span><h2>Discover. Explore. Repeat.</h2></div><div class="how-grid"><article><span>01 /</span><h3>Spin a category</h3><p>Find out whether today is about funding, fellowships, developer tools, or something unexpected.</p></article><article><span>02 /</span><h3>Meet your opportunity</h3><p>Spin again to reveal a random listing, then check its official source and eligibility.</p></article><article><span>03 /</span><h3>No repeats. Ever.*</h3><p>Once drawn, an opportunity is removed from future spins on this browser until you reset your history.</p></article></div><p class="footnote">* Unless you reset progress or clear your browser's site storage. New items arrive when the open dataset refreshes.</p></section>
    </main>
    <footer class="footer"><div class="wrap footer-inner"><div class="footer-brand">✳ <strong>opportunityorbit</strong><span>A little chaos for a good cause.</span></div><p>An independent experiment using <a href="https://github.com/PerkCommons/data" target="_blank" rel="noopener noreferrer">PerkCommons CC0 open data ↗</a>. Listings are not guarantees of availability or eligibility.</p><div class="footer-links"><a href="https://perkcommons.com/" target="_blank" rel="noopener noreferrer">Explore PerkCommons ↗</a><a href="https://github.com/CodWasTaken/opportunity-orbit" target="_blank" rel="noopener noreferrer">Source code ↗</a></div></div></footer>
    <dialog id="reset-dialog" aria-labelledby="reset-heading"><form method="dialog"><span class="dialog-mark" aria-hidden="true">↺</span><h2 id="reset-heading">Start a fresh orbit?</h2><p>This will clear your discovered opportunities on this browser and put every eligible opportunity back in the wheel.</p><div class="dialog-actions"><button value="cancel" class="dialog-cancel">Keep progress</button><button value="confirm" class="dialog-confirm">Reset everything</button></div></form></dialog>
  `;
  $('#spin-button').addEventListener('click', () => void spin());
  $('#switch-button').addEventListener('click', () => { if (spinning) return; phase = 'category'; currentCategory = null; latestResult = null; render(); });
  $('#include-unconfirmed').addEventListener('change', e => { if (spinning) return; saved.includeUnconfirmed = (e.target as HTMLInputElement).checked; persist(); phase = 'category'; currentCategory = null; latestResult = null; render(); });
  $('#reset-button').addEventListener('click', () => { if (!spinning) ($<HTMLDialogElement>('#reset-dialog')).showModal(); });
  $('#reset-dialog').addEventListener('close', () => { if ($<HTMLDialogElement>('#reset-dialog').returnValue === 'confirm') { saved = { ...emptyState(), includeUnconfirmed: saved.includeUnconfirmed }; persist(); phase = 'category'; currentCategory = null; latestResult = null; render(); } });
}
function available(): Opportunity[] { return pool(catalog, saved); }
function sliceLabel(label: string, length = 18): string { return label.length > length ? label.slice(0,length - 1).trimEnd() + '…' : label; }
function paintWheel(choices: Array<{ label: string; short: string }>): void {
  const disc = $('#wheel-disc');
  const labels = $('#wheel-labels');
  const n = Math.max(choices.length, 1); const sector = 360/n;
  disc.style.background = `conic-gradient(from 0deg, ${choices.map((_,i) => `${selectedWheelColors[i % selectedWheelColors.length]} ${i*sector}deg ${(i+1)*sector}deg`).join(', ')})`;
  // A label is fixed to the midpoint of its own sector. The parent disc and
  // every label share exactly the same wheel rotation; no counter-rotation.
  labels.innerHTML = choices.map((o,i)=>`<span class="sector-label" style="--sector-angle:${(i+.5)*sector}deg" title="${escape(o.label)}">${escape(o.short)}</span>`).join('');
  const rotator = $('#wheel-rotator');rotator.style.transition = 'none';rotator.style.transform = 'rotate(0deg)';rotation = 0;
}
function previewForCategory(categories: Category[]): void {
  const sample = shufflePreview(categories, 8);
  paintWheel(sample.map(x=>({label:x.label,short:sliceLabel(x.label,15)})));
}
function previewForOpportunity(opportunities: Opportunity[]): void {
  const sample = shufflePreview(opportunities, 8);
  paintWheel(sample.map(x=>({label:x.title,short:sliceLabel(x.provider,14)})));
}
function shufflePreview<T>(items: readonly T[], max: number): T[] {
  const result = [...items];for(let i=result.length-1;i>0;i--){const j=secureIndex(i+1);[result[i],result[j]]=[result[j],result[i]];}return result.slice(0,max);
}
function historyMarkup(): string {
  const byId = new Map(catalog.opportunities.map(o=>[o.id,o]));
  const items = saved.history.filter(h => byId.has(h.id)).slice(0,5);
  if (!items.length) return '<p class="empty-history">Nothing found just yet. Your adventure is about to begin.</p>';
  return items.map((h,index)=>{const o=byId.get(h.id)!;return `<a class="history-item" href="https://perkcommons.com/opportunities/${encodeURIComponent(o.id)}/" target="_blank" rel="noopener noreferrer"><span class="history-index">${String(index+1).padStart(2,'0')}</span><span><strong>${escape(o.title)}</strong><small>${escape(o.provider)}</small></span><span class="history-arrow">↗</span></a>`;}).join('');
}
function render(preserveWheel = false): void {
  const remaining = available();const categories = availableCategories(catalog,remaining);
  const eligibleTotal = catalog.opportunities.filter(o => saved.includeUnconfirmed || o.status !== 'unconfirmed').length;
  const usedEligible = eligibleTotal-remaining.length;
  const pct = eligibleTotal ? Math.round(usedEligible*100/eligibleTotal) : 0;
  $('#discovered-count').textContent = number(usedEligible);
  $('#total-count').textContent = number(eligibleTotal);
  $('#progress-bar').style.width = `${pct}%`;
  $('#percent-label').textContent = `${pct}%`;
  $('#remaining-label').textContent = `${number(remaining.length)} still waiting`;
  $('#history-list').innerHTML = historyMarkup();
  const toggle = $<HTMLInputElement>('#include-unconfirmed');toggle.checked = saved.includeUnconfirmed; toggle.disabled=spinning;
  $('#reset-button').toggleAttribute('disabled',spinning||saved.seen.length===0);
  $('#stage-one').classList.toggle('current',phase==='category');
  $('#stage-two').classList.toggle('current',phase==='opportunity');
  $('#stage-one').classList.toggle('completed',phase==='opportunity');
  const button=$<HTMLButtonElement>('#spin-button');button.disabled=spinning;
  $('#switch-button').hidden=phase!=='opportunity' || spinning;
  const reveal=$('#reveal');reveal.hidden=!latestResult;
  if (phase==='category') {
    $('#spin-title').textContent='First, a category.';
    $('#spin-subtitle').textContent = remaining.length ? `${number(categories.length)} categories available from ${number(remaining.length)} opportunities · ${Math.min(8,categories.length)} shown per spin.` : 'You have explored every available opportunity!';
    $('#spin-button-label').textContent = remaining.length ? 'SPIN THE CATEGORY' : 'ALL OPPORTUNITIES DISCOVERED';
    button.disabled = spinning || !remaining.length;
    if(!spinning && !preserveWheel) previewForCategory(categories);
  } else {
    const here=remaining.filter(o=>o.category===currentCategory?.id);
    $('#spin-title').textContent=currentCategory?.label || 'Next, an opportunity.';
    $('#spin-subtitle').textContent = here.length ? here.length === 1 ? 'This category has one remaining opportunity, so it will be the result.' : `${number(here.length)} undiscovered in this category · ${Math.min(8,here.length)} on the wheel.` : 'That category is fully explored. Pick another!';
    $('#spin-button-label').textContent = here.length ? 'SPIN AN OPPORTUNITY' : 'CATEGORY COMPLETED';
    button.disabled = spinning || !here.length;
    if(!spinning && !preserveWheel) previewForOpportunity(here);
  }
  if(latestResult) reveal.innerHTML = resultMarkup(latestResult);
  if(!canPersist) $('#remaining-label').textContent += ' · session only';
}
function resultMarkup(o: Opportunity): string {
  const category=catalog.categories.find(c=>c.id===o.category);
  const statusWarning=o.status==='unconfirmed';
  return `<div class="reveal-top"><span><span class="spark">✳</span> OPPORTUNITY UNLOCKED</span><span>#${String(saved.seen.length).padStart(3,'0')}</span></div><div class="reveal-columns"><div><div class="reveal-category">${escape(category?.label||o.category)} <span>↗</span></div><h2>${escape(o.title)}</h2><p class="reveal-provider">By ${escape(o.provider)}</p><p class="reveal-desc">${escape(o.description)}</p></div><div class="reveal-info"><span class="review-chip ${statusWarning?'caution':''}">${statusWarning?'● NOT CONFIRMED':'● '+escape(moneyStatus(o.status).toUpperCase())}</span><div><span class="detail-heading">WHAT IT OFFERS</span><p>${escape(o.value || 'See provider for details.')}</p></div><div><span class="detail-heading">WHO CAN APPLY</span><p>${escape(o.eligibility || 'Check with provider.')}</p></div><p class="review-note">Status reflects the dataset, not a guarantee. Always check current terms, availability and eligibility with the provider.</p><div class="reveal-links"><a href="${escape(o.officialUrl)}" target="_blank" rel="noopener noreferrer" class="primary-link">VISIT THE PROVIDER <span>↗</span></a><a href="https://perkcommons.com/opportunities/${encodeURIComponent(o.id)}/" target="_blank" rel="noopener noreferrer" class="secondary-link">VIEW ON PERKCOMMONS ↗</a></div></div></div><div class="after-spin"><button type="button" id="next-in-category">↻ Spin again in this category</button><button type="button" id="next-category">← New category</button></div>`;
}
function wireResult(): void {
  const nextIn=$<HTMLButtonElement>('#next-in-category');const nextCategory=$<HTMLButtonElement>('#next-category');
  nextIn.disabled = !available().some(o=>o.category===currentCategory?.id);
  nextIn.addEventListener('click',()=>{ latestResult=null;$('#reveal').hidden=true;render();document.querySelector('.spinner-panel')?.scrollIntoView({behavior:reduceMotion.matches?'instant':'smooth',block:'center'}); });
  nextCategory.addEventListener('click',()=>{latestResult=null;phase='category';currentCategory=null;render();document.querySelector('.spinner-panel')?.scrollIntoView({behavior:reduceMotion.matches?'instant':'smooth',block:'center'});});
}
async function spin(): Promise<void> {
  if(spinning) return;
  const remaining=available();
  const wasCategory = phase==='category';
  const options: Array<Category | Opportunity> = wasCategory ? availableCategories(catalog,remaining) : remaining.filter(o=>o.category===currentCategory?.id);
  if (!options.length) return;
  spinning=true;
  const outcome=draw(options,Math.min(8,options.length));
  if (wasCategory) paintWheel(outcome.preview.map(x=>('label' in x ? {label:x.label,short:sliceLabel(x.label,15)} : {label:x.title,short:sliceLabel(x.title,15)})));
  else paintWheel(outcome.preview.map(x=>('provider' in x ? {label:x.title,short:sliceLabel(x.provider,14)} : {label:x.label,short:sliceLabel(x.label,14)})));
  const button=$<HTMLButtonElement>('#spin-button');button.disabled=true;$('#spin-button-label').textContent='IN ORBIT…';
  $<HTMLInputElement>('#include-unconfirmed').disabled=true;$('#switch-button').hidden=true;
  const rotator=$('#wheel-rotator');
  // Sector zero starts at 12 o'clock. A positive rotation positions the winner under the fixed pointer.
  const sector=360/outcome.preview.length;
  const degrees=360*(5+secureIndex(3))+360-(outcome.winnerIndex+.5)*sector;
  await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
    rotator.style.transition=reduceMotion.matches?'none':'transform 4.5s cubic-bezier(.13,.82,.13,1)';
    rotation+=degrees;rotator.style.transform=`rotate(${rotation}deg)`;
    setTimeout(resolve,reduceMotion.matches?45:4570);
  })));
  // Let the pointer settle over the drawn wedge before swapping the wheel.
  if (wasCategory && !reduceMotion.matches) await new Promise<void>(resolve => setTimeout(resolve, 1100));
  spinning=false;
  if(wasCategory && 'label' in outcome.winner) {
    currentCategory=outcome.winner;phase='opportunity';
    $('#spin-title').textContent = currentCategory.label;
    $('#spin-subtitle').textContent = 'Your category has landed. Time for the second spin.';
  } else if('category' in outcome.winner) {
    latestResult=outcome.winner;
    saved=recordWin(saved,latestResult.id);persist();
  }
  // Keep the winning opportunity and its label precisely under the pointer
  // until the user starts the next draw; never snap back immediately.
  render(!wasCategory);
  if(latestResult) {wireResult();$('#reveal').scrollIntoView({behavior:reduceMotion.matches?'instant':'smooth',block:'start'});}
}
function fatal(message: string): void {
  ROOT.innerHTML=`<main class="load-error"><div class="error-symbol">✳</div><h1>Looks like we drifted off course.</h1><p>${escape(message)}</p><button id="retry">Try again ↻</button><p><a href="https://github.com/PerkCommons/data" target="_blank" rel="noopener noreferrer">Browse the source data ↗</a></p></main>`;
  document.querySelector('#retry')?.addEventListener('click',()=>location.reload());
}
async function init(): Promise<void> {
  try {
    const response=await fetch(`${BASE}catalog.json`,{cache:'no-cache'});
    if(!response.ok)throw new Error('The public dataset could not be loaded.');
    const data=await response.json() as Catalog;
    if(data.schemaVersion!==1 || !Array.isArray(data.opportunities) || !Array.isArray(data.categories) || !data.opportunities.length)throw new Error('The dataset is empty or has an unexpected format.');
    catalog=data;saved=loadState();shell();render();
  } catch(error) {fatal(error instanceof Error?error.message:'Please retry in a moment.');}
}
void init();
