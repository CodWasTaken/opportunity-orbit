import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickSummary } from '../src/summary.ts';
test('short source descriptions appear exactly as provided',()=>assert.equal(quickSummary('Funding for eligible nonprofit groups.'),'Funding for eligible nonprofit groups.'));
test('long descriptions use a complete source sentence when possible',()=>assert.equal(quickSummary('This program provides mentorship and tools to founders. It also offers other program benefits in multiple stages.',68),'This program provides mentorship and tools to founders.'));
test('long first sentence is truncated only at a word boundary',()=>{const s=quickSummary('A founder opportunity that supports product development with cloud resources and mentoring for emerging teams across many different countries and sectors, subject to the official criteria.',90);assert(s.length<=90);assert(s.endsWith('…'));assert(!s.endsWith(' …'));});
test('blank content remains blank, without fabricated descriptions',()=>assert.equal(quickSummary(' \n '),''));
