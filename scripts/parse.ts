// Pure parsing functions for the AIGP source Markdown. No file IO here so they can be unit-tested.
import { createHash } from 'node:crypto';
import {
  COMPETENCIES, domainOf,
  type BankId, type Card, type Competency, type Doc, type Letter, type PlanDay,
  type Question, type Scenario, type Section,
} from '../src/types.ts';

export class ImportError extends Error {
  constructor(public problems: string[]) {
    super(`El importador ha rechazado las fuentes (${problems.length} problema(s)):\n  - ${problems.join('\n  - ')}`);
  }
}

const LETTERS: Letter[] = ['A', 'B', 'C', 'D', 'E'];

export function stripFrontMatter(md: string): { meta: Record<string, string>; body: string } {
  const meta: Record<string, string> = {};
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta, body: md };
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*"?(.*?)"?\s*$/);
    if (kv) meta[kv[1]] = kv[2];
  }
  return { meta, body: md.slice(m[0].length) };
}

export const shortHash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 12);

function slug(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

// ---------------------------------------------------------------- study docs

export function parseDoc(id: string, md: string): Doc {
  const { meta, body } = stripFrontMatter(md);
  const sections: Section[] = [];
  let cur: Section = { id: `${id}-intro`, level: 1, title: 'Introducción', markdown: '' };
  let inFence = false;
  const used = new Set<string>();
  for (const line of body.split('\n')) {
    if (line.startsWith('```')) inFence = !inFence;
    const h = !inFence && line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      if (cur.markdown.trim() || cur.id !== `${id}-intro`) sections.push(cur);
      let sid = `${id}-${slug(h[2])}`;
      for (let k = 2; used.has(sid); k++) sid = `${id}-${slug(h[2])}-${k}`;
      used.add(sid);
      cur = { id: sid, level: h[1].length, title: h[2].replace(/\*/g, ''), markdown: '' };
    } else {
      cur.markdown += line + '\n';
    }
  }
  sections.push(cur);
  for (const s of sections) s.markdown = s.markdown.trim();
  return { id, title: meta.title ?? id, subtitle: meta.subtitle, sections };
}

// ---------------------------------------------------------------- tables

export function parseTableAt(lines: string[], start: number): { rows: string[][]; end: number } | null {
  let i = start;
  while (i < lines.length && !lines[i].trim().startsWith('|')) i++;
  if (i >= lines.length) return null;
  const rows: string[][] = [];
  for (; i < lines.length && lines[i].trim().startsWith('|'); i++) {
    const cells = lines[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue; // separator
    rows.push(cells);
  }
  return { rows, end: i };
}

function allTables(md: string): string[][][] {
  const lines = md.split('\n');
  const out: string[][][] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim().startsWith('|')) {
      const t = parseTableAt(lines, i)!;
      out.push(t.rows);
      i = t.end;
    } else i++;
  }
  return out;
}

// ---------------------------------------------------------------- questions

interface RawQuestion {
  n: number;
  stem: string;
  options: Partial<Record<Letter, string>>;
  select: number;
  scenarioId?: string;
}

const Q_HEAD = /^\*\*(\d+)\.\*\*\s*(.*)$/;
const SC_HEAD = /^\*\*Escenario \(preguntas (\d+)\s*[–—-]\s*(\d+)\)\.\*\*\s*(.*)$/;
const OPT = /^>\s*([A-E])\.\s+(.*)$/;

export function selectCount(stem: string): number {
  const m = stem.match(/Select\s+(TWO|THREE)\b/i);
  return m ? (m[1].toUpperCase() === 'TWO' ? 2 : 3) : 1;
}

export function parseTest(bank: BankId, md: string, problems: string[]) {
  const { body } = stripFrontMatter(md);
  const lines = body.split('\n');
  const questions: RawQuestion[] = [];
  const scenarios: Scenario[] = [];
  let q: RawQuestion | null = null;
  let sc: Scenario | null = null;
  let lastOpt: Letter | null = null;
  let mode: 'none' | 'stem' | 'opts' | 'scenario' = 'none';

  const flush = () => {
    if (q) {
      q.stem = q.stem.trim();
      q.select = selectCount(q.stem);
      questions.push(q);
    }
    q = null;
    lastOpt = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if ((m = line.match(SC_HEAD))) {
      flush();
      sc = { id: `${bank}-sc${m[1]}`, bank, from: +m[1], to: +m[2], text: m[3] ? m[3] + '\n' : '' };
      scenarios.push(sc);
      mode = 'scenario';
      continue;
    }
    if ((m = line.match(Q_HEAD))) {
      flush();
      const n = +m[1];
      const scenario = scenarios.find((s) => n >= s.from && n <= s.to);
      q = { n, stem: m[2] + '\n', options: {}, select: 1, scenarioId: scenario?.id };
      mode = 'stem';
      continue;
    }
    // a heading or the answer sheet ends any open block
    if (/^#{1,6}\s/.test(line) || /^\*\*Hoja de respuestas\*\*/.test(line)) {
      flush();
      mode = 'none';
      continue;
    }
    if (mode === 'scenario' && sc) {
      sc.text += line + '\n';
      continue;
    }
    if (!q) continue;
    if ((m = line.match(OPT))) {
      const L = m[1] as Letter;
      if (q.options[L]) problems.push(`${bank} pregunta ${q.n}: la opción ${L} aparece dos veces`);
      q.options[L] = m[2].trim();
      lastOpt = L;
      mode = 'opts';
      continue;
    }
    if (mode === 'opts') {
      // continuation line of an option ("> more text") – blank ">" lines separate options
      const cont = line.match(/^>\s*(.*)$/);
      if (cont && cont[1].trim() && lastOpt) q.options[lastOpt] += ' ' + cont[1].trim();
      else if (cont && !cont[1].trim()) lastOpt = null;
      continue;
    }
    if (mode === 'stem') q.stem += line + '\n';
  }
  flush();
  for (const s of scenarios) s.text = s.text.trim();
  return { questions, scenarios };
}

// ---------------------------------------------------------------- keys

export interface KeyEntry {
  n: number;
  tableAnswer?: Letter[];
  comp?: string;
  headAnswer?: Letter[];
  explanation?: string;
}

const letters = (s: string): Letter[] => (s.match(/[A-E]/g) ?? []) as Letter[];
const K_HEAD = /^\*\*(\d+)\s*[—–-]\s*([A-E](?:\s*(?:,|y)\s*[A-E])*)\.\*\*\s*(.*)$/;

export function parseKey(bank: BankId, md: string, problems: string[]): Map<number, KeyEntry> {
  const { body } = stripFrontMatter(md);
  const entries = new Map<number, KeyEntry>();
  const get = (n: number) => {
    if (!entries.has(n)) entries.set(n, { n });
    return entries.get(n)!;
  };

  // 1) answer table(s): header "| Nº | Resp. | Comp.|..." possibly repeated in column groups
  let foundTable = false;
  for (const rows of allTables(body)) {
    const head = rows[0];
    if (!head || head[0] !== 'Nº' || !/^Resp/.test(head[1] ?? '')) continue;
    foundTable = true;
    const starts = head.map((c, i) => (c === 'Nº' ? i : -1)).filter((i) => i >= 0);
    for (const row of rows.slice(1)) {
      for (const s of starts) {
        const nCell = row[s];
        if (!nCell || !/^\d+$/.test(nCell)) continue;
        const e = get(+nCell);
        if (e.tableAnswer) problems.push(`${bank} clave: la pregunta ${nCell} aparece dos veces en la tabla`);
        e.tableAnswer = letters(row[s + 1] ?? '');
        e.comp = (row[s + 2] ?? '').trim();
      }
    }
  }
  if (!foundTable) problems.push(`${bank} clave: no se encontró la tabla "| Nº | Resp. | …"`);

  // 1b) supplementary inline rows: "Preguntas 31–34 (II.D): 31 **B** · 32 **B** · …"
  for (const line of body.split('\n')) {
    const m = line.match(/^Preguntas\s+\d+\s*[–—-]\s*\d+\s*\(([IV]+\.[A-D][^)]*)\):\s*(.*)$/);
    if (!m) continue;
    for (const pm of m[2].matchAll(/(\d+)\s*\*\*([A-E](?:\s*(?:,|y)\s*[A-E])*)\*\*/g)) {
      const e = get(+pm[1]);
      if (e.tableAnswer) problems.push(`${bank} clave: la pregunta ${pm[1]} aparece dos veces en la tabla`);
      e.tableAnswer = letters(pm[2]);
      e.comp = m[1].trim();
    }
  }

  // 2) explanations "**N — X.** text" (paragraphs until the next header or heading)
  let cur: KeyEntry | null = null;
  for (const raw of body.split('\n')) {
    const line = raw.trimEnd();
    const m = line.match(K_HEAD);
    if (m) {
      cur = get(+m[1]);
      if (cur.headAnswer) problems.push(`${bank} clave: la explicación de la pregunta ${m[1]} aparece dos veces`);
      cur.headAnswer = letters(m[2]);
      cur.explanation = m[3] + '\n';
      continue;
    }
    if (/^#{1,6}\s/.test(line) || line.trim().startsWith('|')) {
      cur = null;
      continue;
    }
    if (cur) cur.explanation += line + '\n';
  }
  for (const e of entries.values()) if (e.explanation) e.explanation = e.explanation.trim();
  return entries;
}

// ---------------------------------------------------------------- merge + validate

export const EXPECTED_COUNTS: Record<BankId, number> = { u1: 25, u2: 34, u3: 26, u4: 26, sim1: 100, sim2: 100 };

export function buildBank(bank: BankId, testMd: string, keyMd: string, problems: string[], expected = EXPECTED_COUNTS[bank]) {
  const { questions: raw, scenarios } = parseTest(bank, testMd, problems);
  const keys = parseKey(bank, keyMd, problems);
  const out: Question[] = [];
  const P = (n: number, msg: string) => problems.push(`${bank} pregunta ${n}: ${msg}`);

  if (raw.length !== expected)
    problems.push(`${bank}: se esperaban ${expected} preguntas y hay ${raw.length}`);
  const seen = new Set<number>();
  raw.forEach((q, i) => {
    if (seen.has(q.n)) P(q.n, 'número repetido');
    seen.add(q.n);
    if (q.n !== i + 1) P(q.n, `fuera de orden (posición ${i + 1})`);
  });

  for (const q of raw) {
    const k = keys.get(q.n);
    if (!k || (!k.tableAnswer && !k.headAnswer)) { P(q.n, 'no tiene clave'); continue; }
    if (!k.tableAnswer) { P(q.n, 'no aparece en la tabla de la clave'); continue; }
    if (!k.headAnswer || !k.explanation) { P(q.n, 'no tiene explicación "**N — X.**" en la clave'); continue; }
    const t = [...k.tableAnswer].sort().join(',');
    const h = [...k.headAnswer].sort().join(',');
    if (t !== h) P(q.n, `la tabla dice ${t} pero la explicación dice ${h}`);
    if (!k.tableAnswer.length) P(q.n, 'la tabla no tiene letra de respuesta');
    for (const L of k.tableAnswer) if (!q.options[L]) P(q.n, `la clave cita la opción ${L}, que no existe en el test`);
    const present = LETTERS.filter((L) => q.options[L]);
    if (present.length < 4) P(q.n, `solo tiene ${present.length} opciones (${present.join('')})`);
    if (present.join('') !== LETTERS.slice(0, present.length).join('')) P(q.n, `opciones no consecutivas (${present.join('')})`);
    if (q.select !== k.tableAnswer.length)
      P(q.n, `el enunciado pide ${q.select} respuesta(s) pero la clave tiene ${k.tableAnswer.length}`);
    // the Comp. cell may carry a sub-topic: "II.C (seguros)"
    const cm = (k.comp ?? '').match(/^([IV]+\.[A-D])\s*(?:\((.*)\))?\s*$/);
    if (!cm || !(COMPETENCIES as readonly string[]).includes(cm[1])) { P(q.n, `competencia desconocida "${k.comp}"`); continue; }
    if (!q.stem) P(q.n, 'enunciado vacío');
    if (q.scenarioId && !scenarios.find((s) => s.id === q.scenarioId)?.text) P(q.n, 'el escenario está vacío');
    const comp = cm[1] as Competency;
    const topic = cm[2]?.trim() || undefined;
    const base = { stem: q.stem, options: q.options, answer: k.tableAnswer, comp, explanation: k.explanation,
      scenario: scenarios.find((s) => s.id === q.scenarioId)?.text ?? '' };
    out.push({
      id: `${bank}-${q.n}`, bank, n: q.n, stem: q.stem, options: q.options, select: q.select,
      scenarioId: q.scenarioId, answer: [...k.tableAnswer].sort() as Letter[], comp, topic, domain: domainOf(comp),
      explanation: k.explanation, hash: shortHash(JSON.stringify(base)),
    });
  }
  for (const n of keys.keys()) if (!seen.has(n)) problems.push(`${bank} clave ${n}: hay clave pero no hay pregunta`);
  for (const s of scenarios) if (!raw.some((q) => q.scenarioId === s.id))
    problems.push(`${bank}: el escenario ${s.from}–${s.to} no tiene preguntas`);
  return { questions: out, scenarios };
}

// ---------------------------------------------------------------- tablas.md & plan.md

function tableAfterHeading(md: string, re: RegExp): string[][] | null {
  const lines = md.split('\n');
  const i = lines.findIndex((l) => /^#{1,3}\s/.test(l) && re.test(l));
  if (i < 0) return null;
  // stop at the next heading of any level
  let j = i + 1;
  while (j < lines.length && !lines[j].trim().startsWith('|') && !/^#{1,3}\s/.test(lines[j])) j++;
  if (j >= lines.length || /^#{1,3}\s/.test(lines[j])) return null;
  return parseTableAt(lines, j)!.rows;
}

const clean = (s: string) => s.replace(/\\\|/g, '|').trim();

export function parseCards(tablasMd: string, problems: string[]): Card[] {
  const cards: Card[] = [];
  const pairs = tableAfterHeading(tablasMd, /Pares de conceptos/i);
  if (!pairs) problems.push('tablas.md: no se encontró la tabla de "Pares de conceptos"');
  else pairs.slice(1).forEach((r, i) => {
    if (r[0] && r[1]) cards.push({ id: `par-${shortHash(r[0])}`, kind: 'par', front: `¿Qué diferencia hay entre: ${clean(r[0])}?`, back: clean(r[1]) });
    else problems.push(`tablas.md: fila ${i + 1} de "Pares de conceptos" incompleta`);
  });
  const glos = tableAfterHeading(tablasMd, /Glosario/i);
  if (!glos) problems.push('tablas.md: no se encontró la tabla del "Glosario"');
  else glos.slice(1).forEach((r, i) => {
    if (r[0] && r[1]) cards.push({ id: `glo-${shortHash(r[0])}`, kind: 'glosario', front: clean(r[0]), back: clean(r[1]) });
    else problems.push(`tablas.md: fila ${i + 1} del Glosario incompleta`);
  });
  const ids = new Set<string>();
  for (const c of cards) {
    if (ids.has(c.id)) problems.push(`tablas.md: tarjeta duplicada "${c.front}"`);
    ids.add(c.id);
  }
  return cards;
}

export function parsePlan(planMd: string, problems: string[]): PlanDay[] {
  const rows = tableAfterHeading(planMd, /calendario/i);
  if (!rows) { problems.push('plan.md: no se encontró la tabla de "El calendario"'); return []; }
  const days = rows.slice(1).filter((r) => /^\d+$/.test(r[0])).map((r) => ({
    day: +r[0], block: r[1] ?? '', hours: r[2] ?? '', what: r[3] ?? '', expected: r[4] ?? '',
  }));
  if (days.length !== 14) problems.push(`plan.md: se esperaban 14 días y hay ${days.length}`);
  return days;
}
