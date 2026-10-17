import { useState } from 'react';
import { scenarioById } from '../content';
import { toggleLetter } from '../domain/grading';
import type { Letter, Question } from '../types';
import { InlineMd, Markdown } from './Markdown';
import { BANK_LABEL } from './labels';

interface Props {
  q: Question;
  selected: Letter[];
  onChange?: (sel: Letter[]) => void;
  /** show correct/incorrect marks and the explanation */
  reveal?: boolean;
  number?: number;
  total?: number;
  showMeta?: boolean;
  outdated?: boolean;
}

export function QuestionView({ q, selected, onChange, reveal, number, total, showMeta, outdated }: Props) {
  const [warn, setWarn] = useState('');
  const scenario = q.scenarioId ? scenarioById.get(q.scenarioId) : undefined;
  const letters = Object.keys(q.options).sort() as Letter[];
  const multi = q.select > 1;

  const click = (l: Letter) => {
    if (!onChange || reveal) return;
    const next = toggleLetter(q, selected, l);
    if (!next) {
      setWarn(`Esta pregunta pide exactamente ${q.select} respuestas. Desmarca una antes de elegir otra.`);
      return;
    }
    setWarn('');
    onChange(next);
  };

  return (
    <div className="stack">
      {scenario && (
        <div className="scenario">
          <div className="scenario-label">Escenario · preguntas {scenario.from}–{scenario.to} de {BANK_LABEL[q.bank]}</div>
          <Markdown>{scenario.text}</Markdown>
        </div>
      )}
      <div className="qmeta row">
        {number !== undefined && <span>Pregunta {number}{total ? ` de ${total}` : ''}</span>}
        {(showMeta || reveal) && <span className="badge">{BANK_LABEL[q.bank]} · nº {q.n}</span>}
        {(showMeta || reveal) && <span className="badge">{q.comp}{q.topic ? ` · ${q.topic}` : ''}</span>}
        {multi && <span className="badge warn">Elige {q.select}</span>}
        {outdated && <span className="badge bad">La pregunta ha cambiado desde este intento</span>}
      </div>
      <div className="stem"><InlineMd>{q.stem}</InlineMd></div>
      <div className="options" role={multi ? 'group' : 'radiogroup'}>
        {letters.map((l) => {
          const sel = selected.includes(l);
          const right = reveal && q.answer.includes(l);
          const wrong = reveal && sel && !q.answer.includes(l);
          const cls = ['opt', multi && 'multi', sel && !reveal && 'sel', right && 'right', wrong && 'wrong', reveal && sel && 'sel']
            .filter(Boolean).join(' ');
          return (
            <button key={l} className={cls} onClick={() => click(l)} disabled={!onChange || reveal}
              aria-pressed={sel}>
              <span className="letter">{l}</span>
              <span style={{ flex: 1 }}><InlineMd>{q.options[l]!}</InlineMd></span>
              {reveal && right && <span title="Correcta">✓</span>}
              {reveal && wrong && <span title="Tu respuesta">✗</span>}
            </button>
          );
        })}
      </div>
      {warn && <div className="callout warn">{warn}</div>}
      {reveal && (
        <div className="explanation">
          <div className="row small">
            <strong>Respuesta: {q.answer.join(', ')}</strong>
            {selected.length > 0 && <span className="muted">· Tu respuesta: {selected.join(', ')}</span>}
            {selected.length === 0 && <span className="muted">· Sin responder</span>}
          </div>
          <Markdown className="prose">{q.explanation}</Markdown>
        </div>
      )}
    </div>
  );
}
