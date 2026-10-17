// Mutations shared by several pages.
import { DATA_VERSION, questionById } from '../content';
import { enqueue, review as leitnerReview, type LeitnerItem } from '../domain/leitner';
import { isCorrect } from '../domain/grading';
import type { Attempt } from './model';
import { getState, setSlice } from './store';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function newAttempt(p: Pick<Attempt, 'mode' | 'label' | 'questionIds'> & Partial<Attempt>): Attempt {
  return { id: uid(), startedAt: Date.now(), status: 'in_progress', dataVersion: DATA_VERSION, answers: {}, ...p };
}

export function saveAttempt(a: Attempt) {
  setSlice('attempts', (list) => {
    const i = list.findIndex((x) => x.id === a.id);
    if (i < 0) return [...list, a];
    const copy = [...list];
    copy[i] = a;
    return copy;
  });
}

export function deleteAttempt(id: string) {
  setSlice('attempts', (list) => list.filter((a) => a.id !== id));
}

/** Feed graded answers into the error queue: wrong or "con duda" → box 1. */
export function queueFromAttempt(a: Attempt) {
  const now = Date.now();
  setSlice('leitner', (prev) => {
    const next = { ...prev };
    for (const [id, rec] of Object.entries(a.answers)) {
      if (rec.correct === false) next[id] = enqueue(prev[id], id, 'question', now, 'fallada');
      else if (rec.doubt) next[id] = enqueue(prev[id], id, 'question', now, 'duda');
    }
    return next;
  });
}

export function queueOne(id: string, reason: 'fallada' | 'duda') {
  const now = Date.now();
  setSlice('leitner', (prev) => ({ ...prev, [id]: enqueue(prev[id], id, 'question', now, reason) }));
}

export function leitnerAnswer(id: string, kind: LeitnerItem['kind'], correct: boolean) {
  const now = Date.now();
  setSlice('leitner', (prev) => {
    const cur = prev[id] ?? enqueue(undefined, id, kind, now);
    return { ...prev, [id]: leitnerReview(cur, correct, now) };
  });
}

/** Grade every answered question of an exam attempt (on submit). */
export function gradeAll(a: Attempt): Attempt {
  const answers = { ...a.answers };
  for (const id of a.questionIds) {
    const q = questionById.get(id);
    const rec = answers[id] ?? { selected: [], timeMs: 0, hash: q?.hash ?? '' };
    answers[id] = { ...rec, correct: q ? isCorrect(q, rec.selected) : false };
  }
  return { ...a, answers };
}

export const attemptIsOld = (a: Attempt) => a.dataVersion !== DATA_VERSION;
export const getAttempt = (id: string) => getState().attempts.find((a) => a.id === id);
