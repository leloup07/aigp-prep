import { useState } from 'react';
import { uid } from '../db/actions';
import type { OfficialEntry } from '../db/model';
import { setSlice, useApp } from '../db/store';

const empty = (): OfficialEntry => ({
  id: uid(), date: new Date().toISOString().slice(0, 10), domains: { I: '', II: '', III: '', IV: '' }, overall: '', notes: '', createdAt: Date.now(),
});

export function Official() {
  const entries = useApp((s) => s.official);
  const [draft, setDraft] = useState<OfficialEntry>(empty);

  const save = () => {
    setSlice('official', (list) => [...list.filter((e) => e.id !== draft.id), { ...draft, createdAt: draft.createdAt || Date.now() }]);
    setDraft(empty());
  };

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <h1>Registro del Practice Exam oficial</h1>
      <div className="callout info small">
        Aquí solo anotas tus resultados. Esta aplicación no contiene, no importa y no pide ningún contenido del Practice Exam oficial
        (ni preguntas, ni opciones, ni explicaciones). Según el plan, hazlo a ciegas el día 6.
      </div>
      <div className="card stack">
        <div className="row">
          <label>Fecha <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
          <label>Puntuación global <input type="text" value={draft.overall} placeholder="tal como la muestre IAPP" onChange={(e) => setDraft({ ...draft, overall: e.target.value })} /></label>
        </div>
        <div className="row">
          {(['I', 'II', 'III', 'IV'] as const).map((d) => (
            <label key={d}>Dominio {d}{' '}
              <input type="text" style={{ width: 110 }} value={draft.domains[d]} onChange={(e) => setDraft({ ...draft, domains: { ...draft.domains, [d]: e.target.value } })} />
            </label>
          ))}
        </div>
        <label>Notas
          <textarea value={draft.notes} placeholder="Sensaciones, gestión del tiempo, temas que te sonaron débiles…" onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </label>
        <div className="row">
          <button className="btn primary" onClick={save}>Guardar</button>
          {entries.some((e) => e.id === draft.id) && <button className="btn" onClick={() => setDraft(empty())}>Cancelar edición</button>}
        </div>
      </div>
      {entries.length > 0 && (
        <div className="card">
          <table className="data">
            <thead><tr><th>Fecha</th><th>Global</th><th>I</th><th>II</th><th>III</th><th>IV</th><th>Notas</th><th></th></tr></thead>
            <tbody>
              {[...entries].sort((a, b) => b.date.localeCompare(a.date)).map((e) => (
                <tr key={e.id}>
                  <td>{e.date}</td><td>{e.overall}</td><td>{e.domains.I}</td><td>{e.domains.II}</td><td>{e.domains.III}</td><td>{e.domains.IV}</td>
                  <td className="small" style={{ whiteSpace: 'pre-wrap' }}>{e.notes}</td>
                  <td className="row">
                    <button className="btn small" onClick={() => setDraft(e)}>Editar</button>
                    <button className="btn small" onClick={() => window.confirm('¿Borrar este registro?') && setSlice('official', (l) => l.filter((x) => x.id !== e.id))}>Borrar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
