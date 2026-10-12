import './style.css';
import { availableCategories, draw, emptyState, MIN_CATEGORY_OPTIONS, normalizeState, pool, recordWin, secureIndex } from './game';
import type { Catalog, Category, Opportunity, SavedState } from './game';
import { quickSummary } from './summary';

const ROOT = document.querySelector<HTMLDivElement>('#app')!;
const STORAGE = 'opportunity-orbit:history:v2';
const OLD_STORAGE = 'opportunity-orbit:history:v1';
const CATEGORY_STORAGE = 'opportunity-orbit:selected-category:v1';
const BASE = import.meta.env.BASE_URL;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let catalog: Catalog;
let saved: SavedState = emptyState();
let canPersist = true;
let currentCategory: Category | null = null;
let latestResult: Opportunity | null = null;
let spinning = false;
let rotation = 0;
const selectedWheelColors = ['#D6C6F2','#C5EBD9','#F5CDBF','#C8E0F4','#F7E7AC','#EFC8DC','#D4DCBB','#E1D6F4'];

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
    <main class="studio-layout">
      <div class="studio-topbar"><a class="top-brand" href="${escape(BASE)}"><span class="mini-mark">✳</span> opportunity<span>orbit</span></a><span class="creator-badge"><i></i> VERTICAL SPIN STUDIO</span></div>
      <section id="recording-canvas" class="recording-canvas" aria-label="Vertical opportunity spin stage">
        <span class="poster-star star-a" aria-hidden="true">✳</span><span class="poster-star star-b" aria-hidden="true">✦</span>
        <div class="video-topline"><div class="in-video-brand"><span class="in-video-mark">✳</span><span>opportunity<strong>orbit</strong></span></div><span class="episode-pill">EP. <span id="episode-count">001</span></span></div>
        <div class="video-head"><div class="kicker"><span class="kicker-dot"></span> YOUR RANDOM OPPORTUNITY GENERATOR</div><h1 id="video-headline">WHAT’S<br><em>OUT THERE?</em></h1><div id="video-subhead">Pick your lane. Spin for a surprise.</div></div>
        <section class="category-picker" aria-label="Choose opportunity category"><div class="picker-top"><strong>01 / PICK A CATEGORY</strong><button type="button" id="category-open-button" aria-haspopup="dialog" aria-controls="category-dialog">ALL CATEGORIES ↗</button></div><div id="category-strip" class="category-strip" role="group" aria-label="Opportunity categories"></div></section>
        <div class="wheel-bay"><div class="wheel-shell" id="wheel-shell"><div class="wheel-halo"></div><div class="wheel-pointer" aria-hidden="true"></div><div id="wheel-rotator" class="wheel-rotator"><div id="wheel-disc" class="wheel-disc"><svg id="wheel-segments" class="wheel-segments" viewBox="0 0 1000 1000" aria-hidden="true"></svg><div class="wheel-placeholder" id="wheel-placeholder" aria-hidden="true">PICK YOUR<br/>CATEGORY<br/>ABOVE ✳</div><div class="wheel-core"><div class="wheel-core-ring">✳</div></div><div id="wheel-labels"></div></div></div></div></div>
        <div class="spin-footer"><div class="spin-title" id="spin-title">Choose your category above.</div><p id="spin-subtitle">18 categories to explore</p><button type="button" id="spin-button" class="spin-button" disabled><span id="spin-button-label">CHOOSE A CATEGORY FIRST</span><span class="button-arrow" aria-hidden="true">↗</span></button></div>
        <div class="video-bottomline"><span>POWERED BY PERKCOMMONS OPEN DATA</span><span class="video-spark" aria-hidden="true">✳</span><span>NO REPEATS · EVER</span></div>
        <section id="reveal" class="reveal" hidden aria-live="polite" aria-label="Your random opportunity result"></section>
      </section>
      <div class="studio-actionbar"><div><strong>Made for short-form video.</strong><span>A 9:16 frame you can screen-record.</span></div><button id="fullscreen-button" class="fullscreen-button" type="button">⛶ Full screen</button></div>
      <section class="control-deck" aria-label="Wheel settings and history">
        <div class="control-top"><span class="control-eyebrow">BEHIND THE SPIN</span><span class="control-caption">All the controls. None of the camera clutter.</span></div>
        <div class="control-grid">
          <section class="progress-card"><span class="overline">YOUR DISCOVERIES</span><div class="big-number"><span id="discovered-count">0</span><span class="metric-suffix"> / <span id="total-count">—</span></span></div><p>Opportunities discovered</p><div class="progress-track"><div id="progress-bar"></div></div><div class="progress-bottom"><span id="remaining-label">Loading pool…</span><span id="percent-label">0%</span></div></section>
          <section class="settings-card"><div class="settings-title">YOUR SPIN SETTINGS <span>✳</span></div><label class="switch-row" for="include-unconfirmed"><span><strong>Use the full catalog</strong><small>Includes unconfirmed listings. Confirm details with the provider.</small></span><input type="checkbox" id="include-unconfirmed" role="switch"/><span class="toggle-track"></span></label><p class="source-note">Only categories with at least eight undrawn opportunities can be chosen. Every option in your category appears on the wheel.</p></section>
        </div>
        <details id="wheel-choice-roster" class="wheel-choice-roster"><summary id="wheel-choice-roster-summary">See all wheel choices</summary><ol id="wheel-choice-list" class="wheel-choice-list" aria-label="Full names of the slices in wheel order"></ol></details>
        <section class="history-card"><div class="history-title"><span>YOUR RECENT FINDS</span><button type="button" id="reset-button">Reset history ↺</button></div><div id="history-list" class="history-list"><p class="empty-history">No opportunities discovered yet. Your adventure starts with a spin.</p></div></section>
        <p class="privacy-card">Your results are saved only in this browser. PerkCommons listings may be unconfirmed or out of date. Check the provider before applying.</p>
      </section>
      <footer class="creator-footer"><a href="https://perkcommons.com/" target="_blank" rel="noopener noreferrer">Explore PerkCommons ↗</a><a href="https://github.com/CodWasTaken/opportunity-orbit" target="_blank" rel="noopener noreferrer">Open-source project ↗</a><span>No logins. No analytics.</span></footer>
    </main>
    <dialog id="category-dialog" class="category-dialog" aria-labelledby="category-dialog-heading"><div class="category-dialog-header"><h2 id="category-dialog-heading">Choose a category</h2><button id="category-close-button" type="button" aria-label="Close category picker">✕</button></div><p>Only categories with 8 or more undrawn opportunities appear.</p><div id="category-dialog-grid" class="category-dialog-grid"></div></dialog>
    <dialog id="reset-dialog" aria-labelledby="reset-heading"><form method="dialog"><div class="dialog-mark">✳</div><h2 id="reset-heading">Fresh start?</h2><p>This puts every eligible opportunity back in the wheel on this browser.</p><div class="dialog-actions"><button value="cancel" class="dialog-cancel">Keep progress</button><button value="confirm" class="dialog-confirm">Reset everything</button></div></form></dialog>`;
  $('#spin-button').addEventListener('click', () => void spin());
  $('#category-open-button').addEventListener('click',()=>{if(!spinning) $<HTMLDialogElement>('#category-dialog').showModal();});
  $('#category-close-button').addEventListener('click',()=>$<HTMLDialogElement>('#category-dialog').close());
  $('#category-strip').addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button[data-category-id]');if(button) chooseCategory(button.dataset.categoryId || '');});
  $('#category-dialog-grid').addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button[data-category-id]');if(button){chooseCategory(button.dataset.categoryId || '');$<HTMLDialogElement>('#category-dialog').close();}});
  $('#include-unconfirmed').addEventListener('change', e => { if (spinning) return; saved.includeUnconfirmed = (e.target as HTMLInputElement).checked; persist(); currentCategory = null; saveCategory(); latestResult = null; render(); });
  $('#reset-button').addEventListener('click', () => { if (!spinning) $<HTMLDialogElement>('#reset-dialog').showModal(); });
  $('#reset-dialog').addEventListener('close', () => { if ($<HTMLDialogElement>('#reset-dialog').returnValue === 'confirm') { saved = { ...emptyState(), includeUnconfirmed: saved.includeUnconfirmed }; persist(); currentCategory = null; saveCategory(); latestResult = null; render(); } });
  $('#fullscreen-button').addEventListener('click', async () => {
    const frame = $('#recording-canvas');
    try {
      if (document.fullscreenElement === frame) await document.exitFullscreen();
      else if (frame.requestFullscreen) await frame.requestFullscreen();
    } catch { $<HTMLButtonElement>('#fullscreen-button').textContent = 'Full screen unavailable'; }
  });
  document.addEventListener('fullscreenchange', () => { $<HTMLButtonElement>('#fullscreen-button').textContent = document.fullscreenElement ? '⛶ Exit full screen' : '⛶ Full screen'; });
}

function saveCategory(): void { try { if(currentCategory) localStorage.setItem(CATEGORY_STORAGE,currentCategory.id); else localStorage.removeItem(CATEGORY_STORAGE); } catch { /* storage unavailable */ } }
function chooseCategory(id:string): void {
  if(spinning) return;
  const chosen=availableCategories(catalog,available()).find(c=>c.id===id);
  if(!chosen) return;
  currentCategory=chosen; latestResult=null; saveCategory(); render();
}

function available(): Opportunity[] { return pool(catalog, saved); }
function sliceLabel(label: string, length = 22): string { return label.length > length ? label.slice(0,length - 1).trimEnd() + '…' : label; }
type WheelChoice = { label: string; short: string };
function paintWheel(choices: WheelChoice[]): void {
  const disc=$('#wheel-disc'), labels=$('#wheel-labels');
  const n=choices.length, sector=360/Math.max(1,n);
  disc.classList.toggle('dense-wheel',n>24);
  disc.classList.toggle('very-dense-wheel',n>42);
  disc.setAttribute('aria-label',n? n+' opportunity choices, one per wedge':'Choose a category to fill the wheel');
  // Each wheel slice is a solid SVG path, not a gradient.
  const xy=(deg:number)=>{const radians=deg*Math.PI/180;return (500+500*Math.sin(radians)).toFixed(3)+' '+(500-500*Math.cos(radians)).toFixed(3);};
  $('#wheel-segments').innerHTML=choices.map((_,i)=>'<path d="M 500 500 L '+xy(i*sector)+' A 500 500 0 '+(sector>180?1:0)+' 1 '+xy((i+1)*sector)+' Z" fill="'+selectedWheelColors[i%selectedWheelColors.length]+'"/>').join('');
  labels.innerHTML=choices.map((o,i)=>'<span class="sector-label" data-wheel-index="'+i+'" style="--sector-angle:'+((i+.5)*sector)+'deg" title="'+escape(o.label)+'">'+escape(o.short)+'</span>').join('');
  $('#wheel-placeholder').hidden=n>0;
  $('#wheel-choice-roster-summary').textContent=n?'View all '+n+' opportunities by name':'Choose a category to view its opportunities';
  $('#wheel-choice-list').innerHTML=choices.map((o,i)=>'<li><span class="wheel-list-number">'+String(i+1).padStart(2,'0')+'</span><span>'+escape(o.label)+'</span></li>').join('');
  const rotator=$('#wheel-rotator'); rotator.style.transition='none';rotator.style.transform='rotate(0deg)';rotation=0;
}
function opportunityWheelChoices(opportunities:Opportunity[]):WheelChoice[]{
  const dense=opportunities.length>42, compact=opportunities.length>24;
  return opportunities.map(o=>({label:o.title,short:sliceLabel(o.title,dense?19:compact?23:28)}));
}

function historyMarkup(): string {
  const byId = new Map(catalog.opportunities.map(o=>[o.id,o]));
  const items = saved.history.filter(h => byId.has(h.id)).slice(0,5);
  if (!items.length) return '<p class="empty-history">Nothing found just yet. Your adventure is about to begin.</p>';
  return items.map((h,index)=>{const o=byId.get(h.id)!;return `<a class="history-item" href="https://perkcommons.com/opportunities/${encodeURIComponent(o.id)}/" target="_blank" rel="noopener noreferrer"><span class="history-index">${String(index+1).padStart(2,'0')}</span><span><strong>${escape(o.title)}</strong><small>${escape(o.provider)}</small></span><span class="history-arrow">↗</span></a>`;}).join('');
}
function render(preserveWheel=false): void {
  const remaining=available();
  const categories=availableCategories(catalog,remaining);
  const total=catalog.opportunities.filter(o=>saved.includeUnconfirmed||o.status!=='unconfirmed').length;
  const used=total-remaining.length,pct=total?Math.round(100*used/total):0;
  $('#discovered-count').textContent=number(used);
  $('#total-count').textContent=number(total);
  $('#progress-bar').style.width=pct+'%';
  $('#percent-label').textContent=pct+'%';
  $('#remaining-label').textContent=number(remaining.length)+' still waiting'+(canPersist?'':' · session only');
  $('#history-list').innerHTML=historyMarkup();
  const toggle=$<HTMLInputElement>('#include-unconfirmed');
  toggle.checked=saved.includeUnconfirmed;toggle.disabled=spinning;
  $('#reset-button').toggleAttribute('disabled',spinning||saved.seen.length===0);
  $('#episode-count').textContent=String(saved.seen.length+1).padStart(3,'0');
  $('#video-subhead').textContent=currentCategory?'TODAY’S THEME: '+currentCategory.label.toUpperCase():'Pick your lane. Spin for a surprise.';
  const counts=new Map<string,number>();
  for(const o of remaining)counts.set(o.category,(counts.get(o.category)||0)+1);
  const chips=categories.map((c,i)=>'<button class="category-chip '+(currentCategory?.id===c.id?'selected':'')+'" type="button" data-category-id="'+escape(c.id)+'" style="--chip-color:'+selectedWheelColors[i%selectedWheelColors.length]+'" aria-pressed="'+(currentCategory?.id===c.id)+'" '+(spinning?'disabled':'')+'><span>'+escape(c.label)+'</span><small>'+counts.get(c.id)+'</small></button>');
  $('#category-strip').innerHTML=chips.join('')||'<span class="empty-categories">No eligible categories remain. Reset progress or change the filter.</span>';
  $('#category-dialog-grid').innerHTML=chips.join('');
  $<HTMLButtonElement>('#category-open-button').disabled=spinning||categories.length===0;
  const here=currentCategory?remaining.filter(o=>o.category===currentCategory?.id):[];
  $('#spin-title').textContent=currentCategory?.label||'Choose your category above.';
  $('#spin-subtitle').textContent=currentCategory?(here.length?number(here.length)+' possibilities · one random pick':'This category is complete. Pick another.'):(categories.length+' categories · at least '+MIN_CATEGORY_OPTIONS+' results each');
  $('#spin-button-label').textContent=currentCategory?(here.length?'SPIN MY OPPORTUNITY ✳':'CATEGORY COMPLETE'):'CHOOSE A CATEGORY FIRST';
  $<HTMLButtonElement>('#spin-button').disabled=spinning||here.length===0;
  $('#reveal').hidden=!latestResult;
  if(!spinning&&!preserveWheel)paintWheel(opportunityWheelChoices(here));
  if(latestResult)$('#reveal').innerHTML=resultMarkup(latestResult);
}

function resultMarkup(o: Opportunity): string {
  const category = catalog.categories.find(c => c.id === o.category);
  const short = quickSummary(o.description, 185);
  const benefit = quickSummary(o.value, 108);
  return `<div class="reveal-flash" aria-hidden="true">✦</div><div class="result-topline"><span>✳ THE UNIVERSE HAS SPOKEN</span><span>FIND #${String(saved.seen.length).padStart(3,'0')}</span></div>
    <div class="result-main"><div class="result-kicker">YOUR OPPORTUNITY IS…</div><div class="result-category">${escape(category?.label ?? o.category)}</div><h2>${escape(o.title)}</h2><div class="result-provider">BY ${escape(o.provider)}</div>
      <div class="result-divider"><span>✷</span><span>✷</span><span>✷</span></div>
      <div class="result-story"><div class="result-story-label">SO, WHAT IS IT?</div><p>${escape(short)}</p></div>
      ${benefit ? `<div class="result-benefit"><span>THE PERK</span><p>${escape(benefit)}</p></div>` : ''}
      <div class="result-status ${o.status === 'unconfirmed' ? 'unconfirmed' : ''}">${o.status === 'unconfirmed' ? '◌ STATUS NOT YET CONFIRMED' : '✓ '+escape(moneyStatus(o.status).toUpperCase())}<span>Check current details with the provider.</span></div>
    </div>
    <div class="result-bottom"><div class="result-links"><a class="primary-link" href="${escape(o.officialUrl)}" target="_blank" rel="noopener noreferrer">OFFICIAL PROGRAM ↗</a><a class="secondary-link" href="https://perkcommons.com/opportunities/${encodeURIComponent(o.id)}/" target="_blank" rel="noopener noreferrer">PERKCOMMONS ↗</a></div>
      <div class="after-spin"><button id="next-in-category" type="button">↻ Spin again</button><button id="next-category" type="button">New category →</button></div>
      <div class="result-watermark">DISCOVER MORE AT <strong>PERKCOMMONS.COM</strong></div></div>`;
}

function wireResult(): void {
  const nextIn=$<HTMLButtonElement>('#next-in-category');const nextCategory=$<HTMLButtonElement>('#next-category');
  nextIn.disabled = !available().some(o=>o.category===currentCategory?.id);
  nextIn.addEventListener('click',()=>{ latestResult=null;render(); });
  nextCategory.addEventListener('click',()=>{latestResult=null;currentCategory=null;saveCategory();render();$<HTMLDialogElement>('#category-dialog').showModal();});
}
async function spin(): Promise<void> {
  if(spinning||!currentCategory)return;
  const choices=available().filter(o=>o.category===currentCategory!.id);
  if(!choices.length)return;
  spinning=true;
  const outcome=draw(choices);
  const button=$<HTMLButtonElement>('#spin-button');
  button.disabled=true;$('#spin-button-label').textContent='SPINNING…';
  $<HTMLInputElement>('#include-unconfirmed').disabled=true;
  $<HTMLButtonElement>('#category-open-button').disabled=true;
  $('#category-strip').querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=true);
  const rotator=$('#wheel-rotator'), sector=360/choices.length;
  const degrees=360*(5+secureIndex(3))+360-(outcome.winnerIndex+.5)*sector;
  await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
    rotator.style.transition=reduceMotion.matches?'none':'transform 3.8s cubic-bezier(.12,.78,.10,1)';
    rotation+=degrees;rotator.style.transform='rotate('+rotation+'deg)';
    setTimeout(resolve,reduceMotion.matches?45:3870);
  })));
  spinning=false; latestResult=outcome.winner;
  saved=recordWin(saved,latestResult.id);persist();
  render(true);wireResult();
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
    catalog=data;saved=loadState();
    try{const id=localStorage.getItem(CATEGORY_STORAGE);currentCategory=id?catalog.categories.find(c=>c.id===id)??null:null;}catch{currentCategory=null;}
    if(currentCategory&&!available().some(o=>o.category===currentCategory!.id))currentCategory=null;
    shell();render();
  } catch(error) {fatal(error instanceof Error?error.message:'Please retry in a moment.');}
}
void init();
