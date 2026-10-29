import React, { useMemo, useState } from 'react';
import { useData, href, cardHref, useMedia } from '../lib/hooks.js';
import { cloudOn } from '../lib/cloud.js';
import Quests from './Quests.jsx';
import { useStore } from '../lib/store.js';
import { fmtEur, fmtDate, fmtNum, fmtShort, eurOf, GAMES, img, setCards, resolveKey, artwork } from '../lib/data.js';
import { CardArt, CardTile, Delta, GameTag, Price, SetArt, setArtCards } from '../ui/Card.jsx';
import { Section, Seg, Loading, Money, Count } from '../ui/Kit.jsx';
import { SearchBox } from '../ui/Search.jsx';
import { Emblem } from '../ui/Brand.jsx';
import { collectionValue } from '../lib/coll.js';
import Icon from '../ui/Icon.jsx';

// ---- Podium : le trio des cartes les plus chères, sur une scène éclairée ----
export function podiumRows(d, game, limit = 10) {
  const out = [];
  for (const [id, eur] of d.M?.games?.[game]?.podium || []) { if (id.startsWith('jp-')) continue; const c = d.cats[game].byId.get(id); if (c) out.push({ c, eur }); }
  return out.sort((a, b) => b.eur - a.eur).slice(0, limit);
}

export function Podium({ game, limit = 10, list = true }) {
  const d = useData();
  const rows = useMemo(() => podiumRows(d, game, limit), [d.v, game]);
  if (!rows.length) return <p className="muted">Le podium apparaîtra après le premier relevé de prix.</p>;
  const [first, second, third] = rows;
  return (
    <div className={'hall' + (list && rows.length > 3 ? ' with-list' : '')}>
      <div className="stage">
        <div className="stage-beams" aria-hidden="true"><i /><i /><i /></div>
        {[[second, 2], [first, 1], [third, 3]].map(([r, k]) => r && (
          <a key={k} className={'plinth p' + k} href={cardHref(r.c)} style={{ '--d': (k === 1 ? 0.3 : k === 2 ? 0.15 : 0.45) + 's' }} aria-label={`${k}${k === 1 ? 'er' : 'e'} : ${r.c.name}`}>
            <span className="plinth-card"><CardArt card={r.c} className="live" eager />{k === 1 && <span className="crown" aria-hidden="true"><Icon name="crown" size={30} stroke={1.6} /></span>}</span>
            <span className="plinth-base">
              <span className="medal">{k}</span>
              <b title={r.c.name}>{r.c.name}</b>
              <small><GameTag game={r.c.game} /> {r.c.number}{r.c.variant ? ' · ' + r.c.variant : ''}</small>
              <span className="plinth-price"><Price card={r.c} /></span>
            </span>
          </a>
        ))}
      </div>
      {list && rows.length > 3 && (
        <ol className="rank-list" start={4}>
          {rows.slice(3).map((r, i) => (
            <li key={r.c.key} style={{ '--i': i }}><a href={cardHref(r.c)}>
              <span className="pos">{i + 4}</span><CardArt card={r.c} className="mini" tilt={false} fx={0} />
              <span className="r-name">{r.c.name}<small><GameTag game={r.c.game} /> {r.c.number}{r.c.variant ? ' · ' + r.c.variant : ''}</small></span>
              <Price card={r.c} />
            </a></li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ---- Ce qui monte, ce qui baisse ----
export function moverRows(d, game, per, dir) {
  const out = [];
  for (const [id, from, to, pct] of d.M?.games?.[game]?.[per]?.[dir] || []) {
    const k = per === 'day' ? 3 : 5; if (!(from >= 0.5 && to / from <= k && from / to <= k)) continue; // erreur ponctuelle d'une source
    const c = d.cats[game].byId.get(id); if (c) out.push({ c, from, to, pct });
  }
  return out.sort((a, b) => (dir === 'up' ? b.pct - a.pct : a.pct - b.pct));
}

export function Movers({ game, limit = 6 }) {
  const d = useData();
  const wide = useMedia('(min-width: 900px)');
  const [dir, setDir] = useState('up');
  const [period, setPeriod] = useState(null);
  const avail = (p) => d.M?.games?.[game]?.[p]?.up?.length || d.M?.games?.[game]?.[p]?.down?.length;
  const per = period || (avail('day') ? 'day' : 'week');
  const col = (dd) => {
    const rows = moverRows(d, game, per, dd).slice(0, limit);
    return (
      <div className={'mover-col ' + dd}>
        <h3><span className={'mc-ico ' + dd}>{dd === 'up' ? '▲' : '▼'}</span>{dd === 'up' ? 'En hausse' : 'En baisse'}</h3>
        {rows.length === 0 ? <p className="muted small">{per === 'day' ? 'Les variations sur 24 h apparaissent dès le deuxième relevé quotidien.' : 'Pas encore assez de relevés pour cette période.'}</p> : (
          <div className="mover-list">
            {rows.map((r, i) => (
              <a key={r.c.key} className={'mover ' + dd} href={cardHref(r.c)} style={{ '--i': i }}>
                <CardArt card={r.c} className="mini" tilt={false} fx={0} />
                <span className="m-name">{r.c.name}<small><GameTag game={r.c.game} /> {r.c.number}</small></span>
                <span className="m-vals"><s>{fmtEur(r.from)}</s><b>{fmtEur(r.to)}</b></span>
                <Delta pct={r.pct} />
              </a>
            ))}
          </div>
        )}
      </div>
    );
  };
  return (
    <div className="movers">
      <div className="movers-bar">
        {!wide && <Seg value={dir} onChange={setDir} label="Sens" options={[['up', '▲ Hausses'], ['down', '▼ Baisses']]} />}
        <Seg value={per} onChange={setPeriod} label="Période" options={[['day', '24 h'], ['week', '7 jours']]} />
      </div>
      <div className="mover-cols">{wide ? <>{col('up')}{col('down')}</> : col(dir)}</div>
      <p className="source-note">Seulement les cartes à 5 € et plus. {per === 'week' && game === 'pokemon' && d.M?.games?.pokemon?.weekNote?.startsWith('Moyenne') && 'Sur 7 jours : moyenne Cardmarket des 7 derniers jours comparée à celle des 30 derniers jours.'}</p>
    </div>
  );
}

const UNIV = {
  onepiece: {
    kicker: 'One Piece Card Game', title: <>Combien vaut <span className="grad">vraiment</span> ta carte One Piece&nbsp;?</>,
    lead: 'Le prix du jour de chaque version, standard, parallèle ou manga, sourcé et daté. Cherche, compare, suis les prix, scanne et range ta collection.',
    chips: ['Luffy', 'Shanks', 'Zoro', 'Nami', 'OP13-118', 'Yamato'], placeholder: 'Luffy, Shanks, OP13-118…',
    world: { href: '/equipage', icon: 'crew', title: 'L’équipage', text: 'Plus de 700 personnages en avis de recherche, chacun avec toutes ses cartes et sa prime du jour.', cta: 'Monter à bord' },
    packs: 'Déchire un booster, retourne les cartes une à une et découvre la valeur réelle de ton tirage.',
  },
  pokemon: {
    kicker: 'Pokémon Trading Card Game', title: <>Combien vaut <span className="grad">vraiment</span> ta carte Pokémon&nbsp;?</>,
    lead: 'Le prix du jour de plus de 20 000 cartes, de Set de Base à aujourd’hui, plus les cartes japonaises. Cherche en français ou en anglais, compare, suis les prix, scanne et range ta collection.',
    chips: ['Dracaufeu', 'Pikachu', 'Mewtwo', 'Évoli', 'Rayquaza', 'Lugia'], placeholder: 'Dracaufeu, Pikachu, 199/165…',
    world: { href: '/pokedex', icon: 'dex', title: 'Le Pokédex', text: 'Les 1 025 Pokémon : types, statistiques, évolutions, cri, faiblesses et toutes leurs cartes au prix du jour.', cta: 'Ouvrir le Pokédex' },
    packs: 'Déchire un booster, retourne les cartes une à une et découvre la valeur réelle de ton tirage.',
  },
};

export default function Home({ game }) {
  const d = useData();
  const U = UNIV[game];
  const coll = useStore((s) => s.collection);
  const recent = useStore((s) => s.recent);
  const wallet = useStore((s) => s.wallet?.[game]);
  if (!d.ready) return <div className="page home"><Hero game={game} /><Loading label="Chargement du catalogue et des prix…" grid /></div>;
  const { cats, M } = d;
  const total = cats[game].cards.length;
  const priced = M?.games?.[game]?.priced || 0;
  const mine = coll.filter((e) => e.key.startsWith(game + ':'));
  const value = mine.length ? collectionValue(mine, d) : null;
  const recentCards = recent.filter((k) => k.startsWith(game + ':')).map((k) => resolveKey(cats, k)).filter(Boolean).slice(0, 8);
  const sets = cats[game].setList.filter((s) => s.lang !== 'ja').slice(0, 10);
  const top = podiumRows(d, game, 3);
  return (
    <div className="page home">
      <Hero game={game} stats={{ total, priced, date: M?.updatedAt, cap: M?.games?.[game]?.marketCap }} top={top} />

      {value && (
        <a className="coll-banner panel glow-edge" href={href('/collection')}>
          <span className="cb-ico"><Icon name="album" size={22} /></span>
          <span className="cb-txt"><span className="kicker">Ma collection {GAMES[game].label}</span><b><Money value={value.total} /></b><small>{fmtNum(value.count)} cartes · {value.priced} avec un prix{value.best ? ' · la plus belle : ' + value.best.c.name : ''}</small></span>
          <span className="btn ghost small">Ouvrir le classeur <Icon name="arrow" size={16} /></span>
        </a>
      )}

      <Quests />

      <Section kicker="Prix relevés chaque matin" title="Le podium des cartes les plus chères" id="podium" action={<a className="btn ghost small" href={href('/classement')}><Icon name="trophy" size={16} />Top 100</a>}>
        <Podium game={game} />
      </Section>

      <Section kicker="Le marché bouge" title="Ce qui monte, ce qui baisse" id="mouvements" action={<a className="btn ghost small" href={href('/marche')}><Icon name="market" size={16} />Tout le marché</a>}>
        <Movers game={game} />
      </Section>

      <section className="bento">
        <a className={'bento-tile world ' + game} href={href(U.world.href)}>
          <WorldArt game={game} />
          <span className="bt-txt"><span className="bt-ico"><Icon name={U.world.icon} size={22} /></span><h3>{U.world.title}</h3><p>{U.world.text}</p><span className="link">{U.world.cta} <Icon name="arrow" size={16} /></span></span>
        </a>
        <a className="bento-tile packs" href={href('/boosters')}>
          <span className="bt-pack" aria-hidden="true"><span className="mini-pack"><Emblem game={game} size={44} /><b>KIRAKAI</b></span></span>
          <span className="bt-txt"><span className="bt-ico"><Icon name="pack" size={22} /></span><h3>Ouvre des boosters</h3><p>{U.packs}</p>{wallet && <span className="tag">{fmtNum(wallet.coins)} {game === 'onepiece' ? 'Berrys' : 'Pokéballs'}</span>}<span className="link">Déchirer un booster <Icon name="arrow" size={16} /></span></span>
        </a>
        <a className="bento-tile scan" href={href('/scanner')}>
          <span className="bt-scan" aria-hidden="true"><i /><span /></span>
          <span className="bt-txt"><span className="bt-ico"><Icon name="scan" size={22} /></span><h3>Scanne ta carte</h3><p>Photo ou caméra : on lit son numéro, on note son état sur 10 et elle rejoint ta collection.</p><span className="link">Scanner <Icon name="arrow" size={16} /></span></span>
        </a>
        <a className="bento-tile binder" href={href('/collection')}>
          <span className="bt-binder" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
          <span className="bt-txt"><span className="bt-ico"><Icon name="album" size={22} /></span><h3>Ton classeur</h3><p>Pages qui se tournent, couverture en cuir, cartes à placer où tu veux, lien de partage.</p><span className="link">Ouvrir <Icon name="arrow" size={16} /></span></span>
        </a>
        <a className="bento-tile market" href={href('/marche')}>
          <span className="bt-chart" aria-hidden="true"><svg viewBox="0 0 120 50" preserveAspectRatio="none"><path d="M0 42 C15 40 20 30 32 32 S50 18 62 22 S82 8 95 12 S112 4 120 2" /></svg></span>
          <span className="bt-txt"><span className="bt-ico"><Icon name="market" size={22} /></span><h3>Le marché</h3><p>Valeur totale, extensions les plus précieuses, répartition des prix et indice du top 50.</p><span className="link">Voir le marché <Icon name="arrow" size={16} /></span></span>
        </a>
        <a className="bento-tile compare" href={href('/comparateur')}>
          <span className="bt-txt"><span className="bt-ico"><Icon name="compare" size={22} /></span><h3>Compare</h3><p>Jusqu’à 4 cartes côte à côte, avec leurs courbes.</p><span className="link">Comparer <Icon name="arrow" size={16} /></span></span>
        </a>
      </section>

      {recentCards.length > 0 && (
        <Section kicker="Tu as regardé" title="Cartes récentes">
          <div className="rail">{recentCards.map((c) => <CardTile key={c.key} card={c} compact />)}</div>
        </Section>
      )}

      <Section kicker={fmtNum(cats[game].setList.filter((s) => s.lang !== 'ja').length) + ' extensions'} title="Les dernières extensions" action={<a className="btn ghost small" href={href('/extensions/' + game)}><Icon name="sets" size={16} />Toutes</a>}>
        <div className="rail sets">
          {sets.map((s) => {
            const cards = setCards(cats, game, s.code);
            const art = setArtCards(cards, d);
            const val = cards.reduce((t, c) => t + (eurOf(c, d.P, d.fx) || 0), 0);
            return (
              <a key={s.code} className="set-card" href={href('/extension/' + game + '/' + encodeURIComponent(s.code))}>
                {art.length ? <SetArt cards={art} code={s.code} logo={s.logo} /> : <span className="set-art"><b className="sa-code">{s.code}</b></span>}
                <span className="set-info"><b>{s.name}</b><small>{s.code} · {s.count} cartes{s.date ? ' · ' + fmtDate(s.date, { month: 'short', year: 'numeric' }) : ''}</small>{val > 0 && <small className="set-val">Valeur du set · {fmtShort(val)}</small>}</span>
              </a>
            );
          })}
        </div>
      </Section>

      <Section kicker="Transparence" title="D’où viennent les prix ?" className="faq">
        <div className="faq-grid">
          {game === 'onepiece'
            ? <div className="panel pad"><Icon name="chart" size={22} /><h3>One Piece</h3><p>Prix de marché TCGplayer relevé chaque matin par optcgapi.com, converti en euros au taux BCE du jour. Chaque version (standard, parallèle, réimpression) a son propre prix.</p></div>
            : <div className="panel pad"><Icon name="chart" size={22} /><h3>Pokémon</h3><p>Tendance Cardmarket, avec les moyennes sur 1, 7 et 30 jours et le prix TCGplayer quand il existe. Les cartes dont les deux sources divergent fortement sont signalées.</p></div>}
          <div className="panel pad"><Icon name="info" size={22} /><h3>Une carte sans prix ?</h3><p>On affiche « Pas de prix relevé ». Aucun prix n’est inventé ni estimé à partir d’une autre carte.</p></div>
          <div className="panel pad"><Icon name="heart" size={22} /><h3>Tes données</h3><p>{cloudOn() ? <>Collection, suivis et boosters sont enregistrés dans ton navigateur, et dans ton compte si tu en crées un : tu les retrouves alors sur tous tes appareils. <a className="link" href={href('/compte')}>Mon compte</a></> : 'Collection, suivis et boosters restent dans ton navigateur. Exporte-les quand tu veux depuis les réglages.'}</p></div>
        </div>
      </Section>
    </div>
  );
}

// Illustration de la tuile Équipage / Pokédex
function WorldArt({ game }) {
  if (game === 'pokemon') return <span className="bt-world mons" aria-hidden="true">{[6, 25, 150, 384, 249].map((id, i) => <img key={id} src={artwork(id)} alt="" loading="lazy" referrerPolicy="no-referrer" style={{ '--i': i }} />)}</span>;
  return <span className="bt-world posters" aria-hidden="true">{['OP01-001', 'OP01-120', 'OP01-024', 'OP01-016'].map((id, i) => <span key={id} style={{ '--i': i }}><img src={img('@o/' + id + '.jpg')} alt="" loading="lazy" referrerPolicy="no-referrer" /></span>)}</span>;
}

function Hero({ game, stats, top = [] }) {
  const U = UNIV[game];
  return (
    <section className={'hero ' + game}>
      <div className="hero-copy">
        <div className="kicker">{U.kicker}</div>
        <h1>{U.title}</h1>
        <p className="lead">{U.lead}</p>
        <SearchBox big placeholder={U.placeholder} />
        <div className="chips hero-chips">{U.chips.map((t) => <a key={t} href={href('/recherche?q=' + encodeURIComponent(t) + '&u=' + game)} className="chip">{t}</a>)}</div>
        {stats && (
          <dl className="hero-stats">
            <div><dt>Cartes</dt><dd><Count value={stats.total} /></dd></div>
            <div><dt>Prix réels</dt><dd><Count value={stats.priced} /></dd></div>
            {stats.cap > 0 && <div><dt>Valeur du marché</dt><dd>{fmtShort(stats.cap)}</dd></div>}
            <div><dt>Relevé</dt><dd>{stats.date ? fmtDate(stats.date, { day: 'numeric', month: 'short' }) : '—'}</dd></div>
          </dl>
        )}
      </div>
      <div className="hero-show" aria-hidden={!top.length}>
        <span className="hs-halo" />
        <Emblem game={game} size={90} className="hs-emblem" />
        {top.length === 3 && (
          <div className="hs-cards">
            {[top[1], top[2], top[0]].map((r, i) => (
              <a key={r.c.key} href={cardHref(r.c)} className={'hs-card c' + i} tabIndex={i === 2 ? 0 : -1}>
                <CardArt card={r.c} size={i === 2 ? 'large' : 'small'} className="live" eager />
                {i === 2 && <span className="hs-label"><Icon name="crown" size={14} />N°1 du jour · {fmtEur(r.eur)}</span>}
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
