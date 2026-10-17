export type Letter = 'A' | 'B' | 'C' | 'D' | 'E';
export type Domain = 'I' | 'II' | 'III' | 'IV';
export type BankId = 'u1' | 'u2' | 'u3' | 'u4' | 'sim1' | 'sim2';

export const COMPETENCIES = [
  'I.A', 'I.B', 'I.C',
  'II.A', 'II.B', 'II.C', 'II.D',
  'III.A', 'III.B', 'III.C',
  'IV.A', 'IV.B', 'IV.C',
] as const;
export type Competency = (typeof COMPETENCIES)[number];

export const BANKS: { id: BankId; label: string; group: 'unidad' | 'simulacro' }[] = [
  { id: 'u1', label: 'Test Unidad I', group: 'unidad' },
  { id: 'u2', label: 'Test Unidad II', group: 'unidad' },
  { id: 'u3', label: 'Test Unidad III', group: 'unidad' },
  { id: 'u4', label: 'Test Unidad IV', group: 'unidad' },
  { id: 'sim1', label: 'Simulacro 1', group: 'simulacro' },
  { id: 'sim2', label: 'Simulacro 2', group: 'simulacro' },
];

export interface Question {
  id: string; // `${bank}-${n}`
  bank: BankId;
  n: number;
  stem: string;
  options: Partial<Record<Letter, string>>;
  /** number of answers the stem asks for (Select TWO/THREE), 1 otherwise */
  select: number;
  scenarioId?: string;
  answer: Letter[];
  comp: Competency;
  /** optional sub-topic from the key table, e.g. "seguros" */
  topic?: string;
  domain: Domain;
  explanation: string;
  /** short hash of the question content, to detect edits between imports */
  hash: string;
}

export interface Scenario {
  id: string;
  bank: BankId;
  from: number;
  to: number;
  text: string;
}

export interface Section {
  id: string;
  level: number;
  title: string;
  markdown: string;
}

export interface Doc {
  id: string; // U1..U4, tablas, plan
  title: string;
  subtitle?: string;
  sections: Section[];
}

export interface Card {
  id: string;
  kind: 'glosario' | 'par';
  front: string;
  back: string;
}

export interface PlanDay {
  day: number;
  block: string;
  hours: string;
  what: string;
  expected: string;
}

export interface Content {
  version: string;
  generatedAt: string;
  docs: Doc[];
  questions: Question[];
  scenarios: Scenario[];
  cards: Card[];
  plan: PlanDay[];
  /** competency titles taken from the "# Competencia X — …" headings of the units */
  compNames: Record<string, string>;
}

export function domainOf(c: Competency): Domain {
  return c.split('.')[0] as Domain;
}
