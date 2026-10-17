import { useState } from 'react';
import { content, NOTA_ESCALA, questionById } from '../content';
import { compName } from '../components/labels';
import { attemptIsOld } from '../db/actions';
import type { Attempt } from '../db/model';
import { setSlice, useApp } from '../db/store';
import { pct } from '../domain/grading';
import { attemptStats, GROUP_LABEL, mergeStats, totals, type StatGroup } from '../domain/stats';
import { COMPETENCIES } from '../types';

const DAY = 86_400_000;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

function Spark({ values }: { values: number[] }) {
  const w = 120, h = 28;
  if (values.length < 2) return <span className="muted small">{values.length ? `${values[0]} %` : '—'}</span>;
  const x = (i: number) => (i / (values.length - 1)) * (w - 4) + 2;
  const y = (v: number) => h - 2 - (v / 100) * (h - 4);
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label={`Evolución: ${values.join(', ')} %`}>
      <line x1="0" x2={w} y1={y(70)} y2={y(70)} stroke="var(--bad)" strokeDasharray="2 3" strokeWidth="1" opacity="0.6" />
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.8" />
      {values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="2.2" fill={v < 70 ? 'var(--bad)' : 'var(--accent)'} />)}
    </svg>
  );
}

export function Progress() {
  const attempts = useApp((s) => s.attempts);
  const [group, setGroup] = useState<StatGroup>('unidad');
  const sorted = [...attempts].sort((a, b) => a.startedAt - b.startedAt);
  const perAttempt = sorted.map((a) => ({ a, s: attemptStats(a, questionById, group) })).filter((x) => totals(x.s).total > 0);
  const merged = mergeStats(perAttempt.map((x) => x.s));
  const t = totals(merged);

  return (
    <div className="stack">
      <h1>Progreso</h1>
      <div className="callout info small">{NOTA_ESCALA}</div>

      <div className="card stack">
        <div className="row spread">
          <h3 style={{ margin: 0 }}>Porcentaje por competencia</h3>
          <div className="tabs">
            {(Object.keys(GROUP_LABEL) as StatGroup[]).map((g) => (
              <button key={g} className={'btn small' + (group === g ? ' on' : '')} onClick={() => setGroup(g)}>{GROUP_LABEL[g]}</button>
            ))}
          </div>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Estadísticas separadas por banco para no mezclar preguntas ya vistas con preguntas nuevas. Los repasos de errores no cuentan.
          {t.total > 0 && ` Acumulado: ${t.ok}/${t.total} (${pct(t.ok, t.total)} %) en ${perAttempt.length} intento(s).`}
        </p>
        {t.total === 0 ? <p className="muted">Todavía no hay respuestas en este grupo.</p> : (
          <table className="data">
            <thead><tr><th>Competencia</th><th className="num">Acumulado</th><th></th><th>Evolución por intento</th></tr></thead>
            <tbody>
              {COMPETENCIES.map((c) => {
                const p = pct(merged[c].ok, merged[c].total);
                const series = perAttempt.filter((x) => x.s[c].total).map((x) => pct(x.s[c].ok, x.s[c].total));
                const weak = merged[c].total > 0 && p < 70;
                return (
                  <tr key={c} className={weak ? 'weak' : ''}>
                    <td><strong>{c}</strong> <span className="muted small">{compName(c)}</span>{weak && <> <span className="badge bad">&lt; 70 %</span></>}</td>
                    <td className="num">{merged[c].total ? `${p} % (${merged[c].ok}/${merged[c].total})` : '—'}</td>
                    <td><div className={'bar' + (weak ? ' weak' : '')}><span style={{ width: `${p}%` }} /></div></td>
                    <td><Spark values={series} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <History attempts={sorted.slice().reverse()} />
      <PlanCalendar />
    </div>
  );
}

function History({ attempts }: { attempts: Attempt[] }) {
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Historial de intentos</h3>
      {!attempts.length ? <p className="muted">Sin intentos todavía.</p> : (
        <table className="data">
          <thead><tr><th>Fecha</th><th>Intento</th><th className="num">Resultado</th><th></th></tr></thead>
          <tbody>
            {attempts.map((a) => {
              const t = totals(attemptStats(a, questionById));
              return (
                <tr key={a.id}>
                  <td className="small">{new Date(a.startedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>
                    <a href={`#/resultado/${a.id}`}>{a.label}</a>{' '}
                    {a.status === 'in_progress' && <span className="badge warn">en curso</span>}
                    {attemptIsOld(a) && <span className="badge">versión anterior</span>}
                  </td>
                  <td className="num">{t.total ? `${t.ok}/${t.total} · ${pct(t.ok, t.total)} %` : '—'}</td>
                  <td className="small muted">{a.mode === 'exam' ? 'examen' : a.mode === 'practice' ? 'práctica' : 'repaso'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PlanCalendar() {
  const settings = useApp((s) => s.settings);
  const checks = useApp((s) => s.plan);
  const examDate = settings.examDate ? parseIso(settings.examDate) : null;
  const start = settings.planStart ? parseIso(settings.planStart) : examDate ? new Date(examDate.getTime() - 13 * DAY) : null;
  const today = iso(new Date());
  const daysLeft = examDate ? Math.round((examDate.getTime() - parseIso(today).getTime()) / DAY) : null;
  const doneCount = content.plan.filter((d) => checks[d.day]).length;

  return (
    <div className="card stack">
      <div className="row spread">
        <h3 style={{ margin: 0 }}>Plan de 14 días</h3>
        <div className="row small">
          <label>Fecha de examen{' '}
            <input type="date" value={settings.examDate ?? ''} onChange={(e) => setSlice('settings', (s) => ({ ...s, examDate: e.target.value || undefined }))} />
          </label>
          <label>Día 1{' '}
            <input type="date" value={settings.planStart ?? (start ? iso(start) : '')}
              onChange={(e) => setSlice('settings', (s) => ({ ...s, planStart: e.target.value || undefined }))} />
          </label>
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {doneCount}/14 días hechos.
        {daysLeft !== null && (daysLeft >= 0 ? ` Faltan ${daysLeft} día(s) para el examen.` : ' La fecha de examen ya ha pasado.')}
        {!settings.planStart && examDate && ' Por defecto, el día 1 es 13 días antes del examen (el día 14 es el del examen).'}
      </p>
      <div>
        {content.plan.map((d) => {
          const date = start ? new Date(start.getTime() + (d.day - 1) * DAY) : null;
          const isToday = date && iso(date) === today;
          return (
            <div key={d.day} className={'plan-day' + (isToday ? ' today' : '') + (checks[d.day] ? ' done' : '')}>
              <input type="checkbox" checked={!!checks[d.day]} aria-label={`Día ${d.day} hecho`}
                onChange={() => setSlice('plan', (p) => ({ ...p, [d.day]: !p[d.day] }))} style={{ width: 20, height: 20, marginTop: 4 }} />
              <div className="small">
                <strong>Día {d.day}</strong><br />
                <span className="muted">{date ? date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) : ''}</span>
              </div>
              <div className="plan-text">
                <div><strong>{d.block.replace(/\*\*/g, '')}</strong> <span className="muted small">· {d.hours} h</span></div>
                <div className="small">{d.what.replace(/\*\*/g, '').replace(/\*/g, '')}</div>
                {d.expected && d.expected !== '—' && <div className="small muted">Resultado esperado: {d.expected.replace(/\*/g, '')}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
