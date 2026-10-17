import type { Letter } from '../types';
import type { LeitnerItem } from '../domain/leitner';

export interface AnswerRecord {
  selected: Letter[];
  correct?: boolean; // set when graded (immediately in practice, on submit in exams)
  timeMs: number;
  flagged?: boolean; // "marcar para revisión" (exam navigation)
  doubt?: boolean; // "con duda" → review queue
  hash: string; // question hash at the time of answering
}

export type ExamKind = 'sim1' | 'sim2' | 'mixed';

export interface ExamRuntime {
  pauseMode: 'halves' | 'free';
  phase: 'half1' | 'pause' | 'half2' | 'free' | 'done';
  /** absolute deadline of the running clock (ms); undefined while the clock is stopped */
  deadline?: number;
  /** remaining ms of the current period while stopped (free pause) */
  remainingMs: number;
  pauseEndsAt?: number;
  current: number;
  /** epoch when the current question was shown (for time per question) */
  shownAt?: number;
}

export interface Attempt {
  id: string;
  mode: 'practice' | 'exam' | 'review';
  examKind?: ExamKind;
  label: string;
  startedAt: number;
  finishedAt?: number;
  status: 'in_progress' | 'submitted';
  dataVersion: string;
  questionIds: string[];
  answers: Record<string, AnswerRecord>;
  runtime?: ExamRuntime;
  notes?: string[];
}

export interface Settings {
  examDate?: string; // yyyy-mm-dd
  planStart?: string; // yyyy-mm-dd, defaults to examDate − 13
  includeSimsEarly: boolean;
  freePause: boolean;
  theme: 'auto' | 'light' | 'dark';
  fontScale: number;
}

export const DEFAULT_SETTINGS: Settings = { includeSimsEarly: false, freePause: false, theme: 'auto', fontScale: 1 };

export interface OfficialEntry {
  id: string;
  date: string;
  domains: Record<'I' | 'II' | 'III' | 'IV', string>;
  overall: string;
  notes: string;
  createdAt: number;
}

export interface Note {
  sectionId: string;
  text: string;
  updatedAt: number;
}

export interface AppData {
  attempts: Attempt[];
  leitner: Record<string, LeitnerItem>;
  notes: Record<string, Note>;
  bookmarks: string[];
  plan: Record<number, boolean>;
  settings: Settings;
  official: OfficialEntry[];
}

export const EMPTY: AppData = {
  attempts: [], leitner: {}, notes: {}, bookmarks: [], plan: {}, settings: DEFAULT_SETTINGS, official: [],
};
