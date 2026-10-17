import raw from './data/content.json';
import type { BankId, Card, Content, Question, Scenario } from './types';

export const content = raw as unknown as Content;
export const DATA_VERSION = content.version;

export const questionById = new Map<string, Question>(content.questions.map((q) => [q.id, q]));
export const scenarioById = new Map<string, Scenario>(content.scenarios.map((s) => [s.id, s]));
export const cardById = new Map<string, Card>(content.cards.map((c) => [c.id, c]));
export const questionsOf = (bank: BankId) => content.questions.filter((q) => q.bank === bank);

export const NOTA_ESCALA =
  'Los resultados de estas pruebas sirven para detectar puntos débiles; IAPP puntúa en una escala de 100 a 500 (aprobado: 300) y no publica una equivalencia con porcentajes.';
export const NOTA_MIXTO =
  'Reparto proporcional al blueprint escalado a 100; el examen oficial incluye además ítems no puntuables cuyo número no se conoce con certeza.';
