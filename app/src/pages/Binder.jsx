import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useData, useMedia, href, cardHref, reduceMotion } from '../lib/hooks.js';
import { useStore, update, condOf, CONDITIONS } from '../lib/store.js';
import { eurOf, fmtEur, fmtNum, GAMES, resolveKey } from '../lib/data.js';
import { SFX } from '../lib/sfx.js';
import { toast } from '../lib/toast.js';
import { unlock } from '../lib/achievements.js';
import { CardArt } from '../ui/Card.jsx';
import { Emblem } from '../ui/Brand.jsx';
import { Loading, Modal } from '../ui/Kit.jsx';
import Icon from '../ui/Icon.jsx';

// Classeur de présentation : couverture en cuir qui s'ouvre, pages de 9 pochettes, double page sur grand écran,
// feuilles qui se tournent en 3D (boutons, clavier, glisser), mode « Organiser » pour placer chaque carte.
// Le lien de partage garde le format de la V2 : un lien créé sur l'une s'ouvre sur l'autre.

export const COVERS = [
  ['rouge', 'Rouge corsaire', '#8e1b1f'], ['bleu', 'Bleu roi', '#1f47a8'], ['marine', 'Bleu marine', '#1b2c5e'], ['noir', 'Noir', '#1a181f'],
  ['vert', 'Vert émeraude', '#14523c'], ['violet', 'Violet', '#4a2370'], ['camel', 'Cuir camel', '#8a5a2b'], ['or', 'Or impérial', '#9a7420'],
];
const PER = 9;
export const DEFAULT_COVER = { onepiece: 'rouge', pokemon: 'bleu' };
export const coverOf = (b, game) => b?.covers?.[game] || DEFAULT_COVER[game] || 'rouge';
const leather = (id, game) => (COVERS.find((c) => c[0] === (id || DEFAULT_COVER[game])) || COVERS[0])[2];

// ---- Lien de partage : [nom, couverture, jeu, [[id, qté, état, note]]] compressé en base64url (format V2) ----
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64 = (s) => { const t = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(t, (c) => c.charCodeAt(0)); };
async function pipe(u8, stream) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer()); }
const CIDX = CONDITIONS.map((c) => c.id);

export async function encodeBinder({ name, cover, game, entries }) {
  const json = JSON.stringify([name || '', cover || 'rouge', game, entries.map((e) => { const id = e.key.slice(game.length + 1); const r = [id, e.qty]; let ci = CIDX.indexOf(e.cond); if (ci < 0) ci = 1; if (ci !== 1 || e.grade != null) r.push(ci); if (e.grade != null) r.push(e.grade); return r; })]);
  const raw = new TextEncoder().encode(json);
  if (typeof CompressionStream === 'function') { try { return 'z' + b64(await pipe(raw, new CompressionStream('deflate-raw'))); } catch {} }
  return 'j' + b64(raw);
}
export async function decodeBinder(s) {
  const kind = s[0], body = unb64(s.slice(1));
  if (kind === 'z' && typeof DecompressionStream !== 'function') throw new Error('navigateur trop ancien');
  const raw = kind === 'z' ? await pipe(body, new DecompressionStream('deflate-raw')) : body;
  const [name, cover, game, list] = JSON.parse(new TextDecoder().decode(raw));
  if (!GAMES[game] || !Array.isArray(list)) throw new Error('lien invalide');
  return { name, cover, game, entries: list.map(([id, qty, ci = 1, grade = null], i) => ({ uid: 's' + i, key: game + ':' + id, qty: qty || 1, cond: CIDX[ci] || 'NM', grade })) };
}

// Ordre personnalisé : liste d'identifiants (null = pochette vide), complétée par les cartes non placées
export function arrange(items, order) {
  if (!order?.length) return items;
  const byUid = new Map(items.map((x) => [x.e.uid, x]));
  const out = order.map((u) => (u && byUid.has(u) ? byUid.get(u) : null));
  const placed = new Set(order);
  for (const x of items) if (!placed.has(x.e.uid)) out.push(x);
  while (out.length && out.at(-1) === null) out.pop();
  return out;
}

function Pocket({ x, onOpen, readOnly, organize, picked, onPick, index }) {
  const { P, fx } = useData();
  const cls = 'bd-pocket' + (x ? '' : ' empty') + (organize ? ' org' : '') + (picked ? ' picked' : '');
  if (organize) return <button type="button" className={cls} onClick={() => onPick(index)} aria-label={x ? 'Déplacer ' + x.c.name : 'Pochette vide'}>{x && <CardArt card={x.c} tilt={false} fx={0} />}<i className="bd-sleeve" />{picked && <span className="bd-pick"><Icon name="move" size={18} /></span>}</button>;
  if (!x) return <div className={cls}><i className="bd-sleeve" /></div>;
  const cond = condOf(x.e.cond);
  const eur = eurOf(x.c, P, fx);
  const inner = (
    <>
      <CardArt card={x.c} />
      <i className="bd-sleeve" />
      {x.e.qty > 1 && <span className="bd-qty">×{x.e.qty}</span>}
      {x.e.grade != null ? <span className="bd-grade">{x.e.grade.toLocaleString('fr-FR')}</span> : cond.id !== 'NM' && <span className="bd-cond">{cond.short}</span>}
      <span className="bd-tip"><b>{x.c.name}</b><small>{x.c.number}{eur != null ? ' · ' + fmtEur(eur * cond.factor) : ''}</small></span>
    </>
  );
  return readOnly
    ? <a className={cls} href={cardHref(x.c)}>{inner}</a>
    : <div className={cls} role="button" tabIndex={0} onClick={() => onOpen?.(x)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.(x); } }}>{inner}</div>;
}

function Page({ items, n, side, base, ...rest }) {
  const { P, fx } = useData();
  const val = items.reduce((t, x) => t + (x ? (eurOf(x.c, P, fx) || 0) * condOf(x.e.cond).factor * x.e.qty : 0), 0);
  return (
    <div className={'bd-page ' + side}>
      <span className="bd-paper" />
      <div className="bd-grid">{Array.from({ length: PER }, (_, i) => <Pocket key={i} x={items[i]} index={base + i} picked={rest.picked === base + i} {...rest} />)}</div>
      <div className="bd-foot"><span>{n}</span>{val > 0 && <small>{fmtEur(val)}</small>}</div>
    </div>
  );
}
const Blank = ({ side }) => <div className={'bd-page blank ' + side}><span className="bd-paper" /><span className="bd-blank-mark"><Icon name="album" size={30} /></span></div>;

export function Cover({ name, cover, game, stats, onOpen, small, opening }) {
  return (
    <button className={'bd-cover' + (small ? ' small' : '') + (opening ? ' opening' : '')} style={{ '--leather': leather(cover, game) }} onClick={onOpen} aria-label="Ouvrir le classeur" type="button">
      <span className="bd-spine" />
      <span className="bd-stitch" />
      <span className="bd-cover-in">
        <span className="bd-emblem"><Emblem game={game} size={small ? 64 : 104} /></span>
        <span className="bd-cover-title">{name || 'Mon classeur'}</span>
        <span className="bd-cover-sub">{GAMES[game].label} · collection</span>
        {stats && <span className="bd-cover-stats"><span><b>{fmtNum(stats.count)}</b> cartes</span><span><b>{fmtNum(stats.unique)}</b> différentes</span>{stats.total > 0 && <span><b>{fmtEur(stats.total)}</b></span>}</span>}
        <span className="bd-cover-stamp">KIRAKAI</span>
      </span>
      <span className="bd-strap"><i /></span>
    </button>
  );
}

export function ShowBinder({ items, name, cover, game, stats, onOpen, readOnly, startClosed, organize, onSwap }) {
  const wide = useMedia('(min-width: 900px)');
  const [open, setOpen] = useState(!startClosed);
  const [opening, setOpening] = useState(false);
  const [sp, setSp] = useState(0);
  const [turn, setTurn] = useState(null); // { dir, from }
  const [picked, setPicked] = useState(null);
  const touch = useRef(null);
  useEffect(() => { if (!organize) setPicked(null); }, [organize]);
  const pages = Math.max(1, Math.ceil(Math.max(items.length, organize ? items.length + 1 : 0) / PER));
  const spreads = wide ? Math.max(1, Math.ceil(pages / 2)) : pages;
  const cur = Math.min(sp, spreads - 1);
  const go = (d) => {
    const n = cur + d; if (n < 0 || n >= spreads || turn) return;
    SFX.flip();
    if (reduceMotion()) { setSp(n); return; }
    setTurn({ dir: d > 0 ? 'next' : 'prev', from: cur }); setSp(n);
    setTimeout(() => setTurn(null), 820);
  };
  useEffect(() => {
    if (!open) return;
    const k = (e) => { if (e.target.closest('input, textarea, select')) return; if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  });
  const doOpen = () => {
    if (reduceMotion()) { setOpen(true); return; }
    setOpening(true); SFX.whoosh();
    setTimeout(() => { setOpen(true); setOpening(false); }, 900);
  };
  if (!open) return <div className="bd-wrap closed"><div className="bd-cover-stage"><Cover name={name} cover={cover} game={game} stats={stats} onOpen={doOpen} opening={opening} /></div><p className="faint small center">Touche la couverture pour ouvrir le classeur</p></div>;
  const slice = (pi) => Array.from({ length: PER }, (_, i) => items[pi * PER + i] ?? null);
  const pick = (i) => {
    if (picked == null) { if (items[i] || i < items.length) { setPicked(i); SFX.tick(); } return; }
    if (picked !== i) { onSwap?.(picked, i); SFX.flip(); }
    setPicked(null);
  };
  const pp = { onOpen, readOnly, organize, onPick: pick, picked };
  const pageEl = (pi, side) => (pi < pages ? <Page items={slice(pi)} n={pi + 1} side={side} base={pi * PER} {...pp} /> : <Blank side={side} />);
  const left = wide ? cur * 2 : cur;
  const fromLeft = turn ? (wide ? turn.from * 2 : turn.from) : 0;
  return (
    <div className="bd-wrap">
      <div className={'bd-book' + (wide ? ' wide' : ' single')} style={{ '--leather': leather(cover, game) }}
        onTouchStart={(e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY, swiped: false }; }}
        onTouchEnd={(e) => { const t = touch.current; if (!t) return; const p = e.changedTouches[0]; const dx = p.clientX - t.x, dy = p.clientY - t.y; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) { t.swiped = true; go(dx < 0 ? 1 : -1); setTimeout(() => { touch.current = null; }, 350); } else touch.current = null; }}
        onClickCapture={(e) => { if (touch.current?.swiped) { e.stopPropagation(); e.preventDefault(); } }}>
        <span className="bd-board" />
        {wide ? (
          <>
            {/* pendant qu'une feuille tourne, la page restée en place est l'ancienne (suivant) ou la nouvelle (précédent) */}
            {turn?.dir === 'next' ? pageEl(fromLeft, 'left') : pageEl(left, 'left')}
            {turn?.dir === 'prev' ? pageEl(fromLeft + 1, 'right') : pageEl(left + 1, 'right')}
            {turn && (
              <div className={'bd-leaf ' + turn.dir}>
                <div className="leaf-face front">{turn.dir === 'next' ? pageEl(fromLeft + 1, 'right') : pageEl(fromLeft, 'left')}</div>
                <div className="leaf-face back">{turn.dir === 'next' ? pageEl(left, 'left') : pageEl(left + 1, 'right')}</div>
              </div>
            )}
            <div className="bd-rings" aria-hidden="true"><i /><i /><i /><i /></div>
          </>
        ) : (
          <>
            {turn?.dir === 'prev' ? pageEl(fromLeft, 'single') : pageEl(left, 'single')}
            {turn && (
              <div className={'bd-leaf single ' + turn.dir}>
                <div className="leaf-face front">{turn.dir === 'next' ? pageEl(fromLeft, 'single') : pageEl(left, 'single')}</div>
                <div className="leaf-face back"><Blank side="single" /></div>
              </div>
            )}
            <div className="bd-rings side" aria-hidden="true"><i /><i /><i /></div>
          </>
        )}
      </div>
      <div className="bd-nav">
        <button className="btn ghost" disabled={cur === 0} onClick={() => go(-1)} aria-label="Page précédente"><Icon name="left" size={18} /></button>
        <span className="bd-pages">{wide ? `Pages ${left + 1}–${Math.min(left + 2, pages)}` : `Page ${left + 1}`} <small>/ {pages}</small></span>
        <button className="btn ghost" disabled={cur >= spreads - 1} onClick={() => go(1)} aria-label="Page suivante"><Icon name="right" size={18} /></button>
        <button className="btn ghost small" onClick={() => { setOpen(false); setSp(0); }}><Icon name="album" size={16} />Fermer</button>
      </div>
      {organize && <p className="bd-org-hint"><Icon name="move" size={16} />{picked == null ? 'Touche une carte, puis la pochette où la placer (même sur une autre page).' : 'Choisis maintenant la pochette de destination.'}</p>}
    </div>
  );
}

// ---- Fenêtre de partage ----
export function ShareModal({ open, onClose, game, entries }) {
  const b = useStore((s) => s.binder);
  const [url, setUrl] = useState('');
  const name = b.name ?? '', cover = coverOf(b, game);
  const setB = (patch) => update((s) => { s.binder = { ...(s.binder || {}), ...patch }; });
  useEffect(() => { setUrl(''); }, [open, name, cover, entries.length]);
  if (!open) return null;
  const make = async () => {
    const code = await encodeBinder({ name, cover, game, entries });
    const u = location.origin + location.pathname + '#/classeur/' + code + '?u=' + game;
    setUrl(u); unlock('share'); return u;
  };
  const share = async () => {
    const u = url || (await make());
    if (navigator.share) { try { await navigator.share({ title: (name || 'Mon classeur') + ' · Kirakai', text: `Mon classeur ${GAMES[game].label} : ${entries.length} cartes`, url: u }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
    copy(u);
  };
  const copy = async (u0) => { const u = u0 || url || (await make()); try { await navigator.clipboard.writeText(u); toast('Le lien de ton classeur est copié.', { icon: 'share' }); } catch { toast('Sélectionne le lien pour le copier.', { icon: 'info' }); } };
  return (
    <Modal open title="Partager mon classeur" onClose={onClose} wide>
      <div className="bd-share">
        <div className="bd-share-cover"><Cover name={name} cover={cover} game={game} small /></div>
        <div className="bd-share-form">
          <label>Nom du classeur<input type="text" value={name} maxLength={40} placeholder="Mon classeur" onChange={(e) => setB({ name: e.target.value })} /></label>
          <div><span className="lbl">Couverture</span>
            <div className="bd-colors" role="radiogroup" aria-label="Couleur de la couverture">
              {COVERS.map(([id, label, c]) => <button key={id} role="radio" aria-checked={cover === id} aria-label={label} title={label} className={cover === id ? 'on' : ''} style={{ '--c': c }} onClick={() => setB({ covers: { ...(b.covers || {}), [game]: id } })} />)}
            </div>
          </div>
          <div className="row">
            <button className="btn primary" onClick={share}><Icon name="share" size={18} />Partager</button>
            <button className="btn ghost" onClick={() => copy()}>Copier le lien</button>
          </div>
          {url && <input className="bd-url" type="text" readOnly value={url} onFocus={(e) => e.target.select()} />}
          <p className="source-note">Le lien contient la liste de tes {fmtNum(entries.length)} cartes {GAMES[game].label} (quantité, état et note), sans tes prix payés. La personne qui l’ouvre voit ton classeur avec les prix du jour. Il s’ouvre aussi sur l’ancienne version du site. Si tu ajoutes des cartes, crée un nouveau lien.</p>
        </div>
      </div>
    </Modal>
  );
}

// ---- Page publique : #/classeur/<code> ----
export function SharedBinderPage({ code }) {
  const d = useData();
  const [res, setRes] = useState(null);
  useEffect(() => { let ok = true; decodeBinder(code).then((r) => ok && setRes(r), (e) => ok && setRes({ error: e.message || 'lien invalide' })); return () => { ok = false; }; }, [code]);
  const items = useMemo(() => (!d.ready || !res?.entries ? [] : res.entries.map((e) => ({ e, c: resolveKey(d.cats, e.key) })).filter((x) => x.c)), [d.ready, d.jp, res]);
  useEffect(() => { if (res?.name != null) document.title = (res.name || 'Classeur') + ' · Kirakai'; }, [res]);
  if (!res || !d.ready) return <div className="page"><Loading /></div>;
  if (res.error) return <div className="page"><h1 className="page-title">Ce lien de classeur ne marche pas</h1><p className="muted">{res.error === 'navigateur trop ancien' ? 'Ton navigateur est trop ancien pour lire ce lien : mets-le à jour (iOS 16.4 ou plus récent, Chrome, Firefox…).' : 'Il est peut-être incomplet. Demande à la personne de te le renvoyer.'}</p><a className="btn primary" href={href('/collection')}>Créer mon classeur</a></div>;
  let total = 0, count = 0;
  for (const x of items) { count += x.e.qty; total += (eurOf(x.c, d.P, d.fx) || 0) * condOf(x.e.cond).factor * x.e.qty; }
  return (
    <div className="page binder-share-page">
      <div className="kicker">Classeur partagé · {GAMES[res.game].label}</div>
      <h1 className="page-title">{res.name || 'Classeur'}</h1>
      <p className="muted">{fmtNum(count)} cartes, {fmtNum(items.length)} différentes{total > 0 ? <> · valeur estimée au prix du jour : <b>{fmtEur(total)}</b></> : null}</p>
      <ShowBinder items={items} name={res.name} cover={res.cover} game={res.game} stats={{ count, unique: items.length, total }} readOnly startClosed />
      <div className="row center" style={{ marginTop: 26 }}><a className="btn primary" href={href('/collection')}><Icon name="album" size={18} />Créer mon propre classeur</a></div>
    </div>
  );
}
