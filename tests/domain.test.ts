import { describe, expect, it } from 'vitest';
import { isCorrect, selectionComplete, toggleLetter } from '../src/domain/grading';
import { competencyQuotas, generateMixed, DOMAIN_TOTALS } from '../src/domain/mixed';
import { mulberry32 } from '../src/domain/rng';
import { groupByScenario } from '../src/domain/practice';
import { enqueue, review } from '../src/domain/leitner';
import { due, endHalf1, navigable, startClock, startHalf2, stopFree, resumeFree, remaining, HALF_MS, PAUSE_MS } from '../src/domain/examClock';
import { COMPETENCIES, domainOf, type Competency, type Letter, type Question } from '../src/types';

const mkQ = (id: string, comp: Competency, extra: Partial<Question> = {}): Question => ({
  id, bank: 'u1', n: +id.replace(/\D/g, '') || 1, stem: 's', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, select: 1,
  answer: ['A'], comp, domain: domainOf(comp), explanation: 'e', hash: 'h', ...extra,
});

describe('grading', () => {
  const single = { answer: ['B'] as Letter[], select: 1 };
  const multi = { answer: ['A', 'C'] as Letter[], select: 2 };
  it('single answer', () => {
    expect(isCorrect(single, ['B'])).toBe(true);
    expect(isCorrect(single, ['A'])).toBe(false);
    expect(isCorrect(single, [])).toBe(false);
    expect(isCorrect(single, undefined)).toBe(false);
  });
  it('multiple answer counts only on exact selection', () => {
    expect(isCorrect(multi, ['C', 'A'])).toBe(true);
    expect(isCorrect(multi, ['A'])).toBe(false);
    expect(isCorrect(multi, ['A', 'B'])).toBe(false);
    expect(isCorrect(multi, ['A', 'B', 'C'])).toBe(false);
    expect(isCorrect(multi, ['A', 'A'])).toBe(false);
  });
  it('cannot mark more than N and requires exactly N to submit', () => {
    expect(toggleLetter(multi, ['A', 'B'], 'C')).toBeNull();
    expect(toggleLetter(multi, ['A'], 'C')).toEqual(['A', 'C']);
    expect(toggleLetter(multi, ['A', 'C'], 'A')).toEqual(['C']);
    expect(toggleLetter(single, ['A'], 'B')).toEqual(['B']);
    expect(selectionComplete(multi, ['A'])).toBe(false);
    expect(selectionComplete(multi, ['A', 'D'])).toBe(true);
  });
});

describe('scenarios in practice', () => {
  it('keeps questions of the same scenario together, in order', () => {
    const qs = [mkQ('q1', 'I.A'), mkQ('q4', 'I.A', { scenarioId: 's' }), mkQ('q2', 'I.A'), mkQ('q3', 'I.A', { scenarioId: 's' })];
    expect(groupByScenario(qs).map((q) => q.id)).toEqual(['q1', 'q3', 'q4', 'q2']);
  });
});

describe('mixed exam distribution', () => {
  it('competency quotas follow the midpoints and add up per domain', () => {
    const q = competencyQuotas();
    expect(q).toEqual({
      'I.A': 6, 'I.B': 7, 'I.C': 8, 'II.A': 6, 'II.B': 6, 'II.C': 8, 'II.D': 5,
      'III.A': 8, 'III.B': 8, 'III.C': 11, 'IV.A': 8, 'IV.B': 7, 'IV.C': 12,
    });
    for (const d of ['I', 'II', 'III', 'IV'] as const)
      expect(COMPETENCIES.filter((c) => domainOf(c) === d).reduce((a, c) => a + q[c], 0)).toBe(DOMAIN_TOTALS[d]);
  });

  // rich synthetic pool: 30 singles per competency + scenario blocks of 4 mixed competencies
  const pool: Question[] = [];
  for (const c of COMPETENCIES) for (let i = 0; i < 30; i++) pool.push(mkQ(`${c}-${i}`, c));
  const blockComps: Competency[][] = [['I.B', 'I.C', 'I.C', 'I.A'], ['III.C', 'III.C', 'III.B', 'IV.C'], ['II.C', 'II.C', 'II.C', 'II.D']];
  blockComps.forEach((cs, b) => cs.forEach((c, k) => pool.push(mkQ(`blk${b}-${k + 1}`, c, { scenarioId: `sc${b}`, n: k + 1 }))));

  for (const seed of [1, 2, 3, 42, 99]) {
    it(`seed ${seed}: 100 questions, exact quotas, whole scenarios never straddling the half`, () => {
      const m = generateMixed(pool, mulberry32(seed));
      expect(m.questionIds).toHaveLength(100);
      expect(new Set(m.questionIds).size).toBe(100);
      const byDomain = { I: 0, II: 0, III: 0, IV: 0 };
      for (const c of COMPETENCIES) byDomain[domainOf(c)] += m.actual[c];
      expect(byDomain).toEqual(DOMAIN_TOTALS);
      for (let b = 0; b < blockComps.length; b++) {
        const idx = m.questionIds.map((id, i) => (id.startsWith(`blk${b}-`) ? i : -1)).filter((i) => i >= 0);
        if (!idx.length) continue;
        expect(idx).toHaveLength(4); // never split
        expect(idx[3] - idx[0]).toBe(3); // contiguous
        expect(idx[0] < 50 && idx[3] >= 50).toBe(false); // does not straddle the half boundary
      }
      // without block overflow, competency quotas are exact; with it, deviations are compensated inside the domain
      const dev = COMPETENCIES.reduce((a, c) => a + Math.abs(m.actual[c] - m.quotas[c]), 0);
      expect(dev).toBeLessThanOrEqual(8);
      expect(m.notes).toEqual([]);
    });
  }

  it('reports adjustments when the bank cannot cover a quota but still fills 100', () => {
    const small = pool.filter((q) => !(q.comp === 'III.C' && !q.scenarioId) || +q.id.split('-')[1] < 3);
    const m = generateMixed(small, mulberry32(7));
    expect(m.questionIds).toHaveLength(100);
    expect(m.notes.join(' ')).toMatch(/III\.C: faltan/);
  });
});

describe('Leitner', () => {
  it('moves up on success, retires after box 3, resets on failure', () => {
    const t = Date.now();
    let it1 = enqueue(undefined, 'x', 'question', t, 'fallada');
    expect(it1.box).toBe(1);
    it1 = review(it1, true, t);
    expect(it1.box).toBe(2);
    it1 = review(it1, true, t);
    expect(it1.box).toBe(3);
    expect(review(it1, false, t).box).toBe(1);
    expect(review(it1, true, t).retired).toBe(true);
  });
});

describe('exam clock (two halves)', () => {
  it('locks half 1, offers a pause that consumes no exam time, then 82.5 min for half 2', () => {
    const t0 = 1_000_000;
    let rt = startClock('halves', t0);
    expect(navigable(rt, 100, 50)).toEqual([0, 49]);
    expect(due(rt, t0 + HALF_MS - 1)).toBe('none');
    expect(due(rt, t0 + HALF_MS)).toBe('endHalf1');
    // submitting half 1 early: leftover time is NOT carried over
    rt = endHalf1(rt, t0 + 10 * 60_000);
    expect(rt.phase).toBe('pause');
    expect(due(rt, t0 + 10 * 60_000 + PAUSE_MS)).toBe('endPause');
    rt = startHalf2(rt, t0 + 12 * 60_000, 50); // pause skipped after 2 min
    expect(remaining(rt, t0 + 12 * 60_000)).toBe(HALF_MS);
    expect(navigable(rt, 100, 50)).toEqual([50, 99]);
    expect(due(rt, t0 + 12 * 60_000 + HALF_MS)).toBe('submit');
  });
  it('free pause just stops the clock', () => {
    let rt = startClock('free', 0);
    rt = stopFree(rt, 60_000);
    expect(remaining(rt, 10_000_000)).toBe(165 * 60_000 - 60_000);
    rt = resumeFree(rt, 10_000_000);
    expect(remaining(rt, 10_000_000)).toBe(165 * 60_000 - 60_000);
    expect(navigable(rt, 100, 50)).toEqual([0, 99]);
  });
});

describe('old Safari compatibility', () => {
  it('RegExp shim neutralises lookbehind but keeps everything else', async () => {
    const { makeRegExpShim } = await import('../src/compat');
    const R = makeRegExpShim(RegExp);
    expect(new R('(?<=^|\\s)x', 'gu').test(' x')).toBe(false);
    expect(new R('(?<name>a)b').exec('ab')?.groups?.name).toBe('a');
    expect(new R('a+', 'g') instanceof RegExp).toBe(true);
    expect(Object.hasOwn({ a: 1 }, 'a')).toBe(true);
  });
});
