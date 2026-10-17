// Mixed 100-question exam, proportional to the AIGP blueprint scaled to 100.
import { COMPETENCIES, domainOf, type Competency, type Domain, type Question } from '../types';
import { shuffle } from './rng';

export const DOMAIN_TOTALS: Record<Domain, number> = { I: 21, II: 25, III: 27, IV: 27 };

/** BoK v2.1 ranges per competency (min, max). */
export const COMP_RANGES: Record<Competency, [number, number]> = {
  'I.A': [4, 6], 'I.B': [5, 7], 'I.C': [6, 8],
  'II.A': [4, 6], 'II.B': [4, 6], 'II.C': [6, 8], 'II.D': [3, 5],
  'III.A': [6, 8], 'III.B': [6, 8], 'III.C': [8, 10],
  'IV.A': [6, 8], 'IV.B': [5, 7], 'IV.C': [9, 11],
};

/** Largest-remainder apportionment of each domain total by the midpoints of its competencies. */
export function competencyQuotas(totals = DOMAIN_TOTALS): Record<Competency, number> {
  const out = {} as Record<Competency, number>;
  for (const d of Object.keys(totals) as Domain[]) {
    const comps = COMPETENCIES.filter((c) => domainOf(c) === d);
    const mids = comps.map((c) => (COMP_RANGES[c][0] + COMP_RANGES[c][1]) / 2);
    const sum = mids.reduce((a, b) => a + b, 0);
    const exact = mids.map((m) => (m / sum) * totals[d]);
    const base = exact.map(Math.floor);
    let left = totals[d] - base.reduce((a, b) => a + b, 0);
    const order = exact.map((e, i) => ({ i, r: e - base[i] })).sort((a, b) => b.r - a.r || a.i - b.i);
    for (const { i } of order) { if (left-- <= 0) break; base[i]++; }
    comps.forEach((c, i) => (out[c] = base[i]));
  }
  return out;
}

type Item = { ids: string[]; comps: Competency[]; block: boolean };

export function toItems(pool: readonly Question[]): Item[] {
  const blocks = new Map<string, Question[]>();
  const items: Item[] = [];
  for (const q of pool) {
    if (q.scenarioId) {
      if (!blocks.has(q.scenarioId)) blocks.set(q.scenarioId, []);
      blocks.get(q.scenarioId)!.push(q);
    } else items.push({ ids: [q.id], comps: [q.comp], block: false });
  }
  for (const qs of blocks.values()) {
    qs.sort((a, b) => a.n - b.n);
    items.push({ ids: qs.map((q) => q.id), comps: qs.map((q) => q.comp), block: true });
  }
  return items;
}

export interface MixedExam {
  questionIds: string[];
  quotas: Record<Competency, number>;
  actual: Record<Competency, number>;
  notes: string[];
}

export function generateMixed(pool: readonly Question[], rand: () => number, size = 100, half = 50): MixedExam {
  const quotas = competencyQuotas();
  const remaining = { ...quotas };
  const items = shuffle(toItems(pool), rand);
  const chosen: Item[] = [];
  const used = new Set<Item>();
  let count = 0;
  const notes: string[] = [];
  const domRemaining = (d: Domain) => COMPETENCIES.filter((c) => domainOf(c) === d).reduce((a, c) => a + remaining[c], 0);

  const take = (it: Item) => {
    chosen.push(it);
    used.add(it);
    count += it.ids.length;
  };

  // Phase 1: fill quotas; scenario blocks go in whole and any overflow is compensated
  // by lowering the remaining quota of the other competencies of the same domain.
  for (const it of items) {
    if (count + it.ids.length > size) continue;
    if (!it.block) {
      if (remaining[it.comps[0]] > 0) { remaining[it.comps[0]]--; take(it); }
      continue;
    }
    const byDomain = new Map<Domain, number>();
    for (const c of it.comps) byDomain.set(domainOf(c), (byDomain.get(domainOf(c)) ?? 0) + 1);
    const fits = [...byDomain].every(([d, k]) => domRemaining(d) >= k);
    const useful = it.comps.some((c) => remaining[c] > 0);
    if (!fits || !useful) continue;
    for (const c of it.comps) {
      if (remaining[c] > 0) { remaining[c]--; continue; }
      // overflow: compensate in the competency of the same domain with most room
      const other = COMPETENCIES.filter((x) => domainOf(x) === domainOf(c) && remaining[x] > 0)
        .sort((a, b) => remaining[b] - remaining[a])[0];
      remaining[other]--; // `fits` guarantees one exists
    }
    take(it);
  }

  // Phase 2: if the bank cannot cover some quota, fill from the same domain, then any domain.
  const short = COMPETENCIES.filter((c) => remaining[c] > 0);
  for (const c of short) notes.push(`${c}: faltan ${remaining[c]} pregunta(s) en el banco disponible`);
  const fill = (pred: (it: Item) => boolean) => {
    for (const it of items) {
      if (count >= size) return;
      if (used.has(it) || !pred(it) || count + it.ids.length > size) continue;
      take(it);
    }
  };
  if (count < size) {
    for (const c of short) {
      const d = domainOf(c);
      const before = count;
      const need = remaining[c];
      for (const it of items) {
        if (count - before >= need || count >= size) break;
        if (used.has(it) || count + it.ids.length > size) continue;
        if (it.comps.every((x) => domainOf(x) === d)) take(it);
      }
    }
    fill(() => true);
    notes.push('Reparto ajustado: se han completado los huecos con otras competencias, primero del mismo dominio.');
  }

  // Order: shuffle items, keep scenario blocks contiguous and never straddling the half boundary.
  const ordered = shuffle(chosen, rand);
  const first: Item[] = [];
  const second: Item[] = [];
  let n1 = 0;
  for (const it of ordered) {
    if (n1 + it.ids.length <= half) { first.push(it); n1 += it.ids.length; } else second.push(it);
  }
  // if only blocks were left for the first half, pull singles forward
  while (n1 < half) {
    const i = second.findIndex((it) => !it.block);
    if (i < 0) break;
    first.push(...second.splice(i, 1));
    n1++;
  }
  const questionIds = [...first, ...second].flatMap((it) => it.ids);
  const byId = new Map(pool.map((q) => [q.id, q]));
  const actual = Object.fromEntries(COMPETENCIES.map((c) => [c, 0])) as Record<Competency, number>;
  for (const id of questionIds) actual[byId.get(id)!.comp]++;
  if (questionIds.length < size) notes.push(`El banco disponible solo tiene ${questionIds.length} preguntas.`);
  return { questionIds, quotas, actual, notes };
}
