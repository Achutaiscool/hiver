import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runAgent } from './src/agent.js';
import { retrieve } from './src/retrieval.js';
import { trivialBaseline, keywordBaseline } from './src/baselines.js';
import { judgeReply } from './src/judge.js';
import { evaluateIntent, evaluateEscalation, evaluateJudge } from './src/evaluate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, 'data');
const RESULTS = join(__dirname, 'results');
fs.mkdirSync(RESULTS, { recursive: true });

const CHECKPOINT = join(RESULTS, 'checkpoint.json');
const GOLDEN = JSON.parse(fs.readFileSync(join(DATA, 'golden.json'), 'utf8'));

// --- resume support ---
let done = [];
if (fs.existsSync(CHECKPOINT)) {
  done = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
  console.log(`Resuming — ${done.length}/${GOLDEN.length} items already processed.`);
}

const skipJudge = process.argv.includes('--skip-judge');

for (let i = done.length; i < GOLDEN.length; i++) {
  const t = GOLDEN[i];
  const examples = retrieve(t.text, 3, t.tweet_id);

  let agent;
  try {
    agent = await runAgent(t, examples);
  } catch (e) {
    console.error(`[${i}] agent failed:`, e.message);
    agent = { intent: 'other', draft_reply: '', should_escalate: false, escalation_reason: 'agent error' };
  }

  let judge = { score: null, reasoning: '' };
  if (!skipJudge && agent.draft_reply) {
    try {
      judge = await judgeReply(t.text, agent.draft_reply);
    } catch (e) {
      console.error(`[${i}] judge failed:`, e.message);
    }
  }

  done.push({
    tweet_id: t.tweet_id,
    text: t.text,
    gold: { intent: t.intent, should_escalate: t.should_escalate },
    agent,
    trivial: trivialBaseline(t),
    keyword: keywordBaseline(t),
    judge,
    grounded_examples: examples.map((e) => ({ score: e.score, text: e.customer_text.slice(0, 120) })),
  });

  process.stdout.write(`\r[${i + 1}/${GOLDEN.length}] intent=${agent.intent} esc=${agent.should_escalate} judge=${judge.score ?? '-'}    `);

  if ((i + 1) % 20 === 0) {
    fs.writeFileSync(CHECKPOINT, JSON.stringify(done, null, 2));
  }
}
console.log();

fs.writeFileSync(CHECKPOINT, JSON.stringify(done, null, 2));
fs.writeFileSync(join(RESULTS, 'full_results.json'), JSON.stringify(done, null, 2));

// --- metrics ---
const goldIntents = done.map((d) => ({ intent: d.gold.intent }));
const goldEsc = done.map((d) => ({ should_escalate: d.gold.should_escalate }));

const metrics = {
  n: done.length,
  intent: {
    agent: evaluateIntent(goldIntents, done.map((d) => ({ intent: d.agent.intent }))),
    trivial: evaluateIntent(goldIntents, done.map((d) => ({ intent: d.trivial.intent }))),
    keyword: evaluateIntent(goldIntents, done.map((d) => ({ intent: d.keyword.intent }))),
  },
  escalation: {
    agent: evaluateEscalation(goldEsc, done.map((d) => ({ should_escalate: d.agent.should_escalate }))),
    trivial: evaluateEscalation(goldEsc, done.map((d) => ({ should_escalate: d.trivial.should_escalate }))),
    keyword: evaluateEscalation(goldEsc, done.map((d) => ({ should_escalate: d.keyword.should_escalate }))),
  },
  judge: evaluateJudge(done.map((d) => d.judge.score).filter((s) => s != null)),
};

fs.writeFileSync(join(RESULTS, 'metrics.json'), JSON.stringify(metrics, null, 2));

console.log('\n=== HEADLINE ===');
for (const k of ['agent', 'trivial', 'keyword']) {
  console.log(`${k.padEnd(8)} intent_acc=${metrics.intent[k].accuracy.toFixed(3)} intent_F1=${metrics.intent[k].macroF1.toFixed(3)} esc_acc=${metrics.escalation[k].accuracy.toFixed(3)} esc_F1=${metrics.escalation[k].f1.toFixed(3)}`);
}
console.log(`judge mean=${metrics.judge.mean.toFixed(2)} (n=${metrics.judge.n})`);