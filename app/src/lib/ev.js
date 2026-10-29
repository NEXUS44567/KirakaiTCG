// Valeur espérée d'un booster : pour chaque emplacement, probabilité de chaque niveau de rareté × prix moyen
// des cartes de ce niveau (prix du jour réels ; une carte sans prix relevé compte pour 0).
// Les taux sont les estimations de packs.js : le résultat est une estimation, présentée comme telle.
import { eurOf } from './data.js';
import { slotsOf, boosterSets, buildProduct } from './packs.js';

// Formats réels les plus courants
export const DISPLAY = { onepiece: 24, pokemon: 36 };
const SIMS = 20000;

// Générateur pseudo-aléatoire à graine : mêmes chiffres à chaque affichage
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const seedOf = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

const caches = new WeakMap(); // par relevé de prix
export function packStats(prod, P, fx) {
  if (!caches.has(P)) caches.set(P, new Map());
  const cache = caches.get(P), id = prod.id + ':' + fx;
  if (cache.has(id)) return cache.get(id);
  const price = new Map();
  const eur = (c) => { let v = price.get(c.key); if (v === undefined) { v = eurOf(c, P, fx) || 0; price.set(c.key, v); } return v; };
  const slots = slotsOf(prod);
  const pools = prod.pools;
  // prix de chaque réserve (tableaux) et moyenne
  const arr = {}, mean = {};
  for (const s of slots) for (const [k] of s) if (!arr[k]) { arr[k] = Float64Array.from(pools[k], eur); mean[k] = arr[k].reduce((a, b) => a + b, 0) / arr[k].length; }
  let ev = 0;
  const odds = new Map(); // carte → nombre moyen d'exemplaires par booster (≈ probabilité pour une carte rare)
  const bySlot = slots.map((s) => {
    const tot = s.reduce((t, [, w]) => t + w, 0);
    let v = 0;
    for (const [k, w] of s) {
      const share = w / tot; v += share * mean[k];
      for (const c of pools[k]) odds.set(c, (odds.get(c) || 0) + share / pools[k].length);
    }
    ev += v;
    return { label: s.length === 1 ? s[0][2] : s.some(([k]) => ['L', 'SR', 'DR', 'UR', 'SEC'].includes(k)) ? 'Carte de tête' : 'Bonus', ev: v };
  });
  // Tirages simulés : la plupart des boosters valent bien moins que la moyenne, tirée vers le haut par les cartes rares
  const R = rng(seedOf(prod.id));
  const cum = slots.map((s) => { const tot = s.reduce((t, [, w]) => t + w, 0); let c = 0; return s.map(([k, w]) => [k, (c += w / tot)]); });
  const vals = new Float64Array(SIMS);
  for (let i = 0; i < SIMS; i++) {
    let v = 0;
    for (const s of cum) {
      const r = R(); let k = s[s.length - 1][0];
      for (const [kk, c] of s) if (r < c) { k = kk; break; }
      const a = arr[k]; v += a[Math.floor(R() * a.length)];
    }
    vals[i] = v;
  }
  vals.sort();
  const q = (x) => vals[Math.min(SIMS - 1, Math.floor(x * SIMS))];
  const above = (x) => { let lo = 0, hi = SIMS; while (lo < hi) { const m = (lo + hi) >> 1; if (vals[m] < x) lo = m + 1; else hi = m; } return (SIMS - lo) / SIMS; };
  const chase = [...odds].map(([card, p]) => ({ card, p, eur: eur(card) })).filter((x) => x.eur > 0).sort((a, b) => b.eur - a.eur).slice(0, 8);
  const out = { ev, median: q(0.5), p10: q(0.1), p90: q(0.9), above, bySlot, chase, displayEv: ev * DISPLAY[prod.game], displaySize: DISPLAY[prod.game] };
  cache.set(id, out);
  return out;
}

// Toutes les extensions disponibles en booster, de la plus rentable à la moins rentable
export function rankSets(game, d) {
  return boosterSets(game, d.cats).map((s) => {
    const prod = buildProduct(game, d.cats, d.P, d.fx, s.code);
    return { set: s, prod, st: packStats(prod, d.P, d.fx) };
  }).sort((a, b) => b.st.ev - a.st.ev);
}

// « 1 sur 37 » : lisible pour une petite probabilité
export const oneIn = (p) => (p <= 0 ? '—' : p >= 0.5 ? Math.round(p * 100) + ' %' : '1 sur ' + (1 / p >= 100 ? Math.round(1 / p / 10) * 10 : Math.round(1 / p)).toLocaleString('fr-FR'));
