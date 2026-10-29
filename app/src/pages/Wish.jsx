import React, { useMemo, useState } from 'react';
import { useData, href, cardHref } from '../lib/hooks.js';
import { useStore, addToCollection, removeWish } from '../lib/store.js';
import { eurOf, resolveKey, fmtEur, fmtShort, fmtDate, fromDisp, CUR, GAMES } from '../lib/data.js';
import { toast } from '../lib/toast.js';
import { CardArt, Delta, GameTag, Price } from '../ui/Card.jsx';
import { Seg, Loading, Empty, Stat } from '../ui/Kit.jsx';
import Icon from '../ui/Icon.jsx';

// Liste de souhaits : les cartes que je veux, leur prix du jour, l'évolution depuis l'ajout, et ce que mon budget permet.

export default function WishPage() {
  const d = useData();
  const wish = useStore((s) => s.wish || {});
  const coll = useStore((s) => s.collection);
  const pref = useStore((s) => s.lang);
  const [sort, setSort] = useState('ajout');
  const [scope, setScope] = useState('all');
  const [budget, setBudget] = useState('');
  const rows = useMemo(() => {
    if (!d.ready) return [];
    const owned = new Set(coll.map((e) => e.key));
    return Object.entries(wish).map(([key, w]) => {
      const c = resolveKey(d.cats, key); if (!c) return null;
      const eur = eurOf(c, d.P, d.fx);
      return { c, w, eur, delta: w.eur && eur != null ? ((eur - w.eur) / w.eur) * 100 : null, own: owned.has(key) };
    }).filter(Boolean);
  }, [wish, coll, d.ready, d.v]);
  if (!d.ready) return <div className="page"><Loading /></div>;
  const list = rows.filter((r) => scope === 'all' || r.c.game === scope).sort((a, b) =>
    sort === 'prix' ? (b.eur ?? -1) - (a.eur ?? -1)
      : sort === 'moins' ? (a.eur ?? 1e9) - (b.eur ?? 1e9)
      : sort === 'baisse' ? (a.delta ?? 1e9) - (b.delta ?? 1e9)
      : String(b.w.addedAt).localeCompare(String(a.w.addedAt)));
  const total = list.reduce((t, r) => t + (r.eur || 0), 0);
  const cheaper = list.filter((r) => r.delta != null && r.delta <= -1);
  const saved = cheaper.reduce((t, r) => t + (r.w.eur - r.eur), 0);
  // Budget : les cartes les moins chères d'abord
  const b = budget === '' ? null : fromDisp(Number(String(budget).replace(',', '.')));
  const fits = new Set();
  let spent = 0;
  if (b != null && isFinite(b)) for (const r of [...list].filter((r) => r.eur != null && !r.own).sort((x, y) => x.eur - y.eur)) { if (spent + r.eur > b) break; spent += r.eur; fits.add(r.c.key); }
  const games = [...new Set(rows.map((r) => r.c.game))];
  const got = (r) => {
    addToCollection(r.c.key, { lang: r.c.lang === 'ja' ? 'jp' : pref === 'fr' ? 'fr' : pref === 'ja' ? 'jp' : 'en', paid: r.eur != null ? Math.round(r.eur * 100) / 100 : null });
    removeWish(r.c.key);
    toast(`${r.c.name} rejoint ta collection.`, { icon: 'album', title: 'Bien joué !' });
  };
  return (
    <div className="page wish-page">
      <div className="kicker">Outils</div>
      <h1 className="page-title">Ma liste de <span className="grad">souhaits</span></h1>
      <p className="lead">Les cartes que tu veux, au prix du jour. Repère celles qui baissent et vois ce que ton budget te permet de t’offrir.</p>
      {rows.length === 0 ? (
        <Empty icon="heart" title="Ta liste de souhaits est vide" action={<a className="btn primary" href={href('/recherche')}>Trouver une carte</a>}>
          Touche le cœur sur une vignette ou « Je la veux » sur la fiche d’une carte. Sur la page d’une extension, tu peux aussi ajouter d’un coup toutes les cartes qui te manquent.
        </Empty>
      ) : (
        <>
          <div className="stats" style={{ margin: '6px 0 18px' }}>
            <Stat label="Cartes voulues" icon="heart" value={list.length} />
            <Stat label="Budget pour tout avoir" icon="gem" value={fmtShort(total)} tone="gold" />
            <Stat label="Moins chères qu’à l’ajout" icon="down" value={cheaper.length} sub={cheaper.length ? 'économie : ' + fmtEur(saved) : 'aucune pour l’instant'} tone={cheaper.length ? 'up' : ''} />
          </div>
          <div className="wish-budget panel">
            <label htmlFor="wish-budget"><Icon name="coin" size={18} />Mon budget</label>
            <span className="ev-input"><input id="wish-budget" type="number" min="0" step="1" inputMode="decimal" placeholder="ex. 50" value={budget} onChange={(e) => setBudget(e.target.value)} /><em>{CUR.sym}</em></span>
            {b != null && isFinite(b) && <span className="muted small">{fits.size ? <>Tu peux t’offrir <b>{fits.size} carte{fits.size > 1 ? 's' : ''}</b> de ta liste pour {fmtEur(spent)} (les moins chères d’abord, surlignées).</> : 'Aucune carte de ta liste ne rentre dans ce budget.'}</span>}
          </div>
          <div className="toolbar">
            <Seg value={sort} onChange={setSort} label="Tri" options={[['ajout', 'Récentes'], ['prix', 'Plus chères'], ['moins', 'Moins chères'], ['baisse', 'En baisse']]} />
            {games.length > 1 && <Seg value={scope} onChange={setScope} label="Univers" options={[['all', 'Tout'], ...games.map((g) => [g, GAMES[g].label])]} />}
          </div>
          <div className="wish-list">
            {list.map((r) => (
              <div key={r.c.key} className={'wish-row' + (fits.has(r.c.key) ? ' fits' : '')}>
                <a href={cardHref(r.c)}><CardArt card={r.c} className="mini" tilt={false} fx={0} /></a>
                <a className="w-name" href={cardHref(r.c)}>{r.c.name}<small><GameTag game={r.c.game} /> {r.c.number}{r.c.variant ? ' · ' + r.c.variant : ''}</small>{r.own && <span className="wish-own"><Icon name="check" size={12} stroke={3} />Déjà dans ta collection</span>}</a>
                <div className="w-price"><Price card={r.c} />{r.delta != null && Math.abs(r.delta) >= 0.5 ? <small><Delta pct={r.delta} small /> depuis l’ajout</small> : <small className="faint">ajoutée le {fmtDate(r.w.addedAt, { day: 'numeric', month: 'short' })}</small>}</div>
                <div className="wish-act">
                  <button className="btn small primary" onClick={() => got(r)}><Icon name="check" size={15} />Je l’ai !</button>
                  <button className="icon-btn" onClick={() => removeWish(r.c.key)} aria-label={'Retirer ' + r.c.name + ' de ma liste'}><Icon name="trash" size={18} /></button>
                </div>
              </div>
            ))}
          </div>
          <p className="source-note">« Je l’ai ! » ajoute la carte à ta collection avec le prix du jour comme prix payé (modifiable dans ta collection). Ta liste est enregistrée dans ton compte si tu es connecté.</p>
        </>
      )}
    </div>
  );
}
