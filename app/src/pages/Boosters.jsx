import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useData, useRoute, useUniverse, href, cardHref, useInfinite, reduceMotion } from '../lib/hooks.js';
import { useStore, update, getState, claimDaily, spendCoins, refund, questStep } from '../lib/store.js';
import { fmtNum, fmtEur, fmtDate, img, eurOf, GAMES } from '../lib/data.js';
import { buildProduct, boosterSets, openPack, levelOf, LEVELS, PRICE, CURRENCY, rarLabel, pullValue } from '../lib/packs.js';
import { seasonNow } from '../lib/league.js';
import { SFX, vibrate, burst } from '../lib/sfx.js';
import { unlock, ACHIEVEMENTS } from '../lib/achievements.js';
import { CardArt } from '../ui/Card.jsx';
import { Emblem, CardBack } from '../ui/Brand.jsx';
import { Section, Seg, Loading, Modal, Money, Ring, Stat, Count } from '../ui/Kit.jsx';
import { League } from './League.jsx';
import { EVLine, EVPanel, EVRanking } from './Ev.jsx';
import Quests from './Quests.jsx';
import Icon from '../ui/Icon.jsx';

const LV_COLOR = ['#9aa3bd', '#7cc4ff', '#b48bff', '#ffd76a', '#ff6b9a', '#ffffff'];

// ---- Visuel du booster : vraie illustration si elle existe (../db/packs/<code>.webp), sinon emballage Kirakai ----
// Seule l'extension la plus récente de chaque univers a une illustration officielle (relevée chaque semaine)
const realPack = new Map();
function useRealPack(code, enabled) {
  const key = code.toLowerCase();
  const [ok, setOk] = useState(realPack.get(key) ?? null);
  useEffect(() => {
    if (!enabled) return;
    if (realPack.has(key)) { setOk(realPack.get(key)); return; }
    const im = new Image();
    im.onload = () => { realPack.set(key, true); setOk(true); };
    im.onerror = () => { realPack.set(key, false); setOk(false); };
    im.src = `../db/packs/${key}.webp`;
  }, [key, enabled]);
  return enabled && ok ? `../db/packs/${key}.webp` : null;
}

export function PackFace({ prod }) {
  const real = useRealPack(prod.code, !!prod.latest);
  if (real) return <span className="pf real"><img src={real} alt="" draggable="false" /><span className="pf-crimp top" /><span className="pf-crimp bottom" /></span>;
  const c = prod.cover?.[0];
  return (
    <span className={'pf gen ' + prod.game}>
      <span className="pf-foil" />
      <span className="pf-crimp top" /><span className="pf-crimp bottom" />
      <span className="pf-head">
        <Emblem game={prod.game} size={34} />
        <span><b>{GAMES[prod.game].label}</b><small>Trading Card Game</small></span>
      </span>
      {c && <span className="pf-art"><img src={img(c.image, 'large')} alt="" referrerPolicy="no-referrer" draggable="false" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} /></span>}
      <span className="pf-title">
        {prod.logo ? <img className="pf-logo" src={img(prod.logo)} alt="" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = 'none')} /> : <b className="pf-code">{prod.code}</b>}
        <span className="pf-name">{prod.name}</span>
      </span>
      <span className="pf-count">{prod.size} cartes · Kirakai</span>
    </span>
  );
}

// Le booster en 3D : suit le doigt, se déchire en glissant le long du haut
function Pack({ prod, phase, onOpen, onPick, locked }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const [tear, setTear] = useState(0);
  const ready = phase === 'ready';
  const opening = phase === 'opening';
  useEffect(() => { if (!opening) setTear(0); }, [opening]);
  const tilt = (e) => {
    const el = ref.current; if (!el || opening || reduceMotion()) return;
    const r = el.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--ry', ((x - 0.5) * 26).toFixed(1) + 'deg'); el.style.setProperty('--rx', ((0.5 - y) * 18).toFixed(1) + 'deg');
    el.style.setProperty('--mx', (x * 100).toFixed(1) + '%'); el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
  };
  const leave = () => { const el = ref.current; if (el) { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); } };
  const down = (e) => { if (!ready) return; const r = ref.current.getBoundingClientRect(); drag.current = { x: e.clientX, w: r.width, last: 0 }; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const move = (e) => {
    tilt(e);
    const g = drag.current; if (!g) return;
    const f = Math.max(0, Math.min(1, Math.abs(e.clientX - g.x) / (g.w * 0.8)));
    if (f - g.last > 0.08) { SFX.tick(); g.last = f; }
    setTear(f);
    if (f >= 0.72) { drag.current = null; setTear(1); onOpen(); }
  };
  const up = () => { if (drag.current) { drag.current = null; setTear((t) => (t < 0.72 ? 0 : t)); } };
  return (
    <div className={'pack-zone' + (ready ? ' is-ready' : '') + (opening ? ' is-opening' : '')}>
      {opening && <Emerge game={prod.game} n={prod.size} />}
      <div ref={ref} className="pack3d" data-game={prod.game} style={{ '--tear': tear }}
        onPointerMove={move} onPointerLeave={leave} onPointerDown={down} onPointerUp={up} onPointerCancel={up}
        onClick={() => !ready && !opening && onPick?.()} role={ready ? 'presentation' : 'button'} tabIndex={ready ? -1 : 0}
        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !ready) { e.preventDefault(); onPick?.(); } }}
        aria-label={ready ? undefined : 'Ouvrir un booster ' + prod.name}>
        <span className="pk-shadow" />
        <span className="pk-body"><PackFace prod={prod} /><span className="pk-sheen" /></span>
        <span className="pk-top"><PackFace prod={prod} /><span className="pk-sheen" /></span>
        <span className="pk-cut"><i style={{ width: tear * 100 + '%' }} /></span>
        {!ready && !opening && <span className="pk-cta">{locked ? 'Solde insuffisant' : 'Touche pour ouvrir'}</span>}
      </div>
    </div>
  );
}

// Les cartes sortent du booster
function Emerge({ game, n }) {
  return <div className="emerge" aria-hidden="true">{Array.from({ length: n }, (_, i) => <span key={i} className="em-card" style={{ '--i': i, '--o': i - (n - 1) / 2 }}><CardBack game={game} /></span>)}</div>;
}

// ---- Éclairs d'ouverture : Haki des rois (One Piece) ou foudre (Pokémon) ----
const C0 = [200, 150];
function zig(a, b, n, amp) { const pts = [a], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L; for (let i = 1; i < n; i++) { const t = i / n, o = (Math.random() - 0.5) * 2 * amp; pts.push([a[0] + dx * t + nx * o, a[1] + dy * t + ny * o]); } pts.push(b); return pts; }
const pathOf = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
function strikeBolts(game) {
  const out = [];
  if (game === 'onepiece') {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + Math.random() * 0.4, L = 240 + Math.random() * 90;
      const pts = zig(C0, [C0[0] + Math.cos(a) * L, C0[1] + Math.sin(a) * L * 0.85], 9, 16);
      out.push({ d: pathOf(pts), delay: k * 0.03, w: 1 });
      const o = pts[3 + Math.floor(Math.random() * 4)], b = a + (Math.random() < 0.5 ? -0.6 : 0.6);
      out.push({ d: pathOf(zig(o, [o[0] + Math.cos(b) * 70, o[1] + Math.sin(b) * 56], 5, 9)), delay: k * 0.03 + 0.08, w: 0.6 });
    }
  } else {
    for (let k = 0; k < 8; k++) {
      const x = 30 + Math.random() * 340, end = [C0[0] + (Math.random() - 0.5) * 60, C0[1] + (Math.random() - 0.5) * 30];
      const pts = zig([x, -20], end, 8, 18);
      out.push({ d: pathOf(pts), delay: k * 0.07, w: 1 });
      const s = pts[3 + (k % 3)];
      out.push({ d: pathOf(zig(s, [s[0] + (Math.random() - 0.5) * 120, s[1] + 50], 4, 10)), delay: k * 0.07 + 0.05, w: 0.6 });
    }
    for (let k = 0; k < 6; k++) { const a = Math.random() * Math.PI * 2; out.push({ d: pathOf(zig(C0, [C0[0] + Math.cos(a) * 130, C0[1] + Math.sin(a) * 100], 5, 10)), delay: 0.45 + k * 0.03, w: 0.7 }); }
  }
  return out;
}
function Strike({ game }) {
  const bolts = useMemo(() => strikeBolts(game), [game]);
  return (
    <div className={'strike strike-' + game} aria-hidden="true">
      <div className="strike-flash" />
      <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
        {bolts.map((b, i) => (
          <g key={i} className="strike-bolt" style={{ animationDelay: b.delay + 's' }}>
            <path d={b.d} className="s-out" style={{ strokeWidth: 7 * b.w }} pathLength="1" />
            <path d={b.d} className="s-mid" style={{ strokeWidth: 4 * b.w }} pathLength="1" />
            <path d={b.d} className="s-core" style={{ strokeWidth: 1.4 * b.w }} pathLength="1" />
          </g>
        ))}
      </svg>
      {game === 'onepiece' && <div className="strike-ring" />}
    </div>
  );
}

// ---- Carte révélée ----
function Reveal({ x, state, isNew, value }) {
  const lv = levelOf(x);
  return (
    <div className={`rv lv-${lv} is-${state}`} style={{ '--lc': LV_COLOR[lv] }}>
      {lv >= 2 && state === 'front' && <span className="rv-rays" aria-hidden="true" />}
      <div className="rv-flip">
        <div className="rv-back"><CardBack game={x.card.game} /><span className="rv-aura" /></div>
        <div className="rv-front"><CardArt card={x.card} size="large" eager className={lv >= 2 ? 'live' : ''} tilt={false} /></div>
      </div>
      {state === 'front' && lv >= 2 && <span className="rv-banner">{x.card.variant && /^Parallèle/.test(x.card.variant) ? 'Parallèle !' : (x.card.rarity || x.label) + ' !'}</span>}
      {state === 'front' && (
        <div className="rv-caption">
          <b>{x.card.name}</b>
          <span>{x.card.number} · {rarLabel(x)}</span>
          <span className="rv-tags">{isNew ? <em className="new">Nouvelle</em> : <em className="dup">Déjà obtenue</em>}{value != null && <em className="val">{fmtEur(value)}</em>}</span>
        </div>
      )}
    </div>
  );
}

export default function BoostersPage({ focus }) {
  const d = useData();
  const game = useUniverse();
  const route = useRoute();
  const cur = CURRENCY[game];
  const wallet = useStore((s) => s.wallet?.[game]);
  const sel = useStore((s) => s.packs.sel?.[game]);
  const sound = useStore((s) => s.settings?.sound !== false);
  const admin = useStore((s) => !!s.admin);
  const [phase, setPhase] = useState('pack'); // pack → ready → opening → reveal → summary
  const [pack, setPack] = useState(null);     // { pulls, fresh:Set<index>, value }
  const [bulk, setBulk] = useState(null);
  const [m, setM] = useState(0);
  const [charging, setCharging] = useState(false);
  const [noFunds, setNoFunds] = useState(false);
  const [odds, setOdds] = useState(false);
  const [gain, setGain] = useState(0);
  const [nonce, setNonce] = useState(0);
  const stageRef = useRef(null);
  const timers = useRef([]);
  const later = (f, ms) => timers.current.push(setTimeout(f, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const sets = useMemo(() => (d.ready ? boosterSets(game, d.cats) : []), [d.ready, d.v, game]);
  const wanted = route.query.set || sel;
  const prod = useMemo(() => (d.ready && sets.length ? buildProduct(game, d.cats, d.P, d.fx, wanted) : null), [d.ready, d.v, game, wanted, sets]);
  const latest = useMemo(() => (d.ready && sets.length ? buildProduct(game, d.cats, d.P, d.fx, sets[0].code) : null), [d.ready, d.v, game, sets]);
  useEffect(() => { const g = claimDaily(game, PRICE.start, PRICE.daily); if (g) setGain(g); }, [game]);
  useEffect(() => { if (route.query.set && route.query.set !== sel) update((s) => { s.packs.sel = { ...(s.packs.sel || {}), [game]: route.query.set }; }); }, [route.query.set]);
  useEffect(() => { if (focus && prod) later(() => document.getElementById('collection-virtuelle')?.scrollIntoView({ behavior: 'smooth' }), 300); }, [focus, !!prod]);
  const coins = admin ? Infinity : wallet?.coins ?? PRICE.start;
  const choose = (code) => { if (phase !== 'pack') return; update((s) => { s.packs.sel = { ...(s.packs.sel || {}), [game]: code }; }); if (route.query.set) location.hash = '#/boosters'; SFX.whoosh(); };

  // Ajoute un tirage à la collection virtuelle, renvoie les index des nouvelles cartes
  const record = (packsList, isDisplay) => {
    const known = new Set(Object.keys(getState().packs.virtual));
    const fresh = packsList.map((pulls) => { const f = new Set(); pulls.forEach((x, i) => { if (!known.has(x.card.key)) { f.add(i); known.add(x.card.key); } }); return f; });
    const values = packsList.map((p) => pullValue(p, d.P, d.fx));
    update((s) => {
      const w = s.wallet[game];
      w.opened = (w.opened || 0) + packsList.length; w.openedToday = (w.openedToday || 0) + packsList.length;
      s.packs.opened = (s.packs.opened || 0) + packsList.length;
      questStep(s, 'open', packsList.length);
      for (const pulls of packsList) for (const x of pulls) s.packs.virtual[x.card.key] = (s.packs.virtual[x.card.key] || 0) + 1;
      const sn = seasonNow();
      if (sn.started) {
        if (!s.season || s.season.n !== sn.n) s.season = { n: sn.n, cards: {}, packs: {} };
        for (const pulls of packsList) for (const x of pulls) s.season.cards[x.card.key] = 1;
        s.season.packs[game] = (s.season.packs[game] || 0) + packsList.length;
      }
      const all = packsList.flat();
      const head = [...all].sort((a, b) => levelOf(b) - levelOf(a) || (eurOf(b.card, d.P, d.fx) || 0) - (eurOf(a.card, d.P, d.fx) || 0))[0];
      if (head && (!w.best || levelOf(head) >= (w.best.lv ?? 0))) w.best = { key: head.card.key, name: head.card.name, rarity: rarLabel(head), lv: levelOf(head) };
      s.packs.history = [{ at: new Date().toISOString(), game, set: prod.code, n: packsList.length, value: values.reduce((a, b) => a + b, 0), best: head ? { key: head.card.key, name: head.card.name, lv: levelOf(head) } : null }, ...(s.packs.history || [])].slice(0, 20);
    });
    // Succès
    const st = getState();
    const opened = Object.values(st.wallet || {}).reduce((t, w) => t + (w.opened || 0), 0);
    const lvMax = Math.max(...packsList.flat().map(levelOf));
    const have = prod.cards.filter((c) => st.packs.virtual[c.key]).length / prod.cards.length;
    unlock('first-pack', opened >= 10 && 'packs-10', opened >= 50 && 'packs-50', opened >= 150 && 'packs-150', isDisplay && 'display', lvMax >= 3 && 'hit-3', lvMax >= 5 && 'hit-5',
      Math.max(...values) >= 50 && 'pull-50', have >= 0.5 && 'set-50', have >= 1 && 'set-100', st.wallet?.onepiece?.opened && st.wallet?.pokemon?.opened && 'both-worlds');
    return { fresh, values };
  };

  const openOne = useCallback(() => {
    if (!prod || phase === 'opening' || phase === 'ready') return;
    if (!spendCoins(game, PRICE.booster)) { setNoFunds(true); return; }
    setNoFunds(false); setBulk(null); setPack(null); setM(0); setCharging(false);
    setNonce((n) => n + 1); SFX.coin();
    setPhase('ready');
  }, [prod, phase, game]);
  const cancelReady = () => { refund(game, PRICE.booster); setPhase('pack'); };
  const tearOpen = useCallback(() => {
    if (!prod || phase !== 'ready') return;
    const pulls = openPack(prod);
    const { fresh: [fresh], values: [value] } = record([pulls]);
    setPack({ pulls, fresh, value });
    SFX.tear(); game === 'onepiece' ? SFX.haki() : SFX.thunder(); vibrate([40, 30, 80]);
    setPhase('opening');
    later(() => setPhase('reveal'), 2100);
  }, [prod, phase, game]);
  useEffect(() => {
    const on = phase !== 'pack';
    document.body.classList.toggle('modal-open', on);
    return () => document.body.classList.remove('modal-open');
  }, [phase]);

  const openDisplay = () => {
    if (!prod) return;
    if (!spendCoins(game, PRICE.display)) { setNoFunds(true); return; }
    setNoFunds(false);
    const list = Array.from({ length: PRICE.displayPacks }, () => openPack(prod));
    const { fresh, values } = record(list, true);
    setBulk({ packs: list.map((pulls, i) => ({ pulls, fresh: fresh[i], value: values[i] })), fresh: fresh.reduce((s, f) => s + f.size, 0), value: values.reduce((a, b) => a + b, 0) });
    setPack(null); setPhase('summary'); SFX.tear();
    const top = Math.max(...list.flatMap((p) => p.map(levelOf)));
    if (top >= 2) { SFX.rare(top); later(() => burst(stageRef.current, top), 150); }
  };

  const next = useCallback(() => {
    if (!pack || phase !== 'reveal' || charging) return;
    if (m >= pack.pulls.length) { setPhase('summary'); SFX.success(); return; }
    const x = pack.pulls[m], lv = levelOf(x);
    const show = () => {
      setCharging(false); setM((v) => v + 1); SFX.flip();
      if (lv >= 2) { SFX.rare(lv); vibrate(lv >= 4 ? [60, 40, 120] : 30); later(() => burst(stageRef.current?.querySelector('.rv'), lv), 120); }
    };
    if (lv >= 2) { setCharging(true); SFX.charge(); later(show, 1000); } else show();
  }, [pack, phase, charging, m]);
  useEffect(() => {
    const f = (e) => { if ((e.key === ' ' || e.key === 'Enter') && phase === 'reveal' && !e.target.closest('button,a,input,select')) { e.preventDefault(); next(); } if (e.key === 'Escape' && phase === 'ready') cancelReady(); };
    addEventListener('keydown', f); return () => removeEventListener('keydown', f);
  }, [next, phase]);

  if (!d.ready || !prod) return <div className="page"><Loading label="Préparation des boosters…" /></div>;
  const shown = pack && m > 0 ? pack.pulls[m - 1] : null;
  const upcoming = pack && m < pack.pulls.length ? pack.pulls[m] : null;
  const left = pack ? pack.pulls.length - m : 0;
  const locked = coins < PRICE.booster;
  const runValue = pack ? pullValue(pack.pulls.slice(0, m), d.P, d.fx) : 0;
  const close = () => (phase === 'ready' ? cancelReady() : (setPhase('pack'), setPack(null), setBulk(null)));
  const actions = (again) => (
    <div className="pack-actions">
      <button className={'btn primary big' + (again ? ' pulse' : '')} disabled={locked} onClick={openOne}><span className="coin-ico">{cur.sym}</span>{again ? 'Ouvrir un autre booster' : 'Ouvrir un booster'} · {PRICE.booster}</button>
      <button className="btn ghost big display-btn" disabled={coins < PRICE.display} onClick={openDisplay}><Icon name="box" size={18} />Display · {PRICE.displayPacks} boosters · {fmtNum(PRICE.display)}<span className="ribbon">10 + 2 offerts</span></button>
      {again && <button className="btn ghost" onClick={close}>Revenir au booster</button>}
    </div>
  );

  return (
    <div className="page boosters-page">
      <div className="kicker">{GAMES[game].label} · boosters virtuels</div>
      <h1 className="page-title">Ouvre des <span className="grad">boosters</span></h1>
      <p className="lead">Choisis une extension, déchire le booster et retourne les cartes une à une. Chaque carte rejoint ta collection virtuelle, avec sa valeur réelle au prix du jour.</p>

      <div className={'wallet panel ' + game}>
        <span className="coin" aria-hidden="true">{cur.sym}</span>
        <div className="w-bal"><b>{admin ? '∞' : <Count value={coins} />}</b><span>{cur.name}</span></div>
        {gain > 0 && <span className="w-gain">+{fmtNum(gain)} reçus depuis ta dernière visite</span>}
        <span className="spacer" />
        {admin ? <span className="admin-badge">Mode administrateur · illimité</span> : <a className="btn small ghost" href={href('/boutique')}><Icon name="plus" size={16} />{cur.name}</a>}
        <button className="icon-btn" onClick={() => update((s) => { s.settings = { ...s.settings, sound: !sound }; })} aria-label={sound ? 'Couper le son' : 'Activer le son'}><Icon name={sound ? 'sound' : 'mute'} /></button>
        <small className="w-note">Booster {PRICE.booster} · Display {fmtNum(PRICE.display)} pour {PRICE.displayPacks} · +{PRICE.daily} {cur.name} chaque jour, même les jours d’absence. Monnaie virtuelle, sans valeur réelle.</small>
      </div>

      {sets.length > 1 && (
        <div className="set-picker" role="listbox" aria-label="Extension du booster">
          {sets.map((s, i) => (
            <button key={s.code} role="option" aria-selected={s.code === prod.code} className={'sp-item' + (s.code === prod.code ? ' on' : '')} onClick={() => choose(s.code)}>
              <span className="sp-pack"><PackFace prod={{ ...buildProductLite(game, s), latest: i === 0 }} /></span>
              <span className="sp-name"><b>{s.code}</b><small>{s.name}</small></span>
              {i === 0 && <em>Saison</em>}
            </button>
          ))}
        </div>
      )}

      {phase !== 'pack' && <div className={'focus-bg ' + game} aria-hidden="true" />}
      <section className={`pack-stage phase-${phase} ${game}` + (phase !== 'pack' ? ' focus' : '')} ref={stageRef}>
        {phase !== 'pack' && phase !== 'opening' && <button className="icon-btn focus-close" onClick={close} aria-label="Fermer"><Icon name="x" /></button>}
        {phase === 'opening' && <Strike key={nonce} game={game} />}
        {phase === 'pack' && (
          <div className="stage-idle">
            <Pack prod={prod} phase="pack" onPick={openOne} locked={locked} />
            <div className="stage-side">
              <div className="kicker">{prod.latest ? 'Extension de la saison' : 'Extension'} · {prod.code}</div>
              <h2>{prod.name}</h2>
              <p className="muted">{prod.composition} <button className="link" onClick={() => setOdds(true)}>Voir les taux</button></p>
              <EVLine prod={prod} />
              <button className="link small ev-more" onClick={() => document.getElementById('rentabilite')?.scrollIntoView({ behavior: 'smooth' })}>Rentabilité de chaque extension<Icon name="down" size={15} /></button>
              <VirtualMini prod={prod} />
              {actions(false)}
              {(noFunds || locked) && <p className="notice">Solde insuffisant : il faut {PRICE.booster} {cur.name} pour un booster (tu en as {fmtNum(wallet?.coins ?? 0)}). Reviens demain pour le bonus quotidien.</p>}
            </div>
          </div>
        )}
        {(phase === 'ready' || phase === 'opening') && (
          <div className="focus-pack">
            <p className="focus-title">{phase === 'ready' ? prod.name : ' '}</p>
            <Pack key={nonce} prod={prod} phase={phase} onOpen={tearOpen} />
            <p className={'swipe-hint' + (phase === 'opening' ? ' gone' : '')}><span className="swipe-hand" aria-hidden="true"><Icon name="hand" size={22} /></span>Glisse ton doigt le long du haut du booster pour le déchirer</p>
            {phase === 'ready' && <button className="btn ghost small" onClick={tearOpen}>Ouvrir sans glisser</button>}
          </div>
        )}

        {phase === 'reveal' && pack && (
          <div className="reveal-zone">
            <div className="rv-top">
              <span className="rv-count" aria-live="polite">{m} / {pack.pulls.length}</span>
              <span className="rv-run">Valeur du tirage <Money value={runValue} /></span>
            </div>
            <button className="rv-table" onClick={next} aria-label={upcoming ? `Retourner la carte ${m + 1} sur ${pack.pulls.length}` : 'Voir le résumé'}>
              <span className="rv-slot">
                {left > 0 && <span className="rv-deck" aria-hidden="true">{Array.from({ length: Math.min(6, left - (charging ? 1 : 0)) }, (_, i) => <i key={i} style={{ '--d': i }}><CardBack game={game} /></i>)}</span>}
                {charging && upcoming ? <Reveal key={'c' + m} x={upcoming} state="charging" />
                  : shown ? <Reveal key={'f' + m} x={shown} state="front" isNew={pack.fresh.has(m - 1)} value={eurOf(shown.card, d.P, d.fx)} />
                  : <span className="rv-hint"><Icon name="hand" size={28} />Touche le paquet pour retourner la première carte</span>}
              </span>
            </button>
            <div className="row center">
              <button className="btn primary" onClick={next} disabled={charging}>{upcoming ? 'Carte suivante' : 'Voir le résumé'}<Icon name="arrow" size={18} /></button>
              <button className="btn ghost" onClick={() => { setM(pack.pulls.length); setPhase('summary'); SFX.success(); }}>Tout révéler</button>
            </div>
            <div className="rv-strip" aria-label="Cartes déjà révélées">
              {pack.pulls.slice(0, Math.max(0, m - 1)).map((x, i) => <span key={i} className={'strip-card lv-' + levelOf(x)} style={{ '--lc': LV_COLOR[levelOf(x)] }} title={x.card.name + ' ' + x.card.number}><CardArt card={x.card} tilt={false} fx={0} /></span>)}
            </div>
          </div>
        )}

        {phase === 'summary' && pack && !bulk && <PackSummary pack={pack} actions={actions(true)} />}
        {phase === 'summary' && bulk && <DisplaySummary bulk={bulk} actions={actions(true)} />}
      </section>

      <BoosterStats game={game} wallet={wallet} />
      <Quests compact />
      <EVPanel prod={prod} title={false} />
      <EVRanking game={game} current={prod.code} onPick={(c) => { choose(c); scrollTo({ top: 0, behavior: 'smooth' }); }} />
      {latest && <League prod={latest} />}
      <VirtualSet prod={prod} />
      <PullHistory game={game} />

      <Modal open={odds} onClose={() => setOdds(false)} title={'Taux · ' + prod.name}>
        <p className="muted">{prod.size} cartes : {prod.composition}</p>
        {prod.odds.map(([title, rows]) => {
          const tot = rows.reduce((s, r) => s + r[2], 0);
          return (
            <div key={title} className="odds">
              <h4>{title}</h4>
              {rows.map(([k, l, w]) => { const pct = (w / tot) * 100; return <div key={k} className="odd-row"><span>{l}</span><span className="odd-bar"><i style={{ width: Math.max(2, pct) + '%' }} /></span><b>{(Math.round(pct * 10) / 10).toLocaleString('fr-FR')} %</b></div>; })}
            </div>
          );
        })}
        <p className="source-note">Les éditeurs ne publient pas de taux officiels. Ces probabilités sont des estimations Kirakai inspirées des retours de la communauté ; elles ne prédisent pas le contenu d’un vrai booster. Cartes virtuelles, sans valeur monétaire.</p>
      </Modal>
    </div>
  );
}

// Booster « léger » pour les vignettes du sélecteur (sans calculer les pools)
const buildProductLite = (game, s) => ({ game, code: s.code, name: s.name, logo: game === 'pokemon' ? s.logo : null, size: 7, cover: [] });

function VirtualMini({ prod }) {
  const virtual = useStore((s) => s.packs.virtual);
  const have = prod.cards.filter((c) => virtual[c.key]).length;
  return (
    <a className="vmini" href="#collection-virtuelle" onClick={(e) => { e.preventDefault(); document.getElementById('collection-virtuelle')?.scrollIntoView({ behavior: 'smooth' }); }}>
      <Ring value={have / Math.max(1, prod.cards.length)} size={54} stroke={6} />
      <span><b>{have} / {prod.cards.length}</b><small>cartes obtenues dans cette extension</small></span>
      <Icon name="down" size={18} />
    </a>
  );
}

function PackSummary({ pack, actions }) {
  const d = useData();
  const best = [...pack.pulls.map((x, i) => ({ x, i }))].sort((a, b) => levelOf(b.x) - levelOf(a.x) || (eurOf(b.x.card, d.P, d.fx) || 0) - (eurOf(a.x.card, d.P, d.fx) || 0))[0];
  return (
    <div className="summary">
      <div className="sum-head">
        <div className="sum-best">
          <span className="kicker">Carte de tête</span>
          <a href={cardHref(best.x.card)} className="sb-card" style={{ '--lc': LV_COLOR[levelOf(best.x)] }}><CardArt card={best.x.card} className="live" eager /></a>
          <b>{best.x.card.name}</b><small>{rarLabel(best.x)}</small>
        </div>
        <div className="sum-info">
          <span className="kicker">Valeur réelle du tirage</span>
          <b className="sum-value"><Money value={pack.value} /></b>
          <p className="muted">{pack.fresh.size} nouvelle{pack.fresh.size > 1 ? 's' : ''} carte{pack.fresh.size > 1 ? 's' : ''} dans ta collection virtuelle · niveau {LEVELS[levelOf(best.x)].toLowerCase()}</p>
          {actions}
        </div>
      </div>
      <div className="sum-grid">
        {pack.pulls.map((x, i) => {
          const v = eurOf(x.card, d.P, d.fx);
          return (
            <a key={i} href={cardHref(x.card)} className={'sum-card lv-' + levelOf(x)} style={{ '--i': i, '--lc': LV_COLOR[levelOf(x)] }}>
              <span className="sc-art"><CardArt card={x.card} />{pack.fresh.has(i) && <span className="badge-new">Nouvelle</span>}</span>
              <span className="sc-meta"><b>{x.card.name}</b><small>{x.card.number} · {rarLabel(x)}</small><em>{v != null ? fmtEur(v) : '—'}</em></span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function DisplaySummary({ bulk, actions }) {
  const d = useData();
  const all = bulk.packs.flatMap((p) => p.pulls);
  const tops = [...all].sort((a, b) => levelOf(b) - levelOf(a) || (eurOf(b.card, d.P, d.fx) || 0) - (eurOf(a.card, d.P, d.fx) || 0)).slice(0, 5);
  return (
    <div className="summary">
      <div className="sum-head display">
        <div className="sum-info">
          <span className="kicker">Display · {bulk.packs.length} boosters</span>
          <b className="sum-value"><Money value={bulk.value} /></b>
          <p className="muted">Valeur réelle de la display au prix du jour · {bulk.fresh} nouvelle{bulk.fresh > 1 ? 's' : ''} carte{bulk.fresh > 1 ? 's' : ''} dans ta collection virtuelle</p>
          {actions}
        </div>
        <div className="sum-tops">
          {tops.map((x, i) => <a key={i} href={cardHref(x.card)} className="st-card" style={{ '--i': i, '--lc': LV_COLOR[levelOf(x)] }}><CardArt card={x.card} className={i === 0 ? 'live' : ''} /><small>{rarLabel(x)}</small></a>)}
        </div>
      </div>
      <div className="bulk-list">
        {bulk.packs.map((p, i) => {
          const h = [...p.pulls].sort((a, b) => levelOf(b) - levelOf(a))[0];
          return (
            <div key={i} className="bulk-pack" style={{ '--i': i }}>
              <span className="bulk-num">#{i + 1}</span>
              <span className="bulk-cards">{p.pulls.map((x, k) => <a key={k} href={cardHref(x.card)} className={'strip-card lv-' + levelOf(x) + (p.fresh.has(k) ? ' fresh' : '')} style={{ '--lc': LV_COLOR[levelOf(x)] }} title={x.card.name + ' ' + x.card.number + ' · ' + rarLabel(x)}><CardArt card={x.card} tilt={false} fx={0} /></a>)}</span>
              <span className="bulk-head"><b>{h.card.name}</b><span>{rarLabel(h)} · {fmtEur(p.value)}</span></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BoosterStats({ game, wallet }) {
  const d = useData();
  const virtual = useStore((s) => s.packs.virtual);
  const vv = useMemo(() => Object.keys(virtual).reduce((t, k) => { if (!k.startsWith(game + ':')) return t; const c = d.cats[game].byId.get(k.slice(game.length + 1)); return t + ((c && eurOf(c, d.P, d.fx)) || 0); }, 0), [virtual, game, d.v]);
  return (
    <div className="stats pack-stats">
      <Stat label="Aujourd’hui" icon="calendar" value={fmtNum(wallet?.openedToday || 0)} sub={'booster' + ((wallet?.openedToday || 0) > 1 ? 's' : '') + ' ouvert' + ((wallet?.openedToday || 0) > 1 ? 's' : '')} />
      <Stat label="Au total" icon="pack" value={fmtNum(wallet?.opened || 0)} sub={'boosters ' + GAMES[game].label} />
      <Stat label="Collection virtuelle" icon="gem" value={fmtEur(vv)} sub="valeur de tes cartes virtuelles au prix du jour" tone="gold" />
      {wallet?.best && <Stat label="Meilleur tirage" icon="crown" value={wallet.best.name} sub={wallet.best.rarity} href={href('/carte/' + encodeURIComponent(wallet.best.key))} />}
      <Stat label="Succès" icon="trophy" value={Object.keys(getState().achievements || {}).length + ' / ' + ACHIEVEMENTS.length} sub="voir tous les succès" href={href('/succes')} />
    </div>
  );
}

function PullHistory({ game }) {
  const all = useStore((s) => s.packs.history);
  const hist = useMemo(() => (all || []).filter((h) => h.game === game).slice(0, 8), [all, game]);
  if (!hist.length) return null;
  return (
    <Section kicker="Journal" title="Mes derniers tirages">
      <div className="pull-log">
        {hist.map((h, i) => (
          <div key={i} className="pl-row" style={{ '--lc': LV_COLOR[h.best?.lv || 0] }}>
            <span className="pl-dot" />
            <span className="pl-main"><b>{h.n > 1 ? `Display ${h.set}` : `Booster ${h.set}`}</b><small>{fmtDate(h.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{h.best ? ' · ' + h.best.name : ''}</small></span>
            <b className="pl-val">{fmtEur(h.value)}</b>
          </div>
        ))}
      </div>
    </Section>
  );
}

function VirtualSet({ prod }) {
  const virtual = useStore((s) => s.packs.virtual);
  const [filter, setFilter] = useState('all');
  const cards = prod.cards;
  const have = cards.filter((c) => virtual[c.key]);
  const shown = cards.filter((c) => filter === 'all' || (filter === 'have' ? virtual[c.key] : !virtual[c.key]));
  const [n, sentinel] = useInfinite(shown.length, 48, [filter, prod.code]);
  const byRar = useMemo(() => {
    const m = new Map();
    for (const c of cards) { const k = c.rarity + (c.variant && /^Parallèle/.test(c.variant) ? ' ✦' : ''); const r = m.get(k) || [0, 0]; r[1]++; if (virtual[c.key]) r[0]++; m.set(k, r); }
    return [...m.entries()];
  }, [cards, virtual]);
  return (
    <section className="section" id="collection-virtuelle">
      <header className="section-head">
        <div><div className="kicker">Collection virtuelle</div><h2>{prod.name}</h2></div>
        <Seg value={filter} onChange={setFilter} label="Filtre" options={[['all', 'Toutes'], ['have', 'Obtenues'], ['missing', 'À découvrir']]} />
      </header>
      <div className="vc-head panel">
        <Ring value={have.length / Math.max(1, cards.length)} size={84} stroke={8} sub={have.length + '/' + cards.length} />
        <div className="vc-rar">{byRar.map(([k, [h, t]]) => <span key={k} className={'vr' + (h === t ? ' full' : '')}><b>{k}</b>{h}/{t}</span>)}</div>
      </div>
      <div className="grid tiles vc">
        {shown.slice(0, n).map((c) => virtual[c.key] ? (
          <a key={c.key} className="tile got" href={cardHref(c)}><div className="tile-art"><CardArt card={c} />{virtual[c.key] > 1 && <span className="own-badge">×{virtual[c.key]}</span>}</div><div className="tile-body"><div className="tile-name">{c.name}</div><div className="tile-meta"><span className="num">{c.number}</span>· {c.rarity}{c.variant ? <span className="variant">{c.variant.toLowerCase()}</span> : null}</div></div></a>
        ) : (
          <div key={c.key} className="tile missing"><div className="tile-art"><CardArt card={c} tilt={false} fx={0} /><span className="miss-q">?</span></div><div className="tile-body"><div className="tile-name">{c.name}</div><div className="tile-meta"><span className="num">{c.number}</span>· {c.rarity}</div></div></div>
        ))}
      </div>
      <div ref={sentinel} className="sentinel" />
      <p className="source-note">Cartes virtuelles : aucune carte physique, aucune valeur monétaire. Touche une carte obtenue pour voir sa fiche et son vrai prix.</p>
    </section>
  );
}

// ---- Boutique de Berrys et de Pokéballs ----
const BUNDLES = [['Bourse', 1000, 0, '1,99 €'], ['Sacoche', 2750, 250, '4,99 €'], ['Coffre', 6000, 1000, '9,99 €', 'Populaire'], ['Trésor', 13000, 3000, '19,99 €'], ['Trésor légendaire', 35000, 10000, '49,99 €', 'Meilleure offre']];
export function ShopPage() {
  const game = useUniverse();
  const cur = CURRENCY[game];
  const coins = useStore((s) => s.wallet?.[game]?.coins ?? PRICE.start);
  useEffect(() => { claimDaily(game, PRICE.start, PRICE.daily); }, [game]);
  return (
    <div className="page shop-page">
      <div className="kicker">Boutique</div>
      <h1 className="page-title">Des {cur.name} pour tes boosters</h1>
      <div className={'wallet panel ' + game}><span className="coin" aria-hidden="true">{cur.sym}</span><div className="w-bal"><b><Count value={coins} /></b><span>{cur.name}</span></div><span className="spacer" /><a className="btn small primary" href={href('/boosters')}>Ouvrir des boosters</a></div>
      <p className="warn-note" style={{ margin: '16px 0' }}><Icon name="info" size={16} />Prix indicatifs. Le paiement n’est pas en place : aucun achat n’est possible et aucune donnée bancaire n’est demandée. En attendant, tu reçois {PRICE.daily} {cur.name} chaque jour.</p>
      <div className="bundles">
        {BUNDLES.map(([name, amount, bonus, price, flag], i) => (
          <div key={name} className={'bundle panel ' + game + (flag ? ' flag' : '')} style={{ '--i': i }}>
            {flag && <span className="bundle-flag">{flag}</span>}
            <span className="coin-stack" aria-hidden="true">{Array.from({ length: Math.min(5, i + 1) }, (_, k) => <span key={k} className="coin" style={{ '--k': k }}>{cur.sym}</span>)}</span>
            <h3>{name}</h3>
            <b>{fmtNum(amount)} {cur.name}</b>
            <small>{bonus ? `dont +${fmtNum(bonus)} offerts` : ' '}</small>
            <span className="muted small">≈ {Math.floor(amount / PRICE.booster)} boosters{amount >= PRICE.display ? ` ou ${Math.floor(amount / PRICE.display)} display${amount >= PRICE.display * 2 ? 's' : ''}` : ''}</span>
            <span className="bundle-price">{price}</span>
            <button className="btn ghost" disabled>Bientôt</button>
          </div>
        ))}
      </div>
      <div className="faq-grid" style={{ marginTop: 30 }}>
        <div className="panel pad"><h3>Repères</h3><p>1 booster {GAMES[game].label} = {PRICE.booster} {cur.name} ; 1 display ({PRICE.displayPacks} boosters, 10 + 2 offerts) = {fmtNum(PRICE.display)} {cur.name}.</p></div>
        <div className="panel pad"><h3>Une monnaie par univers</h3><p>Les {cur.name} ne servent qu’aux boosters {GAMES[game].label}.</p></div>
        <div className="panel pad"><h3>Virtuel</h3><p>Monnaies et cartes virtuelles : aucune valeur réelle, aucune carte physique.</p></div>
      </div>
    </div>
  );
}

// ---- Succès ----
export function AchievementsPage() {
  const got = useStore((s) => s.achievements) || {};
  const n = Object.keys(got).length;
  return (
    <div className="page">
      <div className="kicker">Progression</div>
      <h1 className="page-title">Succès <small>{n} / {ACHIEVEMENTS.length}</small></h1>
      <p className="lead">Ouvre des boosters, complète tes extensions, scanne tes cartes et surveille le marché pour tous les débloquer.</p>
      <div className="ach-head panel"><Ring value={n / ACHIEVEMENTS.length} size={96} stroke={9} /><span><b>{Math.round((n / ACHIEVEMENTS.length) * 100)} % débloqués</b><small>Les succès sont enregistrés sur cet appareil avec ta collection.</small></span></div>
      <div className="ach-grid">
        {ACHIEVEMENTS.map((a, i) => (
          <div key={a.id} className={'ach' + (got[a.id] ? ' on' : '')} style={{ '--i': i }}>
            <span className="ach-ico"><Icon name={a.icon} size={24} /></span>
            <span className="ach-txt"><b>{a.title}</b><small>{a.text}</small>{got[a.id] && <em>Débloqué le {fmtDate(got[a.id], { day: 'numeric', month: 'short', year: 'numeric' })}</em>}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
