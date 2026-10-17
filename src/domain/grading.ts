import type { Letter, Question } from '../types';

/** Exact-set match: a multi-answer question only counts if the selection equals the key. */
export function isCorrect(q: Pick<Question, 'answer'>, selected: readonly Letter[] | undefined): boolean {
  if (!selected || selected.length !== q.answer.length) return false;
  const s = new Set(selected);
  return s.size === q.answer.length && q.answer.every((l) => s.has(l));
}

/** Whether the selection has the number of marks the stem asks for (no hint about correctness). */
export function selectionComplete(q: Pick<Question, 'select'>, selected: readonly Letter[] | undefined): boolean {
  return (selected?.length ?? 0) === q.select;
}

/** Toggle a letter respecting the "Select N" limit. Returns null when the click would exceed N. */
export function toggleLetter(q: Pick<Question, 'select'>, selected: readonly Letter[], l: Letter): Letter[] | null {
  if (q.select === 1) return [l];
  if (selected.includes(l)) return selected.filter((x) => x !== l);
  if (selected.length >= q.select) return null;
  return [...selected, l].sort() as Letter[];
}

export const pct = (ok: number, total: number) => (total ? Math.round((ok / total) * 100) : 0);
