import React, { useEffect, useMemo, useState } from 'react';
import { useData, useAsync, useInfinite, useTilt, href, cardHref } from '../lib/hooks.js';
import { useStore } from '../lib/store.js';
import { pokedexList, pokedexChunk, artwork, cry, TYPE_COLORS, eurOf, fmtEur, fmtNum, normalize } from '../lib/data.js';
import { toast } from '../lib/toast.js';
import { CardTile } from '../ui/Card.jsx';
import { Radar } from '../ui/Chart.jsx';
import { Loading, Empty, Section, Seg, Ring, Crumbs } from '../ui/Kit.jsx';
import Icon from '../ui/Icon.jsx';

const GEN = ['', 'Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unys', 'Kalos', 'Alola', 'Galar', 'Paldea'];
const STATS = [['PV', '#ff5959'], ['Attaque', '#f5ac78'], ['Défense', '#fae078'], ['Att. Spé.', '#9db7f5'], ['Déf. Spé.', '#a7db8d'], ['Vitesse', '#fa92b2']];
const num = (n) => 'n° ' + String(n).padStart(4, '0');

function useDexList() {
  return useAsync(async () => {
    const j = await pokedexList();
    const types = new Map(j.types.map(([id, fr, en, ident]) => [id, { id, fr, en, ident }]));
    const species = j.species.map(([id, fr, en, gen, t1, t2, total, flags, cards]) => ({ id, fr, en, gen, t1, t2, total, flags, cards, q: normalize(fr + ' ' + en + ' ' + id) }));
    return { types, species, byId: new Map(species.map((s) => [s.id, s])) };
  }, []);
}

// Pokémon dont l'utilisateur possède au moins une carte
function useOwnedSpecies() {
  const coll = useStore((s) => s.collection);
  return useAsync(async () => {
    const keys = new Set(coll.filter((e) => e.key.startsWith('pokemon:')).map((e) => e.key.slice(8)));
    if (!keys.size) return new Set();
    const owned = new Set();
    const chunks = await Promise.all(Array.from({ length: 11 }, (_, k) => pokedexChunk(k * 100 + 1).catch(() => ({}))));
    for (const ch of chunks) for (const [id, e] of Object.entries(ch)) if (e.cards.some((c) => keys.has(c))) owned.add(+id);
    return owned;
  }, [coll.length]);
}

export function TypeBadge({ t, small }) {
  if (!t) return null;
  return <span className={'type-badge' + (small ? ' small' : '')} style={{ '--t': TYPE_COLORS[t.id] }}>{t.fr}</span>;
}

export default function PokedexPage() {
  const L = useDexList();
  const owned = useOwnedSpecies();
  const [q, setQ] = useState('');
  const [type, setType] = useState(0);
  const [gen, setGen] = useState(0);
  const [cat, setCat] = useState('all');
  const [sort, setSort] = useState('num');
  const [mine, setMine] = useState(false);
  const list = useMemo(() => {
    if (!L.value) return [];
    const t = normalize(q);
    let r = L.value.species.filter((s) => (!t || s.q.includes(t)) && (!type || s.t1 === type || s.t2 === type) && (!gen || s.gen === gen)
      && (cat === 'all' || (cat === 'leg' && s.flags & 1) || (cat === 'myth' && s.flags & 2) || (cat === 'baby' && s.flags & 4))
      && (!mine || owned.value?.has(s.id)));
    if (sort === 'name') r = [...r].sort((a, b) => a.fr.localeCompare(b.fr, 'fr'));
    if (sort === 'total') r = [...r].sort((a, b) => b.total - a.total);
    if (sort === 'cards') r = [...r].sort((a, b) => b.cards - a.cards);
    return r;
  }, [L.value, q, type, gen, cat, sort, mine, owned.value]);
  const [n, sentinel] = useInfinite(list.length, 72, [q, type, gen, cat, sort, mine]);
  if (L.loading) return <div className="page"><Loading label="Ouverture du Pokédex…" /></div>;
  if (L.error) return <div className="page"><p className="error">Pokédex indisponible.</p></div>;
  const { types } = L.value;
  const nOwned = owned.value?.size || 0;
  return (
    <div className="page pokedex-page">
      <div className="dex-head">
        <div>
          <div className="kicker">Pokémon TCG</div>
          <h1 className="page-title">Le <span className="grad">Pokédex</span></h1>
          <p className="lead">Les 1 025 Pokémon avec leurs types, statistiques, évolutions, faiblesses, leur cri et toutes leurs cartes au prix du jour.</p>
        </div>
        <div className="dex-progress panel">
          <Ring value={nOwned / 1025} size={86} stroke={8} label={nOwned} sub="/ 1 025" />
          <span><b>Mon Pokédex de cartes</b><small>Un Pokémon est « attrapé » quand tu as au moins une de ses cartes dans ta collection.</small></span>
        </div>
      </div>
      <div className="dex-filters">
        <div className="searchbox"><Icon name="search" size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom (français ou anglais) ou numéro" aria-label="Chercher un Pokémon" /></div>
        <div className="chips scroll type-chips">
          <button className={'type-chip' + (!type ? ' on' : '')} onClick={() => setType(0)}>Tous les types</button>
          {[...types.values()].map((t) => <button key={t.id} className={'type-chip' + (type === t.id ? ' on' : '')} style={{ '--t': TYPE_COLORS[t.id] }} onClick={() => setType(type === t.id ? 0 : t.id)}>{t.fr}</button>)}
        </div>
        <div className="toolbar">
          <select value={gen} onChange={(e) => setGen(+e.target.value)} aria-label="Génération"><option value={0}>Toutes les générations</option>{GEN.slice(1).map((g, i) => <option key={i} value={i + 1}>Génération {i + 1} · {g}</option>)}</select>
          <Seg value={cat} onChange={setCat} label="Catégorie" options={[['all', 'Tous'], ['leg', 'Légendaires'], ['myth', 'Fabuleux'], ['baby', 'Bébés']]} />
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Trier"><option value="num">Numéro national</option><option value="name">Nom</option><option value="total">Total des statistiques</option><option value="cards">Nombre de cartes</option></select>
          <label className="check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Mes Pokémon attrapés</label>
          <span className="count">{fmtNum(list.length)} Pokémon</span>
        </div>
      </div>
      {list.length === 0 ? <Empty icon="dex" title="Aucun Pokémon">Change les filtres ou la recherche.</Empty> : (
        <div className="dex-grid">
          {list.slice(0, n).map((s) => (
            <a key={s.id} href={href('/pokedex/' + s.id)} className={'dex-tile' + (owned.value?.has(s.id) ? ' owned' : '')} style={{ '--t1': TYPE_COLORS[s.t1], '--t2': TYPE_COLORS[s.t2 || s.t1] }}>
              <span className="dt-num">{num(s.id)}</span>
              {owned.value?.has(s.id) && <span className="dt-caught" title="Tu as une carte de ce Pokémon"><Icon name="check" size={12} stroke={3} /></span>}
              <span className="dt-art"><img src={artwork(s.id)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} /></span>
              <b>{s.fr}</b>
              <span className="dt-types"><TypeBadge t={types.get(s.t1)} small />{s.t2 ? <TypeBadge t={types.get(s.t2)} small /> : null}</span>
              <small>{s.cards} carte{s.cards > 1 ? 's' : ''}</small>
            </a>
          ))}
        </div>
      )}
      <div ref={sentinel} className="sentinel" />
      <p className="source-note">Données des espèces : PokéAPI (licence BSD-3-Clause). Illustrations et cris : dépôts PokéAPI. Pokémon © Nintendo / Creatures / GAME FREAK.</p>
    </div>
  );
}

export function PokemonPage({ id }) {
  const L = useDexList();
  const d = useData();
  const n = +id;
  const D = useAsync(() => pokedexChunk(n).then((c) => c[n] || null), [n]);
  const coll = useStore((s) => s.collection);
  const [formIdx, setFormIdx] = useState(0);
  const [shiny, setShiny] = useState(false);
  const [cardSort, setCardSort] = useState('prix');
  const tilt = useTilt({ max: 14, gyro: true });
  useEffect(() => { setFormIdx(0); setShiny(false); }, [n]);
  const sp = L.value?.byId.get(n);
  useEffect(() => { if (sp) document.title = sp.fr + ' · Pokédex · Kirakai'; }, [sp]);
  if (L.loading || D.loading) return <div className="page"><Loading label="Chargement du Pokémon…" /></div>;
  if (!sp || !D.value) return <div className="page"><Empty icon="dex" title="Pokémon introuvable" action={<a className="btn primary" href={href('/pokedex')}>Retour au Pokédex</a>} /></div>;
  const { types, byId } = L.value;
  const e = D.value;
  const f = e.forms[formIdx] || e.forms[0];
  const [, , , , height, weight, stats, ftypes, artId, abilities, weak] = f;
  const t1 = TYPE_COLORS[ftypes[0]], t2 = TYPE_COLORS[ftypes[1] || ftypes[0]];
  const total = stats.reduce((a, b) => a + b, 0);
  const cards = d.ready ? e.cards.map((cid) => d.cats.pokemon.byId.get(cid)).filter(Boolean) : [];
  const ownedKeys = new Set(coll.map((x) => x.key));
  const priced = cards.map((c) => [eurOf(c, d.P, d.fx), c]);
  const best = priced.reduce((m, x) => (x[0] != null && x[0] > (m?.[0] ?? -1) ? x : m), null);
  const ownedCount = cards.filter((c) => ownedKeys.has(c.key)).length;
  const sortedCards = cardSort === 'prix' ? [...priced].sort((a, b) => (b[0] ?? -1) - (a[0] ?? -1)).map((x) => x[1]) : cards.slice().sort((a, b) => (d.cats.pokemon.sets.get(b.set)?.date || '').localeCompare(d.cats.pokemon.sets.get(a.set)?.date || ''));
  const weakGroups = [[4, '×4'], [2, '×2'], [0.5, '×½'], [0.25, '×¼'], [0, 'Immunisé']].map(([m, l]) => [l, m, Object.entries(weak).filter(([, v]) => v === m).map(([k]) => types.get(+k))]).filter(([, , a]) => a.length);
  const prev = byId.get(n - 1), next = byId.get(n + 1);
  const levels = [];
  const evo = e.evo;
  let cur = evo.filter((x) => !x[2] || !evo.some((y) => y[0] === x[2]));
  const seen = new Set();
  while (cur.length && levels.length < 5) { levels.push(cur); cur.forEach((x) => seen.add(x[0])); cur = evo.filter((x) => cur.some((c) => c[0] === x[2]) && !seen.has(x[0])); }
  const flavor = (e.flavor || '').replace(/\\n|\n/g, ' ');
  const playCry = () => { const a = new Audio(cry(n)); a.volume = 0.5; a.play().catch(() => toast('Le cri ne peut pas être joué sur ce navigateur.', { icon: 'mute' })); };
  return (
    <div className="page pokemon-page" style={{ '--t1': t1, '--t2': t2 }}>
      <div className="pk-topnav">
        <Crumbs items={[['Pokémon', href('/pk')], ['Pokédex', href('/pokedex')], [sp.fr]]} />
        <div className="pk-nav">
          {prev && <a className="btn ghost small" href={href('/pokedex/' + prev.id)}><Icon name="left" size={16} />{prev.fr}</a>}
          {next && <a className="btn ghost small" href={href('/pokedex/' + next.id)}>{next.fr}<Icon name="right" size={16} /></a>}
        </div>
      </div>
      <div className="pk-hero">
        <div className="pk-stage">
          <span className="pk-num-big" aria-hidden="true">{String(n).padStart(4, '0')}</span>
          <span className="pk-glow" aria-hidden="true" />
          <div className="pk-art" ref={tilt}><img key={artId + String(shiny)} src={artwork(artId, shiny)} alt={sp.fr} referrerPolicy="no-referrer" onError={(ev) => { if (shiny) setShiny(false); else ev.currentTarget.style.visibility = 'hidden'; }} /></div>
          <span className="pk-floor" aria-hidden="true" />
          <div className="row center pk-tools">
            <button className={'btn small ' + (shiny ? 'on' : 'ghost')} onClick={() => setShiny(!shiny)}><Icon name="sparkle" size={16} />Chromatique</button>
            <button className="btn small ghost" onClick={playCry}><Icon name="sound" size={16} />Écouter son cri</button>
          </div>
        </div>
        <div className="pk-info">
          <span className="pk-num">{num(n)} · génération {sp.gen} ({GEN[sp.gen]})</span>
          <h1>{sp.fr}</h1>
          <p className="muted">{e.genus}{sp.en !== sp.fr ? ' · en anglais ' + sp.en : ''}{e.ja ? ' · ' + e.ja : ''}</p>
          <div className="pk-types">{ftypes.map((t) => <TypeBadge key={t} t={types.get(t)} />)}{sp.flags & 1 ? <span className="tag variant">Légendaire</span> : null}{sp.flags & 2 ? <span className="tag variant">Fabuleux</span> : null}{sp.flags & 4 ? <span className="tag">Bébé</span> : null}</div>
          {e.forms.length > 1 && <div className="chips pk-forms">{e.forms.map((fo, i) => <button key={fo[0]} className={'chip' + (i === formIdx ? ' on' : '')} onClick={() => setFormIdx(i)}>{fo[1] || 'Forme de base'}{fo[2] ? ' · Méga' : ''}</button>)}</div>}
          {flavor && <blockquote className="pk-flavor">{flavor}{e.fv && <cite>Pokémon {e.fv}</cite>}</blockquote>}
          <dl className="pk-facts">
            <div><dt>Taille</dt><dd>{height?.toLocaleString('fr-FR')} m</dd></div>
            <div><dt>Poids</dt><dd>{weight?.toLocaleString('fr-FR')} kg</dd></div>
            <div><dt>Capture</dt><dd>{e.capture}</dd></div>
            <div><dt>Genre</dt><dd>{e.gender === -1 ? 'Asexué' : `${Math.round((1 - e.gender / 8) * 100)} % ♂ · ${Math.round((e.gender / 8) * 100)} % ♀`}</dd></div>
          </dl>
          <div className="pk-cards-sum">
            <div><span>Cartes</span><b>{cards.length}</b></div>
            <div><span>Dans ta collection</span><b>{ownedCount}</b></div>
            {best && <a href={cardHref(best[1])}><span>La plus chère</span><b>{fmtEur(best[0])}</b><small>{best[1].name} · {d.cats.pokemon.sets.get(best[1].set)?.name}</small></a>}
          </div>
        </div>
      </div>

      <div className="pk-panels">
        <section className="panel pad">
          <div className="kicker">Statistiques de base</div>
          <h2 className="pk-h2">Total {total}</h2>
          <div className="stat-split">
            <Radar values={stats} labels={STATS.map((s) => s[0])} max={180} color={t1} />
            <div className="stat-bars">{stats.map((v, i) => <div key={i} className="sb" style={{ '--i': i }}><span>{STATS[i][0]}</span><b>{v}</b><div><i style={{ width: Math.min(100, (v / 200) * 100) + '%', background: STATS[i][1] }} /></div></div>)}</div>
          </div>
        </section>
        <section className="panel pad">
          <div className="kicker">Au combat</div>
          <h2 className="pk-h2">Faiblesses et résistances</h2>
          <div className="weak-grid">{weakGroups.map(([l, m, arr]) => <div key={l} className={'weak-row m' + String(m).replace('.', '')}><b>{l}</b><div>{arr.map((t) => <TypeBadge key={t.id} t={t} small />)}</div></div>)}</div>
          <h3 className="ab-title">Talents</h3>
          <ul className="abilities">{abilities.map(([name, fl, hidden]) => <li key={name}><b>{name}{hidden ? <small> · caché</small> : null}</b><span>{fl.replace(/\\n|\n/g, ' ')}</span></li>)}</ul>
        </section>
      </div>

      {levels.length > 1 && (
        <Section kicker="Famille" title="Évolutions">
          <div className="evo panel pad">
            {levels.map((lv, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="evo-arrow"><Icon name="arrow" size={22} /></span>}
                <div className="evo-level">
                  {lv.map((x) => (
                    <a key={x[0]} href={href('/pokedex/' + x[0])} className={'evo-mon' + (x[0] === n ? ' on' : '')}>
                      <img src={artwork(x[0])} alt="" loading="lazy" referrerPolicy="no-referrer" />
                      <b>{x[1]}</b>{x[3] && <small>{x[3]}</small>}
                    </a>
                  ))}
                </div>
              </React.Fragment>
            ))}
          </div>
        </Section>
      )}

      <Section kicker={cards.length + ' cartes'} title={'Les cartes de ' + sp.fr} action={<Seg value={cardSort} onChange={setCardSort} label="Tri" options={[['prix', 'Par prix'], ['date', 'Plus récentes']]} />}>
        {!d.ready ? <Loading grid /> : cards.length === 0 ? <p className="muted">Aucune carte associée à ce Pokémon dans le catalogue.</p> : <div className="grid tiles">{sortedCards.slice(0, 60).map((c) => <CardTile key={c.key} card={c} />)}</div>}
        {cards.length > 60 && <p className="muted" style={{ marginTop: 16 }}>Les 60 premières cartes sont affichées. <a className="link" href={href('/recherche?q=' + encodeURIComponent(sp.en) + '&u=pokemon')}>Voir toutes ses cartes</a></p>}
      </Section>
    </div>
  );
}
