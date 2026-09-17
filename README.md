# AmazonHelp AI Support Agent

An AI customer-support agent for AmazonHelp's Twitter channel. Given a
customer tweet, it:

1. Classifies the message into one of 10 intents
2. Drafts a reply grounded in how AmazonHelp historically resolved
   similar issues
3. Decides whether to auto-handle or escalate to a human, with a reason

Built for the Hiver SDE Intern take-home.

## Setup

Prerequisites: Node 20+, an API key for Groq or NVIDIA NIM.

```bash
git clone <repo>
cd Hiver
npm install
cp .env.example .env
# add API key(s) to .env
node index.js
```

Headline results reproduce in ~10-15 min depending on provider rate
limits. `data/golden.json` (251 hand-labeled tweets) and
`data/pairs.json` (1000 customer+brand reply pairs) are committed, so
no Kaggle extraction step is needed. To rebuild `pairs.json` from raw
data: `node scripts/extract_pairs.js`.

Outputs:
- `results/full_results.json` — per-tweet gold vs agent vs baselines
  vs judge
- `results/metrics.json` — headline metrics

## Problem framing

**What "good" means for AmazonHelp:**
- Fast, on-brand replies that Amazon would plausibly send
- Correct routing: routine queries auto-handled, sensitive issues
  escalated
- No hallucinated order numbers, policies, or status claims
- Cheap enough to run on every inbound tweet

**What I deliberately did not build:**
- Real order lookup — no access to Amazon's systems
- Live deployment — evaluated offline against a golden set
- Thread-aware context — treats each tweet in isolation
- Multilingual handling — non-English tweets are labeled `other`
- Fine-tuning — used retrieval + prompting instead

## What I built

Six-file pipeline in `src/` plus an orchestrator:

| File | Role |
|---|---|
| `retrieval.js` | Jaccard similarity over 1000 historical tweet pairs |
| `agent.js` | LLM prompt: classify + draft + escalate in one call |
| `baselines.js` | Trivial + keyword-rule baselines |
| `judge.js` | LLM-as-judge with a 1-5 rubric |
| `evaluate.js` | Accuracy, macro F1, confusion matrix |
| `index.js` | Orchestrator: run, evaluate, write results |

Per tweet, `index.js` retrieves top-3 similar historical tweets, feeds
them plus the new tweet to the agent, judges the draft reply, and
records gold vs agent vs both baselines.

## Results (n=251)

| Model | Intent acc | Intent macro-F1 | Escalation acc | Escalation F1 |
|---|---|---|---|---|
| **Agent** | **0.570** | **0.568** | **0.709** | **0.670** |
| Trivial (always `follow_up` + escalate) | 0.311 | 0.047 | 0.406 | 0.578 |
| Keyword rules | 0.327 | 0.404 | 0.610 | 0.183 |

Agent beats both baselines on every metric. Judge mean (1-5 rubric,
n=227): **4.23**.

The agent's biggest gap over the keyword baseline is escalation F1
(0.670 vs 0.183) — the keyword rules can't distinguish "delivery is
late" (auto) from "refund for a delivery I never got" (escalate), so
they collapse to a shallow signal.

## Failure analysis

From 251 evaluated tweets, 24 scored ≤3 on the judge (9.6%). They
cluster into 5 modes; full list in `results/worst_24_full.md`.

**1. Generic deflection (11/24).** Agent punts to a URL or "check your
email."
- `23215`: "How do I complain about delivery drivers?" → "Are you
  having trouble receiving a recent order?"
- `18700`: "Refund my amount" → "Please connect with our support team
  here: [URL]"

*Hypothesis:* retrieval surfaces Amazon's own generic replies, and the
agent imitates them. The problem is partly the data.

**2. Ignores specific ask (6/24).** Customer asks a question; agent
acknowledges without answering.
- `22589`: "Give me the timeframe" → "We'll get back to you soon."
- `15694`: "How many times will pickup be rescheduled?" → "Check the
  link."

*Hypothesis:* the anti-fabrication prompt says "don't invent details."
Without a factual answer in grounding, the agent produces a
content-free acknowledgment instead of saying "I don't know."

**3. Wrong/placeholder handle (4/24).**
- `16801`: reply addresses `@119620` — a different user in the thread
- `1710`: reply addresses `@123456` — literal placeholder

*Hypothesis:* the prompt doesn't tell the model to extract the
customer's actual @-handle. It defaults to "use some at-mention."

**4. Hallucinated status (2/24).**
- `18913`: "kindly resend" → "It has been sent to your registered email
  address"
- `21530`: "Haven't received refund in 2 months" → "Our team has sent
  you a correspondence"

*Hypothesis:* the prompt forbids inventing order numbers, tracking
links, or policies — but not status statements. The model fills the
gap.

**5. Tone-deaf on emotion (3/24).**
- `21542`: "Amazon idiots... third day in a row" → "We're sorry for
  the trouble. Please DM us your order ID."

*Hypothesis:* the model imitates the calm tone of the grounding
examples rather than matching the customer's state.

## What is misleading about my headline number?

Several things.

**1. `follow_up` is 31% of the golden set.** Predicting `follow_up`
alone gets ~31% accuracy, so the agent's 57% is only 26 points above
the majority class — not the 57% a fresh reader sees.

**2. Escalation accuracy is inflated by the trivial baseline.**
"Always escalate" gets 0.406 acc / 0.578 F1. The agent gets 0.709 acc
/ 0.670 F1. The F1 gap is only +0.09 — the accuracy gap is larger
because accuracy rewards the agent for correctly declining escalation.
F1 is the honest number for a skewed binary, and it's much narrower
than the accuracy headline suggests.

**3. The judge mean of 4.23 is a soft number.** In a 20-sample human
agreement study, the judge and I agreed exactly 25% of the time (90%
within 1 point). The judge compresses scores toward 4 — it gave 4
eleven times vs. my four, under-scored 5s (7 vs my 11), and over-scored
2s (1 vs my 3). The means match (+0.05 diff) by coincidence, not
calibration. Read 4.23 as "mostly 4s, some 5s, occasionally lower,"
not as a precise score.

**4. Small classes make per-class F1 noisy.** `praise` (n=11) and
`account_access` (n=11) dominate macro-F1 swings. A single
misclassification moves those classes by ~9%.

**5. Non-English tweets can't be retrieved.** `clean()` strips
non-ASCII, so a Japanese or Spanish tweet becomes an empty token set
and gets no grounding. 15 non-English tweets in the golden set, all
labeled `other`. The agent has effectively never seen them.

**6. Golden labels have noise.** ~10% inconsistency in escalation
calls; a handful of intent labels are debatable (e.g. `9780` labeled
`account_access` is closer to `return_process`).

**7. Retrieval is lexical, not semantic.** Jaccard misses paraphrases.
"Package" vs "parcel," "late" vs "delayed." Retrieved neighbors share
keywords, not always meaning.

## What I'd do next (one more week)

1. **Replace Jaccard with sentence embeddings.** Same model used during
   clustering — the vectors already exist for `raw_sample.json`.
   Semantic retrieval would fix paraphrase misses.
2. **Thread-aware context.** Most tweets are mid-conversation. Feeding
   the whole thread to the agent would prevent "I already replied"
   replies.
3. **Multilingual handling.** Translate or use a multilingual encoder.
   Currently non-English tweets are dead ends.
4. **Inter-judge agreement.** Run a second judge model on the same
   outputs, compare. Would answer whether the current judge's
   compression toward 4 is model-specific.
5. **Expand and rebalance the golden set.** Target 500+ examples, cap
   `follow_up` at 20%, add examples for `wrong_item` (currently 0, so
   it's excluded from the taxonomy).
6. **Fix the placeholder handle bug.** Add an explicit instruction to
   extract the customer's @-handle from the tweet.

## Decision log

- **Picked AmazonHelp over SpotifyCares.** Spotify tweets were
  conversational fragments with no standalone intent; AmazonHelp
  tweets are transactional.
- **10 intents, not 9.** Started from 9 clusters; defined intents by
  hand after reading cluster contents. Added `praise` and `other`
  beyond cluster boundaries.
- **Dropped `wrong_item` from taxonomy.** Zero golden examples.
- **251 golden labels, not 250.** Went for full coverage over strict
  adherence to the 150-250 target.
- **`follow_up` over-represented on purpose.** It dominates real data
  — 31% of golden vs. ~50%+ of raw tweets. Sampled down but not
  eliminated.
- **Retrieval via Jaccard, not embeddings.** Simple, pipeline stays
  pure Node, top-3 similarity of ~0.2-0.3 was enough to ground
  replies.
- **Top-3 retrieval, not top-5.** Diminishing returns on context,
  smaller prompt.
- **Single agent call, three outputs.** Classify + draft + escalate in
  one JSON-mode call. Cheaper and consistent — three calls would
  drift.
- **Two baselines, not one.** Trivial (always same) shows the floor;
  keyword rules show what simple feature engineering gets you.
- **Keyword rules ordered by specificity.** First match wins —
  `refund_request` before `delivery_issue` so "refund for a late
  package" classifies as refund.
- **Judge rubric explicitly penalizes fabrication.** Hallucinated
  order numbers would otherwise score high on tone.
- **Two-pass CSV extraction.** First pass indexes Amazon's replies by
  the tweet they respond to; second fetches only the customers who got
  replies.
- **Deterministic sampling for human agreement.** Every 11th
  judge-scored item, not random — reproducible from
  `human_agreement.json`.
- **Sequential pipeline, no parallelism.** Free-tier rate limits make
  batching a false economy; retries with backoff are simpler.
- **Committed all data files.** `golden.json`, `pairs.json`,
  `raw_sample.json` in-repo so reviewers skip extraction.

## Sampling methodology (golden set)

Sampled 1000 customer tweets from AmazonHelp threads via `extract.js`.
Embedded them (sentence-transformers), reduced to 50D via SVD, clustered
with K-Means (k picked by silhouette, k=9). Silhouette was weak
(0.0755) — the clusters were a *scaffold*, not a taxonomy.

Hand-labeled 251 tweets from the clusters using a custom web labeler
(`labeler.html`). Sampling was stratified by cluster to cover the intent
space, with `follow_up` over-represented because it dominates the raw
data. All labels are my own; no LLM was used for labeling.

## Judge-human agreement

Full analysis in `notes/judge_human_agreement.md`. Summary:

| Metric | Value |
|---|---|
| n | 20 |
| Exact agreement | 5/20 (25%) |
| Within-1-point agreement | 18/20 (90%) |
| Mean (judge − human) | +0.05 |

The judge compresses scores toward 4. Agreement on the extremes of the
rubric is poor. Regenerate numbers with
`node scripts/compute_agreement.js`.

## Repo layout

```
.
├── index.js                    # orchestrator — run this
├── src/                        # pipeline modules
├── scripts/
│   ├── extract_pairs.js       # rebuild pairs.json from twcs.csv
│   ├── compute_agreement.js   # regenerate judge-human numbers
│   ├── cluster_intents.py     # one-time clustering (Python)
│   └── ...
├── data/
│   ├── golden.json            # 251 hand-labeled tweets
│   ├── pairs.json             # 1000 customer + brand reply pairs
│   ├── raw_sample.json        # 1000 customer tweets (for clustering)
│   └── cluster_visualization.png
├── results/
│   ├── full_results.json      # every tweet × every model
│   ├── metrics.json           # headline table
│   ├── human_agreement.json   # 20-sample judge-human study
│   └── worst_24_full.md       # raw failure dump
└── notes/                     # long-form analysis
```

## Acknowledgements

- Kaggle dataset: `thoughtvector/customer-support-on-twitter`
- Clustering: `sentence-transformers`, `scikit-learn` (Python, one-time)
- LLM provider: Groq, then NVIDIA NIM (rate limits)
- AI coding assistance used throughout
