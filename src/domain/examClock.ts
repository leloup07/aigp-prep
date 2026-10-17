// Exam clock state machine. Two models:
//  - halves (default): 2 × (50 questions, 82.5 min). Unused time in half 1 is lost. After half 1
//    (submitted or expired) it is locked and an optional 15-min pause is offered; the pause can be
//    skipped and never consumes exam time.
//  - free: one 165-min period; "Pausa" just stops the clock.
import type { ExamRuntime } from '../db/model';

export const MIN = 60_000;
export const FULL_MS = 165 * MIN;
export const HALF_MS = 82.5 * MIN;
export const PAUSE_MS = 15 * MIN;

export function startClock(pauseMode: ExamRuntime['pauseMode'], now: number): ExamRuntime {
  return pauseMode === 'halves'
    ? { pauseMode, phase: 'half1', deadline: now + HALF_MS, remainingMs: HALF_MS, current: 0, shownAt: now }
    : { pauseMode, phase: 'free', deadline: now + FULL_MS, remainingMs: FULL_MS, current: 0, shownAt: now };
}

export function remaining(rt: ExamRuntime, now: number): number {
  if (rt.phase === 'pause') return Math.max(0, (rt.pauseEndsAt ?? now) - now);
  if (rt.deadline === undefined) return rt.remainingMs;
  return Math.max(0, rt.deadline - now);
}

export function endHalf1(rt: ExamRuntime, now: number): ExamRuntime {
  return { ...rt, phase: 'pause', deadline: undefined, remainingMs: 0, pauseEndsAt: now + PAUSE_MS, shownAt: undefined };
}

export function startHalf2(rt: ExamRuntime, now: number, half: number): ExamRuntime {
  return { ...rt, phase: 'half2', deadline: now + HALF_MS, remainingMs: HALF_MS, pauseEndsAt: undefined, current: half, shownAt: now };
}

export function stopFree(rt: ExamRuntime, now: number): ExamRuntime {
  if (rt.phase !== 'free' || rt.deadline === undefined) return rt;
  return { ...rt, remainingMs: Math.max(0, rt.deadline - now), deadline: undefined, shownAt: undefined };
}

export function resumeFree(rt: ExamRuntime, now: number): ExamRuntime {
  if (rt.phase !== 'free' || rt.deadline !== undefined) return rt;
  return { ...rt, deadline: now + rt.remainingMs, shownAt: now };
}

/** What has to happen given the current time: nothing, end of half 1, end of pause, or end of exam. */
export function due(rt: ExamRuntime, now: number): 'none' | 'endHalf1' | 'endPause' | 'submit' {
  if (rt.phase === 'pause') return now >= (rt.pauseEndsAt ?? 0) ? 'endPause' : 'none';
  if (rt.deadline === undefined || now < rt.deadline) return 'none';
  return rt.phase === 'half1' ? 'endHalf1' : rt.phase === 'done' ? 'none' : 'submit';
}

/** Index range a question navigator may visit in the current phase. */
export function navigable(rt: ExamRuntime, total: number, half: number): [number, number] {
  if (rt.phase === 'half1') return [0, Math.min(half, total) - 1];
  if (rt.phase === 'half2') return [Math.min(half, total), total - 1];
  return [0, total - 1];
}

export function fmt(ms: number) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h ? h + ':' : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(ss).padStart(2, '0')}`;
}
