import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draw, availableCategories, emptyState, normalizeState, pool, recordWin } from '../src/game.ts';
const catalog = { categories: [{ id: 'a', label: 'A' },{ id:'b',label:'B' }], opportunities: [
  {id:'one',category:'a',status:'active'},
  {id:'two',category:'a',status:'unconfirmed'},
  {id:'three',category:'b',status:'active'},
]};

test('only confirmed listings enter the default pool; opt-in permits unconfirmed',()=>{
  assert.deepEqual(pool(catalog,emptyState()).map(o=>o.id),['one','three']);
  assert.deepEqual(pool(catalog,{...emptyState(),includeUnconfirmed:true}).map(o=>o.id),['one','two','three']);
});
test('selected opportunity never occurs again, including after rehydration',()=>{
  let state=recordWin(emptyState(),'one','2026-10-12');
  assert.equal(recordWin(state,'one'),state);
  state=normalizeState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(pool(catalog,state).map(o=>o.id),['three']);
  assert.deepEqual(availableCategories(catalog,pool(catalog,state)).map(c=>c.id),['b']);
});
test('an opportunity selected from any position ends in the preview exactly once',()=>{
  const values=Array.from({length:70},(_,i)=>i);
  for(let winnerIndex=0;winnerIndex<values.length;winnerIndex++){
    let call=0;
    const rng=(max)=>call++===0?winnerIndex%max:0;
    const x=draw(values,8,rng);
    assert.equal(x.winner,winnerIndex);
    assert.equal(x.preview.filter(v=>v===x.winner).length,1);
    assert.equal(x.preview[x.winnerIndex],x.winner);
    assert.equal(new Set(x.preview).size,x.preview.length);
  }
});
test('category and opportunity fairness are over the full pool, not preview sample',()=>{
  const entries=Array.from({length:100},(_,i)=>i);
  assert.equal(draw(entries,8,max=>max===100?99:0).winner,99);
});
test('invalid or tampered persistent state is handled safely',()=>{
  assert.deepEqual(normalizeState(null),emptyState());
  assert.deepEqual(normalizeState({version:88}),emptyState());
  const n=normalizeState({version:1,seen:['one','one','<svg>','two'],history:[{id:'one',at:'2026-10-12'}],includeUnconfirmed:true});
  assert.deepEqual(n.seen,['one','two']);assert.equal(n.history.length,1);assert.equal(n.includeUnconfirmed,true);
});
