// Simple 3-box Leitner. Box 1 → tomorrow-ish (same day allowed), box 2 → 3 days, box 3 → 7 days.
// A correct answer in box 3 retires the item from the queue.

export interface LeitnerItem {
  id: string; // question id or card id
  kind: 'question' | 'card';
  box: 1 | 2 | 3;
  due: number; // epoch ms
  retired?: boolean;
  reason?: 'fallada' | 'duda';
  updatedAt: number;
}

const DAY = 86_400_000;
export const INTERVAL_DAYS: Record<1 | 2 | 3, number> = { 1: 1, 2: 3, 3: 7 };

export function startOfDay(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Put (or push back) an item into box 1, due today. */
export function enqueue(prev: LeitnerItem | undefined, id: string, kind: LeitnerItem['kind'], now: number, reason?: LeitnerItem['reason']): LeitnerItem {
  return { id, kind, box: 1, due: startOfDay(now), retired: false, reason: reason ?? prev?.reason, updatedAt: now };
}

export function review(item: LeitnerItem, correct: boolean, now: number): LeitnerItem {
  if (!correct) return { ...item, box: 1, due: startOfDay(now) + DAY * INTERVAL_DAYS[1], retired: false, updatedAt: now };
  if (item.box === 3) return { ...item, retired: true, updatedAt: now };
  const box = (item.box + 1) as 2 | 3;
  return { ...item, box, due: startOfDay(now) + DAY * INTERVAL_DAYS[box], updatedAt: now };
}

export const isDue = (i: LeitnerItem, now: number) => !i.retired && i.due <= now;
