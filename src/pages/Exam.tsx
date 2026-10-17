import { useEffect, useMemo, useRef, useState } from 'react';
import { content, NOTA_MIXTO, questionById, questionsOf } from '../content';
import { QuestionView } from '../components/QuestionView';
import { deleteAttempt, gradeAll, newAttempt, queueFromAttempt, saveAttempt } from '../db/actions';
import type { Attempt, ExamKind } from '../db/model';
import { useApp } from '../db/store';
import {
  due, endHalf1, fmt, navigable, remaining, resumeFree, startClock, startHalf2, stopFree, HALF_MS, FULL_MS, PAUSE_MS,
} from '../domain/examClock';
import { selectionComplete, toggleLetter } from '../domain/grading';
import { competencyQuotas, generateMixed } from '../domain/mixed';
import { mulberry32 } from '../domain/rng';
import { simsDone } from '../domain/stats';
import { go } from '../router';
import { COMPETENCIES, type Letter } from '../types';

const HALF = 50;

export function Exam() {
  const attempts = useApp((s) => s.attempts);
  const active = attempts.find((a) => a.mode === 'exam' && a.status === 'in_progress');
  return active ? <ExamRunner attempt={active} /> : <ExamSetup />;
}

function ExamSetup() {
  const attempts = useApp((s) => s.attempts);
  const settings = useApp((s) => s.settings);
  const sims = simsDone(attempts);
  const includeSims = sims.both || settings.includeSimsEarly;
  const quotas = useMemo(() => competencyQuotas(), []);

  const start = (kind: ExamKind) => {
    let ids: string[];
    let notes: string[] | undefined;
    if (kind === 'mixed') {
      const pool = content.questions.filter((q) => includeSims || !q.bank.startsWith('sim'));
      const m = generateMixed(pool, mulberry32(Date.now() & 0xffffffff));
      ids = m.questionIds;
      notes = m.notes;
    } else {
      ids = questionsOf(kind).map((q) => q.id);
    }
    const label = kind === 'mixed' ? 'Examen mixto' : `Simulacro ${kind.slice(3)}`;
    const a = newAttempt({
      mode: 'exam', examKind: kind, label, questionIds: ids, notes,
      runtime: startClock(settings.freePause ? 'free' : 'halves', Date.now()),
    });
    saveAttempt(a);
  };

  return (
    <div className="stack" style={{ maxWidth: 900 }}>
      <h1>Modo examen</h1>
      <div className="callout info small">
        2 h 45 min de examen. {settings.freePause
          ? 'Pausa libre (ajuste activado): el botón «Pausa» detiene el reloj en cualquier momento.'
          : 'Dos mitades de 50 preguntas y 82,5 min cada una; el tiempo sobrante de la primera mitad no pasa a la segunda. Al cerrar la primera mitad se ofrece una pausa opcional de 15 min que no descuenta tiempo.'}
        {' '}No verás ninguna respuesta hasta entregar.
      </div>
      <div className="grid2">
        {(['sim1', 'sim2'] as const).map((k) => (
          <div key={k} className="card stack">
            <h3 style={{ margin: 0 }}>Simulacro {k.slice(3)}</h3>
            <p className="muted small" style={{ margin: 0 }}>100 preguntas en el orden del simulacro. {sims[k] ? '✓ Ya entregado al menos una vez.' : 'Aún no entregado.'}</p>
            <div><button className="btn primary" onClick={() => start(k)}>Empezar simulacro {k.slice(3)}</button></div>
          </div>
        ))}
        <div className="card stack">
          <h3 style={{ margin: 0 }}>Examen mixto</h3>
          <p className="small" style={{ margin: 0 }}>{NOTA_MIXTO}</p>
          <p className="muted small" style={{ margin: 0 }}>
            {includeSims
              ? 'Incluye preguntas de los tests de unidad y de los simulacros.'
              : 'Solo tests de unidad: las preguntas de los simulacros quedan fuera hasta que entregues los dos (o lo actives en Ajustes). Con el banco reducido, el reparto puede necesitar ajustes, que se indicarán.'}
          </p>
          <details className="small">
            <summary>Reparto previsto por competencia</summary>
            <table className="data">
              <tbody>
                {(['I', 'II', 'III', 'IV'] as const).map((d) => (
                  <tr key={d}>
                    <th>{d} ({COMPETENCIES.filter((c) => c.startsWith(d + '.')).reduce((a, c) => a + quotas[c], 0)})</th>
                    <td>{COMPETENCIES.filter((c) => c.startsWith(d + '.')).map((c) => `${c} ${quotas[c]}`).join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <div><button className="btn primary" onClick={() => start('mixed')}>Generar y empezar</button></div>
        </div>
      </div>
    </div>
  );
}

/** Add the time spent on the current question and restart its stopwatch (or stop it). */
function accrue(a: Attempt, now: number, restart: boolean): Attempt {
  const rt = a.runtime!;
  if (rt.shownAt === undefined) return restart ? { ...a, runtime: { ...rt, shownAt: now } } : a;
  const id = a.questionIds[rt.current];
  const q = questionById.get(id)!;
  const rec = a.answers[id] ?? { selected: [], timeMs: 0, hash: q.hash };
  return {
    ...a,
    answers: { ...a.answers, [id]: { ...rec, timeMs: rec.timeMs + Math.max(0, now - rt.shownAt) } },
    runtime: { ...rt, shownAt: restart ? now : undefined },
  };
}

function ExamRunner({ attempt }: { attempt: Attempt }) {
  const [now, setNow] = useState(Date.now());
  const [warn, setWarn] = useState('');
  const ref = useRef(attempt);
  ref.current = attempt;
  const rt = attempt.runtime!;
  const total = attempt.questionIds.length;
  const half = Math.min(HALF, Math.ceil(total / 2));

  const submit = (a: Attempt) => {
    const t = Date.now();
    const graded = gradeAll(accrue(a, t, false));
    const done: Attempt = { ...graded, status: 'submitted', finishedAt: t, runtime: { ...graded.runtime!, phase: 'done', deadline: undefined } };
    saveAttempt(done);
    queueFromAttempt(done);
    go(`/resultado/${a.id}`);
  };

  // clock
  useEffect(() => {
    const iv = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const a = ref.current;
      const d = due(a.runtime!, t);
      if (d === 'endHalf1') saveAttempt({ ...accrue(a, t, false), runtime: endHalf1(a.runtime!, t) });
      else if (d === 'endPause') saveAttempt({ ...a, runtime: startHalf2(a.runtime!, t, half) });
      else if (d === 'submit') submit(a);
    }, 500);
    return () => clearInterval(iv);
  }, []);

  const goTo = (idx: number) => {
    const [lo, hi] = navigable(rt, total, half);
    if (idx < lo || idx > hi) return;
    setWarn('');
    const t = Date.now();
    const a = accrue(attempt, t, true);
    saveAttempt({ ...a, runtime: { ...a.runtime!, current: idx } });
  };

  const id = attempt.questionIds[rt.current];
  const q = questionById.get(id)!;
  const rec = attempt.answers[id];

  const setSel = (sel: Letter[]) => {
    saveAttempt({ ...attempt, answers: { ...attempt.answers, [id]: { ...(rec ?? { timeMs: 0, hash: q.hash }), selected: sel } } });
  };
  const toggleField = (f: 'flagged' | 'doubt') =>
    saveAttempt({ ...attempt, answers: { ...attempt.answers, [id]: { ...(rec ?? { selected: [], timeMs: 0, hash: q.hash }), [f]: !rec?.[f] } } });

  // keyboard: A–E select, ← → navigate
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (rt.phase === 'pause' || (rt.phase === 'free' && rt.deadline === undefined)) return;
      const k = e.key.toUpperCase();
      if (/^[A-E]$/.test(k) && q.options[k as Letter]) {
        const next = toggleLetter(q, rec?.selected ?? [], k as Letter);
        if (next) setSel(next);
        else setWarn(`Esta pregunta pide exactamente ${q.select} respuestas.`);
      } else if (e.key === 'ArrowRight') goTo(rt.current + 1);
      else if (e.key === 'ArrowLeft') goTo(rt.current - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const [lo, hi] = navigable(rt, total, half);
  const rangeIds = attempt.questionIds.slice(lo, hi + 1);
  const unanswered = rangeIds.filter((x) => !(attempt.answers[x]?.selected.length)).length;
  const incomplete = rangeIds.filter((x) => {
    const r = attempt.answers[x];
    const qq = questionById.get(x)!;
    return r && r.selected.length > 0 && !selectionComplete(qq, r.selected);
  }).map((x) => attempt.questionIds.indexOf(x) + 1);
  const flagged = rangeIds.filter((x) => attempt.answers[x]?.flagged).length;

  const confirmEnd = (what: string) =>
    window.confirm(
      `${what}\n\nSin responder: ${unanswered}\nMarcadas para revisión: ${flagged}` +
      (incomplete.length ? `\nRespuesta múltiple con marcas incompletas: ${incomplete.join(', ')}` : '') +
      (rt.phase === 'half1' ? '\n\nDespués no podrás volver a la primera mitad.' : ''),
    );

  const left = remaining(rt, now);

  if (rt.phase === 'pause') {
    return (
      <div className="card stack" style={{ maxWidth: 640, margin: '40px auto', textAlign: 'center' }}>
        <h2>Pausa opcional</h2>
        <p>La primera mitad está cerrada. La pausa no descuenta tiempo del examen.</p>
        <div className="timer" style={{ fontSize: '2.4em' }}>{fmt(left)}</div>
        <p className="muted small">Al terminar la pausa empezará automáticamente la segunda mitad ({fmt(HALF_MS)}).</p>
        <div><button className="btn primary" onClick={() => saveAttempt({ ...attempt, runtime: startHalf2(rt, Date.now(), half) })}>
          Saltar pausa y empezar la segunda mitad
        </button></div>
      </div>
    );
  }

  const stopped = rt.phase === 'free' && rt.deadline === undefined;
  const periodLabel = rt.phase === 'half1' ? 'Primera mitad' : rt.phase === 'half2' ? 'Segunda mitad' : 'Examen';
  const periodMs = rt.phase === 'free' ? FULL_MS : HALF_MS;

  return (
    <div>
      <div className="exam-bar row spread">
        <div className="row">
          <strong>{attempt.label}</strong>
          <span className="badge">{periodLabel}</span>
        </div>
        <div className="row">
          <span className={'timer' + (left < 10 * 60_000 ? ' low' : '')} title={`de ${fmt(periodMs)}`}>{fmt(left)}</span>
          {rt.phase === 'free' && (stopped
            ? <button className="btn small primary" onClick={() => saveAttempt(accrue({ ...attempt, runtime: resumeFree(rt, Date.now()) }, Date.now(), true))}>Reanudar</button>
            : <button className="btn small" onClick={() => saveAttempt({ ...accrue(attempt, Date.now(), false), runtime: stopFree(accrue(attempt, Date.now(), false).runtime!, Date.now()) })}>Pausa</button>)}
          {rt.phase === 'half1'
            ? <button className="btn small primary" onClick={() => confirmEnd('¿Entregar la primera mitad?') && saveAttempt({ ...accrue(attempt, Date.now(), false), runtime: endHalf1(rt, Date.now()) })}>Entregar primera mitad</button>
            : <button className="btn small primary" onClick={() => confirmEnd('¿Entregar el examen?') && submit(attempt)}>Entregar examen</button>}
        </div>
      </div>
      {attempt.notes?.length ? (
        <details className="callout warn small" style={{ marginTop: 10 }}>
          <summary>Avisos sobre el reparto de este examen</summary>
          <ul>{attempt.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </details>
      ) : null}
      {stopped ? (
        <div className="card" style={{ textAlign: 'center', marginTop: 30 }}>
          <h2>Reloj detenido</h2>
          <p className="muted">Las preguntas quedan ocultas mientras el reloj está parado.</p>
        </div>
      ) : (
        <div className="exam-layout" style={{ marginTop: 16 }}>
          <div className="stack">
            <QuestionView q={q} selected={rec?.selected ?? []} onChange={setSel} number={rt.current + 1} total={total} />
            {warn && <div className="callout warn">{warn}</div>}
            {q.select > 1 && (rec?.selected.length ?? 0) > 0 && !selectionComplete(q, rec!.selected) && (
              <div className="callout warn small">Has marcado {rec!.selected.length} de {q.select}. Esta pregunta pide exactamente {q.select} respuestas.</div>
            )}
            <div className="row">
              <button className="btn" disabled={rt.current <= lo} onClick={() => goTo(rt.current - 1)}>← Anterior</button>
              <button className="btn" disabled={rt.current >= hi} onClick={() => goTo(rt.current + 1)}>Siguiente →</button>
              <button className={'btn' + (rec?.flagged ? ' on' : '')} onClick={() => toggleField('flagged')}>⚑ {rec?.flagged ? 'Marcada' : 'Marcar para revisión'}</button>
              <button className={'btn' + (rec?.doubt ? ' on' : '')} onClick={() => toggleField('doubt')}>{rec?.doubt ? '◉' : '○'} Con duda</button>
            </div>
            <p className="muted small">Atajos: teclas A–E para marcar, ← → para navegar.</p>
          </div>
          <aside className="exam-side card">
            <div className="small muted" style={{ marginBottom: 8 }}>
              Respondidas {rangeIds.length - unanswered}/{rangeIds.length} · marcadas {flagged}
            </div>
            <div className="navgrid">
              {attempt.questionIds.map((x, idx) => {
                const r = attempt.answers[x];
                const cls = [r?.selected.length && 'answered', r?.flagged && 'flag', idx === rt.current && 'current'].filter(Boolean).join(' ');
                return <button key={x} className={cls} disabled={idx < lo || idx > hi} onClick={() => goTo(idx)}>{idx + 1}</button>;
              })}
            </div>
            <div className="small muted" style={{ marginTop: 10 }}>
              {rt.phase === 'half2' && 'La primera mitad está bloqueada.'}
              {rt.phase === 'half1' && `La pausa (${PAUSE_MS / 60000} min) se ofrece al cerrar esta mitad.`}
            </div>
            <hr />
            <button className="btn small" onClick={() => window.confirm('¿Abandonar el examen? Se borrará este intento sin puntuar.') && deleteAttempt(attempt.id)}>
              Abandonar examen
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}
