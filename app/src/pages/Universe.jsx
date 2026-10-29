import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useData, reduceMotion } from '../lib/hooks.js';
import { update } from '../lib/store.js';
import { fmtEur, fmtNum, fmtShort } from '../lib/data.js';
import { SFX, vibrate } from '../lib/sfx.js';
import { Logo, Emblem } from '../ui/Brand.jsx';
import { CardArt } from '../ui/Card.jsx';
import Icon from '../ui/Icon.jsx';

const SIDES = {
  onepiece: { to: '/op', title: 'ONE PIECE', sub: 'Card Game', tagline: 'Parallèles, mangas et trésors du Grand Line', chips: ['Extensions et parallèles', 'L’équipage', 'Boosters en Berrys', 'Classeur'], cry: 'Lève l’ancre !' },
  pokemon: { to: '/pk', title: 'POKÉMON', sub: 'Trading Card Game', tagline: 'De Set de Base à Méga-Évolution, en FR, EN et JP', chips: ['Extensions FR / EN / JP', 'Pokédex', 'Boosters en Pokéballs', 'Classeur'], cry: 'Attrape-les tous !' },
};

// Décor animé de chaque univers
function OceanScene() {
  return (
    <div className="scene ocean" aria-hidden="true">
      <span className="sun" />
      <svg className="rose" viewBox="0 0 200 200"><g fill="none" stroke="currentColor" strokeWidth=".6"><circle cx="100" cy="100" r="96" /><circle cx="100" cy="100" r="70" /><circle cx="100" cy="100" r="40" strokeDasharray="2 3" />{Array.from({ length: 32 }, (_, i) => { const a = (i * Math.PI) / 16; return <line key={i} x1={100 + Math.cos(a) * (i % 4 ? 88 : 30)} y1={100 + Math.sin(a) * (i % 4 ? 88 : 30)} x2={100 + Math.cos(a) * 96} y2={100 + Math.sin(a) * 96} />; })}</g><path d="M100 4 108 92 196 100 108 108 100 196 92 108 4 100 92 92z" fill="currentColor" opacity=".35" /></svg>
      {Array.from({ length: 14 }, (_, i) => <i key={i} className="mote" style={{ '--x': (i * 37) % 100 + '%', '--d': (i % 7) * 0.9 + 's', '--s': 0.6 + (i % 4) * 0.25 }} />)}
      <svg className="waves" viewBox="0 0 1200 220" preserveAspectRatio="none">
        <path className="w1" d="M0 120 C150 80 300 160 450 120 S750 80 900 120 S1100 160 1200 120 V220 H0z" />
        <path className="w2" d="M0 150 C200 110 350 190 600 150 S950 110 1200 150 V220 H0z" />
        <path className="w3" d="M0 180 C150 160 300 200 450 180 S750 160 900 180 S1100 200 1200 180 V220 H0z" />
      </svg>
    </div>
  );
}
function StormScene() {
  const bolts = useMemo(() => Array.from({ length: 4 }, (_, k) => {
    let x = 15 + k * 22 + Math.random() * 8, y = -5, d = `M${x} ${y}`;
    for (let i = 0; i < 7; i++) { x += (Math.random() - 0.5) * 9; y += 9 + Math.random() * 5; d += ` L${x.toFixed(1)} ${y.toFixed(1)}`; }
    return { d, delay: (k * 1.7 + Math.random()).toFixed(2) };
  }), []);
  return (
    <div className="scene storm" aria-hidden="true">
      <span className="hexes" />
      <span className="orb" />
      <span className="ring r1" /><span className="ring r2" /><span className="ring r3" />
      <svg className="bolts" viewBox="0 0 100 100" preserveAspectRatio="none">{bolts.map((b, i) => <path key={i} d={b.d} style={{ animationDelay: b.delay + 's' }} />)}</svg>
      {Array.from({ length: 16 }, (_, i) => <i key={i} className="spark" style={{ '--x': (i * 41) % 100 + '%', '--d': (i % 8) * 0.7 + 's', '--s': 0.5 + (i % 3) * 0.3 }} />)}
    </div>
  );
}

export default function UniversePage() {
  const d = useData();
  const [hover, setHover] = useState(null);
  const [going, setGoing] = useState(null);
  const root = useRef(null);
  // Inclinaison de la ligne de partage : suit la diagonale (9 % de la largeur sur toute la hauteur)
  useEffect(() => {
    const f = () => root.current?.style.setProperty('--seam', (Math.atan((0.09 * innerWidth) / innerHeight) * 180 / Math.PI).toFixed(2) + 'deg');
    f(); addEventListener('resize', f); return () => removeEventListener('resize', f);
  }, []);
  const top = useMemo(() => {
    if (!d.ready) return {};
    const out = {};
    for (const g of ['onepiece', 'pokemon']) {
      const ids = (d.M?.games?.[g]?.podium || []).filter(([id]) => !id.startsWith('jp-')).slice(0, 3).map(([id, eur]) => ({ c: d.cats[g].byId.get(id), eur })).filter((x) => x.c);
      out[g] = { ids, count: d.cats[g].cards.length, priced: d.M?.games?.[g]?.priced || 0, sets: d.cats[g].setList.filter((s) => s.lang !== 'ja').length };
    }
    return out;
  }, [d.ready]);
  const enter = (e, g) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
    e.preventDefault();
    if (going) return;
    const to = () => { update((s) => { s.universe = g; }); location.hash = '#' + SIDES[g].to; };
    if (reduceMotion()) return to();
    setGoing({ g, x: e.clientX || innerWidth / 2, y: e.clientY || innerHeight / 2 });
    if (g === 'onepiece') { SFX.haki(); setTimeout(() => SFX.whoosh(), 500); } else { SFX.charge(); setTimeout(() => SFX.thunder(), 450); }
    vibrate(g === 'onepiece' ? [40, 60, 120] : [20, 40, 20, 40, 90]);
    setTimeout(to, 1500);
  };
  return (
    <div className={'chooser' + (hover ? ' hover-' + hover : '')} ref={root}>
      <header className="ch-top"><Logo size={38} /></header>
      {['onepiece', 'pokemon'].map((g) => {
        const S = SIDES[g], t = top[g];
        return (
          <a key={g} href={'#' + S.to} className={'ch-side ' + g} onPointerEnter={() => setHover(g)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(g)} onBlur={() => setHover(null)} onClick={(e) => enter(e, g)}>
            {g === 'onepiece' ? <OceanScene /> : <StormScene />}
            <div className="ch-body">
              {t?.ids?.length === 3 && (
                <div className="ch-fan" aria-hidden="true">
                  {[t.ids[1], t.ids[0], t.ids[2]].map((x, i) => <span key={x.c.key} className={'ch-card c' + i}><CardArt card={x.c} className="live" eager tilt={false} /></span>)}
                </div>
              )}
              <div className="ch-text">
                <Emblem game={g} size={92} className="ch-emblem" />
                <h2><span className="ch-title">{S.title}</span><small>{S.sub}</small></h2>
                <p className="ch-tag">{S.tagline}</p>
                {t && (
                  <dl className="ch-stats">
                    <div><dt>Cartes</dt><dd>{fmtNum(t.count)}</dd></div>
                    <div><dt>Prix du jour</dt><dd>{fmtNum(t.priced)}</dd></div>
                    {t.ids?.[0] && <div><dt>Record</dt><dd>{fmtShort(t.ids[0].eur)}</dd></div>}
                  </dl>
                )}
                <div className="ch-chips">{S.chips.map((c) => <span key={c}>{c}</span>)}</div>
                <span className="ch-enter">Entrer dans l’univers <Icon name="arrow" size={18} /></span>
              </div>
            </div>
          </a>
        );
      })}
      <div className="ch-seam" aria-hidden="true"><span><b>CHOISIS</b><small>ton univers</small></span></div>
      {!d.ready && !d.error && <div className="ch-loading" aria-hidden="true"><span className="loader"><i /><i /><i /></span></div>}
      {going && <Warp {...going} title={SIDES[going.g].title} cry={SIDES[going.g].cry} best={top[going.g]?.ids?.[0]} />}
    </div>
  );
}

// Entrée dans l'univers : la couleur jaillit du clic, l'emblème tourne et avale l'écran
function Warp({ g, x, y, title, cry, best }) {
  return (
    <div className={'warp ' + g} style={{ '--x': x + 'px', '--y': y + 'px' }} aria-hidden="true">
      <div className="w-fill" />
      <div className="w-lines" />
      <i className="w-ring r1" /><i className="w-ring r2" /><i className="w-ring r3" />
      <div className="w-flash" />
      <div className="w-emblem"><Emblem game={g} size={220} /></div>
      <div className="w-title"><b>{title}</b><span>{cry}</span>{best && <small>Record du jour · {fmtEur(best.eur)}</small>}</div>
      <div className="w-end" />
    </div>
  );
}
