import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(process.env.DATA_REPO_PATH || '../data');
const json = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const [taxonomy, scope] = await Promise.all([json('taxonomy/opportunity-taxonomy.json'), json('editorial/scope-decisions.json')]);
const filenames = (await readdir(path.join(root, 'opportunities'))).filter(n => n.endsWith('.json') && !n.startsWith('_')).sort();

function isExcluded(id) {
  return scope.rules.some(rule => {
    const match = rule.match;
    return (match.ids?.includes(id) ?? false) || ((match.idPrefixes?.some(prefix => id.startsWith(prefix)) ?? false) && !(match.excludeIds ?? []).includes(id));
  });
}
function fromV1(x) {
  if (!['active', 'limited', 'waitlist', 'unconfirmed'].includes(x.status) || isExcluded(x.id)) return null;
  return {
    id: x.id, title: x.title, provider: x.provider, category: x.category,
    description: x.description, value: x.value, eligibility: x.eligibility,
    status: x.status, officialUrl: x.officialUrl || x.sourceUrl, reviewDate: x.reviewDate,
  };
}
function fromV2(x) {
  // Only explicitly accepted default-search resources can be displayed.
  if (x.classification?.defaultSearchEligible !== true || x.changeHistory?.tombstone) return null;
  const status = x.availability?.status;
  if (!['open','rolling','upcoming','limited','waitlist','unconfirmed'].includes(status)) return null;
  return {
    id: x.id, title: x.title, provider: x.provider, category: x.classification.primaryCategory,
    description: x.description, value: x.costAndBenefit?.benefitSummary || '',
    eligibility: x.eligibility?.summary || '',
    status: status === 'open' || status === 'rolling' ? 'active' : status === 'upcoming' ? 'waitlist' : status,
    officialUrl: x.urls?.programUrl || x.urls?.providerUrl || x.canonicalUrl,
    reviewDate: x.reviewProvenance?.reviewedAt?.slice(0,10) || null,
  };
}

const acceptedCategories = new Set(taxonomy.categories.map(c=>c.id));
const entries = [];
const ids = new Set();
for (const filename of filenames) {
  const raw = await json(`opportunities/${filename}`);
  const entry = raw.schemaVersion === '2.0' ? fromV2(raw) : fromV1(raw);
  if (!entry) continue;
  if (ids.has(entry.id)) throw new Error(`Duplicate listing: ${entry.id}`);
  if (!acceptedCategories.has(entry.category)) throw new Error(`Unrecognized category: ${entry.category}`);
  if (!/^https:\/\//.test(entry.officialUrl)) throw new Error(`Invalid official URL: ${entry.id}`);
  ids.add(entry.id);
  entries.push(entry);
}
entries.sort((a,b)=>a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
const counts = new Map();for(const entry of entries)counts.set(entry.category,(counts.get(entry.category)||0)+1);
const categories = taxonomy.categories.filter(c=>counts.has(c.id)).map(c=>({id:c.id,label:c.label,description:c.description}));
let sha = 'unknown';
try { sha = execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(); } catch {}
const result={
  schemaVersion:1,
  sourceRepository:'https://github.com/PerkCommons/data',
  sourceCommit:sha,
  generatedAt:new Date().toISOString(),
  categories,opportunities:entries,
};
await mkdir(path.resolve('public'),{recursive:true});
await writeFile(path.resolve('public/catalog.json'), JSON.stringify(result));
console.log(`Built catalog: ${entries.length} opportunities, ${categories.length} categories; ${entries.filter(x=>x.status==='unconfirmed').length} unconfirmed; data SHA ${sha.slice(0,9)}`);
