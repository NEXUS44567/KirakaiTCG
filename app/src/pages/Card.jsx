import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useData, useAsync, href, cardHref, useTilt, reduceMotion } from '../lib/hooks.js';
import { useStore, addToCollection, setAlert, pushRecent, toggleWatch, toggleCompare, toggleWish, CONDITIONS } from '../lib/store.js';
import { CUR, toDisp, fromDisp, priceOf, eurOf, historyOf, fmtEur, fmtUsd, fmtDate, normalize, GAMES, pokedexList, equipageData, img, fxLevel, FX_NAMES, setCards, cardPageUrl } from '../lib/data.js';
import { toast } from '../lib/toast.js';
import { CardArt, CardTile, Delta, GameTag, LangTag } from '../ui/Card.jsx';
import { CardBack } from '../ui/Brand.jsx';
import { PriceChart } from '../ui/Chart.jsx';
import { Section, Seg, Loading, Empty, Money, Crumbs, Modal } from '../ui/Kit.jsx';
import Icon from '../ui/Icon.jsx';

// Pokémon du Pokédex dont le nom figure dans celui de la carte (« Dracaufeu ex » → Dracaufeu)
let dexIndex = null;
async function speciesOf(card) {
  dexIndex ??= pokedexList().then((j) => j.species.flatMap(([id, fr, en]) => [[normalize(en), id, fr], [normalize(fr), id, fr]]).filter((x) => x[0].length >= 3).sort((a, b) => b[0].length - a[0].length)).catch(() => []);
  const list = await dexIndex;
  const n = ' ' + normalize([card.name, card.en?.name, card.nameFr, card.nameEn].filter(Boolean).join(' ')) + ' ';
  const hit = list.find(([k]) => n.includes(' ' + k + ' '));
  return hit ? { id: hit[1], name: hit[2] } : null;
}
async function memberOf(card) {
  const j = await equipageData().catch(() => null);
  const m = j?.members.find((x) => x[11]?.includes(card.number));
  return m ? { slug: m[0], name: m[1] } : null;
}

export default function CardPage({ cardKey }) {
  const d = useData();
  const card = useMemo(() => {
    if (!d.ready) return null;
    const [g, ...r] = cardKey.split(':');
    return d.cats[g]?.byId.get(r.join(':')) || null;
  }, [d.ready, d.jp, cardKey]);
  useEffect(() => { if (card) { pushRecent(card.key); document.title = card.name + ' ' + card.number + ' · prix · Kirakai'; } }, [card, d.lang]);
  const hist = useAsync(() => (card ? historyOf(card) : []), [card?.key]);
  const world = useAsync(() => (!card ? null : card.game === 'pokemon' ? speciesOf(card) : memberOf(card)), [card?.key, d.lang]);
  const tilt = useTilt({ max: 16, gyro: true });
  const [period, setPeriod] = useState('all');
  const [inspect, setInspect] = useState(false);
  const owned = useStore((s) => s.collection.filter((e) => e.key === cardKey).reduce((n, e) => n + e.qty, 0));
  const rank = useMemo(() => {
    if (!card || !d.ready) return null;
    const mine = eurOf(card, d.P, d.fx); if (mine == null) return null;
    let n = 1, total = 0;
    for (const c of d.cats[card.game].cards) { if ((c.lang === 'ja') !== (card.lang === 'ja')) continue; const e = eurOf(c, d.P, d.fx); if (e == null) continue; total++; if (e > mine) n++; }
    return { n, total };
  }, [card?.key, d.ready, d.jp]);
  if (!d.ready || (!card && cardKey.includes(':jp-') && !d.jp)) return <div className="page"><Loading /></div>;
  if (!card) return <div className="page"><Empty icon="search" title="Carte introuvable" action={<a className="btn primary" href={href('/')}>Retour à l’accueil</a>}>Cette carte n’est pas dans le catalogue.</Empty></div>;

  const { cats, P, fx } = d;
  const set = cats[card.game].sets.get(card.set);
  const p = priceOf(card, P);
  const eur = eurOf(card, P, fx);
  const allPoints = hist.value || [];
  const points = period === 'all' ? allPoints : allPoints.slice(-Number(period));
  const first = points[0]?.[1], last = points.at(-1)?.[1];
  const hi = points.length ? Math.max(...points.map((x) => x[1])) : null, lo = points.length ? Math.min(...points.map((x) => x[1])) : null;
  const change = first && last && points.length > 1 ? ((last - first) / first) * 100 : null;
  const siblings = setCards(cats, card.game, card.set).filter((c) => c.number === card.number && c.id !== card.id);
  const alsoName = card.game === 'onepiece' ? cats[card.game].cards.filter((c) => c.name === card.name && c.number !== card.number) : [];
  const others = [...siblings, ...alsoName.sort((a, b) => (eurOf(b, P, fx) || 0) - (eurOf(a, P, fx) || 0))].slice(0, 12);
  const enName = card.en?.name || card.nameEn || card.name;
  const srcCur = p?.converted ? 'USD' : 'EUR';
  const conv = srcCur !== CUR.code ? ', converti en ' + CUR.name : '';
  const priceLabel = card.lang === 'ja' ? 'Prix du jour · Cardmarket, version japonaise' + conv
    : card.game === 'onepiece' ? 'Prix TCGplayer de la version anglaise' + conv
    : p?.converted ? 'Prix TCGplayer (toutes langues)' + conv : 'Prix du jour · Cardmarket, toutes langues' + conv;
  const scopeNote = card.lang === 'ja' ? 'Prix des exemplaires japonais vendus sur Cardmarket (Europe), pas celui des boutiques au Japon.'
    : card.game === 'onepiece' ? 'Ce prix est celui de la version anglaise : il n’existe pas de relevé gratuit des prix français ou japonais.'
    : 'Cardmarket regroupe toutes les langues (français, anglais, allemand…) dans un même prix : il n’existe pas de relevé gratuit propre à la version française.';
  const q = encodeURIComponent;
  const links = card.game === 'onepiece'
    ? [['Cardmarket', `https://www.cardmarket.com/fr/OnePiece/Products/Search?searchString=${q(card.number)}`], ['TCGplayer', `https://www.tcgplayer.com/search/one-piece-card-game/product?q=${q(card.number)}`], ['eBay', `https://www.ebay.fr/sch/i.html?_nkw=${q(enName + ' ' + card.number)}+one+piece`]]
    : card.lang === 'ja'
      ? [['Cardmarket', `https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${q(card.nameEn || card.name)}`], ['eBay', `https://www.ebay.fr/sch/i.html?_nkw=${q((card.nameEn || card.name) + ' ' + card.number + ' japanese')}`]]
      : [['Cardmarket', `https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${q(enName)}`], ['TCGplayer', `https://www.tcgplayer.com/search/pokemon/product?q=${q(enName + ' ' + (set?.en?.name || set?.name || ''))}`], ['eBay', `https://www.ebay.fr/sch/i.html?_nkw=${q(enName + ' ' + card.number + ' ' + (set?.en?.name || set?.name || ''))}`]];
  const lvl = fxLevel(card);
  const share = async () => {
    // la page de la carte : son aperçu (image, nom) s'affiche dans les messageries et réseaux sociaux
    const url = cardPageUrl(card) || location.href, text = `${card.name} ${card.number} · ${eur != null ? fmtEur(eur) : 'prix'} sur Kirakai`;
    if (navigator.share) { try { await navigator.share({ title: card.name, text, url }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(url); toast('Le lien de la fiche est copié.', { icon: 'share' }); } catch { toast(url, { icon: 'share' }); }
  };

  return (
    <div className="page card-page" data-game={card.game}>
      <Crumbs items={[[GAMES[card.game].label, href(GAMES[card.game].home)], ['Extensions', href('/extensions/' + card.game)], [set?.name, href('/extension/' + card.game + '/' + encodeURIComponent(card.set))]]} />
      <div className="card-hero">
        <div className="card-visual">
          <span className="cv-glow" aria-hidden="true" />
          <div className="cv-tilt" ref={tilt}><CardArt card={card} size="large" eager className="live hero-card" tilt={false} /></div>
          <div className="cv-tools">
            <button className="btn ghost small" onClick={() => setInspect(true)}><Icon name="zoom" size={16} />Inspecter</button>
            {lvl > 0 && <span className={'fx-badge fx' + lvl}><Icon name="sparkle" size={14} />{FX_NAMES[lvl]}</span>}
            {owned > 0 && <a className="owned-pill" href={href('/collection')}><Icon name="check" size={14} stroke={3} />{owned} dans ta collection</a>}
          </div>
        </div>
        <div className="card-info">
          <div className="card-tags"><GameTag game={card.game} /><LangTag card={card} /><span className="tag">{card.number}</span>{card.rarity && <span className="tag">{card.rarity}</span>}{card.variant && <span className="tag variant">{card.variant}</span>}</div>
          <h1 className="card-name">{card.name}{card.lang === 'ja' ? (card.nameFr && <small> · {card.nameFr}</small>)
            : card.local && card.en?.name !== card.name ? <small> · {card.en.name}</small>
            : card.nameFr && card.nameFr !== card.name && <small> · {card.nameFr}</small>}</h1>
          <p className="card-sub"><a href={href('/extension/' + card.game + '/' + encodeURIComponent(card.set))}>{set?.name}</a>{set?.date ? ' · ' + fmtDate(set.date, { month: 'long', year: 'numeric' }) : ''}{card.type ? ' · ' + card.type : ''}
            {world.value && (card.game === 'pokemon'
              ? <a className="world-link" href={href('/pokedex/' + world.value.id)}><Icon name="dex" size={15} />{world.value.name} dans le Pokédex</a>
              : <a className="world-link" href={href('/equipage/' + world.value.slug)}><Icon name="crew" size={15} />Avis de recherche de {world.value.name}</a>)}
          </p>

          <div className="price-box panel glow-edge">
            <span className="pb-label">{priceLabel}</span>
            <div className="pb-main">
              <span className="pb-value">{eur != null ? <>{srcCur !== CUR.code && <span className="approx">≈</span>}<Money value={eur} /></> : <span className="pb-none">Pas de prix relevé</span>}</span>
              {change != null && <span className="pb-change"><Delta pct={change} /><small>depuis le {fmtDate(points[0][0], { day: 'numeric', month: 'short' })}</small></span>}
            </div>
            {rank && <a className="pb-rank" href={href('/classement?u=' + card.game)}><Icon name="trophy" size={15} />N° {rank.n.toLocaleString('fr-FR')} sur {rank.total.toLocaleString('fr-FR')} cartes {card.lang === 'ja' ? 'japonaises' : GAMES[card.game].label} avec un prix</a>}
            {p && (
              <dl className="pb-grid">
                {card.game === 'onepiece' ? <div><dt>TCGplayer · marché</dt><dd>{fmtUsd(p.usd)}</dd></div>
                  : card.lang === 'ja' ? <>
                    <div><dt>Moyenne 7 jours</dt><dd>{fmtEur(p.avg7)}</dd></div>
                    <div><dt>Moyenne 30 jours</dt><dd>{fmtEur(p.avg30)}</dd></div>
                    <div><dt>Offre la plus basse</dt><dd>{fmtEur(p.low)}</dd></div>
                  </> : <>
                    <div><dt>Moyenne 1 jour</dt><dd>{fmtEur(p.avg1)}</dd></div>
                    <div><dt>Moyenne 7 jours</dt><dd>{fmtEur(p.avg7)}</dd></div>
                    <div><dt>Moyenne 30 jours</dt><dd>{fmtEur(p.avg30)}</dd></div>
                    <div><dt>Offre la plus basse</dt><dd>{fmtEur(p.low)}</dd></div>
                    <div><dt>TCGplayer · marché</dt><dd>{fmtUsd(p.usd)}</dd></div>
                  </>}
              </dl>
            )}
            {p?.divergent && <p className="warn-note"><Icon name="info" size={16} />Cardmarket et TCGplayer donnent des prix très différents pour cette carte (impression ou version mal distinguée par les sources). Vérifie les offres avant d’acheter ou de vendre.</p>}
            <p className="scope-note"><Icon name="info" size={14} />{scopeNote}</p>
            <SourceLine game={card.game} ja={card.lang === 'ja'} />
          </div>

          <div className="card-actions">
            <AddButton card={card} />
            <WishBtn card={card} eur={eur} />
            <WatchBtn card={card} eur={eur} />
            <CompareBtn card={card} />
            <button className="btn ghost" onClick={share}><Icon name="share" size={18} />Partager</button>
          </div>
          <AlertEditor card={card} eur={eur} />
          <div className="ext-links"><span>Voir les offres</span>{links.map(([l, u]) => <a key={l} href={u} target="_blank" rel="noreferrer">{l}<Icon name="ext" size={13} /></a>)}</div>
        </div>
      </div>

      <Section kicker="Historique" title="Évolution du prix" action={allPoints.length > 7 ? <Seg value={period} onChange={setPeriod} label="Période" options={[['7', '7 j'], ['30', '30 j'], ['90', '90 j'], ['all', 'Tout']].filter(([v]) => v === 'all' || allPoints.length > Number(v) / 2)} /> : null}>
        <div className="panel pad chart-panel">
          {hist.loading ? <Loading /> : <PriceChart series={[{ points, color: 'var(--a1)' }]} height={260} empty={points.length === 1 ? `Premier relevé le ${fmtDate(points[0][0])} à ${fmtEur(points[0][1])}. La courbe se dessine dès demain.` : undefined} />}
          {points.length > 1 && (
            <div className="hist-stats">
              <div><span>Variation</span><b><Delta pct={change} plain /></b></div>
              <div><span>Plus haut</span><b>{fmtEur(hi)}</b></div>
              <div><span>Plus bas</span><b>{fmtEur(lo)}</b></div>
              <div><span>Relevés</span><b>{points.length} jours</b></div>
            </div>
          )}
        </div>
        {card.game === 'pokemon' && p?.avg30 && <AvgBars p={p} />}
      </Section>

      {eur != null && <ConditionTable eur={eur} />}

      {others.length > 0 && (
        <Section kicker={siblings.length ? 'Autres versions' : 'Même personnage'} title={siblings.length ? 'Les autres versions de cette carte' : 'Autres cartes de ' + card.name}>
          <div className="grid tiles">{others.map((c) => <CardTile key={c.key} card={c} compact />)}</div>
        </Section>
      )}
      {inspect && <Inspector card={card} onClose={() => setInspect(false)} />}
    </div>
  );
}

export function SourceLine({ game, ja }) {
  const { P, M } = useData();
  const g = M?.games?.[game];
  const s = P?.[game]?.source;
  if (ja) return s?.ja ? <p className="source-note">Source : <a href={s.ja.url} target="_blank" rel="noreferrer">{s.ja.name}</a> · relevé du {fmtDate(P[game].updatedAt)} · {s.ja.count.toLocaleString('fr-FR')} cartes japonaises avec un prix</p> : <p className="source-note">Prix des cartes japonaises pas encore relevés.</p>;
  if (!s) return <p className="source-note">Prix pas encore relevés pour ce jeu.</p>;
  return (
    <p className="source-note">
      Source : <a href={s.url} target="_blank" rel="noreferrer">{s.name}</a> · relevé du {fmtDate(P[game].updatedAt)}
      {game === 'onepiece' && s.fx && <> · converti au taux {s.fx.usdEur.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} € pour 1 $ ({s.fx.source})</>}
      {g && <> · {g.priced.toLocaleString('fr-FR')} cartes avec un prix</>}
      {CUR.code !== 'EUR' && <> · affiché en {CUR.name} : 1 € = {CUR.rate.toLocaleString('fr-FR', { maximumFractionDigits: CUR.code === 'JPY' ? 2 : 4 })} {CUR.sym}</>}
    </p>
  );
}

function AvgBars({ p }) {
  const rows = [['30 jours', p.avg30], ['7 jours', p.avg7], ['1 jour', p.avg1], ['Aujourd’hui', p.eur]].filter((r) => r[1]);
  const max = Math.max(...rows.map((r) => r[1]));
  return (
    <div className="avg-bars panel pad">
      <h3>Moyennes Cardmarket</h3>
      {rows.map(([l, v], i) => <div key={l} className="ab" style={{ '--i': i }}><span>{l}</span><div><i style={{ width: (v / max) * 100 + '%' }} /></div><b>{fmtEur(v)}</b></div>)}
    </div>
  );
}

function ConditionTable({ eur }) {
  return (
    <Section kicker="Selon l’état" title="Ce que vaut ta carte selon son état" lead="Estimation Kirakai : le prix du jour (état Near Mint) multiplié par un coefficient d’usure courant sur le marché. Ce n’est pas un prix relevé.">
      <div className="cond-grid">
        {CONDITIONS.map((c, i) => (
          <div key={c.id} className={'cond c-' + c.id} style={{ '--i': i, '--f': Math.min(1, c.factor / 1.15) }}>
            <b className="cond-id">{c.short}</b>
            <span className="cond-txt">{c.label}<small>{c.hint}</small></span>
            <span className="cond-bar"><i /></span>
            <em>{fmtEur(eur * c.factor)}</em>
          </div>
        ))}
      </div>
    </Section>
  );
}

function WatchBtn({ card, eur }) {
  const on = useStore((s) => !!s.watch[card.key]);
  return <button type="button" className={'btn ' + (on ? 'on' : 'ghost')} onClick={() => toggleWatch(card.key, eur)} aria-pressed={on}><Icon name="eye" size={18} />{on ? 'Suivie' : 'Suivre le prix'}</button>;
}
function CompareBtn({ card }) {
  const on = useStore((s) => s.compare.includes(card.key));
  return <button type="button" className={'btn ' + (on ? 'on' : 'ghost')} onClick={() => toggleCompare(card.key)} aria-pressed={on}><Icon name="compare" size={18} />{on ? 'Comparée' : 'Comparer'}</button>;
}

function WishBtn({ card, eur }) {
  const on = useStore((s) => !!s.wish?.[card.key]);
  return <button type="button" className={'btn ' + (on ? 'on wish' : 'ghost')} onClick={() => { toggleWish(card.key, eur); if (!on) toast('Ajoutée à ta liste de souhaits.', { icon: 'heart' }); }} aria-pressed={on}><Icon name="heart" size={18} />{on ? 'Dans mes souhaits' : 'Je la veux'}</button>;
}

function AddButton({ card }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const [cond, setCond] = useState('NM');
  const pref = useStore((s) => s.lang);
  const [lang, setLang] = useState(card.lang === 'ja' ? 'jp' : pref === 'fr' ? 'fr' : pref === 'ja' ? 'jp' : 'en');
  const [paid, setPaid] = useState('');
  const owned = useStore((s) => s.collection.filter((e) => e.key === card.key).reduce((n, e) => n + e.qty, 0));
  return (
    <>
      <button className="btn primary" onClick={() => setOpen(true)}><Icon name="plus" size={18} />{owned ? `Ajouter (${owned} déjà)` : 'Ajouter à ma collection'}</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Ajouter à ma collection">
        <div className="add-sheet">
          <div className="as-card"><CardArt card={card} tilt={false} /><span><b>{card.name}</b><small>{card.number}{card.variant ? ' · ' + card.variant : ''}</small></span></div>
          <div className="as-row"><span>Quantité</span><div className="stepper"><button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Moins"><Icon name="minus" size={16} /></button><b>{qty}</b><button onClick={() => setQty(qty + 1)} aria-label="Plus"><Icon name="plus" size={16} /></button></div></div>
          <div className="as-row col"><span>État</span><div className="cond-pick">{CONDITIONS.map((c) => <button key={c.id} className={cond === c.id ? 'on' : ''} onClick={() => setCond(c.id)} title={c.hint}><b>{c.short}</b><small>{c.label}</small></button>)}</div></div>
          <div className="as-row col"><span>Langue</span><Seg value={lang} onChange={setLang} label="Langue" options={[['en', 'Anglais'], ['fr', 'Français'], ['jp', 'Japonais']]} /></div>
          <label className="as-row col"><span>Prix payé par carte, en € (facultatif)</span><input type="number" min="0" step="0.01" inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="ex. 12,50" /></label>
          {card.lang === 'ja' ? (lang !== 'jp' && <p className="source-note">Cette fiche est celle de la carte japonaise.</p>)
            : card.game === 'onepiece' ? (lang !== 'en' && <p className="source-note">Le prix utilisé est celui de la version anglaise : pas de relevé gratuit des prix {lang === 'fr' ? 'français' : 'japonais'}.</p>)
            : lang === 'jp' ? <p className="source-note">Pour une carte japonaise, ajoute plutôt sa fiche japonaise (choisis JP en haut de l’écran) : son prix est relevé à part.</p>
            : <p className="source-note">Prix Cardmarket toutes langues confondues.</p>}
          <button className="btn primary big block" onClick={() => { addToCollection(card.key, { qty, cond, lang, paid: paid === '' ? null : +paid }); setOpen(false); toast(`${qty} × ${card.name} ajoutée${qty > 1 ? 's' : ''} à ta collection.`, { icon: 'album' }); }}><Icon name="check" size={20} />Ajouter {qty > 1 ? qty + ' cartes' : 'la carte'}</button>
        </div>
      </Modal>
    </>
  );
}

function AlertEditor({ card, eur }) {
  const w = useStore((s) => s.watch[card.key]);
  const show = (v) => (v == null || v === '' ? '' : Math.round(toDisp(v) * (CUR.code === 'JPY' ? 1 : 100)) / (CUR.code === 'JPY' ? 1 : 100));
  const [below, setBelow] = useState(show(w?.below));
  const [above, setAbove] = useState(show(w?.above));
  useEffect(() => { setBelow(show(w?.below)); setAbove(show(w?.above)); }, [w?.below, w?.above, CUR.code]);
  if (!w) return null;
  const save = () => setAlert(card.key, { below: below === '' ? null : fromDisp(+below), above: above === '' ? null : fromDisp(+above), baseline: w.baseline ?? eur });
  return (
    <div className="alert-editor panel">
      <span className="ae-ico"><Icon name="bell" size={18} /></span>
      <label>Préviens-moi sous<span className="ae-in"><input type="number" min="0" step="0.5" inputMode="decimal" value={below} onChange={(e) => setBelow(e.target.value)} onBlur={save} placeholder={eur ? String(Math.round(toDisp(eur) * 0.9)) : ''} />{CUR.sym}</span></label>
      <label>ou au-dessus de<span className="ae-in"><input type="number" min="0" step="0.5" inputMode="decimal" value={above} onChange={(e) => setAbove(e.target.value)} onBlur={save} placeholder={eur ? String(Math.round(toDisp(eur) * 1.1)) : ''} />{CUR.sym}</span></label>
      <small>Vérifié à chaque relevé quotidien, quand tu ouvres Kirakai.</small>
    </div>
  );
}

// ---- Inspecteur plein écran : la carte se tourne à la main (recto, verso) ----
function Inspector({ card, onClose }) {
  const ref = useRef(null);
  const st = useRef({ ry: -14, rx: 6, drag: null, spin: !reduceMotion() });
  const [face, setFace] = useState('front');
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k); document.body.classList.add('modal-open');
    let raf = 0, t0 = performance.now();
    const loop = (t) => {
      const s = st.current;
      if (s.spin && !s.drag) { s.ry = -14 + Math.sin((t - t0) / 1600) * 18; s.rx = 6 + Math.sin((t - t0) / 2300) * 6; }
      const el = ref.current;
      if (el) {
        el.style.transform = `rotateX(${s.rx}deg) rotateY(${s.ry}deg)`;
        const a = (((s.ry % 360) + 360) % 360);
        const f = a > 90 && a < 270 ? 'back' : 'front';
        if (f !== st.current.face) { st.current.face = f; setFace(f); }
        const px = 50 + Math.sin((s.ry * Math.PI) / 180) * 45, py = 50 - Math.sin((s.rx * Math.PI) / 180) * 60;
        el.style.setProperty('--mx', px + '%'); el.style.setProperty('--my', py + '%');
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { removeEventListener('keydown', k); document.body.classList.remove('modal-open'); cancelAnimationFrame(raf); };
  }, []);
  const down = (e) => { st.current.drag = { x: e.clientX, y: e.clientY, ry: st.current.ry, rx: st.current.rx }; st.current.spin = false; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const move = (e) => { const g = st.current.drag; if (!g) return; st.current.ry = g.ry + (e.clientX - g.x) * 0.5; st.current.rx = Math.max(-35, Math.min(35, g.rx - (e.clientY - g.y) * 0.3)); };
  const up = () => { st.current.drag = null; };
  const flip = () => { st.current.spin = false; const s = st.current; const target = s.ry + 180; const from = s.ry, t0 = performance.now(); const step = (t) => { const k = Math.min(1, (t - t0) / 700); s.ry = from + (target - from) * (1 - Math.pow(1 - k, 3)); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); };
  return (
    <div className="inspector" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="insp-stage" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="insp-card" ref={ref}>
          <div className="insp-face front"><CardArt card={card} size="large" eager tilt={false} className="live tilting" /></div>
          <div className="insp-face back"><CardBack game={card.game} /></div>
        </div>
      </div>
      <div className="insp-bar">
        <span className="insp-name"><b>{card.name}</b><small>{card.number} · {face === 'front' ? 'recto' : 'verso Kirakai'}</small></span>
        <button className="btn ghost small" onClick={flip}><Icon name="rotate" size={16} />Retourner</button>
        <a className="btn ghost small" href={img(card.image, 'large')} target="_blank" rel="noreferrer"><Icon name="ext" size={16} />Image HD</a>
        <button className="btn primary small" onClick={onClose}><Icon name="x" size={16} />Fermer</button>
      </div>
      <p className="insp-hint"><Icon name="hand" size={16} />Fais glisser pour tourner la carte</p>
    </div>
  );
}

