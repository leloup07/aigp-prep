import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBank, parseCards, parseKey, parsePlan, parseTest, selectCount } from '../scripts/parse';
import { readSource, runImport } from '../scripts/import';

const TEST = `---
title: "Mini"
---

**Instrucciones.** Texto que no es pregunta.

**1.** Single answer question?

> A. Alpha.
>
> B. Beta
> continued line.
>
> C. Gamma.
>
> D. Delta.

**2.** Which TWO apply? *Select TWO.*

> A. One.
>
> B. Two.
>
> C. Three.
>
> D. Four.
>
> E. Five.

**Escenario (preguntas 3–4).**

*Acme* es una empresa ficticia.

Segundo párrafo del escenario.

**3.** First scenario question?

> A. a
>
> B. b
>
> C. c
>
> D. d

**4.** Second scenario question?

> A. a
>
> B. b
>
> C. c
>
> D. d

**Hoja de respuestas**

| Nº | Resp. | Nº | Resp. |
|----|----|----|----|
| 1 |  | 3 |  |
`;

const KEY = `---
title: "Clave"
---

| Nº | Resp. | Comp. | Nº | Resp. | Comp. |
|----|----|----|----|----|----|
| 1 | B | I.A | 3 | C | II.C (seguros) |
| 2 | A, E | I.B | | | |

Preguntas 4–4 (II.D): 4 **D**.

# Explicaciones

**1 — B.** Because beta.

Second paragraph.

**2 — A y E.** Both.

**3 — C.** Gamma.

**4 — D.** Delta.

# Revisión

| Nº | Clave anterior | Clave nueva | Motivo |
|---|---|---|---|
| 1 | A | B | ignorada |
`;

describe('parser', () => {
  it('parses questions, options, multi-select and scenarios', () => {
    const problems: string[] = [];
    const { questions, scenarios } = parseTest('u1', TEST, problems);
    expect(problems).toEqual([]);
    expect(questions).toHaveLength(4);
    expect(questions[0].options.B).toBe('Beta continued line.');
    expect(questions[1].select).toBe(2);
    expect(Object.keys(questions[1].options)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].text).toContain('Segundo párrafo');
    expect(questions[2].scenarioId).toBe(scenarios[0].id);
    expect(questions[3].scenarioId).toBe(scenarios[0].id);
    expect(questions[0].scenarioId).toBeUndefined();
  });

  it('reads multi-column key tables, inline rows and multi-paragraph explanations; ignores other tables', () => {
    const problems: string[] = [];
    const k = parseKey('u1', KEY, problems);
    expect(problems).toEqual([]);
    expect(k.get(1)).toMatchObject({ tableAnswer: ['B'], headAnswer: ['B'], comp: 'I.A' });
    expect(k.get(1)!.explanation).toContain('Second paragraph');
    expect(k.get(2)).toMatchObject({ tableAnswer: ['A', 'E'], headAnswer: ['A', 'E'] });
    expect(k.get(3)!.comp).toBe('II.C (seguros)');
    expect(k.get(4)).toMatchObject({ tableAnswer: ['D'], comp: 'II.D' });
  });

  it('builds a valid bank with competency, topic and domain', () => {
    const problems: string[] = [];
    const { questions } = buildBank('u1', TEST, KEY, problems, 4);
    expect(problems).toEqual([]);
    expect(questions[2]).toMatchObject({ comp: 'II.C', topic: 'seguros', domain: 'II', answer: ['C'] });
    expect(questions[1].answer).toEqual(['A', 'E']);
  });

  it('detects Select TWO/THREE but not "Select the ONE best answer"', () => {
    expect(selectCount('*(Select THREE.)*')).toBe(3);
    expect(selectCount('*Select TWO.*')).toBe(2);
    expect(selectCount('*Select the ONE best answer.*')).toBe(1);
  });
});

describe('validation failures', () => {
  const run = (test: string, key: string, expected = 4) => {
    const problems: string[] = [];
    buildBank('u1', test, key, problems, expected);
    return problems.join('\n');
  };

  it('wrong count', () => expect(run(TEST, KEY, 25)).toMatch(/se esperaban 25 preguntas y hay 4/));
  it('question without key', () => expect(run(TEST, KEY.replace(/\*\*4 — D\.\*\* Delta\.\n/, '').replace('Preguntas 4–4 (II.D): 4 **D**.', ''))).toMatch(/pregunta 4: no tiene clave/));
  it('key without question', () => expect(run(TEST, KEY + '\n**9 — A.** Huérfana.\n')).toMatch(/clave 9: hay clave pero no hay pregunta/));
  it('table letter differs from explanation header', () => expect(run(TEST, KEY.replace('**3 — C.**', '**3 — B.**'))).toMatch(/pregunta 3: la tabla dice C pero la explicación dice B/));
  it('key cites a missing option', () => expect(run(TEST.replace('> D. Delta.', ''), KEY.replace('| 1 | B |', '| 1 | D |').replace('**1 — B.**', '**1 — D.**'))).toMatch(/pregunta 1: la clave cita la opción D, que no existe/));
  it('Select count differs from key', () => expect(run(TEST.replace(' *Select TWO.*', ''), KEY)).toMatch(/pide 1 respuesta\(s\) pero la clave tiene 2/));
  it('unknown competency', () => expect(run(TEST, KEY.replace('| 1 | B | I.A |', '| 1 | B | V.Z |'))).toMatch(/competencia desconocida "V.Z"/));
});

describe('tablas & plan', () => {
  it('builds cards from pairs and glossary', () => {
    const md = `# 7. Pares de conceptos que el examen confunde\n\n| Par | Diferencia |\n|--|--|\n| Modelo / sistema | X / Y |\n\n# 8. Glosario inglés → español\n\n| Término | Significado |\n|--|--|\n| Deployer | Responsable del despliegue |\n`;
    const problems: string[] = [];
    const cards = parseCards(md, problems);
    expect(problems).toEqual([]);
    expect(cards.map((c) => c.kind)).toEqual(['par', 'glosario']);
    expect(cards[1]).toMatchObject({ front: 'Deployer', back: 'Responsable del despliegue' });
  });
  it('requires 14 plan days', () => {
    const problems: string[] = [];
    parsePlan('# El calendario\n\n| Día | Bloque | h | Qué | Res |\n|--|--|--|--|--|\n| 1 | a | 3 | b | c |\n', problems);
    expect(problems[0]).toMatch(/14 días/);
  });
});

describe('source restrictions', () => {
  it('never opens Practice Exam / AIGP_08 files', () => {
    expect(() => readSource('AIGP_08 Practice Exam.md')).toThrow(/no permitido/);
    expect(() => readSource('AIGP_08.md')).toThrow(/no permitido/);
    expect(() => readSource('otro.md')).toThrow(/no permitido/);
  });
});

const SRC = process.env.AIGP_SRC ?? join(homedir(), 'Documents/IAPP/Revisado_2026-09-25/fuentes_md');
describe.skipIf(!existsSync(SRC))('real sources', () => {
  it('import passes with the expected counts', () => {
    const c = runImport();
    const n = (b: string) => c.questions.filter((q) => q.bank === b).length;
    expect([n('u1'), n('u2'), n('u3'), n('u4'), n('sim1'), n('sim2')]).toEqual([25, 34, 26, 26, 100, 100]);
    expect(c.plan).toHaveLength(14);
    expect(Object.keys(c.compNames)).toHaveLength(13);
  });
});
