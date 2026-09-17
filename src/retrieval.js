import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');

// console.log(__dirname)
// console.log(DATA)
export function clean(text) {
  return (text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/@\w+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(text) {
  return new Set(clean(text).split(' ').filter((w) => w.length > 1));
}

function jaccard(a, b) {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

const CORPUS = JSON.parse(fs.readFileSync(join(DATA, 'pairs.json'), 'utf8')).map((r) => ({
  ...r,
  _tokens: tokens(r.customer_text),
}));

export function retrieve(queryText, k = 3, excludeTweetId = null) {
  const q = tokens(queryText);
  const scored = [];
  for (const doc of CORPUS) {
    if (excludeTweetId && doc.tweet_id === excludeTweetId) continue;
    const s = jaccard(q, doc._tokens);
    if (s > 0) scored.push({ ...doc, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map(({ _tokens, ...rest }) => rest);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sample = CORPUS.find((r) => /^[\x20-\x7E\n\r\t]+$/.test(r.customer_text));
  console.log('Corpus size:', CORPUS.length);
  console.log('Query:', sample.customer_text);
  console.log('Top 3:');
  for (const r of retrieve(sample.customer_text, 3, sample.tweet_id)) {
    console.log(`  [${r.score.toFixed(3)}] ${r.customer_text.slice(0, 80)}`);
    console.log(`         → ${r.brand_reply.slice(0, 80)}`);
  }
}