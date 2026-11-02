import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useData, href, reduceMotion } from '../lib/hooks.js';
import { usePlay, getPlay, act, A, artCard, undo, canUndo, quit, newGame, loadDefs, deckFile, zoneOf, coin, dice, colorFr, PK_TYPES, PK_COND, LIMIT, TRASH } from '../lib/play.js';
import { SFX, burst, vibrate } from '../lib/sfx.js';
import { CardArt } from '../ui/Card.jsx';
import { Modal, Loading, Empty } from '../ui/Kit.jsx';
import { LogoMark, Emblem } from '../ui/Brand.jsx';
import Icon from '../ui/Icon.jsx';

// Tapis de jeu (bac à sable), en plein écran comme un jeu mobile :
// glisser une carte de la main vers le terrain pour la jouer, toucher une carte ou une pile pour voir ses actions.

export default function GamePage() {
  const s = usePlay();
  const d = useData();
  const [defs, setDefs] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { setDefs(null); if (s) loadDefs(s).then(setDefs, (e) => setErr(e.message)); }, [s?.startedAt]);
  // Pas de défilement de la page pendant la partie (iPhone : pas de rebond)
  useEffect(() => { document.documentElement.classList.add('at-table'); return () => document.documentElement.classList.remove('at-table'); }, []);
  if (!s) return <div className="page"><Empty icon="play" title="Aucune partie en cours" action={<a className="btn primary" href={href('/jouer')}>Choisir mes decks</a>}>Choisis ton deck et celui de ton adversaire pour lancer une partie.</Empty></div>;
  if (err) return <div className="page"><Empty icon="info" title="Les decks n’ont pas pu être chargés" action={<a className="btn primary" href={href('/jouer')}>Retour</a>}>{err}</Empty></div>;
  if (!defs || !d.ready) return <div className={'arena g-' + s.game}><div className="ar-loading"><LogoMark size={56} /><Loading label="Préparation du tapis…" /></div></div>;
  return <Board key={s.startedAt} s={s} defs={defs} />;
}

// ---------- Types d'énergie (Pokémon) ----------
const TYPE_COLOR = { Grass: '#3fb950', Fire: '#f2552c', Water: '#2f8fe0', Lightning: '#f5c518', Psychic: '#a855f7', Fighting: '#c2702c', Darkness: '#374151', Metal: '#8b9bb4', Fairy: '#f472b6', Dragon: '#b4942c', Colorless: '#cfcac0' };
const TYPE_GLYPH = {
  Grass: 'M6.5 17.5c0-6.5 4.5-10.6 11-11.3-.6 6.6-4.8 11-11 11.3zm.2-.2 7-7',
  Fire: 'M12 3.5c1.3 3 4.6 4.4 4.6 8.6a4.6 4.6 0 0 1-9.2 0c0-2.2 1.2-3.5 2.3-4.4 0 2 .9 3.2 2 3.4-.4-3 .1-5.3.3-7.6z',
  Water: 'M12 3.8c3.2 4.1 5.3 7.1 5.3 9.6a5.3 5.3 0 0 1-10.6 0c0-2.5 2.1-5.5 5.3-9.6z',
  Lightning: 'M13.4 3 6.5 13.2h4.6L10.2 21l7.2-10.4h-4.7z',
  Psychic: 'M2.8 12c2.9-3.9 5.9-5.8 9.2-5.8s6.3 1.9 9.2 5.8c-2.9 3.9-5.9 5.8-9.2 5.8S5.7 15.9 2.8 12zm9.2-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  Fighting: 'M7 9.5h10v5.2a3.3 3.3 0 0 1-3.3 3.3h-3.4A3.3 3.3 0 0 1 7 14.7zM7.4 6h2.7v3H7.4zm3.3 0h2.6v3h-2.6zm3.2 0h2.7v3h-2.7z',
  Darkness: 'M15.5 3.6a8.5 8.5 0 1 0 5 13.9 7.4 7.4 0 0 1-5-13.9z',
  Metal: 'M12 3l7.4 4.3v9.4L12 21l-7.4-4.3V7.3zm0 5.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  Fairy: 'M12 3l2.4 6.1 6.6.4-5.1 4.2 1.6 6.4L12 16.6 6.5 20.1l1.6-6.4L3 9.5l6.6-.4z',
  Dragon: 'M12 3l2.4 6.1 6.6.4-5.1 4.2 1.6 6.4L12 16.6 6.5 20.1l1.6-6.4L3 9.5l6.6-.4z',
  Colorless: 'M12 4.5l2.1 5.3 5.7.3-4.4 3.6 1.4 5.6L12 16.2l-4.8 3.1 1.4-5.6-4.4-3.6 5.7-.3z',
};
export function TypeIcon({ t, size = 14 }) {
  const k = TYPE_COLOR[t] ? t : 'Colorless';
  return <svg className="ti" viewBox="0 0 24 24" width={size} height={size} aria-label={PK_TYPES[k] || k}><circle cx="12" cy="12" r="12" fill={TYPE_COLOR[k]} /><path d={TYPE_GLYPH[k]} fill={k === 'Colorless' ? '#57534e' : '#fff'} fillRule="evenodd" /></svg>;
}
const energyOf = (def) => (def?.cat === 'Energy' ? Object.keys(TYPE_COLOR).find((t) => def.name.startsWith(t)) || 'Colorless' : null);

function Board({ s, defs }) {
  const d = useData();
  const G = s.game, op = G === 'onepiece';
  const [ready, setReady] = useState(() => (s.phase === 'mulligan' ? s.pl.findIndex((x) => !x.kept) : s.cur)); // en mode à deux : joueur qui a l'appareil
  const [sheet, setSheet] = useState(null); // { uid } ou { p, zone }
  const [target, setTarget] = useState(null); // { kind, uid, label, valid }
  const [look, setLook] = useState(null);
  const [pile, setPile] = useState(null);
  const [showLog, setShowLog] = useState(false);
  const [menu, setMenu] = useState(false);
  const [toss, setToss] = useState(null);
  const [banner, setBanner] = useState(null);
  const [ghost, setGhost] = useState(null); // carte tirée avec le doigt
  const [intro, setIntro] = useState(() => { try { return s.phase === 'mulligan' && !s.pl.some((x) => x.kept || x.mull) && sessionStorage.getItem('kirakai.vs') !== s.startedAt; } catch { return false; } });
  const deciding = s.phase === 'mulligan' ? s.pl.findIndex((x) => !x.kept) : s.cur;
  const duo = s.mode === 'duo';
  const finished = s.winner != null;
  const handoff = duo && ready !== deciding && !finished;
  const me = duo ? (handoff ? 1 - deciding : deciding) : deciding;
  const C = s.cards;
  const def = (uid) => defs[C[uid]?.p]?.[C[uid]?.id];
  const card = (uid) => artCard(d.cats, G, C[uid]?.id);
  const nm = (uid) => def(uid)?.name || 'une carte';
  const run = (fn, ...a) => { act(fn, ...a); SFX.place(); };
  const visibleHand = (p) => (duo ? p === me && !handoff : p === me || s.peek);
  const open = (x) => { if (target) return; setSheet(x); };
  const pickTarget = (uid) => {
    if (!target || !target.valid(uid)) return;
    if (target.kind === 'attach') run(A.attach, target.uid, uid, nm(target.uid), nm(uid));
    if (target.kind === 'evolve') run(A.evolve, target.uid, uid, nm(target.uid), nm(uid));
    if (target.kind === 'swap') run(A.swap, target.uid, uid);
    if (target.kind === 'don') run(A.donGive, uid, nm(uid));
    setTarget(null);
  };
  const flipCoin = () => { const r = coin(); setToss({ kind: 'coin', r, k: Date.now() }); act(A.coin, s.cur, r); SFX.coin(); };
  const rollDice = () => { const r = dice(); setToss({ kind: 'dice', r, k: Date.now() }); act(A.dice, s.cur, r); SFX.tick(); };
  useEffect(() => { if (!toss) return; const t = setTimeout(() => setToss(null), 2100); return () => clearTimeout(t); }, [toss]);

  // Bannière de début de tour
  const turnKey = s.phase + ':' + s.turn + ':' + s.cur;
  const lastTurn = useRef(turnKey);
  useEffect(() => {
    if (turnKey === lastTurn.current || s.phase !== 'play' || handoff || finished) return;
    lastTurn.current = turnKey;
    setBanner({ p: s.cur, k: Date.now() }); SFX.turn();
  }, [turnKey, handoff, finished]);
  useEffect(() => { if (!banner) return; const t = setTimeout(() => setBanner(null), 1700); return () => clearTimeout(t); }, [banner]);
  useEffect(() => { if (finished) { SFX.success(); burst(null, 4); } }, [finished]);
  const closeIntro = () => { try { sessionStorage.setItem('kirakai.vs', s.startedAt); } catch {} setIntro(false); };
  useEffect(() => { if (!intro) return; const t = setTimeout(closeIntro, 3600); return () => clearTimeout(t); }, [intro]);

  // ---- Les cartes glissent d'une zone à l'autre (FLIP : on part de l'ancienne position, on arrive à la nouvelle) ----
  const root = useRef(null);
  const rects = useRef(new Map());
  const measure = () => { const m = new Map(); root.current?.querySelectorAll('[data-uid]').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width) m.set(el.dataset.uid, r); }); return m; };
  useLayoutEffect(() => {
    const el0 = root.current; if (!el0) return;
    const still = reduceMotion();
    const next = new Map();
    el0.querySelectorAll('[data-uid]').forEach((el) => {
      const r = el.getBoundingClientRect(); if (!r.width) return;
      const uid = el.dataset.uid; next.set(uid, r);
      if (still) return;
      let o = rects.current.get(uid);
      if (!o && el.dataset.from) o = el0.querySelector(`[data-pile="${el.dataset.from}"]`)?.getBoundingClientRect();
      if (!o) return;
      const dx = o.left + o.width / 2 - (r.left + r.width / 2), dy = o.top + o.height / 2 - (r.top + r.height / 2);
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${(o.width / r.width).toFixed(3)})`, zIndex: 40 }, { transform: 'none', zIndex: 40 }], { duration: 430, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
    rects.current = next;
  });
  useEffect(() => { const f = () => { rects.current = measure(); }; addEventListener('resize', f); return () => removeEventListener('resize', f); }, []);

  // ---- Glisser-déposer : de la main vers le terrain, un DON!! vers un personnage, une carte vers la défausse ----
  const inPlay = (st, u) => ['active', 'bench'].includes(zoneOf(st, u));
  const dropAction = (src, key) => {
    const st = getPlay(); if (!st) return null;
    const [t, a, b] = key.split(':');
    const T = TRASH[G];
    if (src.kind === 'don') {
      const c = st.cards[a];
      if (t === 'card' && c?.p === src.p && ['leader', 'chars'].includes(zoneOf(st, a)) && st.pl[src.p].don.active > 0) return () => run(A.donGive, a, nm(a));
      return null;
    }
    const uid = src.uid, c = st.cards[uid]; if (!c) return null;
    const p = c.p, z = st.pl[p].z, df = def(uid) || {};
    const own = (pp) => +pp === p;
    if (src.kind === 'field') {
      const from = zoneOf(st, uid);
      if (t === 'zone' && a === T && own(b)) return () => { run(A.ko, uid, nm(uid)); SFX.ko(); };
      if (!op && from === 'bench' && ((t === 'card' && st.cards[a]?.p === p && zoneOf(st, a) === 'active') || (t === 'zone' && a === 'active' && own(b)))) return () => (z.active.length ? run(A.swap, z.active[0], uid) : run(A.move, uid, 'active', {}, nm(uid)));
      return null;
    }
    // depuis la main
    const L = nm(uid);
    if (t === 'zone' && own(b)) {
      if (a === T) return () => run(A.move, uid, T, {}, L);
      if (op && a === 'chars' && df.cat === 'CHARACTER' && z.chars.length < 5) return () => run(A.move, uid, 'chars', {}, L);
      if (op && a === 'stage' && df.cat === 'STAGE' && !z.stage.length) return () => run(A.move, uid, 'stage', {}, L);
      const basic = df.cat === 'Pokémon' && df.sub?.includes('Basic');
      if (!op && basic && a === 'active' && !z.active.length) return () => run(A.move, uid, 'active', {}, L);
      if (!op && basic && a === 'bench' && z.bench.length < 5) return () => run(A.move, uid, 'bench', {}, L);
      if (!op && df.sub?.includes('Stadium') && a === 'stadium' && !z.stadium.length) return () => run(A.move, uid, 'stadium', {}, L);
    }
    if (t === 'card' && st.cards[a]?.p === p && !op && inPlay(st, a)) {
      if (df.cat === 'Energy' || df.sub?.includes('Pokémon Tool')) return () => run(A.attach, uid, a, L, nm(a));
      if (df.cat === 'Pokémon' && !df.sub?.includes('Basic')) {
        const match = (u) => def(u)?.name === df.evolvesFrom;
        const any = [...z.active, ...z.bench].some(match);
        if (!any || match(a)) return () => { run(A.evolve, uid, a, L, nm(a)); SFX.rare(2); };
      }
    }
    if (t === 'side' && own(a)) {
      if (op && df.cat === 'EVENT') return () => run(A.move, uid, T, {}, L);
      if (op && df.cat === 'CHARACTER' && z.chars.length < 5) return () => run(A.move, uid, 'chars', {}, L);
      if (op && df.cat === 'STAGE' && !z.stage.length) return () => run(A.move, uid, 'stage', {}, L);
      if (!op && df.cat === 'Trainer' && !df.sub?.some((x) => x === 'Stadium' || x === 'Pokémon Tool')) return () => run(A.move, uid, T, {}, L);
      if (!op && df.sub?.includes('Stadium') && !z.stadium.length) return () => run(A.move, uid, 'stadium', {}, L);
      if (!op && df.cat === 'Pokémon' && df.sub?.includes('Basic')) return () => run(A.move, uid, z.active.length ? 'bench' : 'active', {}, L);
    }
    return null;
  };
  const resolveDrop = (src, el) => { for (let e = el?.closest('[data-drop]'); e; e = e.parentElement?.closest('[data-drop]')) { const f = dropAction(src, e.dataset.drop); if (f) return { el: e, f }; } return null; };
  const drag = useRef(null);
  const ghostEl = useRef(null);
  const startDrag = (e, src, onTap) => {
    if (target || finished || e.button > 0) return;
    drag.current = { src, onTap, x0: e.clientX, y0: e.clientY, moved: false, over: null, hit: null, id: e.pointerId, el: e.currentTarget };
  };
  const moveDrag = (e) => {
    const g = drag.current; if (!g || e.pointerId !== g.id) return;
    const x = e.clientX, y = e.clientY;
    if (!g.moved) {
      if (Math.hypot(x - g.x0, y - g.y0) < 9) return;
      g.moved = true;
      try { g.el.setPointerCapture(e.pointerId); } catch {}
      setGhost({ src: g.src, x, y });
      // toutes les cibles possibles s'allument
      root.current?.querySelectorAll('[data-drop]').forEach((el) => { if (dropAction(g.src, el.dataset.drop)) el.classList.add('drop-ok'); });
      SFX.draw();
    }
    if (ghostEl.current) ghostEl.current.style.transform = `translate(${x}px, ${y}px) translate(-50%, -62%) rotate(${Math.max(-10, Math.min(10, (x - g.x0) / 18))}deg)`;
    const hit = resolveDrop(g.src, document.elementFromPoint(x, y));
    if (hit?.el !== g.over) { g.over?.classList.remove('drop-on'); hit?.el.classList.add('drop-on'); g.over = hit?.el || null; }
    g.hit = hit;
  };
  const endDrag = (e) => {
    const g = drag.current; if (!g || (e && e.pointerId !== g.id)) return;
    drag.current = null;
    root.current?.querySelectorAll('.drop-ok, .drop-on').forEach((el) => el.classList.remove('drop-ok', 'drop-on'));
    if (!g.moved) { g.onTap?.(); return; }
    if (g.hit && e?.type === 'pointerup') {
      const r = ghostEl.current?.getBoundingClientRect();
      if (r && g.src.uid) rects.current.set(g.src.uid, r); // la carte part de là où le doigt l'a lâchée
      g.hit.f(); vibrate(12);
    }
    setGhost(null);
  };
  const dragProps = (src, onTap, enabled = true) => (enabled ? { onPointerDown: (e) => startDrag(e, src, onTap), onPointerMove: moveDrag, onPointerUp: endDrag, onPointerCancel: endDrag, onClick: (e) => e.preventDefault() } : { onClick: onTap });

  const ctx = { s, defs, d, def, card, nm, run, open, target, pickTarget, me, op, visibleHand, dragProps, ghost };
  const P = s.pl;
  const curName = P[s.cur].label;
  return (
    <div ref={root} className={'arena g-' + G + (target ? ' targeting' : '') + (ghost ? ' dragging' : '')}>
      <div className="ar-mat" aria-hidden="true"><i className="ar-line" /><i className="ar-ring" /></div>
      <header className="ar-hud">
        <button className="ar-round" onClick={() => setMenu(true)} aria-label="Menu de la partie"><Icon name="menu" size={19} /></button>
        <div className="ar-who top"><Emblem game={G} size={26} /><span><b>{P[1 - me].label}</b><small>{P[1 - me].name}</small></span></div>
        <OppHand p={1 - me} ctx={ctx} />
        <button className="ar-round" onClick={() => setShowLog(true)} aria-label="Journal de la partie"><Icon name="list" size={19} /></button>
      </header>
      <Side p={1 - me} top ctx={ctx} />
      <div className="ar-mid">
        <div className="ar-tools">
          <button className="ar-round sm" onClick={flipCoin} aria-label="Pile ou face" title="Pile ou face"><Icon name="coin" size={17} /></button>
          <button className="ar-round sm" onClick={rollDice} aria-label="Lancer un dé" title="Lancer un dé"><Icon name="box" size={17} /></button>
          <button className="ar-round sm" onClick={() => { undo(); SFX.tick(); }} disabled={!canUndo()} aria-label="Annuler la dernière action" title="Annuler"><Icon name="rotate" size={17} /></button>
        </div>
        <div className="ar-turn"><b>{s.phase === 'mulligan' ? 'Préparation' : 'Tour ' + s.turn}</b><small>{s.phase === 'mulligan' ? 'Mains de départ' : 'À ' + curName}</small></div>
        {s.phase === 'play' && !finished
          ? <button className="ar-end" onClick={() => { act(A.end); SFX.whoosh(); setTarget(null); }}><span>Fin du</span><b>tour</b></button>
          : <span className="ar-end ghost" aria-hidden="true" />}
      </div>
      <Side p={me} ctx={ctx} />
      <HandFan p={me} ctx={ctx} />
      {ghost && <div className="ar-ghost" ref={ghostEl} style={{ transform: `translate(${ghost.x}px, ${ghost.y}px) translate(-50%, -62%)` }}>{ghost.src.kind === 'don' ? <span className="don-card big">DON!!</span> : <span className="pb-card"><CardArt card={card(ghost.src.uid)} tilt={false} fx={0} /></span>}</div>}
      {target && <div className="pb-target" role="status"><Icon name="arrow" size={17} /><span>{target.hint}</span><button className="btn small ghost" onClick={() => setTarget(null)}>Annuler</button></div>}
      {toss && <Toss t={toss} />}
      {banner && <div className={'ar-banner' + (banner.p === me ? ' mine' : '')} key={banner.k}><span><small>Tour {s.turn}</small><b>{duo || banner.p === me ? 'À toi de jouer !' : 'Au tour de ' + P[banner.p].label}</b><em>{P[banner.p].label} · {P[banner.p].name}</em></span></div>}
      {intro && <Intro s={s} defs={defs} ctx={ctx} onClose={closeIntro} />}
      {!intro && s.phase === 'mulligan' && !handoff && <Mulligan p={deciding} ctx={ctx} />}
      {handoff && <div className="pb-handoff"><div className="ar-card"><LogoMark size={48} /><h2>Au tour de {P[deciding].label}</h2><p className="muted">Passe l’appareil à {P[deciding].label} ({P[deciding].name}). Sa main reste cachée jusque-là.</p><button className="btn primary big" onClick={() => setReady(deciding)}>C’est moi, je joue</button></div></div>}
      {finished && <div className="pb-handoff win"><div className="ar-card"><span className="ar-trophy"><Icon name="trophy" size={46} /></span><h2>{P[s.winner].label} gagne !</h2><p className="muted">{P[s.winner].name} remporte la partie au tour {s.turn}.</p><div className="row"><button className="btn primary" onClick={() => replay(s)}><Icon name="refresh" size={17} />Rejouer</button><a className="btn ghost" href={href('/jouer')} onClick={() => quit()}>Autres decks</a></div></div></div>}
      <CardSheet x={sheet} close={() => setSheet(null)} ctx={ctx} setTarget={setTarget} setLook={setLook} setPile={setPile} />
      <LookSheet x={look} close={() => setLook(null)} ctx={ctx} />
      <PileSheet x={pile} close={() => setPile(null)} ctx={ctx} />
      <Modal open={showLog} onClose={() => setShowLog(false)} title="Journal de la partie">
        <ol className="pb-log">{[...s.log].reverse().map(([t, p, m], i) => <li key={i} className={'p' + p}><time>{new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time>{m}</li>)}</ol>
      </Modal>
      <Modal open={menu} onClose={() => setMenu(false)} title="Partie">
        <div className="pb-menu">
          <p className="faint small">Glisse une carte de ta main vers le terrain pour la jouer (une énergie ou une évolution sur un Pokémon, un DON!! sur un personnage), ou touche une carte pour voir toutes ses actions.</p>
          <button className="btn ghost" onClick={() => { act(A.auto); }}><Icon name={s.auto ? 'check' : 'x'} size={17} />Début de tour automatique : {s.auto ? 'oui' : 'non'}</button>
          <p className="faint small">{op ? 'Au début de chaque tour : les cartes et les DON!! se redressent, le joueur pioche 1 carte et reçoit 2 DON!! (1 seul au tout premier tour, sans pioche).' : 'Au début de chaque tour, le joueur pioche 1 carte.'}</p>
          {!duo && <button className="btn ghost" onClick={() => act(A.peek)}><Icon name={s.peek ? 'eyeoff' : 'eye'} size={17} />{s.peek ? 'Cacher la main adverse' : 'Voir la main adverse'}</button>}
          {!finished && P.map((x, i) => <button key={i} className="btn ghost" onClick={() => { act(A.win, i); setMenu(false); }}><Icon name="trophy" size={17} />Déclarer la victoire de {x.label}</button>)}
          <button className="btn ghost" onClick={() => { replay(s); setMenu(false); }}><Icon name="refresh" size={17} />Recommencer avec les mêmes decks</button>
          <a className="btn ghost" href={href('/jouer')}><Icon name="left" size={17} />Retour aux decks (la partie reste en mémoire)</a>
          <a className="btn ghost" href={href('/jouer')} onClick={() => quit()}><Icon name="x" size={17} />Quitter la partie</a>
        </div>
      </Modal>
    </div>
  );
}

async function replay(s) {
  const decks = await Promise.all(s.pl.map((p) => deckFile(s.game, p.deck)));
  try { sessionStorage.removeItem('kirakai.vs'); } catch {}
  newGame({ game: s.game, decks, mode: s.mode });
  SFX.whoosh();
}

// ---------- Une moitié du tapis ----------
function Side({ p, top, ctx }) {
  const { s, op, me, target } = ctx;
  const pl = s.pl[p];
  const cls = 'ar-side' + (top ? ' top' : ' me') + (s.cur === p ? ' cur' : '') + (target ? ' aiming' : '');
  if (op) return (
    <section className={cls} aria-label={'Terrain de ' + pl.label} data-drop={'side:' + p}>
      <div className="ar-row chars" data-drop={'zone:chars:' + p}>{Array.from({ length: LIMIT.chars }, (_, i) => <Spot key={pl.z.chars[i] || 'e' + i} uid={pl.z.chars[i]} p={p} zone="chars" ctx={ctx} />)}</div>
      <div className="ar-row base">
        <Pile p={p} zone="life" label="Vie" ctx={ctx} />
        <Spot key={pl.z.stage[0] || 'stage'} uid={pl.z.stage[0]} p={p} zone="stage" ctx={ctx} label="Lieu" />
        <Spot key={pl.z.leader[0] || 'leader'} uid={pl.z.leader[0]} p={p} zone="leader" ctx={ctx} big />
        <Pile p={p} zone="deck" label="Deck" ctx={ctx} />
        <Pile p={p} zone="trash" label="Défausse" ctx={ctx} />
      </div>
      <Don p={p} ctx={ctx} mine={p === me} />
    </section>
  );
  return (
    <section className={cls} aria-label={'Terrain de ' + pl.label} data-drop={'side:' + p}>
      <div className="ar-row base">
        <Pile p={p} zone="prizes" label="Récompenses" ctx={ctx} />
        <Spot key={pl.z.stadium[0] || 'stadium'} uid={pl.z.stadium[0]} p={p} zone="stadium" ctx={ctx} label="Stade" />
        <Spot key={pl.z.active[0] || 'active'} uid={pl.z.active[0]} p={p} zone="active" ctx={ctx} big label="Actif" />
        <Pile p={p} zone="deck" label="Deck" ctx={ctx} />
        <Pile p={p} zone="discard" label="Défausse" ctx={ctx} />
      </div>
      <div className="ar-row bench" data-drop={'zone:bench:' + p}>{Array.from({ length: LIMIT.bench }, (_, i) => <Spot key={pl.z.bench[i] || 'e' + i} uid={pl.z.bench[i]} p={p} zone="bench" ctx={ctx} />)}</div>
    </section>
  );
}

// Une carte posée (ou un emplacement vide) : PV, dégâts, énergies, DON!!, puissance
function Spot({ uid, p, zone, ctx, big, label }) {
  const { s, def, card, open, target, pickTarget, op, me, dragProps, ghost } = ctx;
  const c = uid && s.cards[uid];
  const df = uid ? def(uid) : null;
  const pow = c && op && df?.power != null ? df.power + c.don * 1000 + c.pow : null;
  const dmg = c?.dmg || 0;
  const prev = useRef({ dmg, pow });
  const [pop, setPop] = useState(null);
  useEffect(() => {
    const o = prev.current;
    if (dmg !== o.dmg) { setPop({ t: dmg > o.dmg ? 'dmg' : 'heal', v: Math.abs(dmg - o.dmg), k: Date.now() }); if (dmg > o.dmg) SFX.hit(); }
    else if (pow != null && o.pow != null && pow !== o.pow) setPop({ t: pow > o.pow ? 'up' : 'down', v: Math.abs(pow - o.pow), k: Date.now() });
    prev.current = { dmg, pow };
  }, [dmg, pow]);
  if (!c) return <div className={'ar-spot empty z-' + zone + (big ? ' big' : '')} data-drop={'zone:' + zone + ':' + p}><span>{label || ''}</span></div>;
  const valid = target?.valid(uid);
  const hp = !op && df?.hp ? df.hp : null;
  const left = hp ? Math.max(0, hp - dmg) : null;
  const att = c.att.map((a) => s.cards[a]);
  const mineNow = p === me && !target;
  const tap = () => (target ? pickTarget(uid) : open({ uid }));
  const drag = mineNow && zone !== 'leader' && zone !== 'stadium' && zone !== 'stage' ? dragProps({ kind: 'field', uid }, tap) : { onClick: tap };
  return (
    <div className={'ar-spot z-' + zone + (big ? ' big' : '') + (c.rest ? ' rested' : '') + (valid ? ' valid' : '') + (target && !valid ? ' dim' : '') + (ghost?.src.uid === uid ? ' lifted' : '') + (pop?.t === 'dmg' ? ' hurt' : '')}
      data-drop={'card:' + uid} role="button" tabIndex={0} aria-label={(df?.name || 'Carte') + (c.rest ? ' (inclinée)' : '') + (hp ? ` ${left} PV` : '')}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && tap()} {...drag}>
      {op && c.don > 0 && <span className="ar-donstack" aria-hidden="true">{Array.from({ length: Math.min(c.don, 4) }, (_, i) => <i key={i} style={{ '--i': i }} />)}</span>}
      <span className="pb-fly" data-uid={uid}><span className="pb-card">{c.up ? <CardArt card={card(uid)} tilt={false} fx={0} /> : <Back game={s.game} />}</span></span>
      {op && c.don > 0 && <i className="ar-don">+{c.don}</i>}
      {pow != null && (zone === 'chars' || zone === 'leader') && <i className={'ar-pow' + (c.don || c.pow ? ' up' : '')}>{pow}</i>}
      {hp && (zone === 'active' || zone === 'bench') && (
        <span className={'ar-hp' + (left / hp <= 0.25 ? ' low' : left / hp <= 0.5 ? ' mid' : '')}>
          <i style={{ width: (left / hp) * 100 + '%' }} /><b>{left}</b>
        </span>
      )}
      {!op && dmg > 0 && <i className="ar-dmg">{dmg}</i>}
      {!op && att.length > 0 && <span className="ar-att">{att.map((a) => { const e = energyOf(ctx.defs[a.p][a.id]); return <span key={a.uid} className="pb-fly" data-uid={a.uid}>{e ? <TypeIcon t={e} size={big ? 15 : 12} /> : <i className="ar-tool" title={ctx.defs[a.p][a.id]?.name}><Icon name="gear" size={9} /></i>}</span>; })}</span>}
      {!op && c.cond.length > 0 && <span className="ar-cond">{c.cond.map((k) => <i key={k} className={'c-' + k}>{PK_COND[k].slice(0, 3)}</i>)}</span>}
      {pop && <i key={pop.k} className={'ar-pop ' + pop.t} onAnimationEnd={() => setPop(null)}>{pop.t === 'dmg' || pop.t === 'down' ? '−' : '+'}{pop.v}</i>}
    </div>
  );
}

const Back = ({ game }) => <span className={'pb-back ' + game}><span className="pb-back-in"><LogoMark size={24} /></span></span>;

// Piles : deck (cartes empilées), défausse (carte du dessus), vies et récompenses (cartes cachées)
function Pile({ p, zone, label, ctx }) {
  const { s, card, open, target } = ctx;
  const list = s.pl[p].z[zone];
  const n = list.length;
  const top = list[0];
  const topUp = top && s.cards[top].up;
  const tap = () => !target && open({ p, zone });
  const fan = zone === 'life' || zone === 'prizes';
  return (
    <button type="button" className={'ar-pile z-' + zone + (n ? '' : ' empty') + (target ? ' dim' : '')} onClick={tap} data-drop={'zone:' + zone + ':' + p} data-pile={zone + ':' + p} aria-label={`${label} : ${n} carte${n > 1 ? 's' : ''}`}>
      {fan ? (
        <span className="ar-stack">
          {list.slice(0, 6).reverse().map((u, i, a) => <span key={u} className="pb-fly" data-uid={u} style={{ '--i': a.length - 1 - i }}><span className="pb-card">{s.cards[u].up ? <CardArt card={card(u)} tilt={false} fx={0} /> : <Back game={s.game} />}</span></span>)}
        </span>
      ) : (
        <span className="ar-heap" style={{ '--h': Math.min(4, Math.ceil(n / 12)) }}>
          {n > 0 && <span className="pb-fly" key={top} data-uid={top}><span className="pb-card">{topUp ? <CardArt card={card(top)} tilt={false} fx={0} /> : <Back game={s.game} />}</span></span>}
        </span>
      )}
      <em>{n}</em>
      <small>{label}</small>
    </button>
  );
}

// One Piece : zone de coût (cartes DON!! actives et inclinées) — glisser un DON!! sur un personnage pour le lui donner
function Don({ p, ctx, mine }) {
  const { s, run, target, dragProps } = ctx;
  const d = s.pl[p].don;
  const give = mine && d.active > 0 && !target ? dragProps({ kind: 'don', p }, () => {}) : {};
  return (
    <div className={'ar-donrow' + (target ? ' dim' : '')}>
      <span className="ar-donpile" title="Deck DON!!"><span className="don-card back" /><em>{d.deck}</em></span>
      <span className={'ar-dons' + (mine && d.active ? ' grab' : '')} aria-label={`DON!! : ${d.active} actifs, ${d.rested} inclinés, ${d.deck} dans le deck DON!!`} {...give}>
        {Array.from({ length: d.active }, (_, i) => <span key={'a' + i} className="don-card">DON!!</span>)}
        {Array.from({ length: d.rested }, (_, i) => <span key={'r' + i} className="don-card rested">DON!!</span>)}
        {!d.active && !d.rested && <small>Zone de coût</small>}
      </span>
      {mine && <span className="ar-donbtn">
        <button className="ar-round xs" onClick={() => run(A.donDraw, p, 1)} disabled={!d.deck} aria-label="Ajouter 1 DON!!">+1</button>
        <button className="ar-round xs" onClick={() => run(A.donRest, p, 1)} disabled={!d.active} aria-label="Incliner 1 DON!!"><Icon name="rotate" size={14} /></button>
        <button className="ar-round xs" onClick={() => run(A.donStand, p)} disabled={!d.rested} aria-label="Redresser les DON!!"><Icon name="up" size={14} /></button>
      </span>}
    </div>
  );
}

// Main en éventail, comme sur les jeux mobiles : glisser une carte vers le terrain, toucher pour la voir en grand
function HandFan({ p, ctx }) {
  const { s, card, open, visibleHand, target, dragProps, ghost } = ctx;
  const list = s.pl[p].z.hand;
  const show = visibleHand(p);
  const box = useRef(null);
  const [w, setW] = useState(360);
  const [cw, setCw] = useState(80);
  useLayoutEffect(() => {
    const f = () => { const b = box.current; if (!b) return; setW(b.clientWidth); const pr = b.querySelector('.ar-hprobe'); if (pr) setCw(pr.offsetWidth); };
    f(); const ro = new ResizeObserver(f); if (box.current) ro.observe(box.current); return () => ro.disconnect();
  }, []);
  const n = list.length;
  const step = n > 1 ? Math.min(cw * 0.8, (w - cw - 28) / (n - 1)) : 0;
  const x0 = (w - (n - 1) * step - cw) / 2;
  const spread = Math.min(4.5, 34 / Math.max(1, n));
  return (
    <div className={'ar-hand' + (target ? ' dim' : '')} ref={box} aria-label={'Main de ' + s.pl[p].label + ' : ' + n + ' carte' + (n > 1 ? 's' : '')}>
      <span className="ar-hprobe" aria-hidden="true" />
      {n === 0 && <span className="ar-hempty">Main vide</span>}
      {list.map((u, i) => {
        const k = i - (n - 1) / 2;
        const style = { left: x0 + i * step, zIndex: i + 1, '--r': k * spread + 'deg', '--y': Math.abs(k) ** 1.6 * 2.2 + 'px' };
        const tap = () => show && !target && open({ uid: u });
        return (
          <div key={u} className={'ar-hcard' + (ghost?.src.uid === u ? ' lifted' : '')} style={style} role="button" tabIndex={0} aria-label={show ? ctx.nm(u) : 'Carte cachée'} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && tap()} {...(show ? dragProps({ kind: 'hand', uid: u }, tap, !target) : {})}>
            <span className="pb-fly" data-uid={u} data-from={'deck:' + p}><span className="pb-card">{show ? <CardArt card={card(u)} tilt={false} fx={0} /> : <Back game={s.game} />}</span></span>
          </div>
        );
      })}
    </div>
  );
}

// Main de l'adversaire : dos des cartes en éventail
function OppHand({ p, ctx }) {
  const { s, card, visibleHand } = ctx;
  const list = s.pl[p].z.hand;
  const show = visibleHand(p);
  const n = list.length;
  return (
    <div className="ar-ohand" aria-label={n + ' carte' + (n > 1 ? 's' : '') + ' en main'}>
      {list.slice(0, 12).map((u, i) => { const k = i - (Math.min(n, 12) - 1) / 2; return <span key={u} className="ar-oc" style={{ '--r': k * 5 + 'deg', '--x': k * 9 + 'px', zIndex: i }}><span className="pb-fly" data-uid={u} data-from={'deck:' + p}><span className="pb-card">{show ? <CardArt card={card(u)} tilt={false} fx={0} /> : <Back game={s.game} />}</span></span></span>; })}
      <em>{n}</em>
    </div>
  );
}

// Pile ou face (pièce qui tourne) et dé
function Toss({ t }) {
  return (
    <div className="ar-toss" key={t.k} aria-live="polite">
      {t.kind === 'coin'
        ? <span className={'ar-coin ' + t.r}><i className="f face"><LogoMark size={44} /><b>Face</b></i><i className="f pile"><b>Pile</b></i></span>
        : <span className="ar-dice"><b>{t.r}</b></span>}
      <strong>{t.kind === 'coin' ? (t.r === 'pile' ? 'Pile !' : 'Face !') : 'Dé : ' + t.r}</strong>
    </div>
  );
}

// Écran d'ouverture : les deux decks face à face
function Intro({ s, defs, ctx, onClose }) {
  const { d } = ctx;
  const cover = (p) => {
    const cards = Object.values(defs[p]);
    const c = s.game === 'onepiece' ? cards.find((x) => x.cat === 'LEADER') : cards.filter((x) => x.cat === 'Pokémon').sort((a, b) => (b.hp || 0) - (a.hp || 0))[0];
    return c && artCard(d.cats, s.game, c.id);
  };
  return (
    <div className={'ar-intro g-' + s.game} onClick={onClose} role="dialog" aria-label="Début de la partie">
      {[0, 1].map((p) => (
        <div key={p} className={'ar-vs-side s' + p}>
          <span className="ar-vs-card">{cover(p) && <CardArt card={cover(p)} tilt={false} fx={1} />}</span>
          <b>{s.pl[p].label}</b><small>{s.pl[p].name}</small>
        </div>
      ))}
      <span className="ar-vs">VS</span>
      <p className="ar-vs-first"><Icon name="coin" size={18} />{s.pl[s.first].label} commence</p>
      <small className="ar-vs-skip">Touche pour continuer</small>
    </div>
  );
}

// ---------- Mains de départ ----------
function Mulligan({ p, ctx }) {
  const { s, def, card, op } = ctx;
  const pl = s.pl[p];
  const basics = pl.z.hand.filter((u) => def(u)?.cat === 'Pokémon' && def(u)?.sub?.includes('Basic')).length;
  const other = s.pl[1 - p];
  const n = pl.z.hand.length;
  return (
    <div className="pb-handoff">
      <div className="ar-card pb-mull">
        <small className="ar-kicker">{pl.label} · {pl.name}</small>
        <h2>Ta main de départ</h2>
        <div className="ar-mfan">{pl.z.hand.map((u, i) => <span key={u} className="pb-card" style={{ '--r': (i - (n - 1) / 2) * 5 + 'deg', '--d': i * 70 + 'ms' }}><CardArt card={card(u)} tilt={false} fx={0} /></span>)}</div>
        <p className="muted small">{op ? 'Garde-la, ou remélange-la dans ton deck pour piocher 5 nouvelles cartes (une seule fois).' : basics ? 'Garde ta main si elle te convient : tu poseras ton Pokémon actif et ton banc au début de la partie.' : 'Aucun Pokémon de base : remélange ta main et pioche 7 nouvelles cartes. Ton adversaire pourra piocher 1 carte de plus par mulligan.'}</p>
        {!op && other.mull > 0 && <p className="notice">{other.label} a fait {other.mull} mulligan{other.mull > 1 ? 's' : ''} : tu peux piocher jusqu’à {other.mull} carte{other.mull > 1 ? 's' : ''} de plus (touche ton deck).</p>}
        <div className="row">
          {(op || basics > 0) && <button className="btn primary big" onClick={() => { act(A.keep, p); SFX.place(); }}><Icon name="check" size={18} />Garder</button>}
          {(op ? !pl.mull : true) && <button className={'btn big ' + (!op && !basics ? 'primary' : 'ghost')} onClick={() => { act(A.mulligan, p); SFX.whoosh(); }}><Icon name="refresh" size={18} />Mulligan</button>}
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
        <div className="pb-sheet-art">{c.up || zone === 'hand' ? <CardArt card={card(x.uid)} size="large" eager /> : <Back game={s.game} />}</div>
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
