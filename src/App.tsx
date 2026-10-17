import { useEffect } from 'react';
import { NOTA_ESCALA } from './content';
import { isPersistent, useApp } from './db/store';
import { useRoute } from './router';
import { Study } from './pages/Study';
import { Practice } from './pages/Practice';
import { Exam } from './pages/Exam';
import { Results } from './pages/Results';
import { Review } from './pages/Review';
import { Cards } from './pages/Cards';
import { Progress } from './pages/Progress';
import { Official } from './pages/Official';
import { SettingsPage } from './pages/Settings';

const NAV: [string, string][] = [
  ['/estudio', 'Estudio'],
  ['/practica', 'Práctica'],
  ['/examen', 'Examen'],
  ['/repaso', 'Repaso de errores'],
  ['/tarjetas', 'Tarjetas'],
  ['/progreso', 'Progreso'],
  ['/oficial', 'Practice Exam oficial'],
  ['/ajustes', 'Ajustes'],
];

export function App() {
  const { parts } = useRoute();
  const settings = useApp((s) => s.settings);

  useEffect(() => {
    const el = document.documentElement;
    if (settings.theme === 'auto') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', settings.theme);
    el.style.setProperty('--fs', String(settings.fontScale));
  }, [settings.theme, settings.fontScale]);

  const top = parts[0] ?? 'estudio';
  let page;
  switch (top) {
    case 'practica': page = <Practice />; break;
    case 'examen': page = <Exam />; break;
    case 'resultado': page = <Results id={parts[1]} />; break;
    case 'repaso': page = <Review />; break;
    case 'tarjetas': page = <Cards />; break;
    case 'progreso': page = <Progress />; break;
    case 'oficial': page = <Official />; break;
    case 'ajustes': page = <SettingsPage />; break;
    default: page = <Study />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">AIGP Prep</span>
        <nav>
          {NAV.map(([href, label]) => (
            <a key={href} href={'#' + href} className={'/' + top === href ? 'active' : ''}>{label}</a>
          ))}
        </nav>
      </header>
      <main>
        {!isPersistent() && (
          <div className="callout bad small" style={{ marginBottom: 14 }}>
            Este navegador no permite guardar datos al abrir el archivo directamente: tu progreso se perderá al cerrar.
            Usa <code>npm run preview</code> (o <code>npm run dev</code>) y abre la dirección http://localhost que indique.
          </div>
        )}
        {page}
      </main>
      <footer className="nota">{NOTA_ESCALA}</footer>
    </div>
  );
}
