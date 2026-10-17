import { COMPETENCIES, type Competency, type Question } from '../types';
import type { Attempt } from '../db/model';

export type StatGroup = 'unidad' | 'simulacro' | 'mixto';
export const GROUP_LABEL: Record<StatGroup, string> = { unidad: 'Tests de unidad', simulacro: 'Simulacros', mixto: 'Examen mixto' };

export interface CompStat { ok: number; total: number }
export type CompStats = Record<Competency, CompStat>;

export const emptyStats = (): CompStats =>
  Object.fromEntries(COMPETENCIES.map((c) => [c, { ok: 0, total: 0 }])) as CompStats;

/** Which statistics bucket an answered question belongs to (review sessions are excluded). */
export function groupOf(a: Attempt, q: Question): StatGroup | null {
  if (a.mode === 'review') return null;
  if (a.examKind === 'mixed') return 'mixto';
  return q.bank.startsWith('sim') ? 'simulacro' : 'unidad';
}

export function attemptStats(a: Attempt, byId: Map<string, Question>, group?: StatGroup): CompStats {
  const s = emptyStats();
  for (const [id, rec] of Object.entries(a.answers)) {
    const q = byId.get(id);
    if (!q || rec.correct === undefined) continue;
    if (group && groupOf(a, q) !== group) continue;
    s[q.comp].total++;
    if (rec.correct) s[q.comp].ok++;
  }
  return s;
}

export function mergeStats(list: CompStats[]): CompStats {
  const s = emptyStats();
  for (const x of list) for (const c of COMPETENCIES) { s[c].ok += x[c].ok; s[c].total += x[c].total; }
  return s;
}

export function totals(s: CompStats): CompStat {
  return COMPETENCIES.reduce((a, c) => ({ ok: a.ok + s[c].ok, total: a.total + s[c].total }), { ok: 0, total: 0 });
}

/** A sim counts as "done" once its exam attempt has been submitted. */
export function simsDone(attempts: Attempt[]) {
  const done = (k: 'sim1' | 'sim2') => attempts.some((a) => a.mode === 'exam' && a.examKind === k && a.status === 'submitted');
  return { sim1: done('sim1'), sim2: done('sim2'), both: done('sim1') && done('sim2') };
}
