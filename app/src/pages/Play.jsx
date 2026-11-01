import React, { useEffect, useMemo, useState } from 'react';
import { useData, useAsync, useUniverse, href } from '../lib/hooks.js';
import { resolveKey, fmtDate, GAMES } from '../lib/data.js';
import { deckIndex, deckFile, newGame, usePlay, quit, coverKey, colorFr, PK_TYPES } from '../lib/play.js';
import { SFX } from '../lib/sfx.js';
import { toast } from '../lib/toast.js';
import { CardArt } from '../ui/Card.jsx';
import { Seg, Modal, Loading, Empty } from '../ui/Kit.jsx';
import { Emblem } from '../ui/Brand.jsx';
import Icon from '../ui/Icon.jsx';

// Jouer : choix de son deck parmi de vrais decks officiels, de l'adversaire et du mode, puis partie sur le tapis.

const SERIES_FR = { 'Sword & Shield': 'Épée et Bouclier', 'Sun & Moon': 'Soleil et Lune', 'Black & White': 'Noir et Blanc', 'Diamond & Pearl': 'Diamant et Perle', 'HeartGold & SoulSilver': 'HeartGold SoulSilver', XY: 'XY', EX: 'EX', Platinum: 'Platine', Base: 'Set de base', Gym: 'Gym', Neo: 'Neo', 'E-Card': 'e-Card', Other: 'Autres' };
export const deckTag = (m) => (m.game === 'onepiece' ? colorFr(m.color) : m.types.map((t) => PK_TYPES[t] || t).join(' / '));
const deckSub = (m) => (m.game === 'onepiece' ? 'Deck officiel recommandé · ' + fmtDate(m.date, { month: 'long', year: 'numeric' }) : 'Deck à thème · ' + m.setName);

export default function PlayPage() {
  const universe = useUniverse();
  const d = useData();
  const idx = useAsync(deckIndex, []);
  const cur = usePlay();
  const saved = cur && { game: cur.game, names: cur.pl.map((p) => p.name), turn: cur.turn, winner: cur.winner };
  const [game, setGame] = useState(universe);
  const [me, setMe] = useState(null);
  const [opp, setOpp] = useState(null);
  const [mode, setMode] = useState('solo');
  const [view, setView] = useState(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setMe(null); setOpp(null); setFilter('all'); setQ(''); }, [game]);
  const all = idx.value?.[game] || [];
  const groups = useMemo(() => {
    const c = new Map();
    for (const m of all) for (const k of game === 'onepiece' ? m.color.split('/') : [m.series]) c.set(k, (c.get(k) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [all, game]);
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return all.filter((m) => (filter === 'all' || (game === 'onepiece' ? m.color.split('/').includes(filter) : m.series === filter))
      && (!n || (m.name + ' ' + (m.title || '') + ' ' + deckTag(m) + ' ' + (m.setName || '')).toLowerCase().includes(n)));
  }, [all, filter, q, game]);
  const step = !me ? 'me' : !opp ? 'opp' : 'go';
  const choose = (m, role) => { if (role === 'me') setMe(m); else setOpp(m); setView(null); SFX.tick(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const random = () => { const pool = all.filter((m) => m.id !== me?.id); setOpp(pool[Math.floor(Math.random() * pool.length)]); SFX.tick(); };
  const start = async () => {
    setBusy(true);
    try {
      const decks = await Promise.all([deckFile(game, me.id), deckFile(game, opp.id)]);
      newGame({ game, decks, mode });
      SFX.whoosh();
      location.hash = '#/jouer/partie';
    } catch (e) { toast('Impossible de charger les decks : ' + e.message, { icon: 'info' }); }
    finally { setBusy(false); }
  };
  return (
    <div className="page play-page">
      <div className="kicker">Jouer</div>
      <h1 className="page-title">Choisis ton deck et <span className="grad">joue</span></h1>
      <p className="lead">De vrais decks officiels, un tapis de jeu et toutes tes cartes. Le site mélange, pioche, pose les Vies et les Récompenses, compte les DON!! et les dégâts : vous appliquez les règles comme à une vraie table.</p>
      {saved && (
        <section className="panel pad play-resume">
          <div><b>Partie en cours</b><small>{saved.names.join(' contre ')} · {GAMES[saved.game].label} · tour {saved.turn}{saved.winner != null ? ' · terminée' : ''}</small></div>
          <div className="row">
            <a className="btn primary" href={href('/jouer/partie')}><Icon name="play" size={17} />Reprendre</a>
            <button className="btn ghost" onClick={() => { quit(); toast('Partie abandonnée.', { icon: 'x' }); }}>Abandonner</button>
          </div>
        </section>
      )}
      <div className="play-top">
        <Seg value={game} onChange={setGame} label="Jeu" options={[['onepiece', 'One Piece'], ['pokemon', 'Pokémon']]} />
      </div>
      <section className="play-steps panel" aria-label="Ta partie">
        <PickSlot n="1" label="Ton deck" m={me} active={step === 'me'} onClear={() => { setMe(null); setOpp(null); }} />
        <PickSlot n="2" label="Ton adversaire" m={opp} active={step === 'opp'} onClear={() => setOpp(null)} extra={step === 'opp' && <button className="btn small ghost" onClick={random}><Icon name="refresh" size={15} />Au hasard</button>} />
        <div className={'play-step mode' + (step === 'go' ? ' on' : '')}>
          <span className="play-n">3</span>
          <div>
            <small>Mode de jeu</small>
            <Seg value={mode} onChange={setMode} label="Mode" size="small" options={[['solo', 'Seul'], ['duo', 'À deux']]} />
            <span className="faint small">{mode === 'solo' ? 'Tu joues les deux decks, pour les tester l’un contre l’autre.' : 'Deux joueurs sur cet appareil : chacun son tour, les mains restent cachées.'}</span>
          </div>
          <button className="btn primary big" disabled={step !== 'go' || busy} onClick={start}>{busy ? <span className="acc-spin" /> : <Icon name="play" size={18} />}Lancer la partie</button>
        </div>
      </section>
      <div className="section-head play-list-head">
        <div><div className="kicker">{step === 'opp' ? 'Étape 2' : 'Étape 1'}</div><h2>{step === 'opp' ? 'Choisis le deck adverse' : step === 'me' ? 'Choisis ton deck' : 'Les decks'}</h2></div>
        <input className="input play-search" type="search" placeholder={game === 'onepiece' ? 'Leader, couleur…' : 'Pokémon, type, extension…'} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Chercher un deck" />
      </div>
      <div className="chips scroll play-filters">
        <button className={'chip' + (filter === 'all' ? ' on' : '')} onClick={() => setFilter('all')}>Tous ({all.length})</button>
        {groups.map(([k, n]) => <button key={k} className={'chip' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>{game === 'onepiece' ? colorFr(k) : SERIES_FR[k] || k} ({n})</button>)}
      </div>
      {idx.error ? <Empty icon="info" title="Les decks n’ont pas pu être chargés">{idx.error.message}</Empty>
        : !idx.value || !d.ready ? <Loading />
        : list.length === 0 ? <Empty icon="search" title="Aucun deck">Essaie un autre filtre.</Empty>
        : (
          <div className="deck-grid">
            {list.map((m) => {
              const c = resolveKey(d.cats, coverKey(m));
              const tag = m.id === me?.id ? 'Ton deck' : m.id === opp?.id ? 'Adversaire' : null;
              return (
                <button key={m.id} type="button" className={'deck-tile ' + game + (tag ? ' picked' : '')} onClick={() => setView(m)}>
                  <span className="deck-art">{c && <CardArt card={c} tilt={false} fx={0} />}</span>
                  <span className="deck-txt">
                    <b>{m.name}</b>
                    <em>{deckTag(m)}</em>
                    <small>{game === 'onepiece' ? fmtDate(m.date, { month: 'short', year: 'numeric' }) : m.setName}</small>
                  </span>
                  {tag && <i className="deck-tag">{tag}</i>}
                </button>
              );
            })}
          </div>
        )}
      <p className="source-note">Decks One Piece : decks recommandés du site officiel (1 Leader + 50 cartes), effets en français quand ils sont traduits. Decks Pokémon : decks à thème officiels (60 cartes, textes des cartes en anglais).</p>
      <DeckModal m={view} onClose={() => setView(null)} step={step} onPick={choose} />
    </div>
  );
}

function PickSlot({ n, label, m, active, onClear, extra }) {
  const d = useData();
  const c = m && d.ready ? resolveKey(d.cats, coverKey(m)) : null;
  return (
    <div className={'play-step' + (active ? ' on' : '') + (m ? ' done' : '')}>
      <span className="play-n">{m ? <Icon name="check" size={15} stroke={3} /> : n}</span>
      {c && <span className="play-mini"><CardArt card={c} tilt={false} fx={0} /></span>}
      <div><small>{label}</small><b>{m ? m.name : active ? 'Choisis-le ci-dessous' : '—'}</b>{m && <em>{deckTag(m)}</em>}</div>
      {m && <button className="icon-btn" onClick={onClear} aria-label={'Changer ' + label.toLowerCase()}><Icon name="x" size={16} /></button>}
      {extra}
    </div>
  );
}

// Fiche d'un deck : présentation et liste des cartes
function DeckModal({ m, onClose, step, onPick }) {
  const d = useData();
  const deck = useAsync(() => (m ? deckFile(m.game, m.id) : null), [m?.id]);
  if (!m) return null;
  const cards = deck.value?.cards || [];
  const groups = m.game === 'onepiece'
    ? [['LEADER', 'Leader'], ['CHARACTER', 'Personnages'], ['EVENT', 'Événements'], ['STAGE', 'Lieux']]
    : [['Pokémon', 'Pokémon'], ['Trainer', 'Dresseurs'], ['Energy', 'Énergies']];
  return (
    <Modal open onClose={onClose} title={m.name} wide className="deck-modal">
      <p className="deck-meta"><span className="chip on">{deckTag(m)}</span><span className="muted small">{deckSub(m)}</span></p>
      {m.title && <p className="deck-catch">{m.title}</p>}
      {m.desc && <p className="muted small deck-desc">{m.desc}</p>}
      {!deck.value ? <Loading /> : groups.map(([k, l]) => {
        const g = cards.filter((c) => c.cat === k);
        if (!g.length) return null;
        return (
          <section key={k} className="deck-sec">
            <h4>{l} <small>{g.reduce((a, c) => a + c.n, 0)}</small></h4>
            <div className="deck-cards">
              {g.map((c) => { const card = resolveKey(d.cats, m.game + ':' + c.id); return <span key={c.id} className="deck-card" title={c.name}>{card && <CardArt card={card} tilt={false} fx={0} />}<i>×{c.n}</i></span>; })}
            </div>
          </section>
        );
      })}
      <div className="row deck-actions">
        {step === 'me' ? <button className="btn primary" onClick={() => onPick(m, 'me')}><Icon name="check" size={17} />Choisir ce deck</button>
          : <>
            <button className="btn primary" onClick={() => onPick(m, 'opp')}><Icon name="check" size={17} />Choisir comme adversaire</button>
            <button className="btn ghost" onClick={() => onPick(m, 'me')}>Prendre comme mon deck</button>
          </>}
        <button className="btn ghost" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}
