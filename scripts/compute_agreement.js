import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(
  fs.readFileSync(join(__dirname, '..', 'results', 'human_agreement.json'), 'utf8')
).filter((x) => x.human_score != null);

const n = data.length;
const exact = data.filter((x) => x.human_score === x.judge_score).length;
const within1 = data.filter((x) => Math.abs(x.human_score - x.judge_score) <= 1).length;
const meanDiff = data.reduce((s, x) => s + (x.judge_score - x.human_score), 0) / n;

const judgeDist = {};
const humanDist = {};
for (const x of data) {
  judgeDist[x.judge_score] = (judgeDist[x.judge_score] || 0) + 1;
  humanDist[x.human_score] = (humanDist[x.human_score] || 0) + 1;
}

console.log(`n = ${n}`);
console.log(`exact: ${exact}/${n} = ${(exact / n * 100).toFixed(0)}%`);
console.log(`within-1: ${within1}/${n} = ${(within1 / n * 100).toFixed(0)}%`);
console.log(`mean (judge - human): ${meanDiff.toFixed(2)}`);
console.log('judge dist:', judgeDist);
console.log('human dist:', humanDist);
