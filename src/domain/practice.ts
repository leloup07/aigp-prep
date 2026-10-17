import type { Question } from '../types';

/** Group questions that share a scenario so they appear together (the scenario is shown above each). */
export function groupByScenario(qs: Question[]): Question[] {
  const out: Question[] = [];
  const done = new Set<string>();
  for (const q of qs) {
    if (done.has(q.id)) continue;
    const group = q.scenarioId ? qs.filter((x) => x.scenarioId === q.scenarioId).sort((a, b) => a.n - b.n) : [q];
    for (const g of group) { out.push(g); done.add(g.id); }
  }
  return out;
}
