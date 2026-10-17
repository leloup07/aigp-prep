import { useMemo, useState } from 'react';
import { questionById } from '../content';
import { QuestionView } from '../components/QuestionView';
import { leitnerAnswer } from '../db/actions';
import { setSlice, useApp } from '../db/store';
import { isCorrect, selectionComplete } from '../domain/grading';
import { INTERVAL_DAYS, isDue } from '../domain/leitner';
import { groupByScenario } from '../domain/practice';
import type { Letter } from '../types';

export function Review() {
  const leitner = useApp((s) => s.leitner);
  const items = Object.values(leitner).filter((i) => i.kind === 'question' && questionById.has(i.id));
  const now = Date.now();
  const dueItems = items.filter((i) => isDue(i, now));
  const [session, setSession] = useState<string[] | null>(null);

  if (session) return <ReviewRunner ids={session} onExit={() => setSession(null)} />;

  const boxes = [1, 2, 3].map((b) => items.filter((i) => !i.retired && i.box === b).length);
  const retired = items.filter((i) => i.retired).length;
  const nextDue = items.filter((i) => !i.retired && !isDue(i, now)).sort((a, b) => a.due - b.due)[0];

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <h1>Repaso de errores</h1>
      <p className="muted">
        Las preguntas falladas o marcadas «con duda» (en práctica o examen) entran en la caja 1. Si aciertas, suben de caja
        (caja 1 → {INTERVAL_DAYS[1]} día, caja 2 → {INTERVAL_DAYS[2]} días, caja 3 → {INTERVAL_DAYS[3]} días); un acierto en la caja 3 la saca de la cola.
        Si fallas, vuelve a la caja 1.
      </p>
      <div className="grid2">
        {boxes.map((n, i) => (
          <div key={i} className="card"><div className="muted small">Caja {i + 1}</div><div style={{ fontSize: '1.8em', fontWeight: 700 }}>{n}</div></div>
        ))}
        <div className="card"><div className="muted small">Dominadas (fuera de la cola)</div><div style={{ fontSize: '1.8em', fontWeight: 700 }}>{retired}</div></div>
      </div>
      <div className="card row spread">
        <span><strong>{dueItems.length}</strong> pregunta(s) para repasar hoy.
          {!dueItems.length && nextDue && <span className="muted"> Próxima: {new Date(nextDue.due).toLocaleDateString('es-ES')}.</span>}
        </span>
        <button className="btn primary" disabled={!dueItems.length}
          onClick={() => setSession(groupByScenario(dueItems.map((i) => questionById.get(i.id)!)).map((q) => q.id))}>
          Empezar repaso
        </button>
      </div>
      {items.length > 0 && (
        <details className="card small">
          <summary>Ver la cola completa ({items.length})</summary>
          <table className="data">
            <thead><tr><th>Pregunta</th><th>Comp.</th><th>Motivo</th><th>Caja</th><th>Próximo repaso</th><th></th></tr></thead>
            <tbody>
              {items.sort((a, b) => a.due - b.due).map((i) => {
                const q = questionById.get(i.id)!;
                return (
                  <tr key={i.id}>
                    <td>{q.bank} nº {q.n}</td><td>{q.comp}</td><td>{i.reason ?? ''}</td>
                    <td>{i.retired ? '✓' : i.box}</td>
                    <td>{i.retired ? '—' : new Date(i.due).toLocaleDateString('es-ES')}</td>
                    <td><button className="btn small" onClick={() => setSlice('leitner', (l) => { const c = { ...l }; delete c[i.id]; return c; })}>Quitar</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

function ReviewRunner({ ids, onExit }: { ids: string[]; onExit: () => void }) {
  const [i, setI] = useState(0);
  const [sel, setSel] = useState<Letter[]>([]);
  const [checked, setChecked] = useState<boolean | null>(null);
  const [score, setScore] = useState({ ok: 0, n: 0 });
  const q = useMemo(() => questionById.get(ids[i])!, [ids, i]);

  if (i >= ids.length) {
    return (
      <div className="card stack" style={{ maxWidth: 600 }}>
        <h2>Repaso terminado</h2>
        <p>{score.ok} de {score.n} correctas.</p>
        <div><button className="btn primary" onClick={onExit}>Volver</button></div>
      </div>
    );
  }

  const check = () => {
    const ok = isCorrect(q, sel);
    setChecked(ok);
    setScore((s) => ({ ok: s.ok + (ok ? 1 : 0), n: s.n + 1 }));
    leitnerAnswer(q.id, 'question', ok);
  };

  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <div className="row spread"><strong>Repaso · {i + 1} de {ids.length}</strong><button className="btn small" onClick={onExit}>Salir</button></div>
      <QuestionView q={q} selected={sel} onChange={checked === null ? setSel : undefined} reveal={checked !== null} showMeta />
      <div className="row">
        {checked === null ? (
          <>
            <button className="btn primary" disabled={!selectionComplete(q, sel)} onClick={check}>Comprobar</button>
            {q.select > 1 && !selectionComplete(q, sel) && <span className="small muted">Marca exactamente {q.select} opciones.</span>}
          </>
        ) : (
          <>
            <span className={'badge ' + (checked ? 'ok' : 'bad')}>{checked ? 'Correcta: sube de caja' : 'Incorrecta: vuelve a la caja 1'}</span>
            <button className="btn primary" onClick={() => { setI(i + 1); setSel([]); setChecked(null); }}>Siguiente</button>
          </>
        )}
      </div>
    </div>
  );
}
