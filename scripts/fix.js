import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runAgent } from '../src/agent.js';
import { retrieve } from '../src/retrieval.js';
import { judgeReply } from '../src/judge.js';
import { trivialBaseline, keywordBaseline } from '../src/baselines.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CHECKPOINT = join(ROOT, 'results', 'checkpoint.json');
const RESULTS = join(ROOT, 'results', 'full_results.json');

const GOLDEN = JSON.parse(fs.readFileSync(join(ROOT, 'data', 'golden.json'), 'utf8'));
let done = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, label, maxAttempts = 6) {
  for (let a = 1; a <= maxAttempts; a++) {
    try { return await fn(); }
    catch (e) {
      const msg = String(e?.message || e);
      const is503 = /503|overload|unavailable/i.test(msg);
      const is429 = /429|rate.?limit|quota/i.test(msg);
      const wait = is503 ? 3000 * a : is429 ? Math.min(60000, 2000 * 2 ** (a - 1)) : 1500;
      console.warn(`  [${label}] attempt ${a} failed: ${msg.slice(0, 60)} — waiting ${wait}ms`);
      if (a === maxAttempts) throw e;
      await sleep(wait);
    }
  }
}

const isAgentBad = (d) =>
  !d?.agent || d.agent.escalation_reason === 'agent error' || !d.agent.draft_reply;
const isJudgeBad = (d) => d?.judge?.score == null;

const broken = [];
for (let i = 0; i < GOLDEN.length; i++) {
  const existing = done[i];
  if (!existing || isAgentBad(existing) || isJudgeBad(existing)) broken.push(i);
}

console.log(`Found ${broken.length} broken entries:`, broken.join(', '));
console.log();

for (const i of broken) {
  const t = GOLDEN[i];
  const examples = retrieve(t.text, 3, t.tweet_id);

  let agent;
  try {
    agent = await withRetry(() => runAgent(t, examples), `agent ${i}`);
  } catch (e) {
    console.error(`[${i}] agent permanently failed: ${e.message}`);
    continue;
  }

  let judge = { score: null, reasoning: '' };
  if (agent.draft_reply) {
    try {
      judge = await withRetry(() => judgeReply(t.text, agent.draft_reply), `judge ${i}`, 4);
    } catch (e) {
      console.error(`[${i}] judge permanently failed: ${e.message}`);
    }
  }

  done[i] = {
    tweet_id: t.tweet_id,
    text: t.text,
    gold: { intent: t.intent, should_escalate: t.should_escalate },
    agent,
    trivial: trivialBaseline(t),
    keyword: keywordBaseline(t),
    judge,
    grounded_examples: examples.map((e) => ({
      score: e.score,
      text: e.customer_text.slice(0, 120),
    })),
  };

  fs.writeFileSync(CHECKPOINT, JSON.stringify(done, null, 2));
  fs.writeFileSync(RESULTS, JSON.stringify(done, null, 2));
  console.log(`[${i}] fixed — intent=${agent.intent} judge=${judge.score ?? '-'}`);
}

const remaining = done.filter((d) => !d || isAgentBad(d) || isJudgeBad(d)).length;
console.log(`\nDone. Remaining broken: ${remaining}`);