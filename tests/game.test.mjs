import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draw, availableCategories, emptyState, normalizeState, pool, recordWin } from '../src/game.ts';
const catalog = { categories: [{ id: 'a', label: 'A' },{ id:'b',label:'B' }], opportunities: [
  {id:'one',category:'a',status:'active'},
  {id:'two',category:'a',status:'unconfirmed'},
  {id:'three',category:'b',status:'active'},
]};

test('all eligible listings enter the default pool; optional filter limits to confirmed',()=>{
  assert.deepEqual(pool(catalog,emptyState()).map(o=>o.id),['one','two','three']);
  assert.deepEqual(pool(catalog,{...emptyState(),includeUnconfirmed:false}).map(o=>o.id),['one','three']);
});
test('selected opportunity never occurs again, including after rehydration',()=>{
  let state=recordWin(emptyState(),'one','2026-10-12');
  assert.equal(recordWin(state,'one'),state);
  state=normalizeState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(pool(catalog,state).map(o=>o.id),['two','three']);
  assert.deepEqual(availableCategories(catalog,pool(catalog,state)).map(c=>c.id),[]);
});
test('all choices map one-to-one onto the drawn index, including item 70', () => {
  const values = Array.from({ length: 70 }, (_, i) => i);
  for (let winnerIndex = 0; winnerIndex < values.length; winnerIndex++) {
    const result = draw(values, () => winnerIndex);
    assert.equal(result.winner, winnerIndex);
    assert.equal(result.winnerIndex, winnerIndex);
  }
});
test('every opportunity has the same possible index across the full pool', () => {
  const entries = Array.from({ length: 100 }, (_, i) => i);
  assert.equal(draw(entries, max => max - 1).winner, 99);
});
test('only categories with at least eight currently available records enter the category spin', () => {
  const entries = [
    ...Array.from({ length: 8 }, (_, i) => ({id:`a${i}`, category:'a',status:'active'})),
    ...Array.from({ length: 7 }, (_, i) => ({id:`b${i}`, category:'b',status:'active'})),
    ...Array.from({ length: 9 }, (_, i) => ({id:`c${i}`, category:'c',status:'active'})),
  ];
  const testCatalog = { categories: ['a','b','c'].map(id => ({id, label:id})), opportunities: entries };
  const all = pool(testCatalog, emptyState());
  assert.deepEqual(availableCategories(testCatalog, all).map(c => c.id), ['a','c']);
  const afterOne = all.filter(entry => entry.id !== 'a0');
  assert.deepEqual(availableCategories(testCatalog, afterOne).map(c => c.id), ['c']);
  // A category already chosen may still be spun through its final 7.
  assert.equal(afterOne.filter(entry => entry.category === 'a').length, 7);
});
test('invalid or tampered persistent state is handled safely',()=>{
  assert.deepEqual(normalizeState(null),emptyState());
  assert.deepEqual(normalizeState({version:88}),emptyState());
  const n=normalizeState({version:1,seen:['one','one','<svg>','two'],history:[{id:'one',at:'2026-10-12'}],includeUnconfirmed:true});
  assert.deepEqual(n.seen,['one','two']);assert.equal(n.history.length,1);assert.equal(n.includeUnconfirmed,true);
});
