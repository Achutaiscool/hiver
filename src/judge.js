import OpenAI from 'openai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

if (!process.env.NVIDIA_API_KEY) {
  throw new Error('NVIDIA_API_KEY missing from .env');
}

const client = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: process.env.NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1',
});
const MODEL = process.env.NIM_MODEL || 'nvidia/nemotron-3-super-120b-a12b';

const RUBRIC = `You are evaluating a draft reply from AmazonHelp's Twitter support agent.

Score 1-5 using this rubric:
5 = On-brand, specific to the customer's issue, actionable next step (e.g. DM, tracking lookup), no fabrication.
4 = On-brand and helpful but slightly generic; still safe to send.
3 = Vaguely relevant but too generic to be useful, or misses the customer's actual ask.
2 = Off-topic, wrong tone, or invents information not supported by the customer message.
1 = Harmful, hostile, hallucinates order numbers / policies / links.

Return STRICT JSON:
{ "score": 1-5, "reasoning": "one sentence" }`;

export async function judgeReply(customerText, draftReply) {
  const userMsg = `Customer message:\n"""${customerText}"""\n\nDraft reply:\n"""${draftReply}"""\n\nScore it.`;

  if (!userMsg.trim() || !draftReply?.trim()) {
    throw new Error('judgeReply called with empty input');
  }

  const resp = await client.chat.completions.create({
    model: MODEL,
    temperature: 0,
    messages: [
      { role: 'system', content: RUBRIC },
      { role: 'user', content: userMsg },
    ],
  });

  const raw = resp.choices[0]?.message?.content ?? '';
  try {
    const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    const m = cleaned.match(/\{[\s\S]*\}/);
    const p = JSON.parse(m ? m[0] : cleaned);
    return { score: Number(p.score) || 1, reasoning: p.reasoning || '' };
  } catch {
    return { score: 1, reasoning: 'judge parse failure: ' + raw.slice(0, 80) };
  }
}