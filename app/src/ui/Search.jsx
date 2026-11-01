import React, { useEffect, useMemo, useRef, useState } from 'react';
import { search, normalize, pokedexList, equipageData, artwork, img } from '../lib/data.js';
import { useData, useUniverse, href, cardHref, go } from '../lib/hooks.js';
import { update } from '../lib/store.js';
import { CardArt, GameTag, Price } from './Card.jsx';
import Icon from './Icon.jsx';

// ---- Champ de recherche avec suggestions instantanées ----
export function SearchBox({ autoFocus, big, initial = '', onDone, placeholder = 'Cherche une carte…', scope }) {
  const { ready, cats, P } = useData();
  const universe = useUniverse();
  const game = scope || universe;
  const [q, setQ] = useState(initial);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(-1);
  const ref = useRef();
  const results = useMemo(() => (ready && q.trim().length >= 2 ? search(cats, q, { limit: 7, P, game }) : []), [ready, q, game]);
  useEffect(() => setSel(-1), [q]);
  useEffect(() => {
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', f); return () => document.removeEventListener('pointerdown', f);
  }, []);
  const all = () => go('/recherche?q=' + encodeURIComponent(q.trim()) + (game !== 'all' ? '&u=' + game : ''));
  const submit = (e) => {
    e?.preventDefault();
    if (open && sel >= 0 && results[sel]) go('/carte/' + encodeURIComponent(results[sel].key));
    else if (q.trim()) all();
    setOpen(false); onDone?.();
  };
  return (
    <form className={'searchbox' + (big ? ' big' : '')} onSubmit={submit} ref={ref} role="search">
      <Icon name="search" size={big ? 22 : 18} />
      <input
        value={q} autoFocus={autoFocus} placeholder={placeholder} aria-label="Rechercher une carte"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(-1, s - 1)); }
          if (e.key === 'Escape') setOpen(false);
        }}
        enterKeyHint="search" autoComplete="off" spellCheck="false"
      />
      {q && <button type="button" className="clear" onClick={() => setQ('')} aria-label="Effacer"><Icon name="x" size={16} /></button>}
      <button type="submit" className="btn primary go" aria-label="Chercher"><Icon name="arrow" size={18} /></button>
      {open && results.length > 0 && (
        <ul className="suggest" role="listbox">
          {results.map((c, i) => (
            <li key={c.key} role="option" aria-selected={i === sel}>
              <a href={cardHref(c)} className={i === sel ? 'on' : ''} onMouseEnter={() => setSel(i)} onClick={() => { setOpen(false); onDone?.(); }}>
                <CardArt card={c} className="mini" tilt={false} fx={0} />
                <span className="s-name">{c.name}<small><GameTag game={c.game} /> {c.number}{c.variant ? ' · ' + c.variant : ''} · {cats[c.game].sets.get(c.set)?.name}</small></span>
                <Price card={c} />
              </a>
            </li>
          ))}
          <li><a href={href('/recherche?q=' + encodeURIComponent(q) + (game !== 'all' ? '&u=' + game : ''))} className="all" onClick={() => { setOpen(false); onDone?.(); }}>Voir tous les résultats pour « {q} » <Icon name="arrow" size={14} /></a></li>
        </ul>
      )}
    </form>
  );
}

// ---- Palette de commandes (⌘K, Ctrl+K ou /) : cartes, extensions, Pokémon, personnages et pages ----
let extras = null;
function loadExtras() {
  extras ??= Promise.all([pokedexList().catch(() => null), equipageData().catch(() => null)]).then(([dex, crew]) => ({
    dex: dex ? dex.species.map(([id, fr, en]) => ({ id, fr, en, q: normalize(fr + ' ' + en + ' ' + id) })) : [],
    crew: crew ? crew.members.map(([slug, name, , , , , image]) => ({ slug, name, image, q: normalize(name) })) : [],
  }));
  return extras;
}

const PAGES = [
  ['Accueil One Piece', '/op', 'home', 'onepiece'], ['Accueil Pokémon', '/pk', 'home', 'pokemon'],
  ['Changer d’univers', '/', 'swap'], ['Le marché du jour', '/marche', 'market'], ['Top 100 des cartes les plus chères', '/classement', 'trophy'],
  ['Extensions', '/extensions', 'sets'], ['Ouvrir un booster', '/boosters', 'pack'], ['Ma collection', '/collection', 'album'],
  ['Scanner une carte', '/scanner', 'scan'], ['Comparateur de prix', '/comparateur', 'compare'], ['Mes alertes de prix', '/suivis', 'bell'],
  ['Pokédex', '/pokedex', 'dex', 'pokemon'], ['L’équipage', '/equipage', 'crew', 'onepiece'], ['Boutique', '/boutique', 'coin'],
  ['Succès', '/succes', 'trophy'], ['Réglages et sauvegarde', '/reglages', 'gear'], ['Mon compte', '/compte', 'user'], ['Ma liste de souhaits', '/souhaits', 'heart'], ['Les plus belles collections', '/collectionneurs', 'trophy'], ['Jouer avec de vrais decks', '/jouer', 'play'],
];

export function CommandPalette({ open, onClose }) {
  const d = useData();
  const universe = useUniverse();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [ex, setEx] = useState(null);
  const [scope, setScope] = useState('all');
  const list = useRef();
  useEffect(() => { if (open) { setQ(''); setSel(0); loadExtras().then(setEx); } }, [open]);
  useEffect(() => setSel(0), [q, scope]);
  const items = useMemo(() => {
    const t = normalize(q);
    const out = [];
    const pages = PAGES.filter(([l, , , g]) => (!g || scope === 'all' || g === scope) && (!t || normalize(l).includes(t))).slice(0, t ? 4 : 8);
    if (!t) return pages.map(([l, to, icon]) => ({ kind: 'page', label: l, to, icon }));
    if (d.ready && t.length >= 2) {
      // cartes de l'univers courant d'abord
      const cards = search(d.cats, q, { limit: 8, P: d.P, game: scope });
      cards.sort((a, b) => (a.game === universe ? 0 : 1) - (b.game === universe ? 0 : 1));
      for (const c of cards) out.push({ kind: 'card', c, to: '/carte/' + encodeURIComponent(c.key) });
      const sets = [];
      for (const g of Object.keys(d.cats)) { if (scope !== 'all' && g !== scope) continue; for (const s of d.cats[g].setList) if (normalize(s.name + ' ' + s.code).includes(t)) sets.push(s); }
      for (const s of sets.slice(0, 4)) out.push({ kind: 'set', s, to: '/extension/' + s.game + '/' + encodeURIComponent(s.code) });
    }
    if (ex && t.length >= 2) {
      if (scope !== 'onepiece') for (const p of ex.dex.filter((x) => x.q.includes(t)).slice(0, 4)) out.push({ kind: 'mon', p, to: '/pokedex/' + p.id });
      if (scope !== 'pokemon') for (const m of ex.crew.filter((x) => x.q.includes(t)).slice(0, 4)) out.push({ kind: 'crew', m, to: '/equipage/' + m.slug });
    }
    for (const [l, to, icon] of pages) out.push({ kind: 'page', label: l, to, icon });
    if (t.length >= 2) out.push({ kind: 'all', label: `Tous les résultats pour « ${q} »`, to: '/recherche?q=' + encodeURIComponent(q) + (scope !== 'all' ? '&u=' + scope : ''), icon: 'search' });
    return out;
  }, [q, d.ready, d.v, ex, scope]);
  useEffect(() => { list.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  if (!open) return null;
  const choose = (it) => { if (!it) return; if (it.to === '/') update((s) => { s.universe = null; }); go(it.to); onClose(); };
  let lastKind = null;
  const heads = { card: 'Cartes', set: 'Extensions', mon: 'Pokédex', crew: 'Équipage', page: 'Pages', all: '' };
  return (
    <div className="palette-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Recherche rapide">
        <div className="pal-input">
          <Icon name="search" size={20} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Carte, extension, Pokémon, personnage, page…" aria-label="Recherche rapide"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
              if (e.key === 'Enter') { e.preventDefault(); choose(items[sel]); }
              if (e.key === 'Escape') onClose();
            }} spellCheck="false" autoComplete="off" />
          <kbd>Échap</kbd>
        </div>
        <div className="pal-scope">
          {[['all', 'Tout'], ['onepiece', 'One Piece'], ['pokemon', 'Pokémon']].map(([v, l]) => <button key={v} className={scope === v ? 'on' : ''} onClick={() => setScope(v)}>{l}</button>)}
        </div>
        <ul className="pal-list" ref={list} role="listbox">
          {items.map((it, i) => {
            const head = it.kind !== lastKind && heads[it.kind] ? <li className="pal-head" key={'h' + i}>{heads[it.kind]}</li> : null;
            lastKind = it.kind;
            const cls = i === sel ? 'on' : '';
            let body;
            if (it.kind === 'card') body = <><CardArt card={it.c} className="mini" tilt={false} fx={0} /><span className="pal-txt">{it.c.name}<small><GameTag game={it.c.game} /> {it.c.number}{it.c.variant ? ' · ' + it.c.variant : ''} · {d.cats[it.c.game].sets.get(it.c.set)?.name}</small></span><Price card={it.c} /></>;
            else if (it.kind === 'set') body = <><span className="pal-ico"><Icon name="sets" /></span><span className="pal-txt">{it.s.name}<small><GameTag game={it.s.game} /> {it.s.code} · {it.s.count} cartes</small></span></>;
            else if (it.kind === 'mon') body = <><img className="pal-mon" src={artwork(it.p.id)} alt="" loading="lazy" referrerPolicy="no-referrer" /><span className="pal-txt">{it.p.fr}<small>Pokédex · n° {String(it.p.id).padStart(4, '0')}{it.p.en !== it.p.fr ? ' · ' + it.p.en : ''}</small></span></>;
            else if (it.kind === 'crew') body = <><img className="pal-crew" src={img('@o/' + it.m.image + '.jpg')} alt="" loading="lazy" referrerPolicy="no-referrer" /><span className="pal-txt">{it.m.name}<small>L’équipage · One Piece</small></span></>;
            else body = <><span className="pal-ico"><Icon name={it.icon} /></span><span className="pal-txt">{it.label}</span><Icon name="arrow" size={16} /></>;
            return <React.Fragment key={i}>{head}<li role="option" aria-selected={i === sel}><a href={href(it.to)} className={cls} onMouseMove={() => setSel(i)} onClick={(e) => { e.preventDefault(); choose(it); }}>{body}</a></li></React.Fragment>;
          })}
          {q.trim().length >= 2 && items.filter((x) => x.kind !== 'page' && x.kind !== 'all').length === 0 && <li className="pal-empty">Aucun résultat. Essaie un nom anglais ou français, ou un numéro comme OP01-120.</li>}
        </ul>
        <div className="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> naviguer</span><span><kbd>Entrée</kbd> ouvrir</span><span><kbd>Ctrl</kbd><kbd>K</kbd> ouvrir la recherche</span></div>
      </div>
    </div>
  );
}
