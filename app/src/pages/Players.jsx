import React, { useEffect, useMemo, useState } from 'react';
import { useData, href, cardHref } from '../lib/hooks.js';
import { useStore } from '../lib/store.js';
import { fmtEur, fmtNum, fmtShort, fmtDate, resolveKey, eurOf, GAMES } from '../lib/data.js';
import { cloudOn, restGet, rpc, useCloud } from '../lib/cloud.js';
import { toast } from '../lib/toast.js';
import { CardArt } from '../ui/Card.jsx';
import { Seg, Loading, Empty } from '../ui/Kit.jsx';
import { MemberCard } from './Account.jsx';
import Icon from '../ui/Icon.jsx';
import Avatar from '../ui/Avatar.jsx';

// Collectionneurs : classement des plus belles collections et profils publics (chacun choisit d'être visible).

const BOARDS = [['op', 'One Piece', 'value_op'], ['pk', 'Pokémon', 'value_pk'], ['total', 'Total', 'value_eur'], ['cards', 'Cartes', 'cards']];
const profileHref = (pseudo) => href('/joueur/' + encodeURIComponent(pseudo));

export function PlayersPage() {
  const [board, setBoard] = useState('op');
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const me = useCloud((c) => c.pseudo);
  const pub = useStore((s) => !!s.profile?.public);
  const col = BOARDS.find((b) => b[0] === board)[2];
  useEffect(() => {
    if (!cloudOn()) return;
    let ok = true; setRows(null); setErr('');
    restGet(`/rest/v1/nexus_public?select=pseudo,avatar,value_op,value_pk,value_eur,cards,stats,updated_at&visible=eq.true&${col}=gt.0&order=${col}.desc,updated_at.asc&limit=100`)
      .then((r) => ok && setRows(r || []), (e) => ok && setErr(e.message));
    return () => { ok = false; };
  }, [col]);
  const fmt = (r) => (board === 'cards' ? fmtNum(r.cards) + ' cartes' : fmtEur(r[col], { decimals: 0 }));
  const mine = rows?.findIndex((r) => r.pseudo === me);
  return (
    <div className="page players-page">
      <div className="kicker">Communauté</div>
      <h1 className="page-title">Les plus belles <span className="grad">collections</span></h1>
      <p className="lead">Le classement des collectionneurs qui ont rendu leur profil public, à la valeur du jour de leur collection.</p>
      {!cloudOn() ? <Empty icon="user" title="Les comptes arrivent bientôt">Le classement s’ouvrira avec les comptes.</Empty> : (
        <>
          <div className="toolbar">
            <Seg value={board} onChange={setBoard} label="Classement" options={BOARDS.map(([v, l]) => [v, l])} />
            {!pub && <a className="btn small ghost" href={href('/compte')}><Icon name="user" size={16} />{me ? 'Rendre mon profil public' : 'Créer mon compte'}</a>}
          </div>
          {err && <p className="notice">{err}</p>}
          {!rows && !err && <Loading />}
          {rows && rows.length === 0 && <Empty icon="trophy" title="Personne pour l’instant">Rends ton profil public depuis « Mon compte » et prends la première place.</Empty>}
          {rows && rows.length > 0 && (
            <>
              {me && pub && <p className="muted small">{mine >= 0 ? <>Tu es <b>{mine + 1}{mine === 0 ? 'er' : 'e'}</b> de ce classement.</> : 'Tu n’es pas encore dans ce top 100.'}</p>}
              <div className="pl-podium">
                {rows.slice(0, 3).map((r, i) => (
                  <a key={r.pseudo} href={profileHref(r.pseudo)} className={'pl-step s' + (i + 1)}>
                    <Avatar className="pl-av" path={r.avatar} name={r.pseudo} />
                    <b>{r.pseudo}</b>
                    <em>{fmt(r)}</em>
                    <span className="pl-medal">{i + 1}</span>
                  </a>
                ))}
              </div>
              <ol className="pl-list">
                {rows.slice(3).map((r, i) => (
                  <li key={r.pseudo} className={r.pseudo === me ? 'me' : ''}>
                    <span className="pl-rank">{i + 4}</span>
                    <a href={profileHref(r.pseudo)} className="pl-name"><Avatar className="pl-av small" path={r.avatar} name={r.pseudo} />{r.pseudo}{r.pseudo === me && <em>(toi)</em>}</a>
                    <span className="pl-sub hide-xs">{fmtNum(r.cards)} cartes · {r.stats?.ach || 0} succès</span>
                    <b>{fmt(r)}</b>
                  </li>
                ))}
              </ol>
              <p className="source-note">Valeur des collections déclarées par les joueurs, au prix du jour (état compris). Les profils se mettent à jour quand leur propriétaire ouvre Kirakai.</p>
            </>
          )}
        </>
      )}
    </div>
  );
}

export function PlayerPage({ pseudo }) {
  const d = useData();
  const [p, setP] = useState(undefined);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!cloudOn()) { setP(null); return; }
    let ok = true;
    rpc('nexus_profile', { p: pseudo }).then((r) => ok && setP(r?.[0] || null), (e) => { if (ok) { setErr(e.message); setP(null); } });
    return () => { ok = false; };
  }, [pseudo]);
  useEffect(() => { if (p) document.title = p.pseudo + ' · collectionneur · Kirakai'; }, [p]);
  const cards = useMemo(() => (d.ready && p ? (p.showcase || []).map((k) => resolveKey(d.cats, k)).filter(Boolean) : []), [d.ready, d.v, p]);
  if (p === undefined || !d.ready) return <div className="page"><Loading /></div>;
  if (!p) return <div className="page"><Empty icon="user" title="Profil introuvable" action={<a className="btn primary" href={href('/collectionneurs')}>Voir les collectionneurs</a>}>{err || `Aucun profil public au nom de « ${pseudo} ».`}</Empty></div>;
  const st = p.stats || {}, op = st.per?.onepiece || {}, pk = st.per?.pokemon || {};
  const share = async () => {
    const url = location.href;
    if (navigator.share) { try { await navigator.share({ title: p.pseudo + ' sur Kirakai', url }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(url); toast('Lien du profil copié.', { icon: 'share' }); } catch { toast(url, { icon: 'share' }); }
  };
  const best = [op.best, pk.best].filter(Boolean).sort((a, b) => b.eur - a.eur)[0];
  const bestCard = best && resolveKey(d.cats, best.key);
  return (
    <div className="page player-page">
      <div className="kicker">Collectionneur</div>
      <h1 className="page-title">{p.pseudo}</h1>
      <div className="pp-grid">
        <MemberCard pseudo={p.pseudo} since={p.member_since} code={null} avatar={p.avatar} look={p.card} stats={[[fmtNum(p.cards), p.cards > 1 ? 'cartes' : 'carte'], [fmtShort(p.value_eur), 'de valeur'], [fmtNum(st.packs || 0), 'boosters'], [fmtNum(st.ach || 0), 'succès']]} />
        <div className="pp-side">
          {[['onepiece', op], ['pokemon', pk]].map(([g, x]) => (
            <div key={g} className={'pp-game panel ' + g}>
              <span className="kicker">{GAMES[g].label}</span>
              <b>{fmtEur(x.value || 0, { decimals: 0 })}</b>
              <small>{fmtNum(x.cards || 0)} cartes · {fmtNum(x.unique || 0)} différentes · {fmtNum(x.sets || 0)} extension{x.sets > 1 ? 's' : ''}{x.complete ? ` · ${x.complete} complète${x.complete > 1 ? 's' : ''}` : ''}</small>
            </div>
          ))}
          {bestCard && <a className="pp-best panel" href={cardHref(bestCard)}><CardArt card={bestCard} className="mini" tilt={false} /><span><small>Sa plus belle carte</small><b>{bestCard.name}</b><em>{fmtEur(eurOf(bestCard, d.P, d.fx) ?? best.eur)}</em></span></a>}
          <div className="row">
            <button className="btn ghost" onClick={share}><Icon name="share" size={17} />Partager ce profil</button>
            <a className="btn ghost" href={href('/collectionneurs')}><Icon name="trophy" size={17} />Classement</a>
          </div>
          {st.streak > 1 && <p className="muted small"><Icon name="flame" size={15} /> Meilleure série : {st.streak} jours de suite</p>}
        </div>
      </div>
      {cards.length > 0 && (
        <section className="section">
          <div className="section-head"><div><div className="kicker">Vitrine</div><h2>Les cartes de {p.pseudo}</h2></div></div>
          <div className="pp-showcase">
            {cards.map((c) => (
              <a key={c.key} href={cardHref(c)} className="pp-card">
                <CardArt card={c} />
                <b>{c.name}</b>
                <small>{fmtEur(eurOf(c, d.P, d.fx))}</small>
              </a>
            ))}
          </div>
        </section>
      )}
      <p className="source-note">Profil mis à jour le {fmtDate(p.updated_at, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}. Valeurs au prix du jour, déclarées par le joueur.</p>
    </div>
  );
}
