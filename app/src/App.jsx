import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRoute, useData, useUniverse, href, cardHref, UNIV_HOME, skipNextTransition } from './lib/hooks.js';
import { useStore, update, getState, touchStreak, questStep, questsOf } from './lib/store.js';
import { fmtEur, GAMES, otherGame } from './lib/data.js';
import { checkCollection } from './lib/achievements.js';
import { toast } from './lib/toast.js';
import { LANGS } from './lib/lang.js';
import Icon from './ui/Icon.jsx';
import { Logo, LogoMark, Emblem } from './ui/Brand.jsx';
import { Toasts } from './ui/Kit.jsx';
import { CommandPalette } from './ui/Search.jsx';
import UniversePage from './pages/Universe.jsx';
import Home from './pages/Home.jsx';
import CardPage from './pages/Card.jsx';
import { SearchPage, ComparePage, WatchPage, RankingPage, MarketPage, checkAlerts } from './pages/Market.jsx';
import { SetsPage, SetPage } from './pages/Sets.jsx';
import CollectionPage from './pages/Collection.jsx';
import { SharedBinderPage } from './pages/Binder.jsx';
import BoostersPage, { ShopPage, AchievementsPage } from './pages/Boosters.jsx';
import ScannerPage from './pages/Scanner.jsx';
import PokedexPage, { PokemonPage } from './pages/Pokedex.jsx';
import EquipagePage, { MemberPage } from './pages/Equipage.jsx';
import { SettingsPage, AdminPage } from './pages/Settings.jsx';
import AccountPage, { AccountButton, AccountDrawer } from './pages/Account.jsx';
import WishPage from './pages/Wish.jsx';
import { PlayersPage, PlayerPage } from './pages/Players.jsx';
import PlayPage from './pages/Play.jsx';
import GamePage from './pages/PlayGame.jsx';
import { useProfileSync } from './lib/social.js';

const NAVS = {
  onepiece: [['/op', 'Accueil', 'home'], ['/extensions', 'Extensions', 'sets'], ['/equipage', 'Équipage', 'crew'], ['/marche', 'Marché', 'market'], ['/scanner', 'Scanner', 'scan'], ['/boosters', 'Boosters', 'pack'], ['/collection', 'Collection', 'album']],
  pokemon: [['/pk', 'Accueil', 'home'], ['/extensions', 'Extensions', 'sets'], ['/pokedex', 'Pokédex', 'dex'], ['/marche', 'Marché', 'market'], ['/scanner', 'Scanner', 'scan'], ['/boosters', 'Boosters', 'pack'], ['/collection', 'Collection', 'album']],
};
const TABS = (u) => NAVS[u].filter(([to]) => !['/marche', '/scanner'].includes(to));

function titleFor(p, G) {
  const T = { recherche: `Recherche ${G}`, comparateur: 'Comparateur de prix', suivis: 'Mes alertes de prix', classement: `Top 100 ${G}`, marche: `Le marché ${G}`, extensions: `Extensions ${G}`, extension: `Extension ${G}`, collection: `Ma collection ${G}`, boosters: `Boosters ${G}`, boutique: 'Boutique', scanner: 'Scanner une carte', pokedex: 'Pokédex', equipage: 'L’équipage', reglages: 'Réglages', succes: 'Succès', admin: 'Administration', compte: 'Mon compte', souhaits: 'Ma liste de souhaits', collectionneurs: 'Les plus belles collections', joueur: 'Collectionneur', jouer: 'Jouer' };
  return T[p[0]] ? `${T[p[0]]} · Kirakai` : `Kirakai · ${G} · prix, collection et boosters`;
}

export default function App() {
  const route = useRoute();
  const d = useData();
  const universe = useUniverse();
  const last = useStore((s) => s.universe);
  const fx = useStore((s) => s.settings?.fx || 'full');
  const coll = useStore((s) => s.collection);
  const watch = useStore((s) => s.watch);
  const cmp = useStore((s) => s.compare);
  const [palette, setPalette] = useState(false);
  useProfileSync();
  const [drawer, setDrawer] = useState(false);
  const p = route.parts;
  const isChooser = p.length === 0;

  useEffect(() => { if (!isChooser && last !== universe) update((s) => { s.universe = universe; }); }, [universe, isChooser]);
  useEffect(() => { document.documentElement.dataset.universe = isChooser ? 'choice' : universe; }, [universe, isChooser]);
  useEffect(() => { document.documentElement.dataset.fx = fx; }, [fx]);
  useEffect(() => { document.body.classList.add('booted'); const t = setTimeout(() => document.getElementById('boot')?.remove(), 600); return () => clearTimeout(t); }, []);
  useEffect(() => { setDrawer(false); }, [route.path]);
  useEffect(() => {
    if (['carte', 'pokedex', 'equipage', 'classeur', 'extension', 'joueur'].includes(p[0]) && p[1]) return;
    document.title = isChooser ? 'Kirakai · choisis ton univers' : titleFor(p, GAMES[universe].label);
  }, [route.path, universe]);
  useEffect(() => { if (d.ready) checkCollection(d); }, [d.ready, coll, watch, cmp]);
  // Données reprises de l'ancienne version du site (V2) au premier lancement
  useEffect(() => {
    const s = getState();
    if (s.importedV2 && !s.importedV2Told) {
      const n = s.collection.length;
      update((x) => { x.importedV2Told = true; });
      if (n || Object.keys(s.watch).length) setTimeout(() => toast(`${n} carte${n > 1 ? 's' : ''} et tes suivis ont été repris de l’ancienne version du site.`, { title: 'Bienvenue sur Kirakai', icon: 'sparkle', ms: 5200 }), 1200);
    }
  }, []);
  // Série de jours de visite (bonus aux paliers)
  useEffect(() => {
    const { gain, streak } = touchStreak();
    if (gain) setTimeout(() => toast(`+${gain} Berrys et +${gain} Pokéballs pour ta série de ${streak} jours !`, { title: `Série de ${streak} jours`, icon: 'flame', ms: 5200 }), 1600);
  }, []);
  // Quêtes liées à la visite d'une page
  useEffect(() => {
    const id = route.path === '/marche' ? 'market' : /^\/extension\//.test(route.path) ? 'set' : null;
    if (id && questsOf().includes(id)) update((s) => questStep(s, id));
  }, [route.path]);
  // Raccourcis : Ctrl/⌘ + K ou « / » pour chercher
  useEffect(() => {
    const k = (e) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setPalette((x) => !x); return; }
      if (e.key === '/' && !e.target.closest('input, textarea, select, [contenteditable]')) { e.preventDefault(); setPalette(true); }
    };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, []);

  let page;
  switch (p[0]) {
    case undefined: page = <UniversePage />; break;
    case 'op': page = <Home game="onepiece" key="op" />; break;
    case 'pk': page = <Home game="pokemon" key="pk" />; break;
    case 'carte': page = <CardPage cardKey={p[1] || ''} key={p[1]} />; break;
    case 'recherche': page = <SearchPage query={route.query} />; break;
    case 'comparateur': page = <ComparePage />; break;
    case 'suivis': page = <WatchPage />; break;
    case 'classement': page = <RankingPage key={universe} />; break;
    case 'marche': page = <MarketPage key={universe} />; break;
    case 'extensions': page = <SetsPage game={p[1] || universe} key={p[1] || universe} />; break;
    case 'extension': page = <SetPage game={p[1]} code={p[2]} key={p[2]} />; break;
    case 'classeur': page = <SharedBinderPage code={p[1] || ''} key={p[1]} />; break;
    case 'collection': page = <CollectionPage key={universe} />; break;
    case 'boosters': page = <BoostersPage key={universe} focus={p[1] === 'collection'} />; break;
    case 'boutique': page = <ShopPage key={universe} />; break;
    case 'succes': page = <AchievementsPage />; break;
    case 'scanner': page = <ScannerPage />; break;
    case 'pokedex': page = p[1] ? <PokemonPage id={p[1]} key={p[1]} /> : <PokedexPage />; break;
    case 'equipage': page = p[1] ? <MemberPage slug={p[1]} key={p[1]} /> : <EquipagePage />; break;
    case 'reglages': page = <SettingsPage />; break;
    case 'compte': page = <AccountPage />; break;
    case 'souhaits': page = <WishPage />; break;
    case 'collectionneurs': page = <PlayersPage />; break;
    case 'joueur': page = <PlayerPage pseudo={p[1] || ''} key={p[1]} />; break;
    case 'jouer': page = p[1] === 'partie' ? <GamePage /> : <PlayPage />; break;
    case 'admin': page = <AdminPage code={p[1] || ''} />; break;
    default: page = <div className="page"><h1 className="page-title">Page introuvable</h1><a className="btn primary" href={href('/')}>Accueil</a></div>;
  }

  if (isChooser) return <><div className="aurora" aria-hidden="true"><i /><i /><i /></div><main id="contenu" className="chooser-main">{page}</main><Toasts /><CommandPalette open={palette} onClose={() => setPalette(false)} /></>;

  const nav = NAVS[universe];
  const other = otherGame(universe);
  const active = (to) => (to === UNIV_HOME[universe] ? route.path === to : to === '/extensions' ? /^\/extensions?(\/|$)/.test(route.path) : route.path.startsWith(to));
  return (
    <div className={'shell u-' + universe + (p[0] === 'jouer' && p[1] === 'partie' ? ' at-table' : '')}>
      <div className="aurora" aria-hidden="true"><i /><i /><i /></div>
      <a className="skip" href="#contenu">Aller au contenu</a>
      <header className="topbar">
        <div className="topbar-in">
          <a className="brand" href={href('/')} aria-label="Kirakai, changer d’univers" onClick={() => update((s) => { s.universe = null; })}><Logo size={32} /></a>
          <UniverseSwitch universe={universe} />
          <nav className="topnav" aria-label="Navigation principale">
            <NavPill path={route.path} />
            <NavBolt path={route.path} edge="bottom" />
            {nav.slice(1).map(([to, l, i]) => <a key={to} href={href(to)} className={active(to) ? 'on' : ''}><Icon name={i} size={17} /><span>{l}</span></a>)}
          </nav>
          <button className="search-trigger" onClick={() => setPalette(true)} aria-label="Rechercher (Ctrl K)"><Icon name="search" size={17} /><span>Rechercher…</span><kbd>{/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'}</kbd><kbd>K</kbd></button>
          <div className="top-icons">
            <a className="icon-btn hide-s hide-l" href={href('/scanner')} aria-label="Scanner une carte" title="Scanner"><Icon name="scan" /></a>
            <button className="icon-btn show-s" onClick={() => setPalette(true)} aria-label="Rechercher"><Icon name="search" /></button>
            <a className="icon-btn hide-m" href={href('/comparateur')} aria-label="Comparateur" title="Comparateur"><Icon name="compare" />{cmp.length > 0 && <span className="dot">{cmp.length}</span>}</a>
            <a className="icon-btn hide-m" href={href('/suivis')} aria-label="Alertes de prix" title="Alertes"><Icon name="bell" />{Object.keys(watch).length > 0 && <span className="dot">{Object.keys(watch).length}</span>}</a>
            <LangSelect />
            <AccountButton />
            <button className="icon-btn" onClick={() => setDrawer(true)} aria-label="Menu"><Icon name="menu" /></button>
          </div>
        </div>
      </header>
      <InstallBanner />
      {d.ready && <AlertBanner />}
      <main id="contenu"><div className="route" key={route.path}>{page}</div></main>
      {!(p[0] === 'jouer' && p[1] === 'partie') && <Footer universe={universe} />}
      <nav className="tabbar" aria-label="Navigation">
        <NavBolt path={route.path} edge="top" />
        {TABS(universe).map(([to, l, i]) => <a key={to} href={href(to)} className={active(to) ? 'on' : ''}><span className="tb-ico"><Icon name={i} size={22} /></span><span>{l}</span></a>)}
      </nav>
      <Drawer open={drawer} onClose={() => setDrawer(false)} universe={universe} other={other} openPalette={() => { setDrawer(false); setPalette(true); }} />
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <BackToTop />
      <Toasts />
    </div>
  );
}

// Bascule entre les deux univers, pastille qui glisse
function UniverseSwitch({ universe }) {
  return (
    <div className={'uswitch is-' + universe} role="group" aria-label="Univers">
      <span className="us-pill" aria-hidden="true" />
      {['onepiece', 'pokemon'].map((g) => (
        <a key={g} href={href(UNIV_HOME[g])} className={universe === g ? 'on' : ''} aria-current={universe === g ? 'true' : undefined} onClick={() => update((s) => { s.universe = g; })} title={GAMES[g].label}>
          <Emblem game={g} size={24} /><span>{GAMES[g].label}</span>
        </a>
      ))}
    </div>
  );
}

// Pastille lumineuse qui suit le lien actif de la navigation
function NavPill({ path }) {
  const ref = useRef(null);
  const [st, setSt] = useState(null);
  useLayoutEffect(() => {
    const measure = () => {
      const nav = ref.current?.parentElement; const a = nav?.querySelector('a.on');
      if (!a) { setSt(null); return; }
      setSt({ x: a.offsetLeft, w: a.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure); if (ref.current?.parentElement) ro.observe(ref.current.parentElement);
    return () => ro.disconnect();
  }, [path]);
  return <span ref={ref} className={'nav-pill' + (st ? ' show' : '')} style={st ? { transform: `translateX(${st.x}px)`, width: st.w } : undefined} aria-hidden="true" />;
}

// Éclair qui file de l'ancienne section à la nouvelle, le long de la barre de navigation (repris de la V2)
function boltPath(a, b) {
  // vrai zigzag : segments droits, angles vifs, amplitude marquée, plus une petite fourche
  const len = Math.abs(b.x - a.x), n = Math.max(4, Math.round(len / 18));
  const pts = [a]; let sgn = Math.random() < 0.5 ? 1 : -1;
  for (let i = 1; i < n; i++) { sgn = -sgn; const t = (i + (Math.random() - 0.5) * 0.35) / n; pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + sgn * (5 + Math.random() * 5) }); }
  pts.push(b);
  const f = (v) => v.toFixed(1);
  let d = pts.map((p, i) => (i ? 'L' : 'M') + f(p.x) + ' ' + f(p.y)).join(' ');
  if (pts.length > 4) {
    const k = 1 + Math.floor(Math.random() * (pts.length - 3)), p = pts[k], dir = Math.sign(b.x - a.x) || 1, up = p.y < a.y ? -1 : 1;
    d += ` M${f(p.x)} ${f(p.y)} L${f(p.x + dir * 7)} ${f(p.y + up * 6)} L${f(p.x + dir * 4)} ${f(p.y + up * 11)}`;
  }
  return d;
}
function NavBolt({ path, edge }) {
  const ref = useRef(null);
  const last = useRef(null);
  const [bolt, setBolt] = useState(null);
  const timer = useRef(0);
  const posOf = (link) => {
    const r = ref.current?.parentElement?.getBoundingClientRect(), b = link.getBoundingClientRect();
    return r?.width ? { x: b.left - r.left + b.width / 2, y: edge === 'top' ? 2 : b.bottom - r.top + 7 } : null;
  };
  const fire = (prev, pos, link) => {
    if (!prev || !pos || Math.abs(prev.x - pos.x) < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches || getState().settings?.fx === 'lite') return;
    const key = Date.now();
    clearTimeout(timer.current);
    document.querySelectorAll('a.zap').forEach((a) => a.classList.remove('zap'));
    setBolt({ d: boltPath(prev, pos), d2: boltPath(prev, pos), end: pos, key });
    link.classList.add('zap');
    timer.current = setTimeout(() => { setBolt((x) => (x?.key === key ? null : x)); link.classList.remove('zap'); }, 900);
  };
  // Départ immédiat au toucher d'une section, sans attendre que la nouvelle page s'affiche
  useEffect(() => {
    const nav = ref.current?.parentElement; if (!nav) return;
    const onClick = (e) => {
      const a = e.target.closest('a'); if (!a || a.classList.contains('on') || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const pos = posOf(a); if (!pos) return;
      const cur = nav.querySelector('a.on');
      skipNextTransition();
      fire(cur ? posOf(cur) : last.current, pos, a);
      last.current = pos;
    };
    nav.addEventListener('click', onClick, true);
    return () => { nav.removeEventListener('click', onClick, true); clearTimeout(timer.current); };
  }, []);
  // Changement de section par un autre chemin (lien dans la page, retour arrière, clavier)
  useLayoutEffect(() => {
    let raf = 0, tries = 0;
    const run = () => {
      const link = ref.current?.parentElement?.querySelector('a.on');
      const pos = link && posOf(link);
      if (!pos) { if (++tries < 40) raf = requestAnimationFrame(run); return; }
      const prev = last.current; last.current = pos;
      fire(prev, pos, link);
    };
    run();
    return () => cancelAnimationFrame(raf);
  }, [path]);
  return (
    <svg ref={ref} className={'nav-bolt' + (bolt ? ' live' : '')} key={bolt?.key ?? 'idle'} aria-hidden="true">
      {bolt && (
        <g>
          <path className="bolt-glow" d={bolt.d} pathLength="1" />
          <path className="bolt-mid thin" d={bolt.d2} pathLength="1" />
          <path className="bolt-mid" d={bolt.d} pathLength="1" />
          <path className="bolt-core" d={bolt.d} pathLength="1" />
          <circle className="bolt-ring" cx={bolt.end.x} cy={bolt.end.y} r="6" />
          <circle className="bolt-spark" cx={bolt.end.x} cy={bolt.end.y} r="2.6" />
        </g>
      )}
    </svg>
  );
}

function LangSelect() {
  const lang = useStore((s) => s.lang || 'fr');
  return (
    <label className="lang-select" title="Langue des cartes et devise">
      <span className="sr-only">Langue des cartes</span>
      <select value={lang} onChange={(e) => update((s) => { s.lang = e.target.value; })}>{LANGS.map(([v, l, t]) => <option key={v} value={v}>{l} · {t}</option>)}</select>
      <b aria-hidden="true"><Icon name="globe" size={15} />{LANGS.find((x) => x[0] === lang)?.[1]}</b>
    </label>
  );
}

function Drawer({ open, onClose, universe, other, openPalette }) {
  const cmp = useStore((s) => s.compare.length);
  const watchN = useStore((s) => Object.keys(s.watch).length);
  const wishN = useStore((s) => Object.keys(s.wish || {}).length);
  const sound = useStore((s) => s.settings?.sound !== false);
  const ach = useStore((s) => Object.keys(s.achievements || {}).length);
  useEffect(() => {
    if (!open) return;
    const f = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', f); document.body.classList.add('modal-open');
    return () => { removeEventListener('keydown', f); document.body.classList.remove('modal-open'); };
  }, [open]);
  const links = [
    [GAMES[universe].world, GAMES[universe].worldLabel, universe === 'onepiece' ? 'crew' : 'dex'],
    ['/marche', 'Le marché du jour', 'market'], ['/classement', 'Top 100', 'trophy'], ['/scanner', 'Scanner une carte', 'scan'],
    ['/comparateur', 'Comparateur', 'compare', cmp], ['/suivis', 'Mes alertes de prix', 'bell', watchN], ['/souhaits', 'Ma liste de souhaits', 'heart', wishN || null], ['/collectionneurs', 'Les collectionneurs', 'trophy'], ['/jouer', 'Jouer avec de vrais decks', 'play'], ['/boutique', 'Boutique', 'coin'],
    ['/succes', 'Succès', 'crown', ach || null], ['/reglages', 'Réglages et sauvegarde', 'gear'],
  ];
  return (
    <div className={'drawer-back' + (open ? ' open' : '')} onPointerDown={(e) => e.target === e.currentTarget && onClose()} aria-hidden={!open}>
      <aside className="drawer" role="dialog" aria-label="Menu" aria-modal="true">
        <div className="drawer-head"><Logo size={30} /><button className="icon-btn" onClick={onClose} aria-label="Fermer le menu" tabIndex={open ? 0 : -1}><Icon name="x" /></button></div>
        <AccountDrawer tab={open ? 0 : -1} />
        <button className="drawer-search" onClick={openPalette} tabIndex={open ? 0 : -1}><Icon name="search" size={18} />Rechercher une carte, un Pokémon…</button>
        <a className={'drawer-switch ' + other} href={href(UNIV_HOME[other])} onClick={() => update((s) => { s.universe = other; })} tabIndex={open ? 0 : -1}>
          <Emblem game={other} size={44} />
          <span><small>Passer à l’univers</small><b>{GAMES[other].label}</b></span>
          <Icon name="swap" />
        </a>
        <nav className="drawer-links">
          {links.map(([to, l, i, n]) => <a key={to} href={href(to)} tabIndex={open ? 0 : -1}><Icon name={i} size={19} /><span>{l}</span>{n ? <em>{n}</em> : null}<Icon name="right" size={16} /></a>)}
        </nav>
        <div className="drawer-row">
          <button className="btn ghost small" onClick={() => update((s) => { s.settings = { ...s.settings, sound: !sound }; })} tabIndex={open ? 0 : -1}><Icon name={sound ? 'sound' : 'mute'} size={16} />{sound ? 'Son activé' : 'Son coupé'}</button>
          <a className="btn ghost small" href={href('/')} onClick={() => update((s) => { s.universe = null; })} tabIndex={open ? 0 : -1}><Icon name="home" size={16} />Écran d’accueil</a>
        </div>
        <p className="drawer-foot">Kirakai · <a href="https://nexus44567.github.io/nexus-tcg/" tabIndex={open ? 0 : -1}>ancienne version du site</a></p>
      </aside>
    </div>
  );
}

function AlertBanner() {
  const d = useData();
  const notified = useStore((s) => s.notified);
  const [hits] = useState(() => checkAlerts(d));
  const date = d.M?.updatedAt?.slice(0, 10);
  const fresh = hits.filter((h) => notified[h.c.key] !== date);
  useEffect(() => {
    if (!fresh.length) return;
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try { new Notification('Kirakai · seuil atteint', { body: fresh.slice(0, 3).map((h) => `${h.c.name} : ${fmtEur(h.eur)}`).join('\n'), icon: 'icon-192.png' }); } catch {}
    }
  }, []);
  if (!fresh.length) return null;
  const dismiss = () => update((s) => { for (const h of fresh) s.notified[h.c.key] = date; });
  return (
    <div className="banner alert" role="status">
      <span className="banner-ico"><Icon name="bell" size={18} /></span>
      <span><b>{fresh.length} alerte{fresh.length > 1 ? 's' : ''} de prix</b> · {fresh.slice(0, 2).map((h, i) => <a key={h.c.key} href={cardHref(h.c)}>{i ? ', ' : ''}{h.c.name} à {fmtEur(h.eur)} ({h.kind === 'below' ? 'sous' : 'au-dessus de'} {fmtEur(h.target)})</a>)}{fresh.length > 2 ? '…' : ''}</span>
      <a className="btn small ghost" href={href('/suivis')}>Voir</a>
      <button className="icon-btn" onClick={dismiss} aria-label="Masquer"><Icon name="x" size={16} /></button>
    </div>
  );
}

// Proposition d'installer l'application (bouton natif sur Android / ordinateur, astuce Partager sur iPhone)
function InstallBanner() {
  const [evt, setEvt] = useState(null);
  const [ios, setIos] = useState(false);
  const dismissed = useStore((s) => !!s.installHidden);
  useEffect(() => {
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (standalone) return;
    const f = (e) => { e.preventDefault(); setEvt(e); };
    addEventListener('beforeinstallprompt', f);
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    let visits = 0;
    try { visits = (Number(localStorage.getItem('nexus3.visits')) || 0) + 1; localStorage.setItem('nexus3.visits', String(visits)); } catch {}
    if (isIos && visits >= 2) setIos(true);
    return () => removeEventListener('beforeinstallprompt', f);
  }, []);
  if (dismissed || (!evt && !ios)) return null;
  const close = () => update((s) => { s.installHidden = true; });
  return (
    <div className="banner install" role="region" aria-label="Installer l’application">
      <span className="banner-ico"><LogoMark size={22} /></span>
      <span><b>Installe Kirakai</b> {evt ? '· s’ouvre en un geste, même hors ligne' : <>· <b>Partager</b> › <b>Sur l’écran d’accueil</b></>}</span>
      {evt && <button className="btn small primary" onClick={async () => { evt.prompt(); try { await evt.userChoice; } catch {} setEvt(null); close(); }}>Installer</button>}
      <button className="icon-btn" onClick={close} aria-label="Fermer"><Icon name="x" size={16} /></button>
    </div>
  );
}

function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const f = () => setShow(scrollY > 1400);
    addEventListener('scroll', f, { passive: true });
    return () => removeEventListener('scroll', f);
  }, []);
  return <button className={'back-top' + (show ? ' show' : '')} onClick={() => scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Remonter en haut de la page" tabIndex={show ? 0 : -1}><Icon name="up" size={20} /></button>;
}

function Footer({ universe }) {
  return (
    <footer className="footer">
      <div className="footer-in">
        <div className="footer-brand">
          <Logo size={34} />
          <p>Le prix du jour de chaque carte One Piece et Pokémon, relevé chaque matin, sourcé et daté. Aucun prix n’est inventé.</p>
          <a className="btn ghost small" href={href('/')} onClick={() => update((s) => { s.universe = null; })}><Icon name="swap" size={16} />Changer d’univers</a>
        </div>
        <nav className="footer-cols">
          <div><b>Explorer</b><a href={href('/extensions/' + universe)}>Extensions</a><a href={href(GAMES[universe].world)}>{GAMES[universe].worldLabel}</a><a href={href('/marche')}>Marché du jour</a><a href={href('/classement')}>Top 100</a></div>
          <div><b>Mes outils</b><a href={href('/collection')}>Collection et classeur</a><a href={href('/scanner')}>Scanner</a><a href={href('/comparateur')}>Comparateur</a><a href={href('/suivis')}>Alertes de prix</a><a href={href('/souhaits')}>Liste de souhaits</a></div>
          <div><b>Jouer</b><a href={href('/jouer')}>Parties avec de vrais decks</a><a href={href('/boosters')}>Boosters virtuels</a><a href={href('/boosters/collection')}>Collection virtuelle</a><a href={href('/succes')}>Succès</a><a href={href('/boutique')}>Boutique</a><a href={href('/collectionneurs')}>Collectionneurs</a></div>
        </nav>
      </div>
      <p className="footer-legal">Prix : TCGplayer via optcgapi.com (One Piece) et Cardmarket / TCGplayer via pokemontcg.io et tcgdex (Pokémon). Pokédex : PokéAPI. Images : optcgapi.com, pokemontcg.io, Scrydex, TCGdex, PokéAPI. Site de fan indépendant, non affilié à Bandai, Toei Animation, Shueisha, Nintendo, Creatures, GAME FREAK ou The Pokémon Company. One Piece © Eiichiro Oda / Shueisha, Toei Animation. Pokémon © Nintendo / Creatures / GAME FREAK. · <a href={href('/reglages')}>Réglages</a> · <a href="https://nexus44567.github.io/nexus-tcg/">Ancienne version</a></p>
    </footer>
  );
}

