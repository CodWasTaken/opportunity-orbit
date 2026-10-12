import './style.css';
import { availableCategories, draw, emptyState, MIN_CATEGORY_OPTIONS, normalizeState, pool, recordWin, secureIndex } from './game';
import type { Catalog, Category, Opportunity, SavedState } from './game';
import { quickSummary } from './summary';

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
    <main class="studio-layout">
      <div class="studio-topbar"><a class="top-brand" href="${escape(BASE)}"><span class="mini-mark">✳</span> opportunity<span>orbit</span></a><span class="creator-badge"><i></i> VERTICAL SPIN STUDIO</span></div>
      <section id="recording-canvas" class="recording-canvas" aria-label="Vertical opportunity spin stage">
        <div class="canvas-glow glow-one" aria-hidden="true"></div><div class="canvas-glow glow-two" aria-hidden="true"></div>
        <div class="video-topline"><div class="in-video-brand"><span class="in-video-mark">✳</span><span>opportunity<strong>orbit</strong></span></div><span class="episode-pill">EP. <span id="episode-count">001</span></span></div>
        <div class="video-head"><div class="kicker"><span class="kicker-dot"></span> YOUR RANDOM OPPORTUNITY GENERATOR</div><h1 id="video-headline">YOUR NEXT<br><em>BIG THING?</em></h1><div id="video-subhead">TWO SPINS. ONE NEW POSSIBILITY.</div></div>
        <div class="round-indicator" aria-label="Current wheel"><div id="stage-one" class="stage current"><b>01</b> CATEGORY</div><span class="divider-arrow">→</span><div id="stage-two" class="stage"><b>02</b> OPPORTUNITY</div></div>
        <div class="wheel-bay"><div class="wheel-shell" id="wheel-shell"><div class="wheel-halo"></div><div class="wheel-pointer" aria-hidden="true"></div><div id="wheel-rotator" class="wheel-rotator"><div id="wheel-disc" class="wheel-disc"><div class="wheel-core"><div class="wheel-core-ring">✳</div></div><div id="wheel-labels"></div></div></div></div></div>
        <div class="spin-footer"><div class="spin-title" id="spin-title">Let's find your category.</div><p id="spin-subtitle">18 categories waiting for a spin</p><button type="button" id="spin-button" class="spin-button" disabled><span id="spin-button-label">LOADING…</span><span class="button-arrow" aria-hidden="true">↗</span></button><button type="button" id="switch-button" class="switch-button" hidden>← Back to categories</button></div>
        <div class="video-bottomline"><span>POWERED BY PERKCOMMONS OPEN DATA</span><span class="video-spark" aria-hidden="true">✳</span><span>NO REPEATS · EVER</span></div>
        <section id="reveal" class="reveal" hidden aria-live="polite" aria-label="Your random opportunity result"></section>
      </section>
      <div class="studio-actionbar"><div><strong>Made for short-form video.</strong><span>A 9:16 frame you can screen-record.</span></div><button id="fullscreen-button" class="fullscreen-button" type="button">⛶ Full screen</button></div>
      <section class="control-deck" aria-label="Wheel settings and history">
        <div class="control-top"><span class="control-eyebrow">BEHIND THE SPIN</span><span class="control-caption">All the controls. None of the camera clutter.</span></div>
        <div class="control-grid">
          <section class="progress-card"><span class="overline">YOUR DISCOVERIES</span><div class="big-number"><span id="discovered-count">0</span><span class="metric-suffix"> / <span id="total-count">—</span></span></div><p>Opportunities discovered</p><div class="progress-track"><div id="progress-bar"></div></div><div class="progress-bottom"><span id="remaining-label">Loading pool…</span><span id="percent-label">0%</span></div></section>
          <section class="settings-card"><div class="settings-title">YOUR SPIN SETTINGS <span>✳</span></div><label class="switch-row" for="include-unconfirmed"><span><strong>Use the full catalog</strong><small>Includes unconfirmed listings. Confirm details with the provider.</small></span><input type="checkbox" id="include-unconfirmed" role="switch"/><span class="toggle-track"></span></label><p class="source-note">The category wheel only offers categories with at least eight unspun results. Every listing in a selected category has its own slice.</p></section>
        </div>
        <details id="wheel-choice-roster" class="wheel-choice-roster"><summary id="wheel-choice-roster-summary">See all wheel choices</summary><ol id="wheel-choice-list" class="wheel-choice-list" aria-label="Full names of the slices in wheel order"></ol></details>
        <section class="history-card"><div class="history-title"><span>YOUR RECENT FINDS</span><button type="button" id="reset-button">Reset history ↺</button></div><div id="history-list" class="history-list"><p class="empty-history">No opportunities discovered yet. Your adventure starts with a spin.</p></div></section>
        <p class="privacy-card">Your results are saved only in this browser. PerkCommons listings may be unconfirmed or out of date. Check the provider before applying.</p>
      </section>
      <footer class="creator-footer"><a href="https://perkcommons.com/" target="_blank" rel="noopener noreferrer">Explore PerkCommons ↗</a><a href="https://github.com/CodWasTaken/opportunity-orbit" target="_blank" rel="noopener noreferrer">Open-source project ↗</a><span>No logins. No analytics.</span></footer>
    </main>
    <dialog id="reset-dialog" aria-labelledby="reset-heading"><form method="dialog"><div class="dialog-mark">✳</div><h2 id="reset-heading">Fresh start?</h2><p>This puts every eligible opportunity back in the wheel on this browser.</p><div class="dialog-actions"><button value="cancel" class="dialog-cancel">Keep progress</button><button value="confirm" class="dialog-confirm">Reset everything</button></div></form></dialog>`;
  $('#spin-button').addEventListener('click', () => void spin());
  $('#switch-button').addEventListener('click', () => { if (spinning) return; phase = 'category'; currentCategory = null; latestResult = null; render(); });
  $('#include-unconfirmed').addEventListener('change', e => { if (spinning) return; saved.includeUnconfirmed = (e.target as HTMLInputElement).checked; persist(); phase = 'category'; currentCategory = null; latestResult = null; render(); });
  $('#reset-button').addEventListener('click', () => { if (!spinning) $<HTMLDialogElement>('#reset-dialog').showModal(); });
  $('#reset-dialog').addEventListener('close', () => { if ($<HTMLDialogElement>('#reset-dialog').returnValue === 'confirm') { saved = { ...emptyState(), includeUnconfirmed: saved.includeUnconfirmed }; persist(); phase = 'category'; currentCategory = null; latestResult = null; render(); } });
  $('#fullscreen-button').addEventListener('click', async () => {
    const frame = $('#recording-canvas');
    try {
      if (document.fullscreenElement === frame) await document.exitFullscreen();
      else if (frame.requestFullscreen) await frame.requestFullscreen();
    } catch { $<HTMLButtonElement>('#fullscreen-button').textContent = 'Full screen unavailable'; }
  });
  document.addEventListener('fullscreenchange', () => { $<HTMLButtonElement>('#fullscreen-button').textContent = document.fullscreenElement ? '⛶ Exit full screen' : '⛶ Full screen'; });
}

function available(): Opportunity[] { return pool(catalog, saved); }
function sliceLabel(label: string, length = 22): string { return label.length > length ? label.slice(0,length - 1).trimEnd() + '…' : label; }
type WheelChoice = { label: string; short: string };
function paintWheel(choices: WheelChoice[]): void {
  const disc = $('#wheel-disc');
  const labels = $('#wheel-labels');
  const n = choices.length;
  const sector = 360 / Math.max(n, 1);
  disc.classList.toggle('dense-wheel', n > 24);
  disc.classList.toggle('very-dense-wheel', n > 42);
  disc.setAttribute('aria-label', `${n} distinct choices, one choice per segment`);
  // Every option gets exactly one segment. Boundaries are geometric sector
  // fractions; no sampled preview and no duplicated filler options.
  disc.style.background = n ? `conic-gradient(from 0deg, ${choices.map((_,i) => `${selectedWheelColors[i % selectedWheelColors.length]} ${i*sector}deg ${(i+1)*sector}deg`).join(', ')})` : '#55536c';
  // Rotate text radially within its segment. The disc rotates as one rigid
  // surface; each label retains the same angle relative to its own wedge.
  labels.innerHTML = choices.map((o,i)=>`<span class="sector-label" data-wheel-index="${i}" style="--sector-angle:${(i+.5)*sector}deg" title="${escape(o.label)}">${escape(o.short)}</span>`).join('');
  const summary = $('#wheel-choice-roster-summary');
  summary.textContent = `View all ${n} wheel choices by name`;
  $('#wheel-choice-list').innerHTML = choices.map((o,i)=>`<li><span class="wheel-list-number">${String(i+1).padStart(2,'0')}</span><span>${escape(o.label)}</span></li>`).join('');
  const rotator = $('#wheel-rotator');rotator.style.transition = 'none';rotator.style.transform = 'rotate(0deg)';rotation = 0;
}
function categoryWheelChoices(categories: Category[]): WheelChoice[] {
  return categories.map(x=>({label:x.label,short:sliceLabel(x.label,18)}));
}
function opportunityWheelChoices(opportunities: Opportunity[]): WheelChoice[] {
  // All candidates are rendered. Dense radial labels show compact names;
  // the scrollable roster provides every complete title in segment order.
  const dense=opportunities.length > 42;
  const compact=opportunities.length > 24;
  return opportunities.map(x=>({label:x.title, short:sliceLabel(x.title, dense?19:compact?23:28)}));
}

function historyMarkup(): string {
  const byId = new Map(catalog.opportunities.map(o=>[o.id,o]));
  const items = saved.history.filter(h => byId.has(h.id)).slice(0,5);
  if (!items.length) return '<p class="empty-history">Nothing found just yet. Your adventure is about to begin.</p>';
  return items.map((h,index)=>{const o=byId.get(h.id)!;return `<a class="history-item" href="https://perkcommons.com/opportunities/${encodeURIComponent(o.id)}/" target="_blank" rel="noopener noreferrer"><span class="history-index">${String(index+1).padStart(2,'0')}</span><span><strong>${escape(o.title)}</strong><small>${escape(o.provider)}</small></span><span class="history-arrow">↗</span></a>`;}).join('');
}
function render(preserveWheel = false): void {
  const remaining = available();const categories = availableCategories(catalog,remaining);
  const qualifiedIds = new Set(categories.map(category => category.id));
  const categoryWheelOptions = remaining.filter(item => qualifiedIds.has(item.category)).length;
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
  $('#episode-count').textContent = String(saved.seen.length+1).padStart(3,'0');
  $('#video-headline').innerHTML = phase === 'category' ? 'YOUR NEXT<br><em>BIG THING?</em>' : 'LET FATE<br><em>DECIDE.</em>';
  $('#video-subhead').textContent = phase === 'category' ? 'FIRST UP: PICK YOUR CATEGORY' : `ROUND TWO · ${currentCategory?.label.toUpperCase() ?? 'YOUR OPPORTUNITY'}`;
  $('#stage-one').classList.toggle('current',phase==='category');
  $('#stage-two').classList.toggle('current',phase==='opportunity');
  $('#stage-one').classList.toggle('completed',phase==='opportunity');
  const button=$<HTMLButtonElement>('#spin-button');button.disabled=spinning;
  $('#switch-button').hidden=phase!=='opportunity' || spinning;
  const reveal=$('#reveal');reveal.hidden=!latestResult;
  if (phase==='category') {
    $('#spin-title').textContent='Where will we land?';
    $('#spin-subtitle').textContent = categories.length
      ? `${number(categories.length)} categories · ${number(categoryWheelOptions)} possible discoveries`
      : `No categories have ${MIN_CATEGORY_OPTIONS} remaining options. Try another filter or reset history.`;
    $('#spin-button-label').textContent = categories.length ? 'SPIN THE CATEGORY ✳' : 'NO ELIGIBLE CATEGORIES';
    button.disabled = spinning || !categories.length;
    if(!spinning && !preserveWheel) paintWheel(categoryWheelChoices(categories));
  } else {
    const here=remaining.filter(o=>o.category===currentCategory?.id);
    $('#spin-title').textContent=currentCategory?.label || 'Choose your opportunity';
    $('#spin-subtitle').textContent = here.length ? `${number(here.length)} possible picks · all on the wheel` : 'That category is fully explored. Pick another!';
    $('#spin-button-label').textContent = here.length ? 'SPIN MY OPPORTUNITY ✳' : 'CATEGORY COMPLETED';
    button.disabled = spinning || !here.length;
    if(!spinning && !preserveWheel) paintWheel(opportunityWheelChoices(here));
  }
  if(latestResult) reveal.innerHTML = resultMarkup(latestResult);
  if(!canPersist) $('#remaining-label').textContent += ' · session only';
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
  nextCategory.addEventListener('click',()=>{latestResult=null;phase='category';currentCategory=null;render();});
}
async function spin(): Promise<void> {
  if(spinning) return;
  const remaining=available();
  const wasCategory = phase==='category';
  const options: Array<Category | Opportunity> = wasCategory ? availableCategories(catalog,remaining) : remaining.filter(o=>o.category===currentCategory?.id);
  if (!options.length) return;
  spinning=true;
  // Same order as the idle wheel. No redraw / shortlist reshuffle when the
  // visitor presses Spin: the pointer lands on the exact displayed choice.
  const outcome=draw(options);
  const button=$<HTMLButtonElement>('#spin-button');button.disabled=true;$('#spin-button-label').textContent='IN ORBIT…';
  $<HTMLInputElement>('#include-unconfirmed').disabled=true;$('#switch-button').hidden=true;
  const rotator=$('#wheel-rotator');
  // Sector zero starts at 12 o'clock. A positive rotation positions the winner under the fixed pointer.
  const sector=360/options.length;
  const degrees=360*(5+secureIndex(3))+360-(outcome.winnerIndex+.5)*sector;
  await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
    rotator.style.transition=reduceMotion.matches?'none':'transform 3.8s cubic-bezier(.12,.78,.10,1)';
    rotation+=degrees;rotator.style.transform=`rotate(${rotation}deg)`;
    setTimeout(resolve,reduceMotion.matches?45:3870);
  })));
  // Let the pointer settle over the drawn wedge before swapping the wheel.
  if (wasCategory && !reduceMotion.matches) await new Promise<void>(resolve => setTimeout(resolve, 680));
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
  if(latestResult) wireResult();
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
