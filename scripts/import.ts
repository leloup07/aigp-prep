// Converts the AIGP source Markdown into src/data/content.json. Fails loudly on any inconsistency.
// Usage: npm run import   (source dir overridable with AIGP_SRC=/path/to/fuentes_md)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { BANKS, COMPETENCIES, type Content } from '../src/types.ts';
import { ImportError, buildBank, parseCards, parseDoc, parsePlan, shortHash } from './parse.ts';

const SRC = process.env.AIGP_SRC ?? join(homedir(), 'Documents/IAPP/Revisado_2026-09-25/fuentes_md');
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/content.json');

// Only these files are ever opened. The official Practice Exam must never be read.
const ALLOWED = [
  'U1.md', 'U2.md', 'U3.md', 'U4.md', 'tablas.md', 'plan.md',
  ...BANKS.flatMap((b) => [`${b.id}_test.md`, `${b.id}_key.md`]),
];
const FORBIDDEN = /practice exam|aigp_08/i;

export function readSource(name: string): string {
  if (!ALLOWED.includes(name) || FORBIDDEN.test(name)) throw new Error(`Archivo no permitido: ${name}`);
  const p = join(SRC, name);
  if (FORBIDDEN.test(p) || FORBIDDEN.test(basename(p))) throw new Error(`Ruta no permitida: ${p}`);
  return readFileSync(p, 'utf8');
}

const QuestionSchema = z.object({
  id: z.string(), bank: z.enum(['u1', 'u2', 'u3', 'u4', 'sim1', 'sim2']), n: z.number().int().positive(),
  stem: z.string().min(1), options: z.record(z.string().min(1)), select: z.number().int().min(1).max(3),
  scenarioId: z.string().optional(), answer: z.array(z.enum(['A', 'B', 'C', 'D', 'E'])).min(1),
  comp: z.enum(COMPETENCIES), topic: z.string().optional(), domain: z.enum(['I', 'II', 'III', 'IV']), explanation: z.string().min(1), hash: z.string(),
});

export function runImport(): Content {
  const problems: string[] = [];
  const docs = (['U1', 'U2', 'U3', 'U4', 'tablas', 'plan'] as const).map((id) => parseDoc(id, readSource(`${id}.md`)));
  const questions = [];
  const scenarios = [];
  for (const b of BANKS) {
    const r = buildBank(b.id, readSource(`${b.id}_test.md`), readSource(`${b.id}_key.md`), problems);
    questions.push(...r.questions);
    scenarios.push(...r.scenarios);
  }
  const cards = parseCards(readSource('tablas.md'), problems);
  const plan = parsePlan(readSource('plan.md'), problems);
  for (const q of questions) {
    const r = QuestionSchema.safeParse(q);
    if (!r.success) problems.push(`${q.id}: esquema inválido – ${r.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`);
  }
  const compNames: Record<string, string> = {};
  for (const d of docs) for (const sec of d.sections) {
    const m = sec.title.match(/^Competencia\s+([IV]+\.[A-D])\s*[—–-]\s*(.+)$/);
    if (m) compNames[m[1]] = m[2].trim();
  }
  for (const c of COMPETENCIES) if (!compNames[c]) problems.push(`Unidades: no se encontró el encabezado "# Competencia ${c} — …"`);
  if (problems.length) throw new ImportError(problems);
  const payload = { docs, questions, scenarios, cards, plan, compNames };
  return { version: shortHash(JSON.stringify(payload)), generatedAt: new Date().toISOString(), ...payload };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const content = runImport();
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(content));
    const by = (k: string) => content.questions.filter((q) => q.bank === k).length;
    console.log(`✔ Importado (versión ${content.version}) desde ${SRC}`);
    console.log(`  Preguntas: ${BANKS.map((b) => `${b.id}=${by(b.id)}`).join(' · ')} · escenarios=${content.scenarios.length}`);
    console.log(`  Tarjetas: ${content.cards.length} · días del plan: ${content.plan.length} · documentos: ${content.docs.length}`);
  } catch (e) {
    console.error(`\n✖ ${(e as Error).message}\n`);
    process.exit(1);
  }
}
