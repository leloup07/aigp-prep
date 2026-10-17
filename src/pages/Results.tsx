import { Fragment, useState } from 'react';
import { NOTA_ESCALA, NOTA_MIXTO, questionById } from '../content';
import { QuestionView } from '../components/QuestionView';
import { compName } from '../components/labels';
import { attemptIsOld, deleteAttempt } from '../db/actions';
import { useApp } from '../db/store';
import { fmt } from '../domain/examClock';
import { pct } from '../domain/grading';
import { attemptStats, totals } from '../domain/stats';
import { go } from '../router';
import { COMPETENCIES, type Domain } from '../types';

type Filter = 'todas' | 'falladas' | 'marcadas' | 'duda';

export function Results({ id }: { id?: string }) {
  const a = useApp((s) => s.attempts.find((x) => x.id === id));
  const [filter, setFilter] = useState<Filter>('todas');
  const [open, setOpen] = useState<string | null>(null);
  if (!a) return <p>No se encontró el intento. <a href="#/progreso">Volver a Progreso</a></p>;

  const stats = attemptStats(a, questionById);
  const t = totals(stats);
  const old = attemptIsOld(a);
  const graded = a.questionIds.filter((x) => a.answers[x]?.correct !== undefined);
  const times = graded.map((x) => a.answers[x].timeMs);
  const avg = times.length ? times.reduce((s, v) => s + v, 0) / times.length : 0;
  const byDomain = (['I', 'II', 'III', 'IV'] as Domain[]).map((d) => {
    const cs = COMPETENCIES.filter((c) => c.startsWith(d + '.'));
    return { d, ok: cs.reduce((s, c) => s + stats[c].ok, 0), total: cs.reduce((s, c) => s + stats[c].total, 0) };
  });

  const list = a.questionIds.map((qid, i) => ({ qid, i, rec: a.answers[qid], q: questionById.get(qid) })).filter(({ rec }) => {
    if (filter === 'falladas') return rec?.correct === false || rec?.correct === undefined;
    if (filter === 'marcadas') return rec?.flagged;
    if (filter === 'duda') return rec?.doubt;
    return true;
  });

  return (
    <div className="stack">
      <div className="row spread">
        <h1 style={{ margin: 0 }}>{a.label}</h1>
        <span className="muted small">{new Date(a.startedAt).toLocaleString('es-ES')}</span>
      </div>
      {old && <div className="callout warn small">Versión anterior: este intento se hizo con otra versión de los datos ({a.dataVersion}). Las preguntas que han cambiado se señalan.</div>}
      {a.examKind === 'mixed' && <p className="small muted">{NOTA_MIXTO}</p>}
      {a.notes?.length ? <div className="callout warn small"><ul style={{ margin: 0 }}>{a.notes.map((n) => <li key={n}>{n}</li>)}</ul></div> : null}

      <div className="grid2">
        <div className="card">
          <div className="muted small">Resultado global</div>
          <div style={{ fontSize: '2.2em', fontWeight: 700 }}>{t.ok}/{t.total} <span className="muted" style={{ fontSize: '0.5em' }}>({pct(t.ok, t.total)} %)</span></div>
          <div className="small muted">Tiempo medio por pregunta: {fmt(avg)}{a.finishedAt ? ` · duración total ${fmt(a.finishedAt - a.startedAt)}` : ''}</div>
          <p className="small muted">{NOTA_ESCALA}</p>
        </div>
        <div className="card">
          <div className="muted small">Por dominio</div>
          <table className="data"><tbody>
            {byDomain.filter((x) => x.total).map((x) => (
              <tr key={x.d} className={pct(x.ok, x.total) < 70 ? 'weak' : ''}>
                <th>Dominio {x.d}</th><td className="num">{x.ok}/{x.total}</td><td className="num">{pct(x.ok, x.total)} %</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Por competencia</h3>
        <table className="data">
          <thead><tr><th>Competencia</th><th className="num">Aciertos</th><th className="num">%</th><th></th></tr></thead>
          <tbody>
            {COMPETENCIES.filter((c) => stats[c].total).map((c) => {
              const p = pct(stats[c].ok, stats[c].total);
              return (
                <tr key={c} className={p < 70 ? 'weak' : ''}>
                  <td><strong>{c}</strong> <span className="muted small">{compName(c)}</span></td>
                  <td className="num">{stats[c].ok}/{stats[c].total}</td>
                  <td className="num">{p} %</td>
                  <td>{p < 70 && <span className="badge bad">por debajo del 70 %</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card stack">
        <div className="row spread">
          <h3 style={{ margin: 0 }}>Revisión pregunta a pregunta</h3>
          <div className="tabs">
            {(['todas', 'falladas', 'marcadas', 'duda'] as Filter[]).map((f) => (
              <button key={f} className={'btn small' + (filter === f ? ' on' : '')} onClick={() => setFilter(f)}>
                {{ todas: 'Todas', falladas: 'Solo falladas', marcadas: 'Solo marcadas', duda: 'Solo con duda' }[f]}
              </button>
            ))}
          </div>
        </div>
        <table className="data">
          <thead><tr><th>#</th><th>Pregunta</th><th>Comp.</th><th>Tu resp.</th><th>Clave</th><th className="num">Tiempo</th><th></th></tr></thead>
          <tbody>
            {list.map(({ qid, i, rec, q }) => (
              <Fragment key={qid}>
                <tr onClick={() => setOpen(open === qid ? null : qid)} style={{ cursor: 'pointer' }}>
                  <td>{i + 1}</td>
                  <td className="small">{q ? q.stem.slice(0, 90) + (q.stem.length > 90 ? '…' : '') : <em>pregunta eliminada</em>}</td>
                  <td>{q?.comp}</td>
                  <td>{rec?.selected.join(', ') || '—'}</td>
                  <td>{q?.answer.join(', ')}</td>
                  <td className="num">{fmt(rec?.timeMs ?? 0)}</td>
                  <td>
                    {rec?.correct ? <span className="badge ok">✓</span> : <span className="badge bad">✗</span>}
                    {rec?.flagged && <span className="badge warn">⚑</span>}
                    {rec?.doubt && <span className="badge warn">duda</span>}
                  </td>
                </tr>
                {open === qid && q && (
                  <tr><td colSpan={7}>
                    <QuestionView q={q} selected={rec?.selected ?? []} reveal outdated={!!rec && rec.hash !== q.hash} />
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="muted">No hay preguntas con este filtro.</p>}
      </div>
      <div className="row">
        <a className="btn" href="#/progreso">Volver a Progreso</a>
        <button className="btn small" onClick={() => { if (window.confirm('¿Borrar este intento del historial?')) { deleteAttempt(a.id); go('/progreso'); } }}>Borrar intento</button>
      </div>
    </div>
  );
}
