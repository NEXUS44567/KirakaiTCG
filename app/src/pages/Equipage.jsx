import React, { useEffect, useMemo, useState } from 'react';
import { useData, useAsync, useInfinite, useRoute, useTilt, href, cardHref } from '../lib/hooks.js';
import { useStore } from '../lib/store.js';
import { equipageData, eurOf, fmtEur, fmtNum, img, normalize, OP_COLORS } from '../lib/data.js';
import { CardArt, CardTile } from '../ui/Card.jsx';
import { Loading, Empty, Section, Seg, Crumbs } from '../ui/Kit.jsx';
import Icon from '../ui/Icon.jsx';

const TRAIT_FR = {};
function useCrew() {
  return useAsync(async () => {
    const j = await equipageData();
    for (const [id, label] of j.affiliations) TRAIT_FR[id] = label;
    const members = j.members.map(([slug, name, leader, colors, traits, attributes, image, cards, versions, power, cost, numbers]) => ({ slug, name, leader: !!leader, colors, traits, attributes, image, cards, versions, power, cost, numbers, q: normalize(name) }));
    return { ...j, members, bySlug: new Map(members.map((m) => [m.slug, m])) };
  }, []);
}
function memberCards(m, d) {
  if (!d.ready) return [];
  const nums = new Set(m.numbers);
  return d.cats.onepiece.cards.filter((c) => nums.has(c.number));
}
export const traitLabel = (t) => TRAIT_FR[t] || t;
const Dots = ({ colors }) => <span className="op-dots">{colors.map((c) => <i key={c} title={OP_COLORS[c]?.[0] || c} style={{ background: OP_COLORS[c]?.[1] || '#888' }} />)}</span>;

// Avis de recherche façon Marine : la prime est la valeur de sa carte la plus chère
export function Wanted({ m, value, have, big }) {
  return (
    <span className={'wanted' + (big ? ' big' : '') + (m.leader ? ' leader' : '')}>
      <span className="w-head">WANTED</span>
      <span className="w-photo"><img src={img('@o/' + m.image + '.jpg')} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />{m.leader && <span className="w-stamp">Leader</span>}</span>
      <span className="w-doa">DEAD OR ALIVE</span>
      <b className="w-name">{m.name}</b>
      <span className="w-bounty"><small>Prime</small>{value > 0 ? fmtEur(value) : '—'}</span>
      <span className="w-foot"><Dots colors={m.colors} /><span>{m.versions} version{m.versions > 1 ? 's' : ''}</span>{have > 0 && <span className="w-have">{have}/{m.cards}</span>}</span>
    </span>
  );
}

export default function EquipagePage() {
  const d = useData();
  const C = useCrew();
  const coll = useStore((s) => s.collection);
  const route = useRoute();
  const [q, setQ] = useState('');
  const [aff, setAff] = useState(route.query.aff || '');
  const [color, setColor] = useState('');
  const [role, setRole] = useState('all');
  const [sort, setSort] = useState('valeur');
  const values = useMemo(() => {
    if (!C.value || !d.ready) return new Map();
    const byNum = new Map();
    for (const c of d.cats.onepiece.cards) { const e = eurOf(c, d.P, d.fx); if (e != null && e > (byNum.get(c.number) || 0)) byNum.set(c.number, e); }
    return new Map(C.value.members.map((m) => [m.slug, Math.max(0, ...m.numbers.map((n) => byNum.get(n) || 0))]));
  }, [C.value, d.ready, d.v]);
  const ownedNums = useMemo(() => (!d.ready ? new Set() : new Set(coll.filter((e) => e.key.startsWith('onepiece:')).map((e) => d.cats.onepiece.byId.get(e.key.slice(9))?.number).filter(Boolean))), [coll, d.ready]);
  const list = useMemo(() => {
    if (!C.value) return [];
    const t = normalize(q);
    let r = C.value.members.filter((m) => (!t || m.q.includes(t)) && (!aff || m.traits.includes(aff)) && (!color || m.colors.includes(color)) && (role === 'all' || (role === 'leader') === m.leader));
    if (sort === 'valeur') r = [...r].sort((a, b) => (values.get(b.slug) || 0) - (values.get(a.slug) || 0));
    if (sort === 'cartes') r = [...r].sort((a, b) => b.versions - a.versions);
    if (sort === 'nom') r = [...r].sort((a, b) => a.name.localeCompare(b.name));
    return r;
  }, [C.value, q, aff, color, role, sort, values]);
  const [n, sentinel] = useInfinite(list.length, 48, [q, aff, color, role, sort]);
  if (C.loading) return <div className="page"><Loading label="L’équipage embarque…" /></div>;
  if (C.error) return <div className="page"><p className="error">Équipage indisponible.</p></div>;
  const totalCards = C.value.members.reduce((s, m) => s + m.cards, 0);
  const top = list[0] && sort === 'valeur' && !q && !aff && !color && role === 'all' ? C.value.members.slice().sort((a, b) => (values.get(b.slug) || 0) - (values.get(a.slug) || 0)).slice(0, 3) : null;
  return (
    <div className="page crew-page">
      <div className="kicker">One Piece TCG · {fmtNum(C.value.members.length)} personnages · {fmtNum(totalCards)} cartes</div>
      <h1 className="page-title">L’<span className="grad">équipage</span></h1>
      <p className="lead">Chaque personnage a son avis de recherche : sa prime, c’est la valeur du jour de sa carte la plus chère. Sa fiche réunit toutes ses cartes, parallèles comprises.</p>
      {top && (
        <div className="most-wanted">
          {top.map((m, i) => <a key={m.slug} href={href('/equipage/' + m.slug)} className={'mw mw' + i} style={{ '--i': i }}><Wanted m={m} value={values.get(m.slug)} big={i === 0} /></a>)}
        </div>
      )}
      <div className="crew-filters">
        <div className="searchbox"><Icon name="search" size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Luffy, Zoro, Nami…" aria-label="Chercher un personnage" /></div>
        <div className="toolbar">
          <select value={aff} onChange={(e) => setAff(e.target.value)} aria-label="Affiliation"><option value="">Toutes les affiliations</option>{C.value.affiliations.map(([id, label, k]) => <option key={id} value={id}>{label} ({k})</option>)}</select>
          <Seg value={role} onChange={setRole} label="Rôle" options={[['all', 'Tous'], ['leader', 'Leaders'], ['perso', 'Personnages']]} />
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Trier"><option value="valeur">Prime la plus haute</option><option value="cartes">Nombre de versions</option><option value="nom">Nom</option></select>
          <span className="count">{fmtNum(list.length)} personnage{list.length > 1 ? 's' : ''}</span>
        </div>
        <div className="chips scroll">
          <button className={'chip' + (!color ? ' on' : '')} onClick={() => setColor('')}>Toutes les couleurs</button>
          {Object.entries(OP_COLORS).map(([k, [fr, hex]]) => <button key={k} className={'chip cchip' + (color === k ? ' on' : '')} style={{ '--c': hex }} onClick={() => setColor(color === k ? '' : k)}><i />{fr}</button>)}
        </div>
      </div>
      {list.length === 0 ? <Empty icon="crew" title="Personne à bord">Change les filtres ou la recherche.</Empty> : (
        <div className="crew-grid">
          {list.slice(0, n).map((m) => <a key={m.slug} href={href('/equipage/' + m.slug)} className="crew-tile"><Wanted m={m} value={values.get(m.slug) || 0} have={m.numbers.filter((x) => ownedNums.has(x)).length} /></a>)}
        </div>
      )}
      <div ref={sentinel} className="sentinel" />
      <p className="source-note">Source : {C.value.source}. One Piece © Eiichiro Oda / Shueisha, Toei Animation, Bandai.</p>
    </div>
  );
}

export function MemberPage({ slug }) {
  const d = useData();
  const C = useCrew();
  const coll = useStore((s) => s.collection);
  const [filter, setFilter] = useState('all');
  const tilt = useTilt({ max: 14, gyro: true });
  const m = C.value?.bySlug.get(slug);
  const byNum = useMemo(() => {
    const out = new Map(); if (!d.ready) return out;
    for (const c of d.cats.onepiece.cards) { const e = eurOf(c, d.P, d.fx); if (e != null && e > (out.get(c.number) || 0)) out.set(c.number, e); }
    return out;
  }, [d.ready, d.v]);
  useEffect(() => { if (m) document.title = m.name + ' · L’équipage · Kirakai'; }, [m]);
  if (C.loading || !d.ready) return <div className="page"><Loading /></div>;
  if (!m) return <div className="page"><Empty icon="crew" title="Personnage introuvable" action={<a className="btn primary" href={href('/equipage')}>Retour à l’équipage</a>} /></div>;
  const cards = memberCards(m, d);
  const priced = cards.map((c) => [eurOf(c, d.P, d.fx), c]).sort((a, b) => (b[0] ?? -1) - (a[0] ?? -1));
  const best = priced.find((x) => x[0] != null);
  const sumAll = priced.reduce((s, x) => s + (x[0] || 0), 0);
  const ownedKeys = new Set(coll.map((e) => e.key));
  const have = cards.filter((c) => ownedKeys.has(c.key)).length;
  const shown = priced.map((x) => x[1]).filter((c) => filter === 'all' || (filter === 'std' ? !c.variant : !!c.variant));
  const par = cards.filter((c) => c.variant).length;
  const hero = best?.[1] || cards[0];
  const related = C.value.members.filter((x) => x.slug !== m.slug && x.traits.includes(m.traits[0])).sort((a, b) => b.versions - a.versions).slice(0, 8);
  const range = (r) => (r ? (r[0] === r[1] ? fmtNum(r[0]) : fmtNum(r[0]) + ' à ' + fmtNum(r[1])) : '—');
  return (
    <div className="page member-page" data-game="onepiece">
      <Crumbs items={[['One Piece', href('/op')], ['L’équipage', href('/equipage')], [m.name]]} />
      <div className="member-hero">
        <div className="mh-poster"><Wanted m={m} value={best?.[0] || 0} big /></div>
        <div className="mh-info">
          <div className="card-tags">{m.leader && <span className="tag variant">Leader</span>}<Dots colors={m.colors} /></div>
          <h1 className="card-name">{m.name}</h1>
          <div className="chips">{m.traits.map((t) => <a key={t} className="chip" href={href('/equipage?aff=' + encodeURIComponent(t))}>{traitLabel(t)}</a>)}</div>
          <dl className="member-facts">
            <div><dt>Cartes</dt><dd>{m.cards}</dd></div>
            <div><dt>Versions</dt><dd>{cards.length}{par ? <small> dont {par} parallèle{par > 1 ? 's' : ''} ou réimpression{par > 1 ? 's' : ''}</small> : null}</dd></div>
            <div><dt>Couleurs</dt><dd>{m.colors.map((c) => OP_COLORS[c]?.[0] || c).join(', ')}</dd></div>
            <div><dt>Attribut</dt><dd>{m.attributes.map((a) => C.value.attributes[a] || a).join(', ') || '—'}</dd></div>
            <div><dt>Puissance</dt><dd>{range(m.power)}</dd></div>
            <div><dt>Coût</dt><dd>{range(m.cost)}</dd></div>
          </dl>
          <div className="pk-cards-sum">
            <div><span>Dans ta collection</span><b>{have} / {cards.length}</b></div>
            {best && <a href={cardHref(best[1])}><span>Sa carte la plus chère</span><b>{fmtEur(best[0])}</b><small>{best[1].number}{best[1].variant ? ' · ' + best[1].variant : ''}</small></a>}
            <div><span>Toutes ses versions</span><b>{fmtEur(sumAll)}</b><small>un exemplaire de chaque</small></div>
          </div>
        </div>
        {hero && <div className="mh-card"><div className="cv-tilt" ref={tilt}><CardArt card={hero} size="large" eager className="live" tilt={false} /></div></div>}
      </div>
      <Section kicker={cards.length + ' versions'} title={'Les cartes de ' + m.name} action={<Seg value={filter} onChange={setFilter} label="Versions" options={[['all', 'Toutes'], ['std', 'Standard'], ['par', 'Parallèles']]} />}>
        <div className="grid tiles">{shown.map((c) => <CardTile key={c.key} card={c} />)}</div>
      </Section>
      {related.length > 0 && (
        <Section kicker={traitLabel(m.traits[0])} title="Le reste de l’équipage">
          <div className="crew-grid small">{related.map((x) => <a key={x.slug} href={href('/equipage/' + x.slug)} className="crew-tile"><Wanted m={x} value={Math.max(0, ...x.numbers.map((k) => byNum.get(k) || 0))} /></a>)}</div>
        </Section>
      )}
    </div>
  );
}
