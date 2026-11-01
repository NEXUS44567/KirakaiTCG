import React, { useEffect, useMemo, useState } from 'react';
import { useData, href } from '../lib/hooks.js';
import { resolveKey } from '../lib/data.js';
import { usePlay, getPlay, act, A, undo, canUndo, quit, newGame, loadDefs, deckFile, zoneOf, coin, dice, colorFr, PK_TYPES, PK_COND, ZONES, LIMIT, TRASH } from '../lib/play.js';
import { SFX } from '../lib/sfx.js';
import { CardArt } from '../ui/Card.jsx';
import { Modal, Loading, Empty } from '../ui/Kit.jsx';
import { LogoMark } from '../ui/Brand.jsx';
import Icon from '../ui/Icon.jsx';

// Tapis de jeu (bac à sable) : toucher une carte ou une pile ouvre ses actions.

export default function GamePage() {
  const s = usePlay();
  const d = useData();
  const [defs, setDefs] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { setDefs(null); if (s) loadDefs(s).then(setDefs, (e) => setErr(e.message)); }, [s?.startedAt]);
  if (!s) return <div className="page"><Empty icon="play" title="Aucune partie en cours" action={<a className="btn primary" href={href('/jouer')}>Choisir mes decks</a>}>Choisis ton deck et celui de ton adversaire pour lancer une partie.</Empty></div>;
  if (err) return <div className="page"><Empty icon="info" title="Les decks n’ont pas pu être chargés" action={<a className="btn primary" href={href('/jouer')}>Retour</a>}>{err}</Empty></div>;
  if (!defs || !d.ready) return <div className="page"><Loading label="Préparation du tapis…" /></div>;
  return <Board s={s} defs={defs} />;
}

const ENERGY_TYPE = { Grass: 'Grass', Fire: 'Fire', Water: 'Water', Lightning: 'Lightning', Psychic: 'Psychic', Fighting: 'Fighting', Darkness: 'Darkness', Metal: 'Metal', Fairy: 'Fairy' };
const energyOf = (def) => (def?.cat === 'Energy' ? Object.keys(ENERGY_TYPE).find((t) => def.name.startsWith(t)) || 'Colorless' : null);

function Board({ s, defs }) {
  const d = useData();
  const G = s.game, op = G === 'onepiece';
  const [ready, setReady] = useState(() => (s.phase === 'mulligan' ? s.pl.findIndex((x) => !x.kept) : s.cur)); // en mode à deux : joueur qui a l'appareil
  const [sheet, setSheet] = useState(null); // { uid } ou { p, zone }
  const [target, setTarget] = useState(null); // { kind, uid, label, valid }
  const [look, setLook] = useState(null); // { p, n } cartes du dessus du deck
  const [pile, setPile] = useState(null); // { p, zone } défausse, deck entier
  const [showLog, setShowLog] = useState(false);
  const [menu, setMenu] = useState(false);
  const [toss, setToss] = useState(null);
  const deciding = s.phase === 'mulligan' ? s.pl.findIndex((x) => !x.kept) : s.cur;
  const duo = s.mode === 'duo';
  const handoff = duo && ready !== deciding && s.winner == null;
  const me = duo ? (handoff ? 1 - deciding : deciding) : deciding;
  const C = s.cards;
  const def = (uid) => defs[C[uid]?.p]?.[C[uid]?.id];
  const card = (uid) => resolveKey(d.cats, G + ':' + C[uid]?.id);
  const nm = (uid) => def(uid)?.name || 'une carte';
  const run = (fn, ...a) => { act(fn, ...a); SFX.flip(); };
  const visibleHand = (p) => (duo ? p === me && !handoff : p === me || s.peek);
  const open = (x) => { if (target) return; setSheet(x); };
  const pickTarget = (uid) => {
    if (!target || !target.valid(uid)) return;
    if (target.kind === 'attach') run(A.attach, target.uid, uid, nm(target.uid), nm(uid));
    if (target.kind === 'evolve') run(A.evolve, target.uid, uid, nm(target.uid), nm(uid));
    if (target.kind === 'swap') run(A.swap, target.uid, uid);
    if (target.kind === 'don') run(A.donGive, uid, nm(uid));
    if (target.kind === 'move') run(A.move, target.uid, zoneOf(getPlay(), uid), {}, nm(target.uid));
    setTarget(null);
  };
  const flipCoin = () => { const r = coin(); setToss({ kind: 'coin', r, k: Date.now() }); act(A.coin, s.cur, r === 'pile' ? 'pile' : 'face'); SFX.coin(); };
  const rollDice = () => { const r = dice(); setToss({ kind: 'dice', r, k: Date.now() }); act(A.dice, s.cur, r); SFX.tick(); };
  useEffect(() => { if (!toss) return; const t = setTimeout(() => setToss(null), 1800); return () => clearTimeout(t); }, [toss]);
  const ctx = { s, defs, d, def, card, nm, run, open, target, pickTarget, me, op, visibleHand };
  const P = s.pl;
  const finished = s.winner != null;
  return (
    <div className={'play-board g-' + G + (target ? ' targeting' : '')}>
      <Side p={1 - me} top ctx={ctx} />
      <div className="pb-bar">
        <div className="pb-turn">
          <b>Tour {s.turn}</b>
          <small>{s.phase === 'mulligan' ? 'Mains de départ' : `À ${P[s.cur].label} (${P[s.cur].name})`}</small>
        </div>
        <div className="pb-tools">
          <button className="icon-btn" onClick={flipCoin} aria-label="Pile ou face" title="Pile ou face"><Icon name="coin" size={19} /></button>
          <button className="icon-btn" onClick={rollDice} aria-label="Lancer un dé" title="Lancer un dé"><Icon name="box" size={19} /></button>
          <button className="icon-btn" onClick={() => { undo(); SFX.tick(); }} disabled={!canUndo()} aria-label="Annuler la dernière action" title="Annuler"><Icon name="rotate" size={19} /></button>
          <button className="icon-btn" onClick={() => setShowLog(true)} aria-label="Journal de la partie" title="Journal"><Icon name="list" size={19} /></button>
          <button className="icon-btn" onClick={() => setMenu(true)} aria-label="Menu de la partie" title="Menu"><Icon name="menu" size={19} /></button>
        </div>
        {s.phase === 'play' && !finished && <button className="btn primary small pb-end" onClick={() => { act(A.end); SFX.whoosh(); setTarget(null); }}>Fin du tour<Icon name="right" size={15} /></button>}
      </div>
      <Side p={me} ctx={ctx} />
      <Hand p={me} ctx={ctx} />
      {target && <div className="pb-target" role="status"><Icon name="arrow" size={17} /><span>{target.hint}</span><button className="btn small ghost" onClick={() => setTarget(null)}>Annuler</button></div>}
      {toss && <div className="pb-toss" key={toss.k}><span className={toss.kind}>{toss.kind === 'coin' ? (toss.r === 'pile' ? 'Pile' : 'Face') : toss.r}</span></div>}
      {s.phase === 'mulligan' && !handoff && <Mulligan p={deciding} ctx={ctx} />}
      {handoff && <div className="pb-handoff"><div className="panel pad"><LogoMark size={44} /><h2>Au tour de {P[deciding].label}</h2><p className="muted">Passe l’appareil à {P[deciding].label} ({P[deciding].name}). Sa main reste cachée jusque-là.</p><button className="btn primary big" onClick={() => setReady(deciding)}>C’est moi, je joue</button></div></div>}
      {finished && <div className="pb-handoff win"><div className="panel pad"><Icon name="trophy" size={44} /><h2>{P[s.winner].label} gagne !</h2><p className="muted">{P[s.winner].name} remporte la partie au tour {s.turn}.</p><div className="row"><button className="btn primary" onClick={() => replay(s)}><Icon name="refresh" size={17} />Rejouer</button><a className="btn ghost" href={href('/jouer')} onClick={() => quit()}>Autres decks</a></div></div></div>}
      <CardSheet x={sheet} close={() => setSheet(null)} ctx={ctx} setTarget={setTarget} setLook={setLook} setPile={setPile} />
      <LookSheet x={look} close={() => setLook(null)} ctx={ctx} />
      <PileSheet x={pile} close={() => setPile(null)} ctx={ctx} />
      <Modal open={showLog} onClose={() => setShowLog(false)} title="Journal de la partie">
        <ol className="pb-log">{[...s.log].reverse().map(([t, p, m], i) => <li key={i} className={'p' + p}><time>{new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time>{m}</li>)}</ol>
      </Modal>
      <Modal open={menu} onClose={() => setMenu(false)} title="Partie">
        <div className="pb-menu">
          <button className="btn ghost" onClick={() => { act(A.auto); }}><Icon name={s.auto ? 'check' : 'x'} size={17} />Début de tour automatique : {s.auto ? 'oui' : 'non'}</button>
          <p className="faint small">{op ? 'Au début de chaque tour : les cartes et les DON!! se redressent, le joueur pioche 1 carte et reçoit 2 DON!! (1 seul au tout premier tour, sans pioche).' : 'Au début de chaque tour, le joueur pioche 1 carte.'}</p>
          {!duo && <button className="btn ghost" onClick={() => act(A.peek)}><Icon name={s.peek ? 'eyeoff' : 'eye'} size={17} />{s.peek ? 'Cacher la main adverse' : 'Voir la main adverse'}</button>}
          {!finished && P.map((x, i) => <button key={i} className="btn ghost" onClick={() => { act(A.win, i); setMenu(false); }}><Icon name="trophy" size={17} />Déclarer la victoire de {x.label}</button>)}
          <button className="btn ghost" onClick={() => { replay(s); setMenu(false); }}><Icon name="refresh" size={17} />Recommencer avec les mêmes decks</button>
          <a className="btn ghost" href={href('/jouer')} onClick={() => quit()}><Icon name="x" size={17} />Quitter la partie</a>
        </div>
      </Modal>
    </div>
  );
}

async function replay(s) {
  const decks = await Promise.all(s.pl.map((p) => deckFile(s.game, p.deck)));
  newGame({ game: s.game, decks, mode: s.mode });
  SFX.whoosh();
}

// ---------- Une moitié du tapis ----------
function Side({ p, top, ctx }) {
  const { s, op } = ctx;
  const pl = s.pl[p];
  const cls = 'pb-side' + (top ? ' top' : ' me') + (s.cur === p ? ' cur' : '');
  if (op) return (
    <section className={cls} aria-label={pl.label}>
      <div className="pb-who"><b>{pl.label}</b><span>{pl.name}</span><em>{pl.z.hand.length} en main</em></div>
      <div className="pb-row chars">{Array.from({ length: LIMIT.chars }, (_, i) => <Spot key={i} uid={pl.z.chars[i]} p={p} zone="chars" ctx={ctx} />)}</div>
      <div className="pb-row mid">
        <Pile p={p} zone="life" label="Vie" ctx={ctx} />
        <Spot uid={pl.z.stage[0]} p={p} zone="stage" ctx={ctx} label="Lieu" />
        <Spot uid={pl.z.leader[0]} p={p} zone="leader" ctx={ctx} big />
        <Pile p={p} zone="deck" label="Deck" ctx={ctx} />
        <Pile p={p} zone="trash" label="Défausse" ctx={ctx} />
      </div>
      <Don p={p} ctx={ctx} />
    </section>
  );
  return (
    <section className={cls} aria-label={pl.label}>
      <div className="pb-who"><b>{pl.label}</b><span>{pl.name}</span><em>{pl.z.hand.length} en main</em></div>
      <div className="pb-row mid">
        <Pile p={p} zone="prizes" label="Récompenses" ctx={ctx} />
        <Spot uid={pl.z.stadium[0]} p={p} zone="stadium" ctx={ctx} label="Stade" />
        <Spot uid={pl.z.active[0]} p={p} zone="active" ctx={ctx} big label="Actif" />
        <Pile p={p} zone="deck" label="Deck" ctx={ctx} />
        <Pile p={p} zone="discard" label="Défausse" ctx={ctx} />
      </div>
      <div className="pb-row bench">{Array.from({ length: LIMIT.bench }, (_, i) => <Spot key={i} uid={pl.z.bench[i]} p={p} zone="bench" ctx={ctx} />)}</div>
    </section>
  );
}

// Une carte posée (ou un emplacement vide)
function Spot({ uid, p, zone, ctx, big, label }) {
  const { s, def, card, open, target, pickTarget, op } = ctx;
  if (!uid) return <div className={'pb-spot empty' + (big ? ' big' : '')}><span>{label || ''}</span></div>;
  const c = s.cards[uid], df = def(uid);
  const valid = target?.valid(uid);
  const pow = op && df?.power != null ? df.power + c.don * 1000 + c.pow : null;
  const att = c.att.map((a) => s.cards[a]);
  const hp = !op && df?.hp ? df.hp : null;
  return (
    <button type="button" className={'pb-spot' + (big ? ' big' : '') + (c.rest ? ' rested' : '') + (valid ? ' valid' : '') + (target && !valid ? ' dim' : '')} onClick={() => (target ? pickTarget(uid) : open({ uid }))} aria-label={(df?.name || 'Carte') + (c.rest ? ' (inclinée)' : '')}>
      <span className="pb-card">{c.up ? <CardArt card={card(uid)} tilt={false} fx={0} /> : <Back game={s.game} />}</span>
      {op && c.don > 0 && <i className="pb-don">+{c.don}</i>}
      {pow != null && (zone === 'chars' || zone === 'leader') && <i className={'pb-pow' + (c.don || c.pow ? ' up' : '')}>{pow}</i>}
      {!op && c.dmg > 0 && <i className="pb-dmg">{c.dmg}</i>}
      {hp && (zone === 'active' || zone === 'bench') && <i className={'pb-hp' + (c.dmg >= hp ? ' ko' : '')}>{Math.max(0, hp - c.dmg)}/{hp}</i>}
      {!op && att.length > 0 && <span className="pb-att">{att.map((a) => { const e = energyOf(ctx.defs[a.p][a.id]); return <i key={a.uid} className={'e-' + (e || 'tool')} title={ctx.defs[a.p][a.id]?.name} />; })}</span>}
      {!op && c.cond.length > 0 && <span className="pb-cond">{c.cond.map((k) => <i key={k}>{PK_COND[k].slice(0, 3)}</i>)}</span>}
    </button>
  );
}

const Back = ({ game }) => <span className={'pb-back ' + game}><LogoMark size={22} /></span>;

// Pile : deck, défausse, vies, récompenses
function Pile({ p, zone, label, ctx }) {
  const { s, card, open, target } = ctx;
  const list = s.pl[p].z[zone];
  const topUp = list[0] && s.cards[list[0]].up;
  return (
    <button type="button" className={'pb-pile z-' + zone + (list.length ? '' : ' empty') + (target ? ' dim' : '')} onClick={() => !target && open({ p, zone })} aria-label={`${label} : ${list.length} carte${list.length > 1 ? 's' : ''}`}>
      <span className="pb-card">{list.length ? (topUp ? <CardArt card={card(list[0])} tilt={false} fx={0} /> : <Back game={s.game} />) : null}</span>
      <em>{list.length}</em>
      <small>{label}</small>
    </button>
  );
}

// One Piece : zone de coût (DON!!)
function Don({ p, ctx }) {
  const { s, run, target } = ctx;
  const d = s.pl[p].don;
  return (
    <div className={'pb-donrow' + (target ? ' dim' : '')}>
      <span className="pb-dons" aria-label={`DON!! : ${d.active} actifs, ${d.rested} inclinés, ${d.deck} dans le deck DON!!`}>
        {Array.from({ length: d.active }, (_, i) => <i key={'a' + i} className="don" />)}
        {Array.from({ length: d.rested }, (_, i) => <i key={'r' + i} className="don rested" />)}
      </span>
      <small>{d.active} actif{d.active > 1 ? 's' : ''} · {d.rested} incliné{d.rested > 1 ? 's' : ''} · deck {d.deck}</small>
      <span className="pb-donbtn">
        <button className="btn small ghost" onClick={() => run(A.donDraw, p, 1)} disabled={!d.deck}>+1</button>
        <button className="btn small ghost" onClick={() => run(A.donRest, p, 1)} disabled={!d.active}>Incliner</button>
        <button className="btn small ghost" onClick={() => run(A.donStand, p)} disabled={!d.rested}>Redresser</button>
      </span>
    </div>
  );
}

// Main du joueur (cachée pour l'adversaire)
function Hand({ p, ctx }) {
  const { s, card, open, visibleHand, target } = ctx;
  const list = s.pl[p].z.hand;
  const show = visibleHand(p);
  return (
    <div className={'pb-hand' + (target ? ' dim' : '')} aria-label={'Main de ' + s.pl[p].label}>
      {list.length === 0 && <span className="faint small">Main vide</span>}
      {list.map((u) => <button key={u} type="button" className="pb-hcard" onClick={() => show && !target && open({ uid: u })} aria-label={show ? ctx.nm(u) : 'Carte cachée'}><span className="pb-card">{show ? <CardArt card={card(u)} tilt={false} fx={0} /> : <Back game={s.game} />}</span></button>)}
    </div>
  );
}

// ---------- Mains de départ ----------
function Mulligan({ p, ctx }) {
  const { s, def, card, op } = ctx;
  const pl = s.pl[p];
  const basics = pl.z.hand.filter((u) => def(u)?.cat === 'Pokémon' && def(u)?.sub?.includes('Basic')).length;
  const other = s.pl[1 - p];
  return (
    <div className="pb-handoff">
      <div className="panel pad pb-mull">
        <h2>{pl.label} : ta main de départ</h2>
        <p className="muted small">{op ? 'Tu peux la garder, ou la remélanger dans ton deck et piocher 5 nouvelles cartes (une seule fois).' : basics ? 'Garde ta main si elle te convient. Tu poseras ton Pokémon actif et ton banc dès le début de la partie.' : 'Aucun Pokémon de base : remélange ta main et pioche 7 nouvelles cartes. Ton adversaire pourra piocher 1 carte de plus par mulligan.'}</p>
        {!op && other.mull > 0 && <p className="notice">{other.label} a fait {other.mull} mulligan{other.mull > 1 ? 's' : ''} : tu peux piocher jusqu’à {other.mull} carte{other.mull > 1 ? 's' : ''} de plus (deck → Piocher).</p>}
        <div className="pb-mhand">{pl.z.hand.map((u) => <span key={u} className="pb-card"><CardArt card={card(u)} tilt={false} fx={0} /></span>)}</div>
        <div className="row">
          {(op || basics > 0) && <button className="btn primary" onClick={() => act(A.keep, p)}><Icon name="check" size={17} />Garder</button>}
          {(op ? !pl.mull : true) && <button className={'btn ' + (!op && !basics ? 'primary' : 'ghost')} onClick={() => { act(A.mulligan, p); SFX.whoosh(); }}><Icon name="refresh" size={17} />Mulligan</button>}
        </div>
      </div>
    </div>
  );
}

// ---------- Actions sur une carte ou une pile ----------
function CardSheet({ x, close, ctx, setTarget, setLook, setPile }) {
  const { s, def, card, nm, run, op } = ctx;
  if (!x) return null;
  if (x.zone) return <PileActions x={x} close={close} ctx={ctx} setLook={setLook} setPile={setPile} />;
  const c = s.cards[x.uid];
  if (!c) return null;
  const df = def(x.uid) || {};
  const zone = zoneOf(s, x.uid);
  const pl = s.pl[c.p], z = pl.z;
  const L = nm(x.uid);
  const go = (fn, ...a) => { run(fn, ...a); close(); };
  const aim = (kind, hint, valid) => { setTarget({ kind, uid: x.uid, label: L, hint, valid }); close(); };
  const mine = (u) => s.cards[u]?.p === c.p;
  const inPlay = (u) => ['active', 'bench'].includes(zoneOf(getPlay(), u));
  const btns = [];
  const B = (k, icon, label, fn, dis) => btns.push(<button key={k} className="btn ghost" onClick={fn} disabled={dis}><Icon name={icon} size={16} />{label}</button>);
  const T = TRASH[s.game];
  if (zone === 'hand') {
    if (op) {
      if (df.cat === 'CHARACTER') B('play', 'plus', z.chars.length >= 5 ? 'Terrain plein (5 personnages)' : 'Jouer sur le terrain', () => go(A.move, x.uid, 'chars', {}, L), z.chars.length >= 5);
      if (df.cat === 'STAGE') B('stage', 'plus', 'Jouer en Lieu', () => go(A.move, x.uid, 'stage', {}, L), z.stage.length >= 1);
      if (df.cat === 'EVENT') B('event', 'bolt', 'Jouer l’événement (défausse)', () => go(A.move, x.uid, T, {}, L));
      if (df.counter) B('counter', 'bolt', `Contrer (+${df.counter}, défausse)`, () => go(A.move, x.uid, T, {}, L));
      B('life', 'heart', 'Ajouter à ses Vies (face cachée)', () => go(A.move, x.uid, 'life', {}, L));
    } else {
      const basic = df.cat === 'Pokémon' && df.sub?.includes('Basic');
      if (basic) { B('active', 'plus', 'Mettre en Pokémon actif', () => go(A.move, x.uid, 'active', {}, L), z.active.length >= 1); B('bench', 'plus', z.bench.length >= 5 ? 'Banc plein' : 'Mettre sur le banc', () => go(A.move, x.uid, 'bench', {}, L), z.bench.length >= 5); }
      if (df.cat === 'Pokémon' && !basic) {
        const match = (u) => mine(u) && inPlay(u) && def(u)?.name === df.evolvesFrom;
        const any = [...z.active, ...z.bench].some(match);
        B('evolve', 'up', `Faire évoluer ${df.evolvesFrom || 'un Pokémon'}`, () => aim('evolve', `Touche ${df.evolvesFrom || 'le Pokémon'} à faire évoluer`, any ? match : (u) => mine(u) && inPlay(u)));
      }
      if (df.cat === 'Energy') B('attach', 'bolt', 'Attacher à un Pokémon', () => aim('attach', 'Touche le Pokémon qui reçoit l’énergie', (u) => mine(u) && inPlay(u)));
      if (df.cat === 'Trainer' && df.sub?.includes('Pokémon Tool')) B('tool', 'bolt', 'Attacher à un Pokémon', () => aim('attach', 'Touche le Pokémon qui reçoit l’outil', (u) => mine(u) && inPlay(u)));
      if (df.cat === 'Trainer' && df.sub?.includes('Stadium')) B('stadium', 'plus', 'Jouer en Stade', () => go(A.move, x.uid, 'stadium', {}, L), z.stadium.length >= 1);
      if (df.cat === 'Trainer' && !df.sub?.includes('Stadium') && !df.sub?.includes('Pokémon Tool')) B('trainer', 'bolt', 'Jouer la carte (défausse)', () => go(A.move, x.uid, T, {}, L));
    }
    B('trash', 'trash', 'Défausser', () => go(A.move, x.uid, T, {}, L));
    B('top', 'up', 'Remettre sur le deck', () => go(A.move, x.uid, 'deck', { place: 'top' }, L));
    B('bottom', 'down', 'Remettre sous le deck', () => go(A.move, x.uid, 'deck', { place: 'bottom' }, L));
  } else if (zone) {
    if (op) {
      B('rest', 'rotate', c.rest ? 'Redresser' : 'Incliner (attaquer, activer)', () => go(A.rest, x.uid, L));
      if (zone !== 'stage') {
        B('don', 'plus', 'Donner 1 DON!!', () => go(A.donGive, x.uid, L), !pl.don.active);
        B('undon', 'minus', 'Retirer 1 DON!!', () => go(A.donTake, x.uid, L), !c.don);
        B('p+', 'up', '+1000 puissance (ce tour)', () => go(A.power, x.uid, 1000, L));
        B('p-', 'down', '−1000 puissance', () => go(A.power, x.uid, -1000, L));
      }
      if (zone !== 'leader') B('ko', 'trash', zone === 'chars' ? 'K.O. (défausse)' : 'Défausser', () => go(A.ko, x.uid, L));
    } else {
      [[10, '+10'], [30, '+30'], [50, '+50'], [-10, '−10']].forEach(([v, l]) => B('d' + v, v > 0 ? 'plus' : 'minus', l + ' dégâts', () => go(A.dmg, x.uid, v, L), v < 0 && !c.dmg));
      if (zone === 'active') {
        B('swap', 'swap', 'Retraite / échanger avec le banc', () => aim('swap', 'Touche le Pokémon du banc qui monte en actif', (u) => mine(u) && zoneOf(getPlay(), u) === 'bench'), !z.bench.length);
        Object.entries(PK_COND).forEach(([k, l]) => B(k, c.cond.includes(k) ? 'check' : 'info', (c.cond.includes(k) ? 'Retirer : ' : '') + l, () => go(A.cond, x.uid, k, L)));
      }
      if (zone === 'bench') B('up', 'up', 'Monter en Pokémon actif', () => (z.active.length ? go(A.swap, z.active[0], x.uid) : go(A.move, x.uid, 'active', {}, L)));
      if (zone !== 'stadium') B('ko', 'trash', 'K.O. (défausse avec ses cartes)', () => go(A.ko, x.uid, L)); else B('ko', 'trash', 'Défausser le Stade', () => go(A.move, x.uid, T, {}, L));
    }
    B('hand', 'hand', 'Reprendre en main', () => go(A.move, x.uid, 'hand', {}, L));
    B('top', 'up', 'Remettre sur le deck', () => go(A.move, x.uid, 'deck', { place: 'top' }, L));
    B('bottom', 'down', 'Remettre sous le deck', () => go(A.move, x.uid, 'deck', { place: 'bottom' }, L));
  } else {
    B('detach', 'trash', 'Défausser cette carte attachée', () => go(A.detach, x.uid, L));
  }
  const att = c.att || [];
  return (
    <Modal open onClose={close} title={L} wide className="pb-sheet">
      <div className="pb-sheet-in">
        <div className="pb-sheet-art">{c.up || zone === 'hand' ? <CardArt card={card(x.uid)} size="large" tilt={false} /> : <Back game={s.game} />}</div>
        <div className="pb-sheet-txt">
          <CardText df={df} op={op} />
          {att.length > 0 && <div className="pb-attlist"><h4>Cartes attachées</h4>{att.map((a) => <div key={a}><span>{nm(a)}</span><button className="btn small ghost" onClick={() => go(A.detach, a, nm(a))}>Défausser</button></div>)}</div>}
          <div className="pb-actions">{btns}</div>
        </div>
      </div>
    </Modal>
  );
}

function CardText({ df, op }) {
  if (op) return (
    <div className="pb-ctext">
      <p className="pb-stats">
        {df.cat && <span>{{ LEADER: 'Leader', CHARACTER: 'Personnage', EVENT: 'Événement', STAGE: 'Lieu' }[df.cat] || df.cat}</span>}
        {df.life != null && <span>Vie {df.life}</span>}
        {df.cost != null && <span>Coût {df.cost}</span>}
        {df.power != null && <span>Puissance {df.power}</span>}
        {df.counter ? <span>Contre +{df.counter}</span> : null}
        {df.color && <span>{colorFr(df.color)}</span>}
      </p>
      {df.types && <p className="faint small">{df.types}</p>}
      {df.text && <p className="pb-effect">{df.text}</p>}
      {df.trigger && <p className="pb-effect trig"><b>Déclenchement</b> {df.trigger.replace(/^\[[^\]]+\]\s*/, '')}</p>}
    </div>
  );
  return (
    <div className="pb-ctext">
      <p className="pb-stats">
        <span>{df.cat === 'Pokémon' ? (df.sub || []).join(' · ') : df.cat === 'Trainer' ? 'Dresseur' + (df.sub?.length ? ' · ' + df.sub.join(' · ') : '') : 'Énergie'}</span>
        {df.hp ? <span>{df.hp} PV</span> : null}
        {(df.types || []).map((t) => <span key={t}>{PK_TYPES[t] || t}</span>)}
        {df.evolvesFrom && <span>Évolue de {df.evolvesFrom}</span>}
      </p>
      {(df.abilities || []).map((a) => <p key={a.name} className="pb-effect"><b>{a.type || 'Talent'} : {a.name}</b> {a.text}</p>)}
      {(df.attacks || []).map((a) => <p key={a.name} className="pb-effect"><b>{a.name}</b>{a.damage && <em> {a.damage}</em>} <small className="faint">[{a.cost.map((t) => PK_TYPES[t] || t).join(', ')}]</small>{a.text ? ' ' + a.text : ''}</p>)}
      {(df.rules || []).map((r, i) => <p key={i} className="pb-effect faint">{r}</p>)}
      {df.cat === 'Pokémon' && <p className="faint small">Faiblesse {df.weak || '—'} · Résistance {df.resist || '—'} · Retraite {df.retreat}</p>}
      <p className="faint small">Texte de la carte en anglais.</p>
    </div>
  );
}

function PileActions({ x, close, ctx, setLook, setPile }) {
  const { s, run, op } = ctx;
  const pl = s.pl[x.p];
  const n = pl.z[x.zone].length;
  const go = (fn, ...a) => { run(fn, ...a); close(); };
  const title = { deck: 'Deck', trash: 'Défausse', discard: 'Défausse', life: 'Vies', prizes: 'Récompenses' }[x.zone];
  return (
    <Modal open onClose={close} title={`${title} de ${pl.label} (${n})`}>
      <div className="pb-menu">
        {x.zone === 'deck' && <>
          <div className="row">{[1, 2, 3].map((k) => <button key={k} className="btn primary" onClick={() => go(A.draw, x.p, k)} disabled={!n}>Piocher {k}</button>)}</div>
          <button className="btn ghost" onClick={() => { run(A.shuffle, x.p); SFX.whoosh(); close(); }}><Icon name="refresh" size={17} />Mélanger</button>
          <div className="row">{[3, 5].map((k) => <button key={k} className="btn ghost" onClick={() => { setLook({ p: x.p, n: k }); close(); }} disabled={!n}><Icon name="eye" size={16} />Regarder les {k} du dessus</button>)}</div>
          <button className="btn ghost" onClick={() => { setPile({ p: x.p, zone: 'deck' }); close(); }} disabled={!n}><Icon name="search" size={17} />Chercher une carte dans le deck</button>
          <button className="btn ghost" onClick={() => go(A.mill, x.p, 1)} disabled={!n}><Icon name="trash" size={17} />Défausser la carte du dessus</button>
          {op && <button className="btn ghost" onClick={() => go(A.donBack, x.p, 1)}><Icon name="minus" size={17} />Renvoyer 1 DON!! au deck DON!!</button>}
        </>}
        {(x.zone === 'trash' || x.zone === 'discard') && <button className="btn primary" onClick={() => { setPile({ p: x.p, zone: x.zone }); close(); }} disabled={!n}><Icon name="eye" size={17} />Voir la défausse</button>}
        {x.zone === 'life' && <>
          <button className="btn primary" onClick={() => go(A.life, x.p)}><Icon name="heart" size={17} />Perdre une Vie (elle va dans la main)</button>
          <button className="btn ghost" onClick={() => go(A.flip, pl.z.life[0], ctx.nm(pl.z.life[0]))} disabled={!n}><Icon name="eye" size={17} />Retourner la Vie du dessus (Déclenchement)</button>
          <button className="btn ghost" onClick={() => go(A.move, pl.z.life[0], TRASH[s.game], {}, ctx.nm(pl.z.life[0]))} disabled={!n}><Icon name="trash" size={17} />Défausser la Vie du dessus</button>
          {!n && <button className="btn ghost" onClick={() => go(A.win, 1 - x.p)}><Icon name="trophy" size={17} />Le Leader est touché sans Vie : victoire de {s.pl[1 - x.p].label}</button>}
        </>}
        {x.zone === 'prizes' && <button className="btn primary" onClick={() => go(A.prize, x.p)} disabled={!n}><Icon name="gem" size={17} />Prendre une carte Récompense</button>}
      </div>
    </Modal>
  );
}

// Cartes du dessus du deck : chacune peut aller en main, sous le deck ou à la défausse
function LookSheet({ x, close, ctx }) {
  const { s, card, nm, run } = ctx;
  if (!x) return null;
  const top = s.pl[x.p].z.deck.slice(0, x.n);
  return (
    <Modal open onClose={close} title={`Les ${top.length} cartes du dessus`} wide>
      {top.length === 0 ? <p className="muted">Plus de carte à regarder.</p> : (
        <div className="pb-look">
          {top.map((u) => (
            <div key={u} className="pb-lookc">
              <span className="pb-card"><CardArt card={card(u)} tilt={false} fx={0} /></span>
              <b>{nm(u)}</b>
              <div className="pb-lookb">
                <button className="btn small primary" onClick={() => run(A.move, u, 'hand', {}, nm(u))}>Main</button>
                <button className="btn small ghost" onClick={() => run(A.move, u, 'deck', { place: 'bottom' }, nm(u))}>Dessous</button>
                <button className="btn small ghost" onClick={() => run(A.move, u, TRASH[s.game], {}, nm(u))}>Défausse</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="faint small">Les cartes que tu ne touches pas restent sur le dessus, dans le même ordre.</p>
      <button className="btn ghost" onClick={close}>Terminé</button>
    </Modal>
  );
}

// Deck entier ou défausse : choisir une carte
function PileSheet({ x, close, ctx }) {
  const { s, card, nm, run, op } = ctx;
  const [sel, setSel] = useState(null);
  useEffect(() => setSel(null), [x?.zone, x?.p]);
  if (!x) return null;
  const pl = s.pl[x.p];
  const list = pl.z[x.zone];
  const deck = x.zone === 'deck';
  const field = op ? [['chars', 'Sur le terrain']] : [['bench', 'Sur le banc'], ['active', 'En actif']];
  const finish = () => { if (deck) { run(A.shuffle, x.p); } close(); };
  return (
    <Modal open onClose={finish} title={deck ? `Chercher dans le deck (${list.length})` : `Défausse (${list.length})`} wide>
      <div className="pb-pilegrid">
        {list.map((u) => (
          <button key={u} type="button" className={'pb-pilec' + (sel === u ? ' on' : '')} onClick={() => setSel(sel === u ? null : u)}><span className="pb-card"><CardArt card={card(u)} tilt={false} fx={0} /></span><small>{nm(u)}</small></button>
        ))}
      </div>
      {sel && list.includes(sel) && (
        <div className="row pb-pileacts">
          <b>{nm(sel)}</b>
          <button className="btn small primary" onClick={() => { run(A.move, sel, 'hand', {}, nm(sel)); setSel(null); }}>En main</button>
          {field.map(([z, l]) => <button key={z} className="btn small ghost" onClick={() => { run(A.move, sel, z, {}, nm(sel)); setSel(null); }} disabled={pl.z[z].length >= LIMIT[z]}>{l}</button>)}
          {!deck && <button className="btn small ghost" onClick={() => { run(A.move, sel, 'deck', { place: 'bottom' }, nm(sel)); setSel(null); }}>Sous le deck</button>}
          {deck && <button className="btn small ghost" onClick={() => { run(A.move, sel, TRASH[s.game], {}, nm(sel)); setSel(null); }}>Défausser</button>}
        </div>
      )}
      <p className="faint small">{deck ? 'Le deck est mélangé quand tu fermes cette fenêtre.' : 'Touche une carte pour la déplacer.'}</p>
      <button className="btn ghost" onClick={finish}>{deck ? 'Terminé (mélanger)' : 'Fermer'}</button>
    </Modal>
  );
}
