import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { allCatalogs, allPrices, market, setDisplayCurrency } from './data.js';
import { applyLang, loadJapanese } from './lang.js';
import { getState, onStore, useStore } from './store.js';

// ---- Routeur par fragment (#/chemin?x=1), mêmes adresses que la V2 ----
function parse() {
  // Les pages de cartes et d'extensions (…/carte/pokemon-base1-4.html) donnent leur route dans window.KIRAKAI_ROUTE
  const h = location.hash.replace(/^#/, '') || window.KIRAKAI_ROUTE || '/';
  const [p, qs] = h.split('?');
  const parts = p.split('/').filter(Boolean).map(decodeURIComponent);
  return { path: '/' + parts.join('/'), parts, query: Object.fromEntries(new URLSearchParams(qs || '')) };
}
let route = parse();
const rsubs = new Set();
// L'éclair de la barre de navigation sert alors de transition : la capture de la page la figerait
let skipVT = 0;
export const skipNextTransition = () => { skipVT = Date.now(); };
function onHash() {
  const next = parse();
  const samePage = next.path === route.path;
  const apply = () => { route = next; rsubs.forEach((f) => f()); if (!samePage) window.scrollTo({ top: 0, behavior: 'instant' }); };
  // l'éclair traverse d'abord la barre, puis la nouvelle page s'affiche
  if (!samePage && Date.now() - skipVT < 600) { setTimeout(apply, 140); return; }
  // Transition fluide entre les pages quand le navigateur sait le faire
  if (!samePage && document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches && getState().settings?.fx !== 'lite') {
    try {
      // le rendu est suspendu pendant la mise à jour : on applique la nouvelle page tout de suite (flushSync)
      const t = document.startViewTransition(() => flushSync(apply));
      // une navigation rapide interrompt la transition précédente : ce n'est pas une erreur
      for (const p of [t.ready, t.finished, t.updateCallbackDone]) p?.catch(() => {});
      return;
    } catch {}
  }
  apply();
}
window.addEventListener('hashchange', onHash);

const UNIV_ROUTES = { op: 'onepiece', equipage: 'onepiece', pk: 'pokemon', pokedex: 'pokemon' };
export function universeOf(r, last) {
  const p = r.parts;
  if (UNIV_ROUTES[p[0]]) return UNIV_ROUTES[p[0]];
  if (p[0] === 'carte' && p[1]) { const g = p[1].split(':')[0]; if (g === 'onepiece' || g === 'pokemon') return g; }
  if ((p[0] === 'extensions' || p[0] === 'extension') && (p[1] === 'onepiece' || p[1] === 'pokemon')) return p[1];
  if (r.query.u === 'onepiece' || r.query.u === 'pokemon') return r.query.u;
  return last || 'onepiece';
}
export const UNIV_HOME = { onepiece: '/op', pokemon: '/pk' };
export const useRoute = () => useSyncExternalStore((f) => { rsubs.add(f); return () => rsubs.delete(f); }, () => route);
export const go = (to) => { location.hash = to; };
export const href = (to) => '#' + to;
export const cardHref = (c) => href('/carte/' + encodeURIComponent(c.key || c.game + ':' + c.id));
export function useUniverse() {
  const r = useRoute();
  const last = useStore((s) => s.universe);
  return universeOf(r, last);
}

// ---- Données partagées, chargées une fois ----
let data = { ready: false };
let started = false;
const dsubs = new Set();
const emitData = () => dsubs.forEach((f) => f());
function start() {
  if (started) return; started = true;
  Promise.all([allCatalogs(), allPrices(), market()]).then(async ([cats, P, M]) => {
    const fx = M?.fx?.usdEur || P.onepiece?.source?.fx?.usdEur || null;
    let lang = getState().lang || 'fr';
    try { await applyLang(cats, lang); } catch {}
    setDisplayCurrency(lang, M?.fx);
    data = { ready: true, cats, P, M, fx, lang, jp: false, v: 1 };
    emitData();
    loadJapanese(cats).then((ok) => { if (ok) { data = { ...data, jp: true, v: data.v + 1 }; emitData(); } });
    onStore(() => {
      const l = getState().lang || 'fr';
      if (l === lang) return;
      lang = l;
      applyLang(cats, l).then(() => { if (lang === l) { setDisplayCurrency(l, data.M?.fx); data = { ...data, lang: l, v: data.v + 1 }; emitData(); } });
    });
  }).catch((e) => { data = { ready: false, error: e.message }; emitData(); });
}
export function useData() {
  start();
  return useSyncExternalStore((f) => { dsubs.add(f); return () => dsubs.delete(f); }, () => data);
}
export const getData = () => data;

export function useAsync(fn, deps) {
  const [s, set] = useState({ loading: true });
  useEffect(() => {
    let alive = true;
    set((x) => ({ ...x, loading: true }));
    Promise.resolve().then(fn).then((value) => alive && set({ value }), (error) => alive && set({ error }));
    return () => { alive = false; };
  }, deps);
  return s;
}

export function useMedia(q) {
  const [m, set] = useState(() => matchMedia(q).matches);
  useEffect(() => { const mq = matchMedia(q); const f = () => set(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, [q]);
  return m;
}

export function useNow(ms = 1000) {
  const [n, set] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => set(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}

export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || getState().settings?.fx === 'lite';

// Nombre qui défile jusqu'à sa valeur (prix, totaux)
export function useCountUp(value, ms = 900) {
  const [v, setV] = useState(value ?? 0);
  const from = useRef(0);
  useEffect(() => {
    if (value == null || !isFinite(value)) { setV(value); return; }
    if (reduceMotion()) { setV(value); from.current = value; return; }
    const a = from.current || 0, t0 = performance.now();
    let raf = 0;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 4);
      setV(a + (value - a) * e);
      if (k < 1) raf = requestAnimationFrame(step); else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return v;
}

// Élément visible à l'écran (chargement progressif des grandes grilles)
export function useInView(opts = { rootMargin: '600px' }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setSeen(true); else setSeen(false); }, opts);
    io.observe(el); return () => io.disconnect();
  }, []);
  return [ref, seen];
}

// Grille qui s'allonge toute seule quand on arrive en bas
export function useInfinite(total, step = 60, deps = []) {
  const [n, setN] = useState(step);
  const [ref, seen] = useInView({ rootMargin: '900px' });
  useEffect(() => setN(step), deps);
  useEffect(() => { if (seen && n < total) setN((x) => Math.min(total, x + step)); }, [seen, n, total]);
  return [n, ref];
}

// Inclinaison 3D qui suit le doigt ou la souris (et le gyroscope sur mobile)
export function useTilt({ max = 14, gyro = false } = {}) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el || reduceMotion()) return;
    let raf = 0;
    const set = (x, y, on) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--rx', ((0.5 - y) * max).toFixed(2) + 'deg');
        el.style.setProperty('--ry', ((x - 0.5) * max * 1.3).toFixed(2) + 'deg');
        el.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
        el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
        el.style.setProperty('--hyp', Math.min(1, Math.hypot(x - 0.5, y - 0.5) * 2).toFixed(3));
        el.classList.toggle('tilting', on);
      });
    };
    const move = (e) => { const r = el.getBoundingClientRect(); set(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)), true); };
    const leave = () => set(0.5, 0.5, false);
    let gyroOn = false;
    const orient = (e) => { if (e.gamma == null) return; gyroOn = true; set(0.5 + Math.max(-0.5, Math.min(0.5, e.gamma / 50)), 0.5 + Math.max(-0.5, Math.min(0.5, (e.beta - 45) / 60)), true); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave);
    if (gyro && matchMedia('(pointer: coarse)').matches) addEventListener('deviceorientation', orient);
    return () => { cancelAnimationFrame(raf); el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); if (gyroOn || gyro) removeEventListener('deviceorientation', orient); };
  }, []);
  return ref;
}
