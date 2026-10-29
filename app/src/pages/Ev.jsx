import React, { useMemo, useState } from 'react';
import { useData, href, cardHref } from '../lib/hooks.js';
import { fmtEur, fromDisp, CUR, GAMES } from '../lib/data.js';
import { packStats, rankSets, oneIn, DISPLAY } from '../lib/ev.js';
import { CardArt } from '../ui/Card.jsx';
import Icon from '../ui/Icon.jsx';

// Ce que rapporte un booster en moyenne : prix du jour réels × taux estimés (voir lib/ev.js).

const NOTE = 'Estimation Kirakai : taux de tirage estimés par la communauté (les éditeurs n’en publient pas) multipliés par les prix du jour relevés. Une carte sans prix relevé compte pour 0.';

const slotRows = (rows) => Object.values(rows.reduce((o, r) => { const x = (o[r.label] ||= { label: r.label, ev: 0, n: 0 }); x.ev += r.ev; x.n++; return o; }, {}));

// Ligne compacte (à côté du booster)
export function EVLine({ prod }) {
  const d = useData();
  const st = useMemo(() => packStats(prod, d.P, d.fx), [prod, d.v]);
  return (
    <p className="ev-line">
      <Icon name="gem" size={16} />
      <span>Un vrai booster de cette extension vaut <b>{fmtEur(st.ev)}</b> en moyenne, mais la moitié valent moins de <b>{fmtEur(st.median)}</b>.</span>
    </p>
  );
}

// Panneau détaillé : moyenne, médiane, chances, cartes phares, rentabilité selon le prix payé
export function EVPanel({ prod, title = true }) {
  const d = useData();
  const st = useMemo(() => packStats(prod, d.P, d.fx), [prod, d.v]);
  const [paid, setPaid] = useState('');
  const n = DISPLAY[prod.game];
  const cost = paid === '' ? null : fromDisp(Number(String(paid).replace(',', '.')));
  const diff = cost != null && isFinite(cost) ? st.ev - cost : null;
  const t1 = fromDisp(CUR.code === 'JPY' ? 1500 : 10), t2 = fromDisp(CUR.code === 'JPY' ? 7500 : 50);
  return (
    <section className={'ev panel pad ' + prod.game}>
      {title && (
        <header className="ev-head">
          <div><div className="kicker">Ce que rapporte un booster</div><h3>{prod.name} <small>{prod.code}</small></h3></div>
          <a className="btn small ghost" href={href('/boosters?set=' + encodeURIComponent(prod.code))}><Icon name="pack" size={16} />Ouvrir (virtuel)</a>
        </header>
      )}
      <div className="ev-figs">
        <div className="ev-fig main"><small>Valeur moyenne d’un booster</small><b>{fmtEur(st.ev)}</b><span>{n} boosters (display) : {fmtEur(st.displayEv)}</span></div>
        <div className="ev-fig"><small>Booster « typique » (médiane)</small><b>{fmtEur(st.median)}</b><span>8 boosters sur 10 entre {fmtEur(st.p10)} et {fmtEur(st.p90)}</span></div>
        <div className="ev-fig"><small>Booster à plus de {fmtEur(t1, { decimals: 0 })}</small><b>{oneIn(st.above(t1))}</b><span>plus de {fmtEur(t2, { decimals: 0 })} : {oneIn(st.above(t2))}</span></div>
      </div>
      <div className="ev-slots" aria-label="D’où vient la valeur d’un booster">
        {slotRows(st.bySlot).map((s) => <span key={s.label} style={{ '--w': Math.max(2, (s.ev / st.ev) * 100) + '%' }}><small>{s.n > 1 ? s.n + ' × ' : ''}{s.label}</small><i /><b>{fmtEur(s.ev)}</b></span>)}
      </div>
      {st.chase.length > 0 && (
        <>
          <h4 className="ev-sub">Les cartes que tout le monde cherche</h4>
          <div className="ev-chase">
            {st.chase.slice(0, 6).map((x) => (
              <a key={x.card.key} className="ev-card" href={cardHref(x.card)}>
                <span className="ev-art"><CardArt card={x.card} tilt={false} /></span>
                <span className="ev-name">{x.card.name}</span>
                <b>{fmtEur(x.eur)}</b>
                <small>{oneIn(x.p)} booster{x.p < 0.5 ? 's' : ''}</small>
                <small className="faint">1 display sur {Math.max(1, Math.round(1 / (1 - Math.pow(1 - x.p, n))))}</small>
              </a>
            ))}
          </div>
        </>
      )}
      <div className="ev-calc">
        <label htmlFor={'ev-paid-' + prod.code}>Combien paies-tu un booster ?</label>
        <span className="ev-input"><input id={'ev-paid-' + prod.code} type="number" min="0" step="0.01" inputMode="decimal" placeholder="ex. 5,50" value={paid} onChange={(e) => setPaid(e.target.value)} /><em>{CUR.sym}</em></span>
        {diff != null && (
          <p className={'ev-verdict ' + (diff >= 0 ? 'up' : 'down')}>
            {diff >= 0 ? <>En moyenne tu <b>gagnes {fmtEur(diff)}</b> par booster</> : <>En moyenne tu <b>perds {fmtEur(-diff)}</b> par booster</>}
            {' '}({diff >= 0 ? '+' : '−'}{fmtEur(Math.abs(diff) * n)} sur un display de {n}). Un booster sur {Math.max(1, Math.round(1 / Math.max(st.above(cost), 1 / 20000)))} vaut plus que son prix.
          </p>
        )}
      </div>
      <p className="source-note">{NOTE}{prod.pools.moved?.length ? ` ${prod.pools.moved.length > 1 ? prod.pools.moved.length + ' cartes classées' : 'Une carte classée'} « commune » ou « rare » par la source mais vendue${prod.pools.moved.length > 1 ? 's' : ''} comme une carte secrète (${prod.pools.moved.map((c) => c.name).join(', ')}) ${prod.pools.moved.length > 1 ? 'sont comptées' : 'est comptée'} parmi les plus rares.` : ''}</p>
    </section>
  );
}

// Classement des extensions : laquelle ouvrir ?
export function EVRanking({ game, current, onPick }) {
  const d = useData();
  const rows = useMemo(() => (d.ready ? rankSets(game, d) : []), [d.ready, d.v, game]);
  if (rows.length < 2) return null;
  const max = rows[0].st.ev;
  const t1 = fromDisp(CUR.code === 'JPY' ? 1500 : 10);
  return (
    <section className="section ev-rank" id="rentabilite">
      <div className="section-head">
        <div><div className="kicker">Rentabilité · {GAMES[game].label}</div><h2>Quelle extension ouvrir ?</h2><p className="section-lead">La valeur moyenne d’un booster pour chaque extension, au prix du jour.</p></div>
      </div>
      <div className="ev-table panel" role="table">
        <div className="ev-tr head" role="row"><span role="columnheader">Extension</span><span role="columnheader">Moyenne</span><span role="columnheader" className="hide-xs">Médiane</span><span role="columnheader" className="hide-xs">&gt; {fmtEur(t1, { decimals: 0 })}</span><span role="columnheader">Carte phare</span></div>
        {rows.map(({ set, prod, st }, i) => (
          <div key={set.code} role="row" className={'ev-tr' + (set.code === current ? ' on' : '')}>
            <span role="cell" className="ev-set">
              <em className={i === 0 ? 'gold' : ''}>{i + 1}</em>
              <button className="link" onClick={() => (onPick ? onPick(set.code) : (location.hash = '#/boosters?set=' + encodeURIComponent(set.code)))}><b>{set.code}</b><small>{set.name}</small></button>
            </span>
            <span role="cell" className="ev-val"><b>{fmtEur(st.ev)}</b><i style={{ width: (st.ev / max) * 100 + '%' }} /></span>
            <span role="cell" className="hide-xs">{fmtEur(st.median)}</span>
            <span role="cell" className="hide-xs">{oneIn(st.above(t1))}</span>
            <span role="cell" className="ev-top">{st.chase[0] ? <a href={cardHref(st.chase[0].card)}>{st.chase[0].card.name}<small>{fmtEur(st.chase[0].eur)} · {oneIn(st.chase[0].p)}</small></a> : '—'}</span>
          </div>
        ))}
      </div>
      <p className="source-note">{NOTE}</p>
    </section>
  );
}
