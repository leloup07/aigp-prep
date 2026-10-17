import MiniSearch from 'minisearch';
import { useEffect, useMemo, useState } from 'react';
import { content } from '../content';
import { Markdown } from '../components/Markdown';
import { setSlice, useApp } from '../db/store';
import { go, useRoute } from '../router';
import type { Section } from '../types';

const DOC_LABEL: Record<string, string> = { U1: 'Unidad I', U2: 'Unidad II', U3: 'Unidad III', U4: 'Unidad IV', tablas: 'Tablas', plan: 'Plan' };

type Hit = { id: string; doc: string; title: string; snippet: string };

let index: MiniSearch | null = null;
const sectionDoc = new Map<string, { doc: string; s: Section }>();
function getIndex() {
  if (index) return index;
  index = new MiniSearch({
    fields: ['title', 'text'],
    storeFields: ['title', 'doc'],
    processTerm: (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
  });
  const docs = [];
  for (const d of content.docs) for (const s of d.sections) {
    sectionDoc.set(s.id, { doc: d.id, s });
    docs.push({ id: s.id, doc: d.id, title: s.title, text: s.markdown });
  }
  index.addAll(docs);
  return index;
}

function snippet(text: string, terms: string[]): string {
  const plain = text.replace(/[*_>#|`]/g, ' ').replace(/\s+/g, ' ');
  const norm = plain.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let pos = -1;
  for (const t of terms) { pos = norm.indexOf(t); if (pos >= 0) break; }
  const start = Math.max(0, pos - 60);
  return (start > 0 ? '…' : '') + plain.slice(start, start + 200) + '…';
}

export function Study() {
  const { parts, query } = useRoute();
  const docId = content.docs.some((d) => d.id === parts[1]) ? parts[1] : 'U1';
  const doc = content.docs.find((d) => d.id === docId)!;
  const target = query.get('s');
  const bookmarks = useApp((s) => s.bookmarks);
  const notes = useApp((s) => s.notes);
  const [q, setQ] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [panel, setPanel] = useState<'toc' | 'marks'>('toc');

  const hits: Hit[] = useMemo(() => {
    if (q.trim().length < 3) return [];
    const idx = getIndex();
    return idx.search(q, { prefix: true, fuzzy: 0.15, combineWith: 'AND' }).slice(0, 40).map((r) => ({
      id: r.id, doc: r.doc, title: r.title, snippet: snippet(sectionDoc.get(r.id)!.s.markdown, r.terms),
    }));
  }, [q]);

  // scroll to target section after render
  useEffect(() => {
    const el = target ? document.getElementById(target) : null;
    if (el) el.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
  }, [docId, target]);

  // highlight the section currently in view
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: '-80px 0px -70% 0px' },
    );
    document.querySelectorAll('.section').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [docId]);

  const toggleMark = (id: string) =>
    setSlice('bookmarks', (b) => (b.includes(id) ? b.filter((x) => x !== id) : [...b, id]));

  const allSections = useMemo(() => {
    const m = new Map<string, { doc: string; s: Section }>();
    for (const d of content.docs) for (const s of d.sections) m.set(s.id, { doc: d.id, s });
    return m;
  }, []);

  return (
    <div>
      <div className="row spread" style={{ marginBottom: 12 }}>
        <div className="doc-tabs">
          {content.docs.map((d) => (
            <a key={d.id} className={'btn small' + (d.id === docId ? ' on' : '')} href={`#/estudio/${d.id}`}>{DOC_LABEL[d.id] ?? d.id}</a>
          ))}
        </div>
        <input type="search" placeholder="Buscar en todos los textos…" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 260, flex: '0 1 340px' }} />
      </div>

      {q.trim().length >= 3 && (
        <div className="card search-results" style={{ marginBottom: 16 }}>
          <div className="row spread small muted">
            <span>{hits.length ? `${hits.length} resultado(s)` : 'Sin resultados'}</span>
            <button className="btn small" onClick={() => setQ('')}>Cerrar</button>
          </div>
          {hits.map((h) => (
            <button key={h.id} onClick={() => { go(`/estudio/${h.doc}?s=${h.id}`); setQ(''); }}>
              <div><span className="badge">{DOC_LABEL[h.doc]}</span> <strong>{h.title}</strong></div>
              <div className="small muted">{h.snippet}</div>
            </button>
          ))}
        </div>
      )}

      <div className="reader">
        <aside className="toc">
          <div className="tabs" style={{ marginBottom: 6 }}>
            <button className={'btn small' + (panel === 'toc' ? ' on' : '')} onClick={() => setPanel('toc')}>Índice</button>
            <button className={'btn small' + (panel === 'marks' ? ' on' : '')} onClick={() => setPanel('marks')}>
              Marcadores y notas
            </button>
          </div>
          {panel === 'toc' && doc.sections.map((s) => (
            <a key={s.id} href={`#/estudio/${docId}?s=${s.id}`} className={`l${s.level}` + (active === s.id ? ' active' : '')}>
              {bookmarks.includes(s.id) ? '★ ' : ''}{s.title}
            </a>
          ))}
          {panel === 'marks' && (
            <div>
              {[...new Set([...bookmarks, ...Object.keys(notes).filter((k) => notes[k].text.trim())])].map((id) => {
                const x = allSections.get(id);
                if (!x) return null;
                return (
                  <a key={id} href={`#/estudio/${x.doc}?s=${id}`} className="l2">
                    {bookmarks.includes(id) ? '★' : '✎'} <span className="badge">{DOC_LABEL[x.doc]}</span> {x.s.title}
                  </a>
                );
              })}
              {!bookmarks.length && !Object.values(notes).some((n) => n.text.trim()) && (
                <p className="muted">Aún no hay marcadores ni notas. Usa ☆ y ✎ junto a cada encabezado.</p>
              )}
            </div>
          )}
        </aside>
        <article className="prose">
          <h1 style={{ marginTop: 0 }}>{doc.title}</h1>
          {doc.subtitle && <p className="muted">{doc.subtitle}</p>}
          {doc.sections.map((s) => (
            <SectionView key={s.id} s={s} marked={bookmarks.includes(s.id)} note={notes[s.id]?.text ?? ''} onMark={() => toggleMark(s.id)} />
          ))}
        </article>
      </div>
    </div>
  );
}

function SectionView({ s, marked, note, onMark }: { s: Section; marked: boolean; note: string; onMark: () => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(note);
  useEffect(() => setDraft(note), [note]);
  const H = (`h${Math.min(s.level + 1, 4)}`) as 'h2';
  const save = () =>
    setSlice('notes', (n) => {
      const copy = { ...n };
      if (draft.trim()) copy[s.id] = { sectionId: s.id, text: draft, updatedAt: Date.now() };
      else delete copy[s.id];
      return copy;
    });
  return (
    <section id={s.id} className="section">
      {!s.id.endsWith('-intro') && (
        <div className="section-head">
          <H>{s.title}</H>
          <div className={'section-tools' + (marked || note ? ' has' : '')}>
            <button className={'icon-btn' + (marked ? ' on' : '')} title="Marcador" onClick={onMark}>{marked ? '★' : '☆'}</button>
            <button className={'icon-btn' + (note ? ' on' : '')} title="Nota personal" onClick={() => setOpen((o) => !o)}>✎</button>
          </div>
        </div>
      )}
      {(open || (note && !s.id.endsWith('-intro'))) && (
        <div className="note-box">
          {open ? (
            <>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Tu nota para esta sección…" autoFocus />
              <div className="row">
                <button className="btn small primary" onClick={() => { save(); setOpen(false); }}>Guardar nota</button>
                <button className="btn small" onClick={() => { setDraft(note); setOpen(false); }}>Cancelar</button>
              </div>
            </>
          ) : (
            <div className="callout warn small" onClick={() => setOpen(true)} style={{ cursor: 'pointer', whiteSpace: 'pre-wrap' }}>
              ✎ {note}
            </div>
          )}
        </div>
      )}
      <Markdown>{s.markdown}</Markdown>
    </section>
  );
}
