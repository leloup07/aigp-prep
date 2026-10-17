import { useMemo, useState } from 'react';
import { content, questionById } from '../content';
import { QuestionView } from '../components/QuestionView';
import { compName } from '../components/labels';
import { newAttempt, queueOne, saveAttempt } from '../db/actions';
import type { Attempt } from '../db/model';
import { useApp } from '../db/store';
import { isCorrect, selectionComplete } from '../domain/grading';
import { mulberry32, shuffle } from '../domain/rng';
import { simsDone } from '../domain/stats';
import { groupByScenario } from '../domain/practice';
import { go } from '../router';
import { COMPETENCIES, type BankId, type Competency, type Letter } from '../types';

export function Practice() {
  const attempts = useApp((s) => s.attempts);
  const active = [...attempts].reverse().find((a) => a.mode === 'practice' && a.status === 'in_progress');
  const [runningId, setRunningId] = useState<string | null>(null);
  const running = attempts.find((a) => a.id === runningId);
  if (running && running.status === 'in_progress') return <Runner attempt={running} onExit={() => setRunningId(null)} />;
  return <Setup active={active} onStart={setRunningId} />;
}

function Setup({ active, onStart }: { active?: Attempt; onStart: (id: string) => void }) {
  const attempts = useApp((s) => s.attempts);
  const settings = useApp((s) => s.settings);
  const sims = simsDone(attempts);
  const simsAllowed = sims.both || settings.includeSimsEarly;
  const [by, setBy] = useState<'unidad' | 'comp'>('unidad');
  const [banks, setBanks] = useState<BankId[]>(['u1']);
  const [comps, setComps] = useState<Competency[]>([]);
  const [count, setCount] = useState(10);

  const allowedBanks: BankId[] = simsAllowed ? ['u1', 'u2', 'u3', 'u4', 'sim1', 'sim2'] : ['u1', 'u2', 'u3', 'u4'];
  const pool = useMemo(
    () => content.questions.filter((q) => allowedBanks.includes(q.bank) && (by === 'unidad' ? banks.includes(q.bank) : comps.includes(q.comp))),
    [by, banks, comps, simsAllowed],
  );

  const start = () => {
    const rand = mulberry32(Date.now() & 0xffffffff);
    const picked = groupByScenario(shuffle(pool, rand).slice(0, Math.min(count, pool.length)));
    const label = by === 'unidad'
      ? `Práctica · ${banks.map((b) => b.toUpperCase()).join(', ')}`
      : `Práctica · ${comps.join(', ')}`;
    const a = newAttempt({ mode: 'practice', label, questionIds: picked.map((q) => q.id) });
    saveAttempt(a);
    onStart(a.id);
  };

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <h1>Práctica por competencia</h1>
      {active && (
        <div className="callout info row spread">
          <span>Tienes una práctica sin terminar: <strong>{active.label}</strong> ({Object.keys(active.answers).length}/{active.questionIds.length}).</span>
          <span className="row">
            <button className="btn small primary" onClick={() => onStart(active.id)}>Continuar</button>
            <button className="btn small" onClick={() => saveAttempt({ ...active, status: 'submitted', finishedAt: Date.now() })}>Darla por terminada</button>
          </span>
        </div>
      )}
      <div className="card stack">
        <div className="tabs">
          <button className={'btn' + (by === 'unidad' ? ' on' : '')} onClick={() => setBy('unidad')}>Por unidad</button>
          <button className={'btn' + (by === 'comp' ? ' on' : '')} onClick={() => setBy('comp')}>Por competencias</button>
        </div>
        {by === 'unidad' ? (
          <div className="row">
            {allowedBanks.map((b) => (
              <label key={b} className="check btn small">
                <input type="checkbox" checked={banks.includes(b)} onChange={() => setBanks(toggle(banks, b))} />
                {b.startsWith('sim') ? `Simulacro ${b.slice(3)}` : `Unidad ${['I', 'II', 'III', 'IV'][+b.slice(1) - 1]}`}
              </label>
            ))}
          </div>
        ) : (
          <div className="stack">
            {(['I', 'II', 'III', 'IV'] as const).map((d) => (
              <div key={d} className="row">
                <strong style={{ width: 34 }}>{d}</strong>
                {COMPETENCIES.filter((c) => c.startsWith(d + '.')).map((c) => (
                  <label key={c} className={'check btn small' + (comps.includes(c) ? ' on' : '')} title={compName(c)}>
                    <input type="checkbox" checked={comps.includes(c)} onChange={() => setComps(toggle(comps, c))} />
                    {c}
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}
        <div className="row">
          <label>Número de preguntas{' '}
            <input type="number" min={1} max={pool.length || 1} value={count} onChange={(e) => setCount(Math.max(1, +e.target.value))} style={{ width: 90 }} />
          </label>
          <span className="muted small">{pool.length} disponibles</span>
        </div>
        {!simsAllowed && (
          <p className="small muted">Las preguntas de los simulacros no entran en la práctica hasta que entregues ambos simulacros (puedes cambiarlo en Ajustes).</p>
        )}
        <div><button className="btn primary" disabled={!pool.length} onClick={start}>Empezar</button></div>
      </div>
    </div>
  );
}

function Runner({ attempt, onExit }: { attempt: Attempt; onExit: () => void }) {
  const firstOpen = attempt.questionIds.findIndex((id) => attempt.answers[id]?.correct === undefined);
  const [i, setI] = useState(firstOpen < 0 ? attempt.questionIds.length - 1 : firstOpen);
  const [sel, setSel] = useState<Letter[]>([]);
  const [shownAt, setShownAt] = useState(Date.now());
  const id = attempt.questionIds[i];
  const q = questionById.get(id)!;
  const rec = attempt.answers[id];
  const checked = rec?.correct !== undefined;
  const selected = checked ? rec.selected : sel;
  const doubt = rec?.doubt ?? false;
  const ok = Object.values(attempt.answers).filter((r) => r.correct).length;
  const answered = Object.values(attempt.answers).filter((r) => r.correct !== undefined).length;

  const check = () => {
    const correct = isCorrect(q, sel);
    saveAttempt({ ...attempt, answers: { ...attempt.answers, [id]: { selected: sel, correct, timeMs: Date.now() - shownAt, doubt, hash: q.hash } } });
    if (!correct) queueOne(id, 'fallada');
    else if (doubt) queueOne(id, 'duda');
  };
  const toggleDoubt = () => {
    const next = !doubt;
    const base = rec ?? { selected: sel, timeMs: 0, hash: q.hash };
    saveAttempt({ ...attempt, answers: { ...attempt.answers, [id]: { ...base, doubt: next } } });
    if (next && checked) queueOne(id, 'duda');
  };
  const next = () => {
    if (i + 1 >= attempt.questionIds.length) {
      const done = { ...attempt, status: 'submitted' as const, finishedAt: Date.now() };
      saveAttempt(done);
      onExit();
      go(`/resultado/${attempt.id}`);
      return;
    }
    setI(i + 1);
    setSel([]);
    setShownAt(Date.now());
  };

  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <div className="row spread">
        <strong>{attempt.label}</strong>
        <span className="muted small">{ok}/{answered} aciertos</span>
        <button className="btn small" onClick={onExit}>Salir (se guarda)</button>
      </div>
      <QuestionView q={q} selected={selected} onChange={checked ? undefined : setSel} reveal={checked}
        number={i + 1} total={attempt.questionIds.length} />
      <div className="row">
        {!checked && (
          <button className="btn primary" disabled={!selectionComplete(q, sel)} onClick={check}>Comprobar</button>
        )}
        {!checked && q.select > 1 && !selectionComplete(q, sel) && (
          <span className="small muted">Marca exactamente {q.select} opciones para poder comprobar.</span>
        )}
        <button className={'btn' + (doubt ? ' on' : '')} onClick={toggleDoubt}>{doubt ? '◉ Con duda' : '○ Con duda'}</button>
        {checked && (
          <>
            <span className={'badge ' + (rec.correct ? 'ok' : 'bad')}>{rec.correct ? 'Correcta' : 'Incorrecta'}</span>
            <button className="btn primary" onClick={next}>{i + 1 >= attempt.questionIds.length ? 'Ver resumen' : 'Siguiente'}</button>
          </>
        )}
      </div>
    </div>
  );
}
