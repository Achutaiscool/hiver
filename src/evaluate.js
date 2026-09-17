export function evaluateIntent(gold, pred) {
  const labels = [...new Set(gold.map((g) => g.intent))].sort();
  const matrix = {};
  for (const g of labels) matrix[g] = Object.fromEntries(labels.map((p) => [p, 0]));

  let correct = 0;
  for (let i = 0; i < gold.length; i++) {
    const g = gold[i].intent;
    const p = pred[i].intent;
    if (!matrix[g][p]) matrix[g][p] = 0;
    matrix[g][p]++;
    if (g === p) correct++;
  }

  const perClass = {};
  let macroP = 0, macroR = 0, macroF1 = 0, counted = 0;
  for (const c of labels) {
    const tp = matrix[c][c] || 0;
    const fp = labels.reduce((s, g) => s + (matrix[g][c] || 0), 0) - tp;
    const fn = labels.reduce((s, p) => s + (matrix[c][p] || 0), 0) - tp;
    const prec = tp + fp ? tp / (tp + fp) : 0;
    const rec  = tp + fn ? tp / (tp + fn) : 0;
    const f1   = prec + rec ? (2 * prec * rec) / (prec + rec) : 0;
    perClass[c] = { precision: prec, recall: rec, f1, support: tp + fn };
    macroP += prec; macroR += rec; macroF1 += f1; counted++;
  }
  return {
    accuracy: correct / gold.length,
    macroPrecision: macroP / counted,
    macroRecall: macroR / counted,
    macroF1: macroF1 / counted,
    perClass,
    confusion: matrix,
  };
}

export function evaluateEscalation(gold, pred) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < gold.length; i++) {
    const g = gold[i].should_escalate === true;
    const p = pred[i].should_escalate === true;
    if (g && p) tp++;
    else if (!g && p) fp++;
    else if (!g && !p) tn++;
    else fn++;
  }
  const prec = tp + fp ? tp / (tp + fp) : 0;
  const rec  = tp + fn ? tp / (tp + fn) : 0;
  return {
    accuracy: (tp + tn) / gold.length,
    precision: prec,
    recall: rec,
    f1: prec + rec ? (2 * prec * rec) / (prec + rec) : 0,
    confusion: { tp, fp, tn, fn },
  };
}

export function evaluateJudge(scores) {
  const n = scores.length;
  if (!n) return { mean: 0, distribution: {} };
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const s of scores) { sum += s; distribution[s] = (distribution[s] || 0) + 1; }
  return { mean: sum / n, distribution, n };
}