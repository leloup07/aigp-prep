import { useState } from 'react';
import { content } from '../content';
import { leitnerAnswer } from '../db/actions';
import { useApp } from '../db/store';
import { isDue } from '../domain/leitner';
import { mulberry32, shuffle } from '../domain/rng';
import type { Card } from '../types';
import { InlineMd } from '../components/Markdown';

type Kind = 'todas' | 'glosario' | 'par';

export function Cards() {
  const leitner = useApp((s) => s.leitner);
  const [kind, setKind] = useState<Kind>('todas');
  const [session, setSession] = useState<Card[] | null>(null);
  const now = Date.now();
  const cards = content.cards.filter((c) => kind === 'todas' || c.kind === kind);
  const fresh = cards.filter((c) => !leitner[c.id]);
  const due = cards.filter((c) => leitner[c.id] && isDue(leitner[c.id], now));
  const retired = cards.filter((c) => leitner[c.id]?.retired).length;

  if (session) return <CardRunner cards={session} onExit={() => setSession(null)} />;

  const begin = (list: Card[]) => setSession(shuffle(list, mulberry32(Date.now() & 0xffffffff)));

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <h1>Tarjetas</h1>
      <p className="muted">Generadas desde el Glosario y los «Pares de conceptos» de las tablas de repaso. Mismo sistema de 3 cajas que el repaso de errores.</p>
      <div className="tabs">
        {(['todas', 'glosario', 'par'] as Kind[]).map((k) => (
          <button key={k} className={'btn small' + (kind === k ? ' on' : '')} onClick={() => setKind(k)}>
            {{ todas: 'Todas', glosario: 'Glosario', par: 'Pares de conceptos' }[k]}
          </button>
        ))}
      </div>
      <div className="grid2">
        <div className="card"><div className="muted small">Para hoy</div><div style={{ fontSize: '1.8em', fontWeight: 700 }}>{due.length}</div></div>
        <div className="card"><div className="muted small">Nuevas</div><div style={{ fontSize: '1.8em', fontWeight: 700 }}>{fresh.length}</div></div>
        <div className="card"><div className="muted small">Dominadas</div><div style={{ fontSize: '1.8em', fontWeight: 700 }}>{retired}</div></div>
      </div>
      <div className="row">
        <button className="btn primary" disabled={!due.length} onClick={() => begin(due)}>Repasar las de hoy ({due.length})</button>
        <button className="btn" disabled={!fresh.length} onClick={() => begin(fresh.slice(0, 15))}>Aprender nuevas ({Math.min(15, fresh.length)})</button>
        <button className="btn" onClick={() => begin(cards)}>Repasar todas</button>
      </div>
    </div>
  );
}

function CardRunner({ cards, onExit }: { cards: Card[]; onExit: () => void }) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [ok, setOk] = useState(0);
  if (i >= cards.length) {
    return (
      <div className="card stack" style={{ maxWidth: 600 }}>
        <h2>Sesión terminada</h2>
        <p>Sabías {ok} de {cards.length}.</p>
        <div><button className="btn primary" onClick={onExit}>Volver</button></div>
      </div>
    );
  }
  const c = cards[i];
  const answer = (knew: boolean) => {
    leitnerAnswer(c.id, 'card', knew);
    if (knew) setOk(ok + 1);
    setI(i + 1);
    setFlipped(false);
  };
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <div className="row spread">
        <span className="muted small">{i + 1} de {cards.length} · {c.kind === 'par' ? 'Par de conceptos' : 'Glosario'}</span>
        <button className="btn small" onClick={onExit}>Salir</button>
      </div>
      <div className="card flash" onClick={() => setFlipped(true)}>
        <div>
          <div style={{ fontWeight: 600 }}><InlineMd>{c.front}</InlineMd></div>
          {flipped ? <div className="back" style={{ marginTop: 18, fontSize: '0.85em' }}><InlineMd>{c.back}</InlineMd></div>
            : <div className="muted small" style={{ marginTop: 18 }}>Toca para ver el reverso</div>}
        </div>
      </div>
      {flipped && (
        <div className="row">
          <button className="btn" onClick={() => answer(false)}>No la sabía</button>
          <button className="btn primary" onClick={() => answer(true)}>La sabía</button>
        </div>
      )}
    </div>
  );
}
