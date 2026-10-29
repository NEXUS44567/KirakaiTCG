import React, { useMemo, useState } from 'react';
import { useData, useInfinite, href, cardHref } from '../lib/hooks.js';
import { useStore, addWishes } from '../lib/store.js';
import { toast } from '../lib/toast.js';
import { eurOf, fmtEur, fmtDate, fmtNum, fmtShort, GAMES, normalize, setCards } from '../lib/data.js';
import { boosterSets, buildProduct } from '../lib/packs.js';
import { EVPanel } from './Ev.jsx';
import { CardArt, CardTile, SetArt, setArtCards } from '../ui/Card.jsx';
import { Seg, Loading, Empty, Ring, Stat, Crumbs, Progress } from '../ui/Kit.jsx';
import Icon from '../ui/Icon.jsx';

// ---------- Toutes les extensions ----------
export function SetsPage({ game }) {
  const d = useData();
  const pref = useStore((s) => s.lang);
  const coll = useStore((s) => s.collection);
  const [tab, setTab] = useState(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('date');
  const [series, setSeries] = useState('');
  const g = d.ready ? d.cats[game] : null;
  const hasJa = game === 'pokemon' && !!g?.setList.some((s) => s.lang === 'ja');
  const t = tab || (hasJa && pref === 'ja' ? 'ja' : 'intl');
  const info = useMemo(() => {
    if (!g) return new Map();
    const owned = new Set(coll.map((e) => e.key));
    return new Map(g.setList.map((s) => {
      const cards = setCards(d.cats, game, s.code);
      let value = 0, top = null, have = 0;
      for (const c of cards) { const e = eurOf(c, d.P, d.fx) || 0; value += e; if (!top || e > top[0]) top = [e, c]; if (owned.has(c.key)) have++; }
      return [s.code, { cards, value, top, have }];
    }));
  }, [d.ready, d.v, game, coll]);
  const list = useMemo(() => {
    if (!g) return [];
    const n = normalize(q);
    let l = g.setList.filter((s) => (t === 'ja' ? s.lang === 'ja' : s.lang !== 'ja') && (!series || s.series === series) && (!n || normalize(s.name + ' ' + s.code + ' ' + (s.en?.name || '')).includes(n)));
    if (sort === 'valeur') l = [...l].sort((a, b) => info.get(b.code).value - info.get(a.code).value);
    if (sort === 'completion') l = [...l].sort((a, b) => info.get(b.code).have / b.count - info.get(a.code).have / a.count);
    return l;
  }, [g, t, q, sort, series, info]);
  const [n, sentinel] = useInfinite(list.length, 24, [t, q, sort, series]);
  if (!d.ready) return <div className="page"><Loading grid /></div>;
  if (!g) return <div className="page"><Empty title="Jeu inconnu" /></div>;
  const seriesList = [...new Set(g.setList.filter((s) => (t === 'ja' ? s.lang === 'ja' : s.lang !== 'ja')).map((s) => s.series).filter(Boolean))];
  return (
    <div className="page">
      <div className="kicker">{GAMES[game].label} · {fmtNum(list.length)} extensions</div>
      <h1 className="page-title">Les extensions</h1>
      <div className="toolbar">
        {hasJa && <Seg value={t} onChange={(v) => { setTab(v); setSeries(''); }} label="Édition" options={[['intl', 'Internationales'], ['ja', 'Japonaises']]} />}
        <div className="searchbox small filter"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom ou code de l’extension" aria-label="Filtrer les extensions" /></div>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Trier"><option value="date">Les plus récentes</option><option value="valeur">Les plus précieuses</option><option value="completion">Ma complétion</option></select>
      </div>
      {seriesList.length > 1 && <div className="chips scroll" style={{ marginBottom: 18 }}><button className={'chip' + (!series ? ' on' : '')} onClick={() => setSeries('')}>Toutes les séries</button>{seriesList.map((s) => <button key={s} className={'chip' + (series === s ? ' on' : '')} onClick={() => setSeries(series === s ? '' : s)}>{s}</button>)}</div>}
      {game === 'pokemon' && !d.jp && t === 'ja' && <p className="muted small">Chargement des extensions japonaises…</p>}
      {list.length === 0 ? <Empty icon="sets" title="Aucune extension">Change la recherche ou la série.</Empty> : (
        <div className="sets-grid">
          {list.slice(0, n).map((s) => {
            const I = info.get(s.code);
            const art = setArtCards(I.cards, d);
            const code = s.code.replace(/^jp-/, '');
            return (
              <a key={s.code} className={'set-card' + (s.lang === 'ja' ? ' ja' : '')} href={href('/extension/' + game + '/' + encodeURIComponent(s.code))}>
                {art.length ? <SetArt cards={art} code={code} logo={s.logo} /> : <span className="set-art"><b className="sa-code">{code}</b></span>}
                <span className="set-info">
                  <b>{s.name}</b>
                  <small>{s.lang === 'ja' ? 'JP · ' : ''}{code} · {s.count} cartes{s.date ? ' · ' + fmtDate(s.date, { month: 'short', year: 'numeric' }) : ''}</small>
                  {I.value > 0 && <small className="set-val">Valeur du set · {fmtShort(I.value)}{I.top?.[1] ? ' · top : ' + I.top[1].name : ''}</small>}
                  {I.have > 0 && <><Progress value={I.have / s.count} /><small>{I.have} / {s.count} dans ta collection</small></>}
                </span>
              </a>
            );
          })}
        </div>
      )}
      <div ref={sentinel} className="sentinel" />
    </div>
  );
}

// ---------- Une extension ----------
const RAR_ORDER = ['C', 'UC', 'R', 'SR', 'L', 'SEC', 'SP CARD', 'TR', 'Common', 'Uncommon', 'Rare', 'Rare Holo', 'Double Rare', 'Ultra Rare', 'Illustration Rare', 'Special Illustration Rare', 'Hyper Rare'];
// Ce qu'il me manque pour compléter l'extension, et ce que ça coûte au prix du jour
function CompleteSet({ all, owned }) {
  const d = useData();
  const wish = useStore((s) => s.wish || {});
  const st = useMemo(() => {
    const miss = all.filter((c) => !owned.has(c.key)).map((c) => [c, eurOf(c, d.P, d.fx)]);
    const priced = miss.filter(([, e]) => e != null).sort((a, b) => b[1] - a[1]);
    const cost = priced.reduce((t, [, e]) => t + e, 0);
    const cheap = [...priced].reverse();
    const cheapHalf = cheap.slice(0, Math.ceil(cheap.length / 2)).reduce((t, [, e]) => t + e, 0);
    return { miss, priced, cost, cheapHalf, unpriced: miss.length - priced.length };
  }, [all, owned, d.v]);
  if (!owned.size || !all.some((c) => owned.has(c.key))) return null;
  if (!st.miss.length) return <div className="complete panel pad done"><Icon name="crown" size={26} /><div><b>Extension complète !</b><small>Tu as toutes les cartes de cette extension. Bravo, collectionneur.</small></div></div>;
  const notWished = st.miss.filter(([c]) => !wish[c.key]);
  const add = () => { const n = addWishes(notWished.map(([c, e]) => [c.key, e])); toast(`${n} carte${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''} à ta liste de souhaits.`, { icon: 'heart' }); };
  return (
    <section className="complete panel pad">
      <header>
        <div><div className="kicker">Compléter l’extension</div><h3>Il te manque {st.miss.length} carte{st.miss.length > 1 ? 's' : ''}</h3></div>
        <div className="complete-cost"><small>Au prix du jour</small><b>{fmtEur(st.cost)}</b>{st.unpriced > 0 && <small>+ {st.unpriced} sans prix relevé</small>}</div>
      </header>
      {st.priced.length > 3 && <p className="muted small">La moitié la moins chère des cartes manquantes coûte {fmtEur(st.cheapHalf)} ; les {Math.min(3, st.priced.length)} plus chères pèsent {fmtEur(st.priced.slice(0, 3).reduce((t, [, e]) => t + e, 0))} à elles seules.</p>}
      <div className="complete-top">
        {st.priced.slice(0, 5).map(([c, e]) => (
          <a key={c.key} href={cardHref(c)} className="ct-card"><CardArt card={c} tilt={false} fx={0} /><b>{fmtEur(e)}</b><small>{c.name}</small></a>
        ))}
      </div>
      <div className="row">
        {notWished.length > 0 ? <button className="btn ghost" onClick={add}><Icon name="heart" size={17} />Ajouter les {notWished.length} manquante{notWished.length > 1 ? 's' : ''} à ma liste de souhaits</button> : <a className="btn ghost" href={href('/souhaits')}><Icon name="heart" size={17} />Toutes sont dans ta liste de souhaits</a>}
      </div>
    </section>
  );
}

export function SetPage({ game, code }) {
  const d = useData();
  const coll = useStore((s) => s.collection);
  const [sort, setSort] = useState('numero');
  const [own, setOwn] = useState('all');
  const [rar, setRar] = useState('');
  const g = d.ready ? d.cats[game] : null;
  const s = g?.sets.get(code);
  const all = s ? setCards(d.cats, game, code) : [];
  const owned = useMemo(() => new Map(coll.map((e) => [e.key, e.qty])), [coll]);
  const cards = useMemo(() => {
    let l = all.filter((c) => (!rar || c.rarity === rar) && (own === 'all' || (own === 'have' ? owned.has(c.key) : !owned.has(c.key))));
    if (sort === 'prix') l = [...l].sort((a, b) => (eurOf(b, d.P, d.fx) || 0) - (eurOf(a, d.P, d.fx) || 0));
    if (sort === 'rarete') l = [...l].sort((a, b) => (RAR_ORDER.indexOf(b.rarity) - RAR_ORDER.indexOf(a.rarity)) || ((eurOf(b, d.P, d.fx) || 0) - (eurOf(a, d.P, d.fx) || 0)));
    return l;
  }, [all, sort, own, rar, owned, d.v]);
  const [n, sentinel] = useInfinite(cards.length, 60, [sort, own, rar, code]);
  if (!d.ready) return <div className="page"><Loading grid /></div>;
  if (!s && String(code).startsWith('jp-') && !d.jp) return <div className="page"><Loading /></div>;
  if (!s) return <div className="page"><Empty title="Extension introuvable" action={<a className="btn primary" href={href('/extensions/' + game)}>Toutes les extensions</a>} /></div>;
  document.title = s.name + ' · extension ' + GAMES[game].label + ' · Kirakai';
  const value = all.reduce((t, c) => t + (eurOf(c, d.P, d.fx) || 0), 0);
  const priced = all.filter((c) => eurOf(c, d.P, d.fx) != null).length;
  const top = all.reduce((m, c) => { const e = eurOf(c, d.P, d.fx) || 0; return e > m[0] ? [e, c] : m; }, [0, null]);
  const have = all.filter((c) => owned.has(c.key)).length;
  const rarities = [...new Set(all.map((c) => c.rarity).filter(Boolean))];
  const isBooster = boosterSets(game, d.cats).some((x) => x.code === code);
  return (
    <div className="page">
      <Crumbs items={[[GAMES[game].label, href(GAMES[game].home)], ['Extensions', href('/extensions/' + game)], [s.name]]} />
      <div className="set-hero">
        {(() => { const a = setArtCards(all, d); return a.length ? <SetArt cards={a} logo={s.logo} big /> : null; })()}
        <div className="set-facts">
          <div className="kicker">{s.series || GAMES[game].label}{s.lang === 'ja' ? ' · Japon' : ''}</div>
          <h1 className="page-title" style={{ margin: 0 }}>{s.name} <small>{s.lang === 'ja' ? s.code.slice(3) : s.code}</small></h1>
          <p className="muted" style={{ margin: 0 }}>{s.count} cartes{s.date ? ' · sortie le ' + fmtDate(s.date) : ''}</p>
          <div className="stats">
            <Stat label="Valeur du set" icon="gem" value={fmtShort(value)} sub="un exemplaire de chaque" tone="gold" />
            <Stat label="Avec un prix" icon="chart" value={fmtNum(priced)} sub={'sur ' + all.length + ' cartes'} />
            {top[1] && <Stat label="La plus chère" icon="crown" value={fmtEur(top[0])} sub={top[1].name} href={cardHref(top[1])} />}
          </div>
          <div className="panel set-progress-row">
            <Ring value={have / Math.max(1, s.count)} size={62} />
            <span><b>{have} / {s.count} dans ta collection</b><small>{have ? 'Filtre « Manquantes » pour voir ce qu’il te reste à trouver.' : 'Ajoute tes cartes depuis leur fiche ou avec le scanner.'}</small></span>
          </div>
          {isBooster && <a className="btn primary" href={href('/boosters?set=' + encodeURIComponent(code))}><Icon name="pack" size={18} />Ouvrir un booster de cette extension</a>}
        </div>
      </div>
      <CompleteSet all={all} owned={owned} />
      {isBooster && <EVPanel prod={buildProduct(game, d.cats, d.P, d.fx, code)} />}
      <div className="toolbar" style={{ marginTop: 30 }}>
        <Seg value={sort} onChange={setSort} label="Tri" options={[['numero', 'Numéro'], ['prix', 'Prix'], ['rarete', 'Rareté']]} />
        <Seg value={own} onChange={setOwn} label="Collection" options={[['all', 'Toutes'], ['have', 'Possédées'], ['missing', 'Manquantes']]} />
        <span className="count">{fmtNum(cards.length)} carte{cards.length > 1 ? 's' : ''}</span>
      </div>
      {rarities.length > 1 && <div className="chips scroll rarity-chips" style={{ marginBottom: 18 }}><button className={'chip' + (!rar ? ' on' : '')} onClick={() => setRar('')}>Toutes raretés</button>{rarities.map((r) => <button key={r} className={'chip' + (rar === r ? ' on' : '')} onClick={() => setRar(rar === r ? '' : r)}>{r}</button>)}</div>}
      {cards.length === 0 ? <Empty icon="album" title={own === 'have' ? 'Aucune carte de cette extension dans ta collection' : 'Rien à afficher'}>Change le filtre.</Empty> : <div className="grid tiles">{cards.slice(0, n).map((c) => <CardTile key={c.key} card={c} compact owned={owned.get(c.key) || 0} />)}</div>}
      <div ref={sentinel} className="sentinel" />
    </div>
  );
}
