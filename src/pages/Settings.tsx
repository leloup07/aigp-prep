import { useRef, useState } from 'react';
import { content, DATA_VERSION } from '../content';
import { exportJson, importJson, resetAll, setSlice, useApp } from '../db/store';
import { simsDone } from '../domain/stats';

export function SettingsPage() {
  const settings = useApp((s) => s.settings);
  const attempts = useApp((s) => s.attempts);
  const sims = simsDone(attempts);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const set = (patch: Partial<typeof settings>) => setSlice('settings', (s) => ({ ...s, ...patch }));

  const download = () => {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `aigp-prep-copia-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const upload = async (f: File) => {
    try {
      if (!window.confirm('Importar sustituye todos tus datos actuales por los de la copia. ¿Continuar?')) return;
      importJson(await f.text());
      setMsg('Copia importada correctamente.');
    } catch (e) {
      setMsg('Error: ' + (e as Error).message);
    }
  };

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <h1>Ajustes</h1>
      <div className="card stack">
        <h3 style={{ margin: 0 }}>Apariencia</h3>
        <div className="row">
          {(['auto', 'light', 'dark'] as const).map((t) => (
            <button key={t} className={'btn small' + (settings.theme === t ? ' on' : '')} onClick={() => set({ theme: t })}>
              {{ auto: 'Automático', light: 'Claro', dark: 'Oscuro' }[t]}
            </button>
          ))}
        </div>
        <label className="row">Tamaño de letra
          <input type="range" min={0.85} max={1.4} step={0.05} value={settings.fontScale} onChange={(e) => set({ fontScale: +e.target.value })} />
          <span className="small muted">{Math.round(settings.fontScale * 100)} %</span>
        </label>
      </div>
      <div className="card stack">
        <h3 style={{ margin: 0 }}>Examen</h3>
        <label className="check">
          <input type="checkbox" checked={settings.freePause} onChange={(e) => set({ freePause: e.target.checked })} />
          Pausa libre: el botón «Pausa» solo detiene el reloj, sin mitades ni bloqueo (desactivado = modelo oficial de dos mitades)
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.includeSimsEarly} onChange={(e) => set({ includeSimsEarly: e.target.checked })} />
          Incluir preguntas de los simulacros en el examen mixto y en la práctica antes de haber entregado los dos
        </label>
        <p className="small muted" style={{ margin: 0 }}>
          Simulacro 1: {sims.sim1 ? 'entregado' : 'pendiente'} · Simulacro 2: {sims.sim2 ? 'entregado' : 'pendiente'}.
          {sims.both && ' Como ya entregaste ambos, sus preguntas se incluyen automáticamente.'}
        </p>
      </div>
      <div className="card stack">
        <h3 style={{ margin: 0 }}>Copia de seguridad</h3>
        <p className="small muted" style={{ margin: 0 }}>Todo se guarda solo en este navegador (IndexedDB). Nada se envía a internet. Exporta de vez en cuando.</p>
        <div className="row">
          <button className="btn primary" onClick={download}>Exportar JSON</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Importar JSON…</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button className="btn" onClick={() => window.confirm('¿Borrar TODOS los datos (intentos, notas, repaso, plan)? Exporta antes si quieres conservarlos.') && resetAll()}>
            Borrar todos los datos
          </button>
        </div>
        {msg && <div className="callout info small">{msg}</div>}
      </div>
      <div className="card small muted">
        Datos importados: versión <code>{DATA_VERSION}</code> · generados el {new Date(content.generatedAt).toLocaleString('es-ES')} ·{' '}
        {content.questions.length} preguntas, {content.scenarios.length} escenarios, {content.cards.length} tarjetas.
      </div>
    </div>
  );
}
