# AmazonHelp AI Support Agent

Given a customer tweet, the agent classifies intent, drafts a reply
grounded in AmazonHelp's historical responses, and decides whether to
auto-handle or escalate.

Per the assignment, the pipeline runs against committed subsamples:
1000 customer tweets (`data/raw_sample.json`), 1000 customer+brand
pairs (`data/pairs.json`), 251 hand-labeled examples
(`data/golden.json`). Full extraction available via
`scripts/extract_pairs.js` if needed.

## Setup

Requires Node 20+ and an API key (NVIDIA NIM recommended; Groq
supported).

```bash
git clone <repo> && cd Hiver
npm install
cp .env.example .env    # paste key
node index.js           # ~10 min on NIM free tier
```

Headline results are committed in `results/metrics.json` — you don't
need to run anything to see them. Run `node index.js` to reproduce.

## Results (n=251)

| Model | Intent acc | Intent F1 | Escalation acc | Escalation F1 |
|---|---|---|---|---|
| **Agent** | **0.570** | **0.568** | **0.709** | **0.670** |
| Trivial (always `follow_up` + escalate) | 0.311 | 0.047 | 0.406 | 0.578 |
| Keyword rules | 0.327 | 0.404 | 0.610 | 0.183 |

Judge mean (1-5 rubric, n=227): **4.23**.

Agent beats both baselines on every metric. Largest gap is escalation
F1 (0.670 vs. 0.183 for keyword) — keyword rules can't distinguish
"delivery is late" (auto) from "refund for a delivery I never got"
(escalate).

## Problem framing

**What "good" means:** fast, on-brand replies Amazon would plausibly
send; correct routing of sensitive vs. routine; no hallucinated order
numbers, policies, or status claims.

**Deliberately not built:** real order lookup (no system access), live
deployment, thread-aware context, multilingual handling, fine-tuning
(used retrieval + prompting instead).

## Pipeline

Six files in `src/`, orchestrated by `index.js`:

| File | Role |
|---|---|
| `retrieval.js` | Jaccard similarity over 1000 historical pairs |
| `agent.js` | One LLM call: classify + draft + escalate |
| `baselines.js` | Trivial + keyword-rule baselines |
| `judge.js` | LLM-as-judge with 1-5 rubric |
| `evaluate.js` | Accuracy, macro F1, confusion matrix |

Per tweet: retrieve top-3 similar historical tweets → agent → judge →
record gold vs agent vs baselines.

## Failure analysis

24/251 (9.6%) scored ≤3 on the judge. Five modes; full list in
`results/worst_24_full.md`.

**1. Generic deflection (11/24).** Punt to URL or "check your email."
*Hypothesis:* retrieval surfaces Amazon's own generic replies; agent
imitates them.
- `23215`: "How do I complain about delivery drivers?" → "Are you
  having trouble receiving a recent order?"
- `18700`: "Refund my amount" → "Please connect with our support team
  here: [URL]"

**2. Ignores specific ask (6/24).** Acknowledges without answering.
*Hypothesis:* anti-fabrication prompt produces content-free
acknowledgments when grounding lacks facts.
- `22589`: "Give me the timeframe" → "We'll get back to you soon."
- `15694`: "How many times will pickup be rescheduled?" → "Check the
  link."

**3. Wrong/placeholder handle (4/24).** Prompt doesn't tell the model
to extract the customer's real handle.
- `16801`: reply addresses `@119620` (different user in thread)
- `1710`: reply addresses `@123456` (literal placeholder)

**4. Hallucinated status (2/24).** Prompt forbids inventing order
numbers/policies, but not status statements.
- `18913`: "kindly resend" → "It has been sent to your registered
  email address"
- `21530`: "Haven't received refund in 2 months" → "Our team has sent
  you a correspondence"

**5. Tone-deaf on emotion (3/24).** Model imitates calm tone of
grounding examples instead of matching customer state.
- `21542`: "Amazon idiots... third day in a row" → "We're sorry for
  the trouble. Please DM us your order ID."

## What is misleading about my headline number?

**`follow_up` is 31% of golden.** Majority-class accuracy is 31%, so
agent's 57% is only 26 points above baseline, not 57%.

**Escalation accuracy is inflated.** "Always escalate" gets 0.578 F1;
agent gets 0.670. F1 gap is +0.09 — much narrower than the accuracy
gap suggests.

**Judge mean 4.23 is soft.** In a 20-sample human study, exact
agreement was 25% (90% within 1 point). Judge compresses toward 4 —
11 fours vs. my 4, under-scored 5s (7 vs my 11), over-scored 2s (1 vs
my 3). Means match by coincidence, not calibration.

**Small classes are noisy.** `praise` and `account_access` (n=11 each)
swing macro-F1 by ~9% on single misclassifications.

**Non-English tweets can't be retrieved.** `clean()` strips non-ASCII,
so 15 golden tweets labeled `other` get zero grounding.

**Golden labels have noise.** ~10% escalation-call inconsistency; a
few intent labels are debatable (e.g. `9780` labeled `account_access`
is closer to `return_process`).

**Retrieval is lexical.** Jaccard misses paraphrases — "package" vs.
"parcel." Top-3 share keywords, not always meaning.

## What I'd do next

1. Replace Jaccard with sentence embeddings (vectors already exist from
   clustering)
2. Thread-aware context — most tweets are mid-conversation
3. Multilingual handling
4. Inter-judge agreement — second judge to test if the compression
   toward 4 is model-specific
5. Expand golden set to 500+, cap `follow_up` at 20%, add `wrong_item`
   examples (currently 0, excluded from taxonomy)
6. Fix placeholder-handle bug with an explicit extraction instruction

## Decision log

- **AmazonHelp over SpotifyCares.** Spotify tweets were conversational
  fragments; AmazonHelp tweets are transactional.
- **10 intents, not 9.** Hand-defined after reading cluster contents.
- **Dropped `wrong_item`.** Zero golden examples.
- **`follow_up` over-represented on purpose.** 31% of golden reflects
  ~50%+ of raw data.
- **Jaccard, not embeddings.** Simple, pure Node, top-3 similarity of
  0.2-0.3 grounds replies adequately.
- **Top-3, not top-5.** Diminishing returns, smaller prompt.
- **Single agent call for three outputs.** Cheaper and consistent than
  separate calls.
- **Two baselines.** Trivial shows floor; keyword shows simple feature
  engineering.
- **Keyword rules ordered by specificity.** `refund_request` before
  `delivery_issue` — first match wins.
- **Judge rubric penalizes fabrication explicitly.**
- **Two-pass CSV extraction.** Index brand replies → fetch customers
  who got replies.
- **Deterministic sampling for human agreement.** Every 11th
  judge-scored item.
- **Sequential pipeline.** Free-tier rate limits make batching a false
  economy.
- **Committed data files.** `golden.json`, `pairs.json`,
  `raw_sample.json` in-repo so reviewers skip extraction.
- **Subsamples, per assignment.** Full CSV not required.

## Sampling methodology

Sampled 1000 customer tweets from AmazonHelp threads. Embedded via
sentence-transformers, reduced to 50D SVD, K-Means with k=9 (silhouette
0.0755 — weak, treated as scaffold not taxonomy). Hand-labeled 251
tweets via `labeler.html`, stratified by cluster, `follow_up`
over-represented. All labels hand-made; no LLM used.

## Judge-human agreement

| Metric | Value |
|---|---|
| n | 20 |
| Exact agreement | 5/20 (25%) |
| Within-1-point | 18/20 (90%) |
| Mean (judge − human) | +0.05 |

Judge compresses toward 4; agreement on extremes is poor. Full
analysis in `notes/judge_human_agreement.md`. Regenerate with
`node scripts/compute_agreement.js`.

## Repo layout

```
index.js                 # orchestrator
src/                     # pipeline
scripts/                 # extract_pairs.js, compute_agreement.js, clustering
data/                    # golden.json, pairs.json, raw_sample.json
results/                 # metrics.json, full_results.json, worst_24_full.md
notes/                   # long-form analysis
```

## Acknowledgements

- Kaggle: `thoughtvector/customer-support-on-twitter`
- Clustering: `sentence-transformers`, `scikit-learn`
- LLM providers: Groq, NVIDIA NIM
- AI coding assistance used throughout
