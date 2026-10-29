import React, { useEffect, useState } from 'react';
import { img, priceOf, eurOf, trendOf, fxLevel, CUR, fmtEur, fmtPct, GAMES } from '../lib/data.js';
import { useData, cardHref } from '../lib/hooks.js';
import { useStore, toggleWatch, toggleCompare, toggleWish } from '../lib/store.js';
import Icon from './Icon.jsx';

// ---- Image de carte avec reflets holographiques selon la rareté ----
// Le survol est géré pour toute la page par un seul écouteur (installTilt), via l'attribut data-tilt.
export function CardArt({ card, size = 'small', className = '', eager = false, alt, fx, tilt = true, style }) {
  const [state, setState] = useState('loading');
  const [useEn, setUseEn] = useState(false);
  const local = img(card?.image, size);
  const src = useEn && card?.en?.image ? img(card.en.image, size) : local;
  useEffect(() => { setState(src ? 'loading' : 'error'); }, [src]);
  useEffect(() => { setUseEn(false); }, [local]);
  const fail = () => { if (!useEn && card?.en?.image && card.en.image !== card.image) setUseEn(true); else setState('error'); };
  const lvl = fx ?? fxLevel(card);
  return (
    <div className={`cart fx-${lvl} is-${state} ${className}`} data-tilt={tilt ? '' : undefined} data-game={card?.game} style={style}>
      <div className="cart-in">
        {src && state !== 'error' && <img src={src} alt={alt ?? (card ? card.name + ' ' + card.number : '')} loading={eager ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" onLoad={() => setState('ok')} onError={fail} draggable="false" />}
        {state === 'error' && <div className="cart-fallback"><b>{card?.name}</b>{card?.nameFr && card.lang === 'ja' && <em>{card.nameFr}</em>}<small>{card?.number}</small></div>}
        {lvl >= 2 && <span className="cart-holo" />}
        <span className="cart-glare" />
      </div>
    </div>
  );
}

// Un seul écouteur pour faire pencher toutes les cartes survolées (souris et stylet)
export function installTilt() {
  let cur = null, raf = 0;
  const reset = (el) => { el.classList.remove('tilting'); el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); };
  const onMove = (e) => {
    if (e.pointerType === 'touch') return;
    const el = e.target.closest?.('[data-tilt]');
    if (cur && cur !== el) reset(cur);
    cur = el;
    if (!el || document.documentElement.dataset.fx === 'lite') return;
    const x = e.clientX, y = e.clientY;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const px = Math.max(0, Math.min(1, (x - r.left) / r.width)), py = Math.max(0, Math.min(1, (y - r.top) / r.height));
      const k = r.width > 260 ? 12 : 18;
      el.style.setProperty('--rx', ((0.5 - py) * k).toFixed(2) + 'deg');
      el.style.setProperty('--ry', ((px - 0.5) * k * 1.25).toFixed(2) + 'deg');
      el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      el.style.setProperty('--hyp', Math.min(1, Math.hypot(px - 0.5, py - 0.5) * 2).toFixed(3));
      el.classList.add('tilting');
    });
  };
  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', () => { if (cur) reset(cur); cur = null; });
}

export function LangTag({ card }) {
  if (card?.lang === 'ja') return <span className="ltag ja" title="Carte japonaise">JP</span>;
  if (card?.local === 'fr') return <span className="ltag fr" title="Nom et image de la version française">FR</span>;
  if (card?.local === 'ja') return <span className="ltag ja" title="Nom et image de la version japonaise">JP</span>;
  return null;
}

export function Delta({ pct, small, plain }) {
  if (pct == null || !isFinite(pct)) return null;
  const dir = pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat';
  return <span className={'delta ' + dir + (small ? ' small' : '') + (plain ? ' plain' : '')}><i aria-hidden="true">{dir === 'up' ? '▲' : dir === 'down' ? '▼' : '●'}</i>{fmtPct(Math.abs(pct)).replace('+', '')}</span>;
}

export const GameTag = ({ game }) => <span className={'gtag ' + game}>{GAMES[game]?.short}</span>;

export function Price({ card, big, className = '' }) {
  const { P, fx } = useData();
  const p = priceOf(card, P);
  const eur = eurOf(card, P, fx);
  if (eur == null) return <span className={'price none ' + className}>Pas de prix relevé</span>;
  const src = p.converted ? 'USD' : 'EUR';
  return (
    <span className={'price' + (big ? ' big' : '') + ' ' + className} title={(p.converted ? 'Prix TCGplayer en dollars' : 'Prix Cardmarket en euros') + (src !== CUR.code ? ', converti en ' + CUR.name : '')}>
      {src !== CUR.code && <span className="approx">≈</span>}{fmtEur(eur)}
    </span>
  );
}

// ---- Vignette de carte (grilles) ----
export function CardTile({ card, extra, rank, compact, onClick, owned, showSet = !compact, actions = true }) {
  const d = useData();
  const watch = useStore((s) => !!s.watch[card.key]);
  const cmp = useStore((s) => s.compare.includes(card.key));
  const wish = useStore((s) => !!s.wish?.[card.key]);
  const mine = useStore((s) => (owned === undefined ? s.collection.reduce((n, e) => n + (e.key === card.key ? e.qty : 0), 0) : owned));
  const trend = card.game === 'pokemon' ? trendOf(card, d.P) : null;
  const set = d.cats?.[card.game]?.sets.get(card.set);
  const stop = (f) => (e) => { e.preventDefault(); e.stopPropagation(); f(); };
  const content = (
    <>
      <div className="tile-art">
        <CardArt card={card} />
        {rank && <span className={'rank-badge r' + Math.min(rank, 4)}>{rank}</span>}
        {mine > 0 && <span className="own-badge" title="Dans ta collection">{mine > 1 ? '×' + mine : <Icon name="check" size={12} stroke={3} />}</span>}
        {actions && (
          <span className="tile-actions">
            <button type="button" className={wish ? 'on wish' : ''} onClick={stop(() => toggleWish(card.key, eurOf(card, d.P, d.fx)))} aria-label={wish ? 'Retirer de ma liste de souhaits' : 'Ajouter à ma liste de souhaits'} title={wish ? 'Dans ta liste de souhaits' : 'Je la veux'}><Icon name="heart" size={15} /></button>
            <button type="button" className={watch ? 'on' : ''} onClick={stop(() => toggleWatch(card.key, eurOf(card, d.P, d.fx)))} aria-label={watch ? 'Ne plus suivre' : 'Suivre le prix'} title={watch ? 'Suivie' : 'Suivre le prix'}><Icon name="eye" size={15} /></button>
            <button type="button" className={cmp ? 'on' : ''} onClick={stop(() => toggleCompare(card.key))} aria-label={cmp ? 'Retirer du comparateur' : 'Comparer'} title="Comparer"><Icon name="compare" size={15} /></button>
          </span>
        )}
        {watch && !actions && <span className="watch-dot" title="Suivie"><Icon name="eye" size={12} /></span>}
      </div>
      <div className="tile-body">
        <div className="tile-name">{card.name}</div>
        <div className="tile-meta"><GameTag game={card.game} /><LangTag card={card} /><span className="num">{card.number}</span>{card.variant && <span className="variant">{card.variant}</span>}</div>
        {showSet && <div className="tile-set">{set?.name}</div>}
        <div className="tile-price"><Price card={card} />{trend != null && Math.abs(trend) >= 1 && <Delta pct={trend} small />}{extra}</div>
      </div>
    </>
  );
  if (onClick) return <button type="button" className="tile" onClick={onClick}>{content}</button>;
  return <a className="tile" href={cardHref(card)}>{content}</a>;
}

// ---- Illustration d'une extension : éventail de ses trois cartes les plus chères ----
export function setArtCards(cards, d) {
  const priced = cards.map((c) => [eurOf(c, d.P, d.fx) || 0, c]).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  const withImg = (l) => l.filter((c) => c.image);
  const pick = withImg(priced).slice(0, 3);
  return pick.length >= 3 ? pick : withImg(cards).slice(0, 3);
}
export function SetArt({ cards, code, big, logo }) {
  const order = cards.length === 3 ? [cards[1], cards[0], cards[2]] : cards;
  const [logoOk, setLogoOk] = useState(true);
  return (
    <div className={'set-art' + (big ? ' big' : '') + (logo && logoOk ? ' has-logo' : '')} aria-hidden="true">
      <span className="sa-glow" />
      {order.map((c, i) => <span key={c.key} className={'sa-card p' + (order.length === 3 ? i : 1)}><CardArt card={c} tilt={false} fx={0} /></span>)}
      {logo && logoOk && <img className="sa-logo" src={img(logo)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setLogoOk(false)} />}
      {code && !(logo && logoOk) && <b className="sa-code">{code}</b>}
    </div>
  );
}
