// Données statiques (dossier db/, relevées chaque jour par les robots du dépôt) : catalogues, prix réels, historique, marché.
// Aucune donnée n'est inventée : une carte sans relevé affiche « Pas de prix relevé ».
const cache = new Map();
export const BASE = 'db/';

export function load(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(BASE + path, { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + path);
      return r.json();
    }).catch((e) => { cache.delete(path); throw e; }));
  }
  return cache.get(path);
}

export const GAMES = {
  onepiece: { id: 'onepiece', label: 'One Piece', short: 'OP', home: '/op', world: '/equipage', worldLabel: 'Équipage' },
  pokemon: { id: 'pokemon', label: 'Pokémon', short: 'PKM', home: '/pk', world: '/pokedex', worldLabel: 'Pokédex' },
};
export const otherGame = (g) => (g === 'onepiece' ? 'pokemon' : 'onepiece');

const PREFIX = { '@o/': 'https://optcgapi.com/media/static/Card_Images/', '@p/': 'https://images.pokemontcg.io/', '@s/': 'https://images.scrydex.com/pokemon/' };
export function img(u, size = 'small') {
  if (!u) return '';
  const p = u.slice(0, 3);
  let url = PREFIX[p] ? PREFIX[p] + u.slice(3) : u;
  if (p === '@t/') url = 'https://assets.tcgdex.net/' + u.slice(3) + (/\/logo$/.test(u) ? '.webp' : size === 'large' ? '/high.webp' : '/low.webp');
  if (size === 'large') {
    if (p === '@p/') url = url.replace(/\.png$/, '_hires.png');
    else if (p === '@s/') url = url.replace(/\/small$/, '/large');
  }
  return url;
}

export const normalize = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9/]+/g, ' ').trim();

// ---- Catalogue : objets cartes enrichis et indexés ----
const catalogs = {};
export async function catalog(game) {
  if (catalogs[game]) return catalogs[game];
  const j = await load('catalog/' + game + '.json');
  const sets = new Map(j.sets.map(([code, name, series, date, count, logo, printed], i) => [code, { code, name, series, date, count, logo, printed, game, order: i }]));
  const cards = j.cards.map(([id, name, set, number, rarity, image, variant, type, nameFr]) => ({
    id, key: game + ':' + id, game, name, set, number, rarity, image, variant, type, nameFr: nameFr || '',
    q: normalize(name + ' ' + (nameFr || '') + ' ' + number + ' ' + (variant || '') + ' ' + set),
  }));
  const byId = new Map(cards.map((c) => [c.id, c]));
  const bySet = new Map();
  for (const c of cards) { if (!bySet.has(c.set)) bySet.set(c.set, []); bySet.get(c.set).push(c); }
  catalogs[game] = { sets, cards, byId, bySet, setList: [...sets.values()] };
  return catalogs[game];
}
export const setCards = (cats, game, code) => cats[game]?.bySet.get(code) || [];

// Page lisible par les moteurs de recherche (générée par seo.mjs, même règle de nom) ; pas pour les cartes japonaises
export const pageSlug = (game, id) => game + '-' + String(id).replace(/[^A-Za-z0-9._-]+/g, '-');
export const cardPageUrl = (c) => (c.lang === 'ja' ? null : new URL('carte/' + pageSlug(c.game, c.id) + '.html', document.baseURI).href);
export const setPageUrl = (game, code) => (String(code).startsWith('jp-') ? null : new URL('extension/' + pageSlug(game, code) + '.html', document.baseURI).href);

export async function allCatalogs() {
  const [a, b] = await Promise.all([catalog('onepiece'), catalog('pokemon')]);
  return { onepiece: a, pokemon: b };
}

// ---- Prix : un relevé par jeu ----
const priceData = {};
export async function prices(game) {
  if (priceData[game]) return priceData[game];
  try { priceData[game] = await load('prices/' + game + '.json'); }
  catch { priceData[game] = { items: {}, source: null, missing: true }; }
  return priceData[game];
}
export async function allPrices() {
  const [a, b] = await Promise.all([prices('onepiece'), prices('pokemon')]);
  return { onepiece: a, pokemon: b };
}

export function priceOf(card, P) {
  if (!card || !P) return null;
  const v = P[card.game]?.items?.[card.id];
  if (!v) return null;
  if (card.game === 'onepiece') return { eur: v[0], usd: v[1], usdInventory: v[2], source: 'TCGplayer', converted: true };
  const src = v[6] || 'cm';
  return { eur: v[0], avg1: v[1], avg7: v[2], avg30: v[3], low: v[4], usd: v[5], source: src === 'tp' ? 'TCGplayer' : 'Cardmarket', converted: src === 'tp', divergent: src === 'x' };
}
// Valeur en euros utilisable (repli sur TCGplayer converti si pas de Cardmarket)
export function eurOf(card, P, fxRate) {
  const p = priceOf(card, P);
  if (!p) return null;
  if (p.eur != null) return p.eur;
  if (p.usd != null && fxRate) return Math.round(p.usd * fxRate * 100) / 100;
  return null;
}
// Tendance 7 j / 30 j (Pokémon, moyennes Cardmarket)
export function trendOf(card, P) {
  const p = priceOf(card, P);
  return p && p.avg7 && p.avg30 ? ((p.avg7 - p.avg30) / p.avg30) * 100 : null;
}

export const market = () => load('market.json').catch(() => null);
export const history = (game, set) => load('history/' + game + '/' + set + '.json').catch(() => null);

export async function historyOf(card) {
  const h = await history(card.game, card.set);
  if (!h || !h.p[card.id]) return [];
  const pts = h.d.map((d, i) => [d, h.p[card.id][i]]).filter((x) => x[1] != null);
  // valeur isolée aberrante (erreur ponctuelle d'une source) : écartée de la courbe
  return pts.filter(([, v], i) => {
    const a = pts[i - 1]?.[1], b = pts[i + 1]?.[1];
    const out = (x, k) => x != null && (v > x * k || v < x / k);
    return !((a != null && b != null && out(a, 6) && out(b, 6)) || (a == null && b != null && out(b, 20)));
  });
}

export function resolveKey(cats, key) {
  if (!cats || !key) return null;
  const [g, ...r] = String(key).split(':');
  return cats[g]?.byId.get(r.join(':')) || null;
}

// ---- Recherche plein texte ----
export function search(cats, query, { game = 'all', limit = 60, P } = {}) {
  const q = normalize(query);
  if (!q) return [];
  const terms = q.split(' ').filter(Boolean);
  const out = [];
  const qCompact = q.replace(/ /g, '');
  for (const g of Object.keys(cats)) {
    if (game !== 'all' && g !== game) continue;
    for (const c of cats[g].cards) {
      let ok = true;
      for (const t of terms) if (!c.q.includes(t)) { ok = false; break; }
      const num = normalize(c.number).replace(/ /g, '');
      if (!ok && !(qCompact.length >= 4 && (num === qCompact || normalize(c.id).replace(/ /g, '') === qCompact))) continue;
      let score = 0;
      const n = normalize(c.name), nf = normalize(c.nameFr);
      if (n === q || nf === q) score += 50;
      else if (n.startsWith(q) || nf.startsWith(q)) score += 25;
      if (num === qCompact) score += 60;
      if (P) { const e = P[g]?.items?.[c.id]?.[0]; if (e) score += Math.min(30, Math.log10(1 + e) * 10); }
      out.push([score, c]);
    }
  }
  out.sort((a, b) => b[0] - a[0]);
  return out.slice(0, limit).map((x) => x[1]);
}

// ---- Devise d'affichage : FR → euros, EN → dollars, JP → yens (stockage toujours en euros) ----
export const CUR = { code: 'EUR', rate: 1, locale: 'fr-FR', name: 'euros', sym: '€' };
export function setDisplayCurrency(lang, fx) {
  if (lang === 'en' && fx?.usdEur) Object.assign(CUR, { code: 'USD', rate: 1 / fx.usdEur, locale: 'en-US', name: 'dollars', sym: '$' });
  else if (lang === 'ja' && fx?.eurJpy) Object.assign(CUR, { code: 'JPY', rate: fx.eurJpy, locale: 'ja-JP', name: 'yens', sym: '¥' });
  else Object.assign(CUR, { code: 'EUR', rate: 1, locale: 'fr-FR', name: 'euros', sym: '€' });
}
export const toDisp = (eur) => (eur == null ? null : eur * CUR.rate);
export const fromDisp = (v) => (v == null ? null : v / CUR.rate);
export const fmtEur = (n, { decimals } = {}) => {
  if (n == null || !isFinite(n)) return '—';
  const v = n * CUR.rate;
  const d = CUR.code === 'JPY' ? 0 : decimals ?? (Math.abs(v) >= 1000 ? 0 : 2);
  return v.toLocaleString(CUR.locale, { style: 'currency', currency: CUR.code, minimumFractionDigits: d, maximumFractionDigits: d });
};
// Montant compact (12,3 k€) pour les graphiques et les tuiles
export const fmtShort = (n) => {
  if (n == null || !isFinite(n)) return '—';
  const v = n * CUR.rate;
  if (Math.abs(v) < 10000) return fmtEur(n, { decimals: Math.abs(v) >= 100 ? 0 : undefined });
  return v.toLocaleString(CUR.locale, { style: 'currency', currency: CUR.code, notation: 'compact', maximumFractionDigits: 1 });
};
export const fmtUsd = (n) => (n == null ? '—' : n.toLocaleString('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: n >= 1000 ? 0 : 2 }));
export const fmtPct = (n, d = 1) => (n == null || !isFinite(n) ? '—' : (n > 0 ? '+' : '') + n.toLocaleString('fr-FR', { maximumFractionDigits: d }) + ' %');
export const fmtDate = (d, opts = { day: 'numeric', month: 'long', year: 'numeric' }) => { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? String(d) : x.toLocaleDateString('fr-FR', opts); };
export const fmtNum = (n) => (n ?? 0).toLocaleString('fr-FR');
export const plural = (n, one, many = one + 's') => (Math.abs(n) > 1 ? many : one);

// ---- Rareté → effet holographique (0 aucun, 1 reflet, 2 holo, 3 illustration, 4 or) ----
const PK_FX = {
  'Rare Holo': 2, 'Rare Holo EX': 2, 'Rare Holo GX': 2, 'Rare Holo V': 2, 'Rare Holo VMAX': 2, 'Rare Holo VSTAR': 2, 'Rare Holo LV.X': 2, 'Rare Holo ex': 2, 'Holo Rare VMAX': 2, 'Holo Rare VSTAR': 2, 'Holo Rare V': 2, 'Holo Rare': 2,
  'Double Rare': 2, 'Double rare': 2, 'Rare BREAK': 2, 'Rare Prime': 2, 'Rare Holo Star': 3, 'Rare Prism Star': 2, 'Radiant Rare': 3, 'Amazing Rare': 3, 'LEGEND': 2, 'Rare ACE': 2, 'ACE SPEC Rare': 2, 'MEGA_ATTACK_RARE': 2, 'Triple Rare': 2,
  'Rare Ultra': 2, 'Ultra Rare': 2, 'Trainer Gallery Rare Holo': 3, 'Illustration Rare': 3, 'Illustration rare': 3, 'Character Rare': 3, 'Character Super Rare': 3, 'Pikachu Rare': 3, 'Classic Collection': 2,
  'Special Illustration Rare': 3, 'Special illustration rare': 3, 'Rare Rainbow': 3, 'Rare Shiny': 2, 'Shiny Rare': 2, 'Rare Shiny GX': 3, 'Rare Shining': 3, 'Shiny Ultra Rare': 3,
  'Rare Secret': 4, 'Secret Rare': 4, 'Hyper Rare': 4, 'Hyper rare': 4, 'Mega Hyper Rare': 4, 'Futuristic Rare': 4, 'Black White Rare': 4, 'Rare': 1, 'Promo': 1,
};
export function fxLevel(card) {
  if (!card) return 0;
  if (card.game === 'onepiece') {
    const r = card.rarity, par = /^Parallèle/.test(card.variant || '');
    if (r === 'TR' || r === 'SP CARD') return 4;
    if (par) return /\d/.test(card.variant) ? 4 : 3;
    if (r === 'SEC') return 4;
    if (r === 'SR' || r === 'L') return 2;
    if (r === 'R') return 1;
    return 0;
  }
  return PK_FX[card.rarity] ?? 0;
}
export const FX_NAMES = ['Commune', 'Rare', 'Holo', 'Illustration', 'Secrète'];

// ---- Pokédex et Équipage ----
export const pokedexList = () => load('pokedex/list.json');
export const pokedexChunk = (id) => load('pokedex/d-' + Math.floor((id - 1) / 100) + '.json');
export const equipageData = () => load('equipage.json');
export const artwork = (id, shiny) => id ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${shiny ? 'shiny/' : ''}${id}.png` : '';
export const cry = (id) => `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`;
export const TYPE_COLORS = { 1: '#a8a77a', 2: '#c22e28', 3: '#a98ff3', 4: '#a33ea1', 5: '#e2bf65', 6: '#b6a136', 7: '#a6b91a', 8: '#735797', 9: '#b7b7ce', 10: '#ee8130', 11: '#6390f0', 12: '#7ac74c', 13: '#f7d02c', 14: '#f95587', 15: '#96d9d6', 16: '#6f35fc', 17: '#705746', 18: '#d685ad' };
export const OP_COLORS = { Red: ['Rouge', '#e2433a'], Green: ['Vert', '#2fa56a'], Blue: ['Bleu', '#2f7fe0'], Purple: ['Violet', '#8e4ad8'], Black: ['Noir', '#3b3f4a'], Yellow: ['Jaune', '#e8c43a'] };
