import React, { useMemo, useState } from 'react';
import { useData, useAsync, useUniverse, useInfinite, href, cardHref } from '../lib/hooks.js';
import { useStore, toggleCompare, toggleWatch, setAlert, getState } from '../lib/store.js';
import { CUR, toDisp, fromDisp, priceOf, eurOf, trendOf, historyOf, history, search, fmtEur, fmtUsd, fmtNum, fmtShort, fmtDate, GAMES, resolveKey } from '../lib/data.js';
import { CardArt, CardTile, Delta, GameTag, Price } from '../ui/Card.jsx';
import { PriceChart, Sparkline, HBars } from '../ui/Chart.jsx';
import { Section, Seg, Loading, Empty, Stat, Money } from '../ui/Kit.jsx';
import { SearchBox } from '../ui/Search.jsx';
import { Podium, Movers, podiumRows, moverRows } from './Home.jsx';
import { SourceLine } from './Card.jsx';
import Icon from '../ui/Icon.jsx';
import PushPanel from './Push.jsx';
import { cloudOn } from '../lib/cloud.js';

const COLORS = ['#ff6a4d', '#4cc9f0', '#ffd23f', '#b388ff'];

// ---------- Recherche ----------
export function SearchPage({ query }) {
  const d = useData();
  const q = query.q || '';
  const universe = useUniverse();
  const [scope, setScope] = useState(query.u || universe);
  const [sort, setSort] = useState('pertinence');
  const [only, setOnly] = useState('all');
  const coll = useStore((s) => s.collection);
  const res = useMemo(() => (d.ready ? search(d.cats, q, { game: scope, limit: 3000, P: d.P }) : []), [d.ready, d.v, q, scope]);
  const sorted = useMemo(() => {
    const owned = new Set(coll.map((e) => e.key));
    let r = res;
    if (only === 'priced') r = r.filter((c) => eurOf(c, d.P, d.fx) != null);
    if (only === 'mine') r = r.filter((c) => owned.has(c.key));
    if (sort === 'pertinence') return r;
    const v = (c) => eurOf(c, d.P, d.fx) ?? -1;
    return [...r].sort((a, b) => (sort === 'prix-desc' ? v(b) - v(a) : (v(a) < 0 ? 1e9 : v(a)) - (v(b) < 0 ? 1e9 : v(b))));
  }, [res, sort, only, coll]);
  const [n, sentinel] = useInfinite(sorted.length, 60, [q, scope, sort, only]);
  return (
    <div className="page">
      <div className="search-head">
        <div className="kicker">Recherche</div>
        <h1 className="page-title">{q ? <>« <span className="grad">{q}</span> »</> : 'Chercher une carte'}</h1>
        <SearchBox initial={q} key={q} scope={scope} big />
      </div>
      {!d.ready ? <Loading grid /> : (
        <>
          <div className="toolbar">
            <Seg value={scope} onChange={setScope} label="Univers" options={[['onepiece', 'One Piece'], ['pokemon', 'Pokémon'], ['all', 'Les deux']]} />
            <Seg value={only} onChange={setOnly} label="Filtre" options={[['all', 'Toutes'], ['priced', 'Avec un prix'], ['mine', 'Dans ma collection']]} />
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Trier"><option value="pertinence">Les plus pertinentes</option><option value="prix-desc">Prix décroissant</option><option value="prix-asc">Prix croissant</option></select>
            <span className="count">{fmtNum(sorted.length)} résultat{sorted.length > 1 ? 's' : ''}{res.length >= 3000 ? ' (3 000 premiers)' : ''}</span>
          </div>
          {q && sorted.length === 0 && <Empty icon="search" title="Aucune carte trouvée">Essaie un nom anglais ou français, ou un numéro comme OP01-120 ou 4/102.</Empty>}
          <div className="grid tiles">{sorted.slice(0, n).map((c) => <CardTile key={c.key} card={c} />)}</div>
          <div ref={sentinel} className="sentinel" />
        </>
      )}
    </div>
  );
}

// ---------- Marché du jour (nouveau) ----------
const BRACKETS = [[0, 1, '< 1'], [1, 5, '1–5'], [5, 20, '5–20'], [20, 100, '20–100'], [100, 1000, '100–1 k'], [1000, Infinity, '> 1 k']];
export function MarketPage() {
  const d = useData();
  const game = useUniverse();
  const stats = useMemo(() => {
    if (!d.ready) return null;
    const g = d.cats[game];
    const bySet = new Map(), byRar = new Map(), hist = BRACKETS.map(() => 0);
    let n = 0, sum = 0; const vals = [];
    for (const c of g.cards) {
      if (c.lang === 'ja') continue;
      const e = eurOf(c, d.P, d.fx); if (e == null) continue;
      n++; sum += e; vals.push([e, c]);
      bySet.set(c.set, (bySet.get(c.set) || 0) + e);
      const rk = c.rarity + (c.variant && /^Parallèle/.test(c.variant) ? ' · parallèle' : '');
      const r = byRar.get(rk) || [0, 0]; r[0] += e; r[1]++; byRar.set(rk, r);
      hist[BRACKETS.findIndex(([a, b]) => e >= a && e < b)]++;
    }
    vals.sort((a, b) => b[0] - a[0]);
    const median = vals.length ? vals[Math.floor(vals.length / 2)][0] : null;
    const sets = [...bySet.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([code, v]) => { const s = g.sets.get(code); return { label: s?.name || code, sub: code + ' · ' + (s?.count || '?') + ' cartes', value: v, href: href('/extension/' + game + '/' + encodeURIComponent(code)) }; });
    const rar = [...byRar.entries()].filter(([, r]) => r[1] >= 5).map(([k, r]) => ({ label: k || '—', sub: r[1] + ' cartes', value: r[0] / r[1] })).sort((a, b) => b.value - a.value).slice(0, 8);
    return { n, sum, median, sets, rar, hist, top50: vals.slice(0, 50).map((x) => x[1]) };
  }, [d.ready, d.v, game]);
  const index = useAsync(async () => {
    if (!stats) return [];
    const sets = [...new Set(stats.top50.map((c) => c.set))];
    const hs = new Map(await Promise.all(sets.map((s) => history(game, s).then((h) => [s, h]))));
    const byDate = new Map();
    for (const c of stats.top50) { const h = hs.get(c.set); const p = h?.p[c.id]; if (!p) continue; h.d.forEach((dt, i) => { if (p[i] != null) byDate.set(dt, (byDate.get(dt) || 0) + p[i]); }); }
    return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [stats, game]);
  if (!d.ready || !stats) return <div className="page"><Loading /></div>;
  const up = moverRows(d, game, 'day', 'up')[0], down = moverRows(d, game, 'day', 'down')[0];
  const top = podiumRows(d, game, 1)[0];
  const idx = index.value || [];
  const idxChange = idx.length > 1 ? ((idx.at(-1)[1] - idx[0][1]) / idx[0][1]) * 100 : null;
  const maxH = Math.max(...stats.hist, 1);
  return (
    <div className="page market-page">
      <div className="kicker">{GAMES[game].label} · relevé du {fmtDate(d.M?.updatedAt, { day: 'numeric', month: 'long' })}</div>
      <h1 className="page-title">Le marché <span className="grad">{GAMES[game].label}</span></h1>
      <p className="lead">La photographie du jour de toutes les cartes {GAMES[game].label} avec un prix : ce qu’elles valent ensemble, où se trouve la valeur et ce qui bouge.</p>
      <div className="stats market-kpis">
        <Stat label="Valeur cumulée" icon="gem" value={<Money value={stats.sum} />} sub={'un exemplaire de chacune des ' + fmtNum(stats.n) + ' cartes'} tone="gold" />
        <Stat label="Prix médian" icon="chart" value={fmtEur(stats.median)} sub="la moitié des cartes vaut moins" />
        {top && <Stat label="Carte la plus chère" icon="crown" value={fmtShort(top.eur)} sub={top.c.name + ' · ' + top.c.number} href={cardHref(top.c)} />}
        {up && <Stat label="Plus forte hausse" icon="up" value={<Delta pct={up.pct} plain />} sub={up.c.name} tone="up" href={cardHref(up.c)} />}
        {down && <Stat label="Plus forte baisse" icon="down" value={<Delta pct={down.pct} plain />} sub={down.c.name} tone="down" href={cardHref(down.c)} />}
      </div>

      <div className="market-grid">
        <div className="panel pad">
          <div className="index-head"><h3><Icon name="market" size={18} />Indice Kirakai · top 50</h3>{idxChange != null && <Delta pct={idxChange} />}</div>
          {idx.length > 0 && <div className="index-head"><b>{fmtEur(idx.at(-1)[1])}</b><small className="faint">valeur des 50 cartes les plus chères, jour après jour</small></div>}
          {index.loading ? <Loading /> : <PriceChart series={[{ points: idx, color: 'var(--a2)' }]} height={220} empty="L’indice se dessine au fil des relevés quotidiens." />}
        </div>
        <div className="panel pad">
          <h3><Icon name="layers" size={18} />Répartition des prix <small className="faint">(en euros)</small></h3>
          <div className="histo">{stats.hist.map((v, i) => <div key={i}><b>{fmtNum(v)}</b><span style={{ height: Math.max(3, (v / maxH) * 100) + '%', animationDelay: i * 70 + 'ms' }} /><small>{BRACKETS[i][2]}</small></div>)}</div>
        </div>
        <div className="panel pad">
          <h3><Icon name="sets" size={18} />Les extensions qui valent le plus</h3>
          <HBars rows={stats.sets} />
        </div>
        <div className="panel pad">
          <h3><Icon name="sparkle" size={18} />Prix moyen par rareté</h3>
          <HBars rows={stats.rar} format={(v) => fmtEur(v)} color="linear-gradient(90deg, var(--a3), var(--a2))" />
        </div>
      </div>

      <Section kicker="Le marché bouge" title="Hausses et baisses" action={<a className="btn ghost small" href={href('/suivis')}><Icon name="bell" size={16} />Mes alertes</a>}>
        <Movers game={game} limit={12} />
      </Section>
      <Section kicker="Classement" title="Le podium du jour" action={<a className="btn ghost small" href={href('/classement')}><Icon name="trophy" size={16} />Top 100</a>}>
        <Podium game={game} />
      </Section>
      <SourceLine game={game} />
    </div>
  );
}

// ---------- Comparateur ----------
function CompareIdeas() {
  const d = useData();
  const game = useUniverse();
  const recent = useStore((s) => s.recent);
  const top = podiumRows(d, game, 3).map((r) => r.c);
  const rec = (recent || []).map((k) => resolveKey(d.cats, k)).filter((c) => c && c.game === game).slice(0, 8);
  return (
    <div className="compare-ideas">
      {top.length === 3 && (
        <button className="ci-top" onClick={() => top.forEach((c) => toggleCompare(c.key))}>
          <span className="ci-fan">{top.map((c, i) => <span key={c.key} style={{ '--i': i }}><CardArt card={c} tilt={false} fx={0} /></span>)}</span>
          <span><b>Comparer le podium {GAMES[game].label}</b><small>{top.map((c) => c.name).join(' · ')}</small></span>
          <Icon name="compare" size={22} />
        </button>
      )}
      {rec.length > 1 && (
        <div>
          <span className="kicker">Tu as regardé récemment</span>
          <div className="ci-chips">{rec.map((c) => <button key={c.key} className="ci-chip" onClick={() => toggleCompare(c.key)}><CardArt card={c} className="mini" tilt={false} fx={0} /><span>{c.name}<small>{c.number}</small></span><Icon name="plus" size={16} /></button>)}</div>
        </div>
      )}
    </div>
  );
}

export function ComparePage() {
  const d = useData();
  const keys = useStore((s) => s.compare);
  const cards = d.ready ? keys.map((k) => resolveKey(d.cats, k)).filter(Boolean) : [];
  const hist = useAsync(() => Promise.all(cards.map((c) => historyOf(c))), [keys.join('|'), d.ready]);
  const [adding, setAdding] = useState(false);
  if (!d.ready) return <div className="page"><Loading /></div>;
  const rows = cards.map((c) => ({ c, p: priceOf(c, d.P), eur: eurOf(c, d.P, d.fx), set: d.cats[c.game].sets.get(c.set) }));
  const best = (f) => { const v = rows.map(f).filter((x) => x != null); return v.length ? Math.max(...v) : null; };
  const lines = [
    ['Prix du jour', (r) => r.eur, fmtEur],
    ['Moyenne 7 jours', (r) => r.p?.avg7, fmtEur],
    ['Moyenne 30 jours', (r) => r.p?.avg30, fmtEur],
    ['Offre la plus basse', (r) => r.p?.low, fmtEur],
    ['TCGplayer (marché)', (r) => r.p?.usd, fmtUsd],
    ['Tendance 7 j / 30 j', (r) => trendOf(r.c, d.P), (v) => <Delta pct={v} />],
  ];
  return (
    <div className="page compare-page">
      <div className="kicker">Outils</div>
      <h1 className="page-title">Comparateur de prix</h1>
      <p className="lead">Jusqu’à 4 cartes côte à côte. Ajoute-les depuis leur fiche, avec l’icône sur les vignettes, ou cherche-les ici.</p>
      {(adding || cards.length === 0) ? <CompareSearch onPick={() => setAdding(false)} /> : cards.length < 4 && <button className="btn ghost" onClick={() => setAdding(true)}><Icon name="plus" size={18} />Ajouter une carte</button>}
      {cards.length === 0 && <CompareIdeas />}
      {cards.length > 0 && (
        <>
          <div className="compare-wrap" style={{ marginTop: 18 }}>
            <div className="compare-grid" style={{ '--cols': cards.length }}>
              <div className="cg-head" />
              {rows.map((r, i) => (
                <div className="cg-card" key={r.c.key} style={{ '--c': COLORS[i] }}>
                  <button className="icon-btn rm" onClick={() => toggleCompare(r.c.key)} aria-label={'Retirer ' + r.c.name}><Icon name="x" size={16} /></button>
                  <a href={cardHref(r.c)}><CardArt card={r.c} /></a>
                  <b>{r.c.name}</b><small><GameTag game={r.c.game} /> {r.c.number}{r.c.variant ? ' · ' + r.c.variant : ''}</small><small>{r.set?.name}</small>
                </div>
              ))}
              {lines.map(([label, f, fmt]) => {
                const hi = best(f);
                return (
                  <React.Fragment key={label}>
                    <div className="cg-label">{label}</div>
                    {rows.map((r) => { const v = f(r); return <div key={r.c.key} className={'cg-val' + (v != null && v === hi && rows.length > 1 && label === 'Prix du jour' ? ' top' : '')}>{v == null ? <span className="faint">—</span> : fmt(v)}</div>; })}
                  </React.Fragment>
                );
              })}
              <div className="cg-label" style={{ borderBottom: 0 }}>Suivi</div>
              {rows.map((r) => <div key={r.c.key} className="cg-val" style={{ borderBottom: 0 }}><WatchToggle card={r.c} eur={r.eur} /></div>)}
            </div>
          </div>
          <Section kicker="Courbes" title="Évolution comparée">
            <div className="panel pad chart-panel">
              {hist.loading ? <Loading /> : <PriceChart height={280} series={rows.map((r, i) => ({ label: r.c.name, color: COLORS[i], points: hist.value?.[i] || [] }))} />}
              <div className="legend">{rows.map((r, i) => <span key={r.c.key}><i style={{ background: COLORS[i] }} />{r.c.name} {r.c.number}</span>)}</div>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function WatchToggle({ card, eur }) {
  const on = useStore((s) => !!s.watch[card.key]);
  return <button className={'btn small ' + (on ? 'on' : 'ghost')} onClick={() => toggleWatch(card.key, eur)}><Icon name="eye" size={16} />{on ? 'Suivie' : 'Suivre'}</button>;
}

function CompareSearch({ onPick }) {
  const d = useData();
  const [q, setQ] = useState('');
  const res = useMemo(() => (q.length >= 2 ? search(d.cats, q, { limit: 12, P: d.P }) : []), [q]);
  return (
    <div className="picker">
      <div className="searchbox"><Icon name="search" size={18} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom ou numéro de la carte à comparer" aria-label="Carte à comparer" /></div>
      {res.length > 0 && <div className="grid tiles small">{res.map((c) => <CardTile key={c.key} card={c} compact actions={false} onClick={() => { toggleCompare(c.key); setQ(''); onPick?.(); }} />)}</div>}
    </div>
  );
}

// ---------- Suivis et alertes ----------
export function checkAlerts(d) {
  const s = getState();
  const hits = [];
  for (const [key, w] of Object.entries(s.watch)) {
    const c = resolveKey(d.cats, key);
    const eur = c && eurOf(c, d.P, d.fx);
    if (eur == null) continue;
    if (w.below != null && eur <= w.below) hits.push({ c, eur, kind: 'below', target: w.below });
    else if (w.above != null && eur >= w.above) hits.push({ c, eur, kind: 'above', target: w.above });
  }
  return hits;
}

function WatchSpark({ card }) {
  const h = useAsync(() => historyOf(card), [card.key]);
  return <Sparkline points={h.value} color="var(--a2)" />;
}

export function WatchPage() {
  const d = useData();
  const watch = useStore((s) => s.watch);
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  if (!d.ready) return <div className="page"><Loading /></div>;
  const rows = Object.entries(watch).map(([key, w]) => { const c = resolveKey(d.cats, key); return c && { c, w, eur: eurOf(c, d.P, d.fx) }; }).filter(Boolean);
  const hits = new Set(checkAlerts(d).map((h) => h.c.key));
  const total = rows.reduce((t, r) => t + (r.eur || 0), 0);
  return (
    <div className="page">
      <div className="kicker">Outils</div>
      <h1 className="page-title">Mes suivis et alertes</h1>
      <p className="lead">Suis une carte et fixe un seuil : à chaque relevé quotidien, Kirakai te signale les cartes qui passent sous ou au-dessus de ton prix.</p>
      {rows.length > 0 && (
        <div className="stats" style={{ margin: '6px 0 18px' }}>
          <Stat label="Cartes suivies" icon="eye" value={rows.length} />
          <Stat label="Seuils atteints" icon="bell" value={hits.size} tone={hits.size ? 'gold' : ''} />
          <Stat label="Valeur des cartes suivies" icon="gem" value={fmtShort(total)} />
        </div>
      )}
      {cloudOn() ? rows.length > 0 && <PushPanel count={rows.filter((r) => r.w.below != null || r.w.above != null).length} />
        : perm === 'default' && rows.length > 0 && <button className="btn ghost" style={{ marginBottom: 16 }} onClick={() => Notification.requestPermission().then(setPerm)}><Icon name="bell" size={18} />Activer les notifications du navigateur</button>}
      {rows.length === 0 ? <Empty icon="eye" title="Aucune carte suivie" action={<a className="btn primary" href={href('/recherche')}>Trouver une carte</a>}>Ouvre la fiche d’une carte et touche « Suivre le prix », ou l’œil sur une vignette.</Empty> : (
        <div className="watch-list">
          {rows.map(({ c, w, eur }) => {
            const ch = w.baseline && eur ? ((eur - w.baseline) / w.baseline) * 100 : null;
            return (
              <div key={c.key} className={'watch-row' + (hits.has(c.key) ? ' hit' : '')}>
                <a href={cardHref(c)}><CardArt card={c} className="mini" tilt={false} fx={0} /></a>
                <a className="w-name" href={cardHref(c)}>{c.name}<small><GameTag game={c.game} /> {c.number}{c.variant ? ' · ' + c.variant : ''}</small>{hits.has(c.key) && <span className="hit-badge" style={{ width: 'fit-content', marginTop: 4 }}><Icon name="bell" size={13} />Seuil atteint</span>}</a>
                <WatchSpark card={c} />
                <div className="w-price"><Price card={c} />{ch != null && <small><Delta pct={ch} small /> depuis le suivi</small>}</div>
                <div className="w-th-row">
                  <label className="w-th">Sous <input key={CUR.code} type="number" min="0" inputMode="decimal" defaultValue={w.below != null ? Math.round(toDisp(w.below) * 100) / 100 : ''} onBlur={(e) => setAlert(c.key, { below: e.target.value === '' ? null : fromDisp(+e.target.value) })} /> {CUR.sym}</label>
                  <label className="w-th">Au-dessus <input key={CUR.code + 'a'} type="number" min="0" inputMode="decimal" defaultValue={w.above != null ? Math.round(toDisp(w.above) * 100) / 100 : ''} onBlur={(e) => setAlert(c.key, { above: e.target.value === '' ? null : fromDisp(+e.target.value) })} /> {CUR.sym}</label>
                  <button className="icon-btn" onClick={() => toggleWatch(c.key)} aria-label="Ne plus suivre"><Icon name="trash" size={18} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- Top 100 ----------
export function RankingPage() {
  const d = useData();
  const game = useUniverse();
  const [n, setN] = useState(100);
  const [ed, setEd] = useState('intl');
  const ja = game === 'pokemon' && ed === 'ja';
  const rows = useMemo(() => {
    if (!d.ready) return [];
    const out = [];
    for (const c of d.cats[game].cards) {
      if ((c.lang === 'ja') !== ja) continue;
      const e = eurOf(c, d.P, d.fx); if (e != null && priceOf(c, d.P)?.divergent !== true) out.push([e, c]);
    }
    return out.sort((a, b) => b[0] - a[0]).slice(0, n);
  }, [d.ready, d.v, game, n, ja]);
  if (!d.ready) return <div className="page"><Loading /></div>;
  const first = ja ? 1 : 4;
  return (
    <div className="page">
      <div className="kicker">Classement</div>
      <h1 className="page-title">Les cartes {GAMES[game].label} {ja ? 'japonaises ' : ''}<span className="grad">les plus chères</span></h1>
      {game === 'pokemon' && <Seg value={ed} onChange={(v) => { setEd(v); setN(100); }} label="Édition" options={[['intl', 'Internationales (EN / FR)'], ['ja', 'Japonaises']]} />}
      {!ja && <div style={{ marginTop: 26 }}><Podium game={game} limit={3} list={false} /></div>}
      {ja && !d.jp ? <Loading /> : (
        <ol className="rank-list big" start={first} style={{ marginTop: 34 }}>
          {rows.slice(first - 1).map(([e, c], i) => (
            <li key={c.key} style={{ '--i': Math.min(i, 12) }}><a href={cardHref(c)}><span className="pos">{i + first}</span><CardArt card={c} className="mini" tilt={false} fx={0} /><span className="r-name">{c.name}{c.lang === 'ja' && c.nameFr ? <em> · {c.nameFr}</em> : null}<small><GameTag game={c.game} /> {c.number}{c.variant ? ' · ' + c.variant : ''} · {d.cats[c.game].sets.get(c.set)?.name}</small></span><Price card={c} /></a></li>
          ))}
        </ol>
      )}
      {n < 500 && <div className="more"><button className="btn ghost" onClick={() => setN(n + 100)}>Afficher 100 de plus</button></div>}
      <SourceLine game={game} ja={ja} />
    </div>
  );
}

