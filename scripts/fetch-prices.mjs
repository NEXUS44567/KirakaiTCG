// Robot de prix NEXUS : relève les prix réels une fois par jour (GitHub Actions).
//  - One Piece : optcgapi.com (prix de marché TCGplayer, en dollars, converti en euros au taux BCE du jour)
//  - Pokémon   : api.pokemontcg.io (prix Cardmarket en euros + TCGplayer en dollars)
// Écrit :
//  db/prices/<jeu>.json        dernier relevé, par carte
//  db/history/<jeu>/<set>.json historique quotidien (180 jours max)
//  db/market.json              podium, hausses, baisses, sources et dates
// Aucune valeur inventée : une carte sans prix relevé reste sans prix.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DB = path.join(ROOT, 'db');
const HISTORY_DAYS = 180;
const now = new Date();
const today = now.toISOString().slice(0, 10);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const readJSON = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } };
const writeJSON = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n) => (n == null || !isFinite(n) ? null : Math.round(n * 100) / 100);
const num = (v) => { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) && n > 0 ? n : null; };

async function getJSON(url, { tries = 4, headers = {} } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'NEXUS-TCG-price-bot (github.com/NEXUS44567/nexus-tcg)', Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(60000) });
      if (r.status === 429 || r.status >= 500) { last = new Error('HTTP ' + r.status); await sleep(3000 * (i + 1)); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
      return await r.json();
    } catch (e) { last = e; await sleep(2000 * (i + 1)); }
  }
  throw last;
}

// ---------- Taux de change ----------
async function usdToEur() {
  const prev = readJSON(path.join(DB, 'market.json'), {})?.fx;
  const tries = [
    ['https://api.frankfurter.app/latest?from=USD&to=EUR', (j) => [j.rates?.EUR, j.date, 'BCE via frankfurter.app']],
    ['https://open.er-api.com/v6/latest/USD', (j) => [j.rates?.EUR, (j.time_last_update_utc || '').slice(0, 16), 'open.er-api.com']],
  ];
  // Yen : pour afficher les prix en yens quand la langue choisie est le japonais
  let eurJpy = null;
  for (const [u, pick] of [['https://api.frankfurter.app/latest?from=EUR&to=JPY', (j) => j.rates?.JPY], ['https://open.er-api.com/v6/latest/EUR', (j) => j.rates?.JPY]]) {
    try { const v = pick(await getJSON(u, { tries: 2 })); if (v > 0) { eurJpy = v; break; } } catch (e) { log('fx jpy', u, e.message); }
  }
  if (!eurJpy && prev?.eurJpy) eurJpy = prev.eurJpy;
  for (const [u, pick] of tries) {
    try { const [rate, date, src] = pick(await getJSON(u, { tries: 2 })); if (rate > 0) return { usdEur: rate, eurJpy, date, source: src }; } catch (e) { log('fx', u, e.message); }
  }
  if (prev?.usdEur) return { ...prev, stale: true };
  throw new Error('Aucun taux de change disponible');
}

// ---------- One Piece ----------
async function onePiece(catalog, fx) {
  const ids = new Set(catalog.cards.map((c) => c[0]));
  const endpoints = ['https://optcgapi.com/api/allSetCards/', 'https://optcgapi.com/api/allSTCards/', 'https://optcgapi.com/api/allPromoCards/'];
  const rows = [];
  for (const u of endpoints) {
    try { const j = await getJSON(u); const arr = Array.isArray(j) ? j : j.results || j.data || []; log('optcgapi', u, arr.length, 'lignes'); rows.push(...arr); }
    catch (e) { log('optcgapi échec', u, e.message); }
  }
  if (rows.length) log('exemple optcgapi', JSON.stringify(rows[0]).slice(0, 600));
  const items = {};
  let matched = 0, unmatched = 0, latestScrape = null;
  for (const r of rows) {
    const imgId = r.card_image_id || (r.card_image || '').split('/').pop()?.replace(/\.(jpg|png|webp)$/i, '');
    const id = ids.has(imgId) ? imgId : ids.has(r.card_set_id) && !imgId ? r.card_set_id : null;
    const usd = num(r.market_price) ?? num(r.inventory_price);
    if (!id || usd == null) { unmatched++; continue; }
    const prev = items[id];
    if (prev && prev[1] >= usd) continue;
    items[id] = [round(usd * fx.usdEur), round(usd), round(num(r.inventory_price))];
    matched++;
    const d = r.date_scraped || r.date || null;
    if (d && (!latestScrape || d > latestScrape)) latestScrape = d;
  }
  log('One Piece : prix associés', matched, 'non associés', unmatched);
  return {
    game: 'onepiece', updatedAt: now.toISOString(), sourceDate: latestScrape,
    source: { name: 'TCGplayer (prix de marché) via optcgapi.com', url: 'https://optcgapi.com', currency: 'USD', converted: 'EUR', fx },
    fields: ['eur', 'usd_market', 'usd_inventory'], items,
  };
}

// ---------- Pokémon ----------
// Prix TCGplayer de l'impression de base : normale, sinon holo, sinon la moins chère des autres
function tcgMarket(prices, get) {
  for (const k of ['normal', 'holofoil', 'unlimitedHolofoil', 'unlimited']) { const v = num(get(prices[k])); if (v != null) return v; }
  const rest = Object.values(prices).map((p) => num(get(p))).filter((v) => v != null);
  return rest.length ? Math.min(...rest) : null;
}
function pokemonItem(cm, tpMarket) {
  let eur = num(cm.trendPrice ?? cm.trend) ?? num(cm.averageSellPrice ?? cm.avg) ?? num(cm.avg7) ?? num(cm.avg30);
  // tendance à quelques centimes alors que les moyennes sont bien plus hautes : valeur de remplissage de la source
  const ref = num(cm.avg30) ?? num(cm.avg7) ?? num(cm.averageSellPrice ?? cm.avg);
  if (eur != null && eur <= 0.05 && ref != null && ref > eur * 20) eur = ref;
  if (eur == null && tpMarket == null) return null;
  return [round(eur), round(num(cm.avg1)), round(num(cm.avg7)), round(num(cm.avg30)), round(num(cm.lowPrice ?? cm.low)), round(tpMarket)];
}

async function pokemonTcgIo(ids) {
  const items = {};
  const headers = process.env.POKEMONTCG_API_KEY ? { 'X-Api-Key': process.env.POKEMONTCG_API_KEY } : {};
  let page = 1, total = Infinity, matched = 0, latest = null;
  while ((page - 1) * 250 < total && page < 200) {
    const u = `https://api.pokemontcg.io/v2/cards?page=${page}&pageSize=250&select=id,cardmarket,tcgplayer`;
    let j;
    try { j = await getJSON(u, { headers, tries: 5 }); } catch (e) { log('pokemontcg échec page', page, e.message); if (page === 1) throw e; break; }
    total = j.totalCount ?? 0;
    if (page === 1) log('pokemontcg total', total, 'exemple', JSON.stringify(j.data?.[0]).slice(0, 500));
    for (const c of j.data || []) {
      if (!ids.has(c.id)) continue;
      const tpMarket = tcgMarket(c.tcgplayer?.prices || {}, (p) => p?.market);
      const it = pokemonItem(c.cardmarket?.prices || {}, tpMarket);
      if (!it) continue;
      items[c.id] = it; matched++;
      const d = c.cardmarket?.updatedAt; if (d && (!latest || d > latest)) latest = d;
    }
    page++;
    await sleep(headers['X-Api-Key'] ? 300 : 2100);
  }
  return { items, latest, name: 'Cardmarket (tendance) et TCGplayer via api.pokemontcg.io', url: 'https://pokemontcg.io' };
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');

async function pool(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) { const k = i++; await fn(list[k], k); } }));
}

async function tcgdex(catalog) {
  const B = 'https://api.tcgdex.net/v2/en';
  const sets = await getJSON(B + '/sets');
  log('tcgdex sets', sets.length);
  // Associer chaque extension du catalogue à une extension tcgdex : par identifiant proche, puis par nom
  const byName = new Map();
  for (const s of sets) { const k = norm(s.name); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(s); }
  const byId = new Map(sets.map((s) => [s.id.toLowerCase(), s]));
  const idGuess = (code) => [code, code.replace(/^sv(\d)$/, 'sv0$1'), code.replace(/^sv(\d)pt5$/, 'sv0$1.5'), code.replace(/^sv(\d+)pt5$/, 'sv$1.5'), code.replace(/^swsh(\d+)pt5$/, 'swsh$1.5'), code.replace(/^me(\d)$/, 'me0$1'), code.replace(/^me(\d)pt5$/, 'me0$1.5'), code.replace(/pt5$/, '.5')];
  const mapped = [];
  for (const [code, name, , , count] of catalog.sets) {
    let t = null;
    for (const g of idGuess(code)) { if (byId.has(g.toLowerCase())) { t = byId.get(g.toLowerCase()); break; } }
    if (!t) { const c = byName.get(norm(name)) || []; t = c.length === 1 ? c[0] : c.find((x) => (x.cardCount?.total ?? 0) === count) || c[0] || null; }
    if (t) mapped.push([code, t.id]); else log('tcgdex : extension non trouvée', code, name);
  }
  log('tcgdex extensions associées', mapped.length, '/', catalog.sets.length);
  const ourBySet = new Map();
  for (const c of catalog.cards) { if (!ourBySet.has(c[2])) ourBySet.set(c[2], new Map()); ourBySet.get(c[2]).set(String(c[3]).replace(/^0+(?=\d)/, '').toLowerCase(), c[0]); }
  const jobs = [];
  await pool(mapped, 6, async ([code, tid]) => {
    try {
      const s = await getJSON(B + '/sets/' + encodeURIComponent(tid), { tries: 3 });
      const ours = ourBySet.get(code) || new Map();
      for (const c of s.cards || []) { const our = ours.get(String(c.localId).replace(/^0+(?=\d)/, '').toLowerCase()); if (our) jobs.push([our, c.id]); }
    } catch (e) { log('tcgdex set', tid, e.message); }
  });
  log('tcgdex cartes à relever', jobs.length);
  const items = {};
  let latest = null, done = 0, fails = 0, sample = false;
  await pool(jobs, 12, async ([our, tid]) => {
    try {
      const c = await getJSON(B + '/cards/' + encodeURIComponent(tid), { tries: 3 });
      const pr = c.pricing || {};
      if (!sample && pr.cardmarket) { sample = true; log('exemple tcgdex', JSON.stringify(pr).slice(0, 600)); }
      const cm = pr.cardmarket || {};
      const tp = pr.tcgplayer || {};
      const tpMarket = tcgMarket(tp, (p) => (p && typeof p === 'object' ? p.marketPrice ?? p.market : null));
      const it = pokemonItem(cm, tpMarket);
      if (it) { items[our] = it; const d = cm.updated; if (d && (!latest || d > latest)) latest = d; }
    } catch { fails++; }
    if (++done % 2000 === 0) log('tcgdex', done, '/', jobs.length, 'échecs', fails);
  });
  log('tcgdex terminé, prix', Object.keys(items).length, 'échecs', fails);
  return { items, latest, name: 'Cardmarket (tendance) et TCGplayer via api.tcgdex.net', url: 'https://tcgdex.dev' };
}

// Contrôle de cohérence : Cardmarket est parfois associé à la mauvaise impression (holo / non holo,
// promos regroupées). On écarte une valeur partagée à l'identique par 3 cartes ou plus d'une même
// extension, et on signale (« x ») les cartes dont Cardmarket et TCGplayer divergent de plus d'un facteur 3 :
// elles restent affichées avec un avertissement mais sortent du podium et des mouvements.
function sanitizePokemon(items, fx) {
  const groups = new Map();
  for (const [id, v] of Object.entries(items)) {
    if (v[0] == null) continue;
    const k = (id.startsWith('jp-') ? id.split('-').slice(0, 2).join('-') : id.split('-')[0]) + '|' + v.slice(0, 5).join(',');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(id);
  }
  let dup = 0, swapped = 0;
  for (const ids of groups.values()) {
    if (ids.length < 3) continue;
    for (const id of ids) { const v = items[id]; v[0] = v[1] = v[2] = v[3] = v[4] = null; dup++; }
  }
  for (const [id, v] of Object.entries(items)) {
    v[6] = 'cm';
    const tpEur = v[5] != null ? v[5] * fx.usdEur : null;
    if (v[0] == null) { if (tpEur != null) { v[0] = round(tpEur); v[6] = 'tp'; } else delete items[id]; continue; }
    if (tpEur != null && tpEur >= 2 && (v[0] / tpEur > 3 || v[0] / tpEur < 1 / 3)) { v[6] = 'x'; swapped++; }
  }
  log('Pokémon contrôle : valeurs dupliquées écartées', dup, 'sources divergentes signalées', swapped);
  return items;
}

// Cartes japonaises (catalogue db/catalog/pokemon-ja.json) : prix Cardmarket des produits japonais via TCGdex
async function pokemonJaPrices(jaCatalog) {
  const items = {};
  if (!jaCatalog?.cards?.length) return { items, latest: null };
  let latest = null, done = 0, fails = 0;
  const ids = jaCatalog.cards.map((c) => c[0]);
  await pool(ids, 12, async (id) => {
    try {
      const c = await getJSON('https://api.tcgdex.net/v2/ja/cards/' + encodeURIComponent(id.slice(3)), { tries: 3 });
      const cm = c.pricing?.cardmarket || c.variants_detailed?.find((v) => v.pricing?.cardmarket)?.pricing?.cardmarket || null;
      if (cm) { const it = pokemonItem(cm, null); if (it && it[0] != null && it[3] != null && Math.abs(it[0] - it[3]) / it[3] > 0.4) it[0] = it[3]; /* marché japonais peu échangé : la tendance s'emballe, on garde la moyenne 30 j */ if (it && it[0] != null) { items[id] = it; if (cm.updated && (!latest || cm.updated > latest)) latest = cm.updated; } }
    } catch { fails++; }
    if (++done % 3000 === 0) log('JP', done, '/', ids.length, 'échecs', fails);
  });
  log('Pokémon JP : prix', Object.keys(items).length, '/', ids.length, 'échecs', fails);
  return { items, latest };
}

async function pokemon(catalog, fx) {
  const ids = new Set(catalog.cards.map((c) => c[0]));
  let r = null;
  try { r = await pokemonTcgIo(ids); log('pokemontcg prix', Object.keys(r.items).length); } catch (e) { log('pokemontcg indisponible :', e.message); }
  // pokemontcg.io répond parfois partiellement : on complète les cartes manquantes avec TCGdex
  const prevCount = Object.keys(readJSON(path.join(DB, 'prices', 'pokemon.json'), { items: {} }).items || {}).filter((k) => !k.startsWith('jp-')).length;
  if (!r || Object.keys(r.items).length < Math.max(1000, prevCount * 0.9, catalog.cards.length * 0.8)) {
    try {
      const t = await tcgdex(catalog);
      if (!r) r = t;
      else { let added = 0; for (const [id, v] of Object.entries(t.items)) if (!r.items[id]) { r.items[id] = v; added++; } log('complément TCGdex', added); if (added) r.name += ' (complété par TCGdex)'; }
    } catch (e) { log('tcgdex indisponible :', e.message); if (!r) throw e; }
  }
  sanitizePokemon(r.items, fx);
  try {
    const ja = await pokemonJaPrices(readJSON(path.join(DB, 'catalog', 'pokemon-ja.json'), null));
    sanitizePokemon(ja.items, fx);
    Object.assign(r.items, ja.items);
    r.jaCount = Object.keys(ja.items).length; r.jaLatest = ja.latest;
  } catch (e) { log('Pokémon JP indisponible :', e.message); }
  return {
    game: 'pokemon', updatedAt: now.toISOString(), sourceDate: r.latest,
    source: { name: r.name, url: r.url, currency: 'EUR', fx, ja: r.jaCount ? { name: 'Cardmarket (produits japonais) via api.tcgdex.net', url: 'https://tcgdex.dev', count: r.jaCount, date: r.jaLatest } : null },
    fields: ['eur', 'eur_avg1', 'eur_avg7', 'eur_avg30', 'eur_low', 'usd_tcgplayer', 'eur_source'], items: r.items,
  };
}

// ---------- Historique ----------
// Une valeur isolée qui s'écarte d'un facteur 6 de ses deux voisines (ou 20 au bord) est une erreur de source
// (ex. 0,02 € renvoyé un jour pour une carte à 900 €) : on l'efface plutôt que de fausser courbes et mouvements.
function cleanSeries(s) {
  let n = 0;
  const near = (i, dir) => { for (let j = i + dir; j >= 0 && j < s.length; j += dir) if (s[j] != null) return s[j]; return null; };
  const out = (v, x, k) => x != null && (v > x * k || v < x / k);
  // 1) valeurs encadrées par deux relevés cohérents entre eux, d'abord ; 2) puis les bords
  for (let i = 0; i < s.length; i++) { const v = s[i]; if (v == null) continue; const a = near(i, -1), b = near(i, 1); if (a != null && b != null && out(v, a, 6) && out(v, b, 6)) { s[i] = null; n++; } }
  for (let i = 0; i < s.length; i++) { const v = s[i]; if (v == null) continue; const a = near(i, -1), b = near(i, 1); if (a == null && b != null) { const c = (() => { let k = 0; for (let j = i + 1; j < s.length; j++) if (s[j] != null && ++k === 2) return s[j]; return null; })(); if (out(v, b, 20) && (c == null || !out(b, c, 6))) { s[i] = null; n++; } } }
  return n;
}

function updateHistory(game, catalog, prices) {
  const bySet = new Map();
  for (const c of catalog.cards) { if (!bySet.has(c[2])) bySet.set(c[2], []); bySet.get(c[2]).push(c[0]); }
  for (const [set, cardIds] of bySet) {
    const p = path.join(DB, 'history', game, set + '.json');
    const h = readJSON(p, { d: [], p: {} });
    let idx = h.d.indexOf(today);
    if (idx === -1) { h.d.push(today); idx = h.d.length - 1; for (const k in h.p) h.p[k].push(null); }
    let any = false;
    for (const id of cardIds) {
      const v = prices.items[id]?.[0] ?? null;
      if (v == null && !h.p[id]) continue;
      if (!h.p[id]) h.p[id] = new Array(h.d.length).fill(null);
      h.p[id][idx] = v;
      if (v != null) any = true;
    }
    for (const k in h.p) cleanSeries(h.p[k]);
    const extra = h.d.length - HISTORY_DAYS;
    if (extra > 0) { h.d.splice(0, extra); for (const k in h.p) h.p[k].splice(0, extra); }
    if (any || fs.existsSync(p)) writeJSON(p, h);
  }
}

function lastTwo(series) {
  let a = null, b = null;
  for (let i = series.length - 1; i >= 0; i--) { if (series[i] == null) continue; if (b == null) b = series[i]; else { a = series[i]; break; } }
  return [a, b];
}

function market(cats, all, fx) {
  const out = { updatedAt: now.toISOString(), fx, games: {} };
  for (const [game, cat] of Object.entries(cats)) {
    const prices = all[game];
    const byId = new Map(cat.cards.map((c) => [c[0], c]));
    const list = Object.entries(prices.items).filter(([, v]) => v[0] != null && v[6] !== 'x').map(([id, v]) => ({ id, eur: v[0], c: byId.get(id) })).filter((x) => x.c);
    list.sort((a, b) => b.eur - a.eur);
    // Podium : cartes internationales (FR / EN) seulement, sans les cartes japonaises
    const podium = list.filter((x) => !x.id.startsWith('jp-')).slice(0, 25).map((x) => [x.id, x.eur]);

    const day = [], week = [];
    const histDir = path.join(DB, 'history', game);
    for (const f of fs.existsSync(histDir) ? fs.readdirSync(histDir) : []) {
      const h = readJSON(path.join(histDir, f), null); if (!h) continue;
      for (const [id, s] of Object.entries(h.p)) {
        if (prices.items[id]?.[6] === 'x') continue;
        const [a, b] = lastTwo(s);
        const sane = (x, y, k = 5) => x >= 0.5 && y / x <= k && x / y <= k; // écarts plausibles en un jour (×3) / une semaine (×5)
        if (a != null && b != null && b >= 5 && a !== b && sane(a, b, 3)) day.push([id, a, b, round(((b - a) / a) * 100)]);
        const n = s.length; const old = s.slice(Math.max(0, n - 8), Math.max(0, n - 6)).find((v) => v != null);
        if (old != null && b != null && b >= 5 && n >= 7 && old !== b && sane(old, b)) week.push([id, old, b, round(((b - old) / old) * 100)]);
      }
    }
    // Pokémon : tendance sur 7 jours fournie par Cardmarket (moyenne 7 j vs moyenne 30 j)
    if (game === 'pokemon' && week.length < 20) {
      for (const [id, v] of Object.entries(prices.items)) {
        const [eur, , a7, a30] = v;
        if (v[6] !== 'cm' || eur == null || a7 == null || a30 == null) continue;
        if (Math.abs(eur - a7) / a7 > 0.5) continue; // moyenne 7 j trop éloignée de la tendance : peu d'échanges
        if (v[1] != null && Math.abs(v[1] - a7) / a7 > 0.6) continue; // moyenne 1 j incohérente
        if (eur >= 10 && a30 >= 10 && a7 !== a30) week.push([id, a30, a7, round(((a7 - a30) / a30) * 100), 'cm']);
      }
    }
    const sortUp = (a, b) => b[3] - a[3];
    const pick = (arr) => ({ up: arr.filter((x) => x[3] > 0).sort(sortUp).slice(0, 12), down: arr.filter((x) => x[3] < 0).sort((a, b) => a[3] - b[3]).slice(0, 12) });
    const total = list.reduce((s, x) => s + x.eur, 0);
    out.games[game] = {
      source: prices.source, sourceDate: prices.sourceDate, priced: list.length, cards: cat.cards.length,
      podium, day: pick(day), week: pick(week), weekNote: week.some((x) => x[4] === 'cm') ? 'Moyenne Cardmarket sur 7 jours comparée à la moyenne sur 30 jours' : 'Écart entre le relevé d’il y a 7 jours et celui du jour',
      marketCap: round(total),
    };
  }
  return out;
}

// ---------- Programme ----------
const cats = { onepiece: readJSON(path.join(DB, 'catalog', 'onepiece.json')), pokemon: readJSON(path.join(DB, 'catalog', 'pokemon.json')) };
// Les cartes japonaises rejoignent le catalogue Pokémon pour l'historique et le marché
const jaCat = readJSON(path.join(DB, 'catalog', 'pokemon-ja.json'), null);
const catsAll = { ...cats, pokemon: jaCat ? { ...cats.pokemon, sets: [...cats.pokemon.sets, ...jaCat.sets], cards: [...cats.pokemon.cards, ...jaCat.cards] } : cats.pokemon };
const fx = await usdToEur();
log('taux USD→EUR', fx);
const all = {};
const failures = [];
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
for (const [game, fn] of [['onepiece', onePiece], ['pokemon', pokemon]]) {
  if (only && !only.includes(game)) { all[game] = readJSON(path.join(DB, 'prices', game + '.json'), { game, items: {}, source: null, sourceDate: null }); continue; }
  try {
    const res = await fn(cats[game], fx);
    if (Object.keys(res.items).length < 50) throw new Error('trop peu de prix relevés (' + Object.keys(res.items).length + ')');
    // Garde-fou : une source qui répond à moitié ne doit pas effacer les prix de la veille
    const before = Object.keys(readJSON(path.join(DB, 'prices', game + '.json'), { items: {} }).items || {}).length;
    if (before && Object.keys(res.items).length < before * 0.7) throw new Error(`relevé incomplet (${Object.keys(res.items).length} prix contre ${before} la veille)`);
    all[game] = res;
    writeJSON(path.join(DB, 'prices', game + '.json'), res);
    updateHistory(game, catsAll[game], res);
  } catch (e) {
    failures.push(game + ': ' + e.message);
    log('ÉCHEC', game, e.message);
    const prev = readJSON(path.join(DB, 'prices', game + '.json'), null);
    if (prev) { all[game] = prev; log('on garde le relevé précédent du', prev.updatedAt); }
    else all[game] = { game, items: {}, source: null, sourceDate: null };
  }
}
writeJSON(path.join(DB, 'market.json'), { ...market(catsAll, all, fx), failures });
log('terminé', failures.length ? 'avec échecs : ' + failures.join(' | ') : 'sans échec');
if (failures.length === 2) process.exit(1);
