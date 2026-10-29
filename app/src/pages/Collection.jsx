import React, { useMemo, useRef, useState } from 'react';
import { useData, useAsync, useUniverse, useInfinite, href, cardHref } from '../lib/hooks.js';
import { useStore, update, updateEntry, removeEntry, CONDITIONS, condOf, exportData, importData, hasV2, syncFromV2 } from '../lib/store.js';
import { useCloud, cloudOn } from '../lib/cloud.js';
import { eurOf, history, fmtEur, fmtDate, fmtNum, fmtShort, GAMES, otherGame, resolveKey, setCards } from '../lib/data.js';
import { collectionValue, entryValue } from '../lib/coll.js';
import { toast } from '../lib/toast.js';
import { ShowBinder, ShareModal, coverOf, arrange } from './Binder.jsx';
import { CardArt, Delta, GameTag, Price } from '../ui/Card.jsx';
import { PriceChart, Donut } from '../ui/Chart.jsx';
import { Seg, Loading, Empty, Modal, Money, Ring, Section } from '../ui/Kit.jsx';
import Icon from '../ui/Icon.jsx';

const PALETTE = ['#ff6a4d', '#ffc24a', '#4cc9f0', '#b388ff', '#2fe39b', '#ff6b9a', '#6b7aa6'];

export default function CollectionPage() {
  const d = useData();
  const account = useCloud((c) => !!c.user);
  const game = useUniverse();
  const allColl = useStore((s) => s.collection);
  const coll = useMemo(() => allColl.filter((e) => e.key.startsWith(game + ':')), [allColl, game]);
  const other = otherGame(game);
  const otherCount = allColl.length - coll.length;
  const virtualCount = useStore((s) => Object.keys(s.packs.virtual).filter((k) => k.startsWith(game + ':')).length);
  const binder = useStore((s) => s.binder);
  const [view, setView] = useState('classeur');
  const [sort, setSort] = useState('valeur');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [organize, setOrganize] = useState(false);
  const file = useRef();

  const sorted = useMemo(() => {
    if (!d.ready) return [];
    let list = coll.map((e) => ({ e, c: resolveKey(d.cats, e.key) })).filter((x) => x.c);
    if (q.trim()) { const t = q.toLowerCase(); list = list.filter((x) => (x.c.name + ' ' + x.c.nameFr + ' ' + x.c.number).toLowerCase().includes(t)); }
    const val = (x) => (eurOf(x.c, d.P, d.fx) || 0) * condOf(x.e.cond).factor;
    const sorters = { valeur: (a, b) => val(b) - val(a), recent: (a, b) => b.e.addedAt.localeCompare(a.e.addedAt), nom: (a, b) => a.c.name.localeCompare(b.c.name), extension: (a, b) => a.c.set.localeCompare(b.c.set) || a.c.number.localeCompare(b.c.number, 'fr', { numeric: true }) };
    return list.sort(sorters[sort]);
  }, [d.ready, d.v, coll, sort, q]);
  const order = binder.order?.[game];
  const binderItems = useMemo(() => (q.trim() ? sorted : arrange(sorted, order)), [sorted, order, q]);

  const histSets = useMemo(() => [...new Set(coll.map((e) => { const c = d.ready && resolveKey(d.cats, e.key); return c ? c.set : null; }).filter(Boolean))], [coll, d.ready]);
  const valueHist = useAsync(async () => {
    if (!d.ready || !coll.length) return { pts: [], movers: [] };
    const hs = new Map(await Promise.all(histSets.map((s) => history(game, s).then((h) => [s, h]))));
    const byDate = new Map();
    const movers = new Map();
    for (const e of coll) {
      const c = resolveKey(d.cats, e.key); if (!c) continue;
      const h = hs.get(c.set); const s = h?.p[c.id]; if (!s) continue;
      const f = condOf(e.cond).factor * e.qty;
      h.d.forEach((dt, i) => { if (s[i] != null) byDate.set(dt, (byDate.get(dt) || 0) + s[i] * f); });
      // variation de la carte entre le premier et le dernier relevé
      const i0 = s.findIndex((v) => v != null), i1 = s.findLastIndex((v) => v != null);
      if (i0 < 0 || i1 <= i0 || !s[i0]) continue;
      const m = movers.get(c.key) || { c, pct: ((s[i1] - s[i0]) / s[i0]) * 100, diff: 0, from: h.d[i0] };
      m.diff += (s[i1] - s[i0]) * f;
      movers.set(c.key, m);
    }
    return { pts: [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])), movers: [...movers.values()].filter((m) => Math.abs(m.pct) >= 1 && Math.abs(m.diff) >= 0.05) };
  }, [histSets.join('|'), coll.length, d.ready]);
  const [n, sentinel] = useInfinite(sorted.length, 60, [view, sort, q]);

  if (!d.ready) return <div className="page"><Loading /></div>;
  const V = collectionValue(coll, d);
  const vh = valueHist.value?.pts || [];
  const movers = valueHist.value?.movers || [];
  const ups = movers.filter((m) => m.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 5);
  const downs = movers.filter((m) => m.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 5);
  const vChange = vh.length > 1 ? ((vh.at(-1)[1] - vh[0][1]) / vh[0][1]) * 100 : null;

  // Répartition de la valeur par extension
  const bySet = new Map();
  for (const x of sorted) bySet.set(x.c.set, (bySet.get(x.c.set) || 0) + entryValue(x.e, x.c, d));
  const setParts = [...bySet.entries()].sort((a, b) => b[1] - a[1]);
  const parts = setParts.slice(0, 6).map(([code, v], i) => ({ label: d.cats[game].sets.get(code)?.name || code, value: v, color: PALETTE[i] }));
  const rest = setParts.slice(6).reduce((t, x) => t + x[1], 0);
  if (rest > 0) parts.push({ label: 'Autres extensions', value: rest, color: PALETTE[6] });

  const swap = (i, j) => update((s) => {
    const cur = arrange(sorted, s.binder.order?.[game]).map((x) => x?.e.uid ?? null);
    while (cur.length <= Math.max(i, j)) cur.push(null);
    [cur[i], cur[j]] = [cur[j], cur[i]];
    s.binder.order = { ...(s.binder.order || {}), [game]: cur };
  });
  const autoSort = (key) => {
    const sorters = { valeur: (a, b) => entryValue(b.e, b.c, d) - entryValue(a.e, a.c, d), extension: (a, b) => a.c.set.localeCompare(b.c.set) || a.c.number.localeCompare(b.c.number, 'fr', { numeric: true }), recent: (a, b) => b.e.addedAt.localeCompare(a.e.addedAt) };
    const l = [...sorted].sort(sorters[key]);
    update((s) => { s.binder.order = { ...(s.binder.order || {}), [game]: l.map((x) => x.e.uid) }; });
    toast('Classeur rangé ' + ({ valeur: 'par valeur', extension: 'par extension', recent: 'par date d’ajout' })[key] + '.', { icon: 'album' });
  };
  const download = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  const doCsv = () => {
    const rows = [['Univers', 'Carte', 'Numéro', 'Extension', 'Version', 'Rareté', 'Quantité', 'État', 'Note', 'Langue', 'Prix du jour (EUR)', 'Valeur selon l’état (EUR)', 'Prix payé (EUR)', 'Ajoutée le']];
    for (const x of sorted) { const eur = eurOf(x.c, d.P, d.fx); rows.push([GAMES[x.c.game].label, x.c.name, x.c.number, d.cats[x.c.game].sets.get(x.c.set)?.name || x.c.set, x.c.variant || '', x.c.rarity || '', x.e.qty, x.e.cond, x.e.grade ?? '', x.e.lang, eur ?? '', eur != null ? (eur * condOf(x.e.cond).factor * x.e.qty).toFixed(2) : '', x.e.paid ?? '', x.e.addedAt.slice(0, 10)]); }
    download(`kirakai-collection-${game}-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n'), 'text/csv');
  };
  const doImport = async (f) => { try { const n = importData(await f.text()); toast(`${n} carte${n > 1 ? 's' : ''} importée${n > 1 ? 's' : ''}.`, { icon: 'download' }); } catch (e) { toast('Import impossible : ' + e.message, { icon: 'info' }); } };

  return (
    <div className="page collection-page">
      <div className="page-head">
        <div>
          <div className="kicker">{GAMES[game].label} · {account ? 'enregistrée dans ton compte' : 'dans ce navigateur'}</div>
          <h1 className="page-title" style={{ marginBottom: 0 }}>Ma <span className="grad">collection</span></h1>
        </div>
        {coll.length > 0 && <button className="btn primary" onClick={() => setSharing(true)}><Icon name="share" size={18} />Partager mon classeur</button>}
      </div>
      {otherCount > 0 && <p className="muted">Tu as aussi {otherCount} carte{otherCount > 1 ? 's' : ''} {GAMES[other].label} : <a className="link" href={href('/collection?u=' + other)}>voir ma collection {GAMES[other].label}</a></p>}
      {coll.length === 0 ? (
        <Empty icon="album" title="Ta collection est vide" action={<div className="row"><a className="btn primary" href={href('/scanner')}><Icon name="scan" size={18} />Scanner une carte</a><a className="btn ghost" href={href('/recherche')}><Icon name="search" size={18} />Chercher une carte</a>{hasV2() && <button className="btn ghost" onClick={() => { try { const n = syncFromV2(); toast(n ? `${n} carte${n > 1 ? 's' : ''} reprise${n > 1 ? 's' : ''} de la V2.` : 'Rien de nouveau dans la V2.', { icon: 'download' }); } catch (e) { toast(e.message, { icon: 'info' }); } }}><Icon name="download" size={18} />Reprendre ma collection V2</button>}</div>}>
          Ajoute tes cartes depuis leur fiche ou avec le scanner : Kirakai calcule leur valeur au prix du jour selon leur état.
          {virtualCount > 0 && <><br /><a className="link" href={href('/boosters/collection')}>Tu as aussi {virtualCount} cartes virtuelles gagnées en boosters</a></>}
        </Empty>
      ) : (
        <>
          <div className="coll-dash">
            <div className="cd-main panel glow-edge">
              <span className="kicker">Valeur estimée selon l’état</span>
              <b className="cd-value"><Money value={V.total} /></b>
              <span className="cd-sub">{vChange != null && <><Delta pct={vChange} /> depuis le {fmtDate(vh[0][0], { day: 'numeric', month: 'short' })} · </>}au prix Near Mint : {fmtEur(V.totalNM)}</span>
              <div className="cd-chart">{vh.length > 1 ? <PriceChart series={[{ points: vh, color: 'var(--gold)' }]} height={150} compact /> : <p className="faint small">La courbe de ta collection se dessine avec les relevés quotidiens.</p>}</div>
              <div className="cd-figs">
                <span><b>{fmtNum(V.count)}</b>cartes</span>
                <span><b>{fmtNum(V.unique)}</b>différentes</span>
                <span><b>{fmtNum(V.priced)}</b>avec un prix</span>
                {V.paid > 0 && <span><b className={V.total - V.paid >= 0 ? 'up' : 'down'}>{(V.total - V.paid >= 0 ? '+' : '') + fmtEur(V.total - V.paid)}</b>plus-value (payé {fmtShort(V.paid)})</span>}
              </div>
            </div>
            <div className="cd-side">
              {V.best && (
                <a href={cardHref(V.best.c)} className="cd-best panel">
                  <CardArt card={V.best.c} className="live" tilt={false} />
                  <span><small>Ta plus belle carte</small><b>{V.best.c.name}</b><em>{fmtEur(V.best.eur)}</em></span>
                </a>
              )}
              {parts.length > 1 && (
                <div className="cd-donut panel">
                  <Donut parts={parts} size={132} stroke={18} center={<><b>{setParts.length}</b><small>extensions</small></>} />
                  <ul>{parts.map((p) => <li key={p.label}><i style={{ background: p.color }} /><span>{p.label}</span><b>{fmtShort(p.value)}</b></li>)}</ul>
                </div>
              )}
            </div>
          </div>

          {(ups.length > 0 || downs.length > 0) && (
            <div className="movers-mine">
              {[['up', 'En hausse dans ta collection', ups], ['down', 'En baisse dans ta collection', downs]].map(([k, t, list]) => list.length > 0 && (
                <div key={k} className={'mm-col panel ' + k}>
                  <h3><Icon name={k === 'up' ? 'up' : 'down'} size={18} />{t}<small>depuis le {fmtDate(list[0].from, { day: 'numeric', month: 'short' })}</small></h3>
                  {list.map((m) => (
                    <a key={m.c.key} href={cardHref(m.c)} className="mm-row">
                      <CardArt card={m.c} className="mini" tilt={false} fx={0} />
                      <span className="mm-name">{m.c.name}<small>{m.c.number}{m.c.variant ? ' · ' + m.c.variant : ''}</small></span>
                      <span className="mm-val"><b className={k}>{(m.diff > 0 ? '+' : '') + fmtEur(m.diff)}</b><Delta pct={m.pct} small /></span>
                    </a>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="toolbar coll-bar">
            <Seg value={view} onChange={(v) => { setView(v); setOrganize(false); }} label="Affichage" options={[['classeur', 'Classeur'], ['grille', 'Grille'], ['liste', 'Liste'], ['extensions', 'Extensions']]} />
            {view !== 'extensions' && view !== 'classeur' && <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Trier"><option value="valeur">Valeur</option><option value="recent">Ajout récent</option><option value="nom">Nom</option><option value="extension">Extension</option></select>}
            {view !== 'extensions' && <div className="searchbox small filter"><Icon name="search" size={16} /><input value={q} onChange={(e) => { setQ(e.target.value); setOrganize(false); }} placeholder="Filtrer ma collection" aria-label="Filtrer" /></div>}
            {view === 'classeur' && !q.trim() && <button className={'btn small ' + (organize ? 'on' : 'ghost')} onClick={() => setOrganize(!organize)}><Icon name="move" size={16} />{organize ? 'Terminer' : 'Organiser'}</button>}
          </div>
          {view === 'classeur' && organize && (
            <div className="org-bar"><span>Ranger automatiquement :</span><button className="chip" onClick={() => autoSort('valeur')}>par valeur</button><button className="chip" onClick={() => autoSort('extension')}>par extension</button><button className="chip" onClick={() => autoSort('recent')}>par date d’ajout</button></div>
          )}

          {view === 'classeur' && <ShowBinder items={binderItems} name={binder.name} cover={coverOf(binder, game)} game={game} stats={V} onOpen={setEdit} organize={organize} onSwap={swap} />}
          {view === 'grille' && <div className="grid tiles">{sorted.slice(0, n).map((x) => <CollTile key={x.e.uid} x={x} onOpen={() => setEdit(x)} />)}</div>}
          {view === 'liste' && <CollList items={sorted.slice(0, n)} onOpen={setEdit} />}
          {view === 'extensions' && <SetProgress coll={coll} game={game} />}
          {(view === 'grille' || view === 'liste') && <div ref={sentinel} className="sentinel" />}

          <Section kicker="Sauvegarde" title="Mes données" className="coll-tools-sec">
            <div className="coll-tools">
              <button className="btn ghost" onClick={() => download('kirakai-collection-' + new Date().toISOString().slice(0, 10) + '.json', exportData(), 'application/json')}><Icon name="download" size={18} />Exporter (sauvegarde)</button>
              <button className="btn ghost" onClick={doCsv}><Icon name="list" size={18} />Exporter en tableau (CSV)</button>
              <button className="btn ghost" onClick={() => file.current.click()}><Icon name="upload" size={18} />Importer</button>
              <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files[0] && doImport(e.target.files[0])} />
              {virtualCount > 0 && <a className="btn ghost" href={href('/boosters/collection')}><Icon name="pack" size={18} />Collection virtuelle ({virtualCount})</a>}
              <a className="btn ghost" href={href('/reglages')}><Icon name="gear" size={18} />Réglages</a>
            </div>
            <p className="source-note">{account ? 'Ta collection est enregistrée dans ton compte et te suit sur tous tes appareils. Tu peux aussi l’exporter pour en garder une copie.'
              : cloudOn() ? <>Ta collection est enregistrée dans ce navigateur. <a href={href('/compte')}>Crée un compte</a> pour la retrouver sur tous tes appareils, ou exporte-la pour en garder une copie.</>
              : 'Ta collection est enregistrée dans ce navigateur. Exporte-la régulièrement pour la garder en sécurité ou la passer sur un autre appareil.'}</p>
          </Section>
        </>
      )}
      <EntryModal x={edit} onClose={() => setEdit(null)} />
      <ShareModal open={sharing} onClose={() => setSharing(false)} game={game} entries={coll} />
    </div>
  );
}

function CollTile({ x, onOpen }) {
  const d = useData();
  const eur = eurOf(x.c, d.P, d.fx);
  const cond = condOf(x.e.cond);
  return (
    <button className="tile" onClick={onOpen}>
      <div className="tile-art"><CardArt card={x.c} />{x.e.qty > 1 && <span className="own-badge">×{x.e.qty}</span>}<span className={'cond-badge c-' + cond.id}>{x.e.grade != null ? x.e.grade.toLocaleString('fr-FR') : cond.short}</span></div>
      <div className="tile-body"><div className="tile-name">{x.c.name}</div><div className="tile-meta"><GameTag game={x.c.game} /><span className="num">{x.c.number}</span></div><div className="tile-price">{eur != null ? <span className="price">{fmtEur(eur * cond.factor)}</span> : <span className="price none">Pas de prix</span>}</div></div>
    </button>
  );
}

function CollList({ items, onOpen }) {
  const d = useData();
  return (
    <div className="coll-list">
      {items.map((x) => {
        const eur = eurOf(x.c, d.P, d.fx); const cond = condOf(x.e.cond);
        return (
          <button key={x.e.uid} className="cl-row" onClick={() => onOpen(x)}>
            <CardArt card={x.c} className="mini" tilt={false} fx={0} />
            <span className="cl-name">{x.c.name}<small><GameTag game={x.c.game} /> {x.c.number} · {d.cats[x.c.game].sets.get(x.c.set)?.name}</small></span>
            <span className={'cond-badge inline c-' + cond.id}>{cond.short}{x.e.grade != null ? ' · ' + x.e.grade.toLocaleString('fr-FR') + '/10' : ''}</span>
            <span className="cl-qty">×{x.e.qty}</span>
            <span className="cl-val">{eur != null ? fmtEur(eur * cond.factor * x.e.qty) : '—'}</span>
          </button>
        );
      })}
    </div>
  );
}

function SetProgress({ coll, game }) {
  const d = useData();
  const rows = useMemo(() => {
    const owned = new Map();
    for (const e of coll) { const c = resolveKey(d.cats, e.key); if (!c) continue; if (!owned.has(c.set)) owned.set(c.set, new Set()); owned.get(c.set).add(c.id); }
    return [...owned.entries()].map(([s, ids]) => {
      const set = d.cats[game].sets.get(s); if (!set) return null;
      // coût des cartes manquantes au prix du jour
      const miss = setCards(d.cats, game, s).filter((c) => !ids.has(c.id));
      return { s: set, have: ids.size, missing: miss.length, cost: miss.reduce((t, c) => t + (eurOf(c, d.P, d.fx) || 0), 0) };
    }).filter(Boolean).sort((a, b) => b.have / b.s.count - a.have / a.s.count);
  }, [coll, game, d.v]);
  return (
    <div className="set-progress">
      {rows.map((r) => (
        <a key={r.s.code} href={href('/extension/' + game + '/' + encodeURIComponent(r.s.code))} className="sp-row panel">
          <Ring value={r.have / r.s.count} size={52} stroke={6} />
          <span className="sp-txt"><b>{r.s.name}</b><small>{r.s.code} · {r.have} / {r.s.count} cartes{r.missing > 0 && r.cost > 0 ? ` · il en manque ${r.missing} (${fmtShort(r.cost)})` : ''}</small></span>
          <span className="sp-go">{r.missing ? 'Compléter' : 'Complète !'} <Icon name="arrow" size={16} /></span>
        </a>
      ))}
    </div>
  );
}

function EntryModal({ x, onClose }) {
  const d = useData();
  const e = useStore((s) => s.collection.find((y) => y.uid === x?.e.uid));
  if (!x || !e) return null;
  const eur = eurOf(x.c, d.P, d.fx);
  return (
    <Modal open title={x.c.name + ' · ' + x.c.number} onClose={onClose} wide>
      <div className="entry">
        <div className="entry-card"><CardArt card={x.c} size="large" className="live" /></div>
        <div className="entry-form">
          <p className="entry-price"><Price card={x.c} /> <small className="faint">prix du jour (Near Mint)</small></p>
          <div className="as-row"><span>Quantité</span><div className="stepper"><button onClick={() => e.qty > 1 && updateEntry(e.uid, { qty: e.qty - 1 })} aria-label="Moins"><Icon name="minus" size={16} /></button><b>{e.qty}</b><button onClick={() => updateEntry(e.uid, { qty: e.qty + 1 })} aria-label="Plus"><Icon name="plus" size={16} /></button></div></div>
          <div className="as-row col"><span>État</span><div className="cond-pick">{CONDITIONS.map((c) => <button key={c.id} className={e.cond === c.id ? 'on' : ''} onClick={() => updateEntry(e.uid, { cond: c.id })} title={c.hint}><b>{c.short}</b><small>{c.label}</small></button>)}</div></div>
          <div className="as-row col"><span>Langue</span><Seg value={e.lang} onChange={(v) => updateEntry(e.uid, { lang: v })} label="Langue" options={[['en', 'Anglais'], ['fr', 'Français'], ['jp', 'Japonais']]} /></div>
          <label className="as-row col"><span>Prix payé par carte, en €</span><input type="number" min="0" step="0.01" inputMode="decimal" defaultValue={e.paid ?? ''} onBlur={(ev) => updateEntry(e.uid, { paid: ev.target.value === '' ? null : +ev.target.value })} placeholder="facultatif" /></label>
          {e.grade != null && <div className="grade-recall"><b>{e.grade.toLocaleString('fr-FR')}<small>/10</small></b><span>Note du scanner{e.scan?.date ? ' · ' + fmtDate(e.scan.date) : ''}{e.scan?.parts && <small>Centrage {e.scan.parts.centering} · Coins {e.scan.parts.corners} · Bords {e.scan.parts.edges} · Surface {e.scan.parts.surface}</small>}</span></div>}
          {eur != null && <p className="muted" style={{ margin: 0 }}>Valeur selon l’état : <b>{fmtEur(eur * condOf(e.cond).factor * e.qty)}</b>{e.paid ? <> · payé {fmtEur(e.paid * e.qty)}</> : null}</p>}
          <div className="row"><a className="btn ghost" href={cardHref(x.c)} onClick={onClose}><Icon name="ext" size={16} />Fiche de la carte</a><button className="btn danger" onClick={() => { removeEntry(e.uid); onClose(); toast(x.c.name + ' retirée de ta collection.', { icon: 'trash' }); }}><Icon name="trash" size={18} />Retirer</button></div>
        </div>
      </div>
    </Modal>
  );
}
