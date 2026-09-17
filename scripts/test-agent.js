import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runAgent } from '../src/agent.js';
import { retrieve } from '../src/retrieval.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(
  fs.readFileSync(join(__dirname, '..', 'data', 'golden.json'), 'utf8')
);

// pick an English delivery-ish tweet to see grounding in action
const t = golden.find((r) => /deliver|package|order/i.test(r.text)) || golden[0];

console.log('INPUT:', t.text);
console.log('GOLD :', { intent: t.intent, should_escalate: t.should_escalate });

const examples = retrieve(t.text, 3, t.tweet_id);
console.log('\nGROUNDING:');
for (const e of examples) {
  console.log(`  [${e.score.toFixed(3)}] ${e.customer_text.slice(0, 70)}`);
  console.log(`         → ${e.brand_reply.slice(0, 70)}`);
}

const out = await runAgent(t, examples);
console.log('\nAGENT:', out);