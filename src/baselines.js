const INTENTS = [
  'refund_request', 'delivery_issue', 'return_process', 'prime_membership',
  'technical_issue', 'account_access', 'follow_up', 'complaint', 'praise', 'other',
];

const CANNED = 'Thanks for reaching out! Please DM us your order details and we will look into this.';

export function trivialBaseline(_tweet) {
  return {
    intent: 'follow_up',
    draft_reply: CANNED,
    should_escalate: true,
    escalation_reason: 'Baseline always escalates',
  };
}

const RULES = [
  { intent: 'refund_request',   re: /\b(refund|money back|reimburse|charge ?back|my money)\b/i },
  { intent: 'wrong_item',       re: /\b(wrong (item|product|order)|not what i ordered|different (item|product))\b/i },
  { intent: 'return_process',   re: /\b(return|send (it |this )?back|return label|returns? process)\b/i },
  { intent: 'account_access',   re: /\b(can'?t (log|sign) ?in|locked out|password reset|account (locked|blocked|suspended))\b/i },
  { intent: 'prime_membership', re: /\b(prime|membership|subscription|renewal)\b/i },
  { intent: 'technical_issue',  re: /\b(echo|alexa|kindle|fire ?tv|app (crash|freez)|won'?t (turn on|charge)|device)\b/i },
  { intent: 'delivery_issue',   re: /\b(deliver|delivery|package|parcel|shipment|tracking|arrive|courier|where is my)\b/i },
  { intent: 'praise',           re: /\b(thank(s| you)|great job|awesome|love (you|amazon)|appreciate)\b/i },
  { intent: 'complaint',        re: /\b(terrible|awful|horrible|worst|angry|furious|disgust|useless|scam)\b/i },
  { intent: 'follow_up',        re: /\b(still (waiting|no)|no (response|reply|update)|again|second time|third time|chased|followed up)\b/i },
];

const ESCALATE_RE = /\b(refund|money back|reimburse|wrong (item|product)|not what i ordered|locked out|can'?t (log|sign) ?in|angry|furious|terrible|awful|horrible|worst|scam|disgust|lawyer|legal|bbb|police)\b/i;

export function keywordBaseline(tweet) {
  const text = tweet.text || '';
  let intent = 'other';
  for (const { intent: name, re } of RULES) {
    if (re.test(text)) { intent = name; break; }
  }
  const escalate = ESCALATE_RE.test(text);
  return {
    intent,
    draft_reply: CANNED,
    should_escalate: escalate,
    escalation_reason: escalate ? 'Keyword match on escalation list' : '',
  };
}