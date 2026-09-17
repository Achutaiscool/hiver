import OpenAI from 'openai'
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

if (!process.env.GROQ_API_KEY) {
  throw new Error('GROQ_API_KEY not loaded. Run `cat -A .env` from ~/Hiver to inspect.');
}

const client = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: process.env.NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1',
});
const MODEL = process.env.NIM_MODEL || 'nvidia/nemotron-3-super-120b-a12b';
const BRAND = process.env.BRAND_NAME || 'AmazonHelp';

export const INTENTS = [
  'refund_request',
  'delivery_issue',
  'return_process',
  'wrong_item',
  'prime_membership',
  'technical_issue',
  'account_access',
  'follow_up',
  'complaint',
  'praise',
  'other',
];

const SYSTEM = `You are the AI support agent for ${BRAND} on Twitter/X.

For each incoming customer message, output STRICT JSON with exactly these fields:
{
  "intent": one of [${INTENTS.join(', ')}],
  "draft_reply": a public reply in ${BRAND}'s voice (1-3 sentences, mentions the customer with @, no emojis unless apologizing),
  "should_escalate": true | false,
  "escalation_reason": one short sentence ("" if not escalating)
}

INTENT DEFINITIONS:
- refund_request: wants money back
- delivery_issue: package late, missing, not arrived
- return_process: asking how to return
- wrong_item: received wrong product
- prime_membership: Prime / subscription issues
- technical_issue: device, app, Echo problems
- account_access: can't sign in, locked out
- follow_up: "I already replied", "no response", chasing a prior ticket
- complaint: anger, no specific ask
- praise: thanks, positive
- other: fragments, non-English, unclear

ESCALATION RULES:
- ESCALATE (true): refund requests, wrong items, account access blocks, anger/swearing, multi-issue messages, follow-ups chased 2+ times, any mention of money lost.
- DO NOT ESCALATE (false): delivery status checks, how-to questions, praise, simple feature questions, fragments.

GROUNDING: You will be shown similar past customer messages and how ${BRAND} actually replied. Match that tone and level of specificity. NEVER invent order numbers, tracking links, or policy details that aren't in the grounding.

Return ONLY the JSON object. No prose. No markdown.`;

function buildUserMessage(tweet, examples) {
  const lines = [`Customer message:\n"""${tweet.text}"""`];
  if (examples && examples.length) {
    lines.push(`\nSimilar past messages and how ${BRAND} replied:`);
    examples.forEach((ex, i) => {
      lines.push(`\n[${i + 1}] Customer: ${ex.text}`);
      lines.push(`    ${BRAND}: ${ex.brand_reply ?? '(no reply captured)'}`);
      lines.push(`\n[${i + 1}] Customer: ${ex.customer_text}`);
    });
  }
  lines.push('\nReturn the JSON object now.');
  return lines.join('\n');
}

function safeParse(raw) {
  const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Agent returned non-JSON: ' + raw.slice(0, 200));
  }
}

export async function runAgent(tweet, examples = []) {
  const resp = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: buildUserMessage(tweet, examples) },
    ],
  });

  const raw = resp.choices[0]?.message?.content ?? '';
  const parsed = safeParse(raw);

  if (!INTENTS.includes(parsed.intent)) parsed.intent = 'other';
  parsed.should_escalate = Boolean(parsed.should_escalate);
  parsed.escalation_reason = parsed.escalation_reason || '';
  parsed.draft_reply = (parsed.draft_reply || '').trim();

  return parsed;
}
