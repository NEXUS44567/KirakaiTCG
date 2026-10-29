// Données de langue de NEXUS (lancé chaque semaine par GitHub Actions) :
//  db/lang/pokemon-fr.json   noms et images officiels FR des cartes Pokémon du catalogue (TCGdex)
//  db/catalog/pokemon-ja.json catalogue des cartes Pokémon japonaises (TCGdex), même format que pokemon.json
//  db/lang/onepiece-fr.json  noms FR des cartes One Piece et extensions (liste officielle fr.onepiece-cardgame.com)
//  db/lang/onepiece-ja.json  noms JP des cartes One Piece et extensions (liste officielle www.onepiece-cardgame.com)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DB = path.join(ROOT, 'db');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJSON = (p, f) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return f; } };
const writeJSON = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v)); };
const UA = 'NEXUS-TCG-lang-bot (github.com/NEXUS44567/nexus-tcg)';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);

async function get(url, { json = true, tries = 4 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
      if (r.status === 429 || r.status >= 500) { last = new Error('HTTP ' + r.status); await sleep(3000 * (i + 1)); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
      return json ? await r.json() : await r.text();
    } catch (e) { last = e; await sleep(1500 * (i + 1)); }
  }
  throw last;
}
async function pool(list, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) { const k = i++; await fn(list[k], k); } })); }
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
const ent = (s) => String(s || '').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/<br[^>]*>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
// « BOOSTER -LES GUERRIERS LES PLUS PUISSANTS AU MONDE- [OP-17] » → « Les guerriers les plus puissants au monde »
function setTitle(label, lang) {
  let t = label.replace(/\s*[\[【][^\]】]+[\]】]\s*$/, '').trim();
  const m = /-(.+)-\s*$/.exec(t); if (m) t = m[1].trim();
  if (lang === 'fr' && /[a-z]/.test(t) === false && /[A-Z]/.test(t)) { t = t.toLowerCase(); t = (t.charAt(0).toUpperCase() + t.slice(1)).replace(/one piece/gi, 'One Piece'); }
  return t;
}
const T = 'https://assets.tcgdex.net/';
const packT = (u) => (u && u.startsWith(T) ? u.slice(T.length) : u || '');

// ---------- Pokémon : correspondance des extensions du catalogue avec TCGdex ----------
async function mapPokemonSets(catalog) {
  const sets = await get('https://api.tcgdex.net/v2/en/sets');
  const byName = new Map();
  for (const s of sets) { const k = norm(s.name); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(s); }
  const byId = new Map(sets.map((s) => [s.id.toLowerCase(), s]));
  const idGuess = (code) => [code, code.replace(/^sv(\d)$/, 'sv0$1'), code.replace(/^sv(\d)pt5$/, 'sv0$1.5'), code.replace(/^sv(\d+)pt5$/, 'sv$1.5'), code.replace(/^swsh(\d+)pt5$/, 'swsh$1.5'), code.replace(/^me(\d)$/, 'me0$1'), code.replace(/^me(\d)pt5$/, 'me0$1.5'), code.replace(/pt5$/, '.5')];
  const mapped = [];
  for (const [code, name, , , count] of catalog.sets) {
    let t = null;
    for (const g of idGuess(code)) if (byId.has(g.toLowerCase())) { t = byId.get(g.toLowerCase()); break; }
    if (!t) { const c = byName.get(norm(name)) || []; t = c.length === 1 ? c[0] : c.find((x) => (x.cardCount?.total ?? 0) === count) || c[0] || null; }
    if (t) mapped.push([code, t.id]);
  }
  log('Pokémon : extensions associées à TCGdex', mapped.length, '/', catalog.sets.length);
  return mapped;
}

async function pokemonFr(catalog) {
  const mapped = await mapPokemonSets(catalog);
  const ours = new Map();
  for (const c of catalog.cards) { if (!ours.has(c[2])) ours.set(c[2], new Map()); ours.get(c[2]).set(String(c[3]).replace(/^0+(?=\d)/, '').toLowerCase(), c[0]); }
  const out = { builtAt: new Date().toISOString(), source: 'TCGdex (api.tcgdex.net, fr)', sets: {}, cards: {} };
  let n = 0;
  await pool(mapped, 6, async ([code, tid]) => {
    try {
      const s = await get('https://api.tcgdex.net/v2/fr/sets/' + encodeURIComponent(tid));
      if (s.name) out.sets[code] = [s.name, packT(s.logo)];
      const m = ours.get(code) || new Map();
      for (const c of s.cards || []) {
        const id = m.get(String(c.localId).replace(/^0+(?=\d)/, '').toLowerCase());
        if (id && c.name) { out.cards[id] = [c.name, packT(c.image)]; n++; }
      }
    } catch (e) { log('fr', tid, e.message); }
  });
  log('Pokémon FR : cartes traduites', n, 'extensions', Object.keys(out.sets).length);
  writeJSON(path.join(DB, 'lang', 'pokemon-fr.json'), out);
}

// ---------- Pokémon : catalogue japonais ----------
// Séries retenues : la première génération (PMCG, neo) et les séries modernes (Soleil et Lune → MEGA)
const JA_SERIES = new Set(['PMCG', 'neo', 'SM', 'S', 'SV', 'M']);
async function pokemonJa() {
  const species = readJSON(path.join(DB, 'species-fr.json'), []);
  const sets = await get('https://api.tcgdex.net/v2/ja/sets');
  const details = [];
  await pool(sets, 6, async (s) => { try { const d = await get('https://api.tcgdex.net/v2/ja/sets/' + encodeURIComponent(s.id)); if (JA_SERIES.has(d.serie?.id) && d.cards?.length) details.push(d); } catch (e) { log('ja set', s.id, e.message); } });
  details.sort((a, b) => String(b.releaseDate || '').localeCompare(String(a.releaseDate || '')) || a.id.localeCompare(b.id));
  const jobs = details.flatMap((d) => d.cards.map((c) => [d, c]));
  log('Pokémon JP : extensions', details.length, 'cartes', jobs.length);
  const cards = new Map();
  let fails = 0, done = 0;
  await pool(jobs, 12, async ([d, c]) => {
    let x = null;
    try { x = await get('https://api.tcgdex.net/v2/ja/cards/' + encodeURIComponent(c.id), { tries: 3 }); } catch { fails++; }
    const dex = x?.dexId?.[0];
    const sp = dex ? species[dex - 1] : null;
    const cat = x?.category === 'Pokemon' ? 'Pokémon' : x?.category === 'Trainer' ? 'Trainer' : x?.category === 'Energy' ? 'Energy' : (x?.category || '');
    cards.set(c.id, ['jp-' + c.id, c.name || x?.name || '', 'jp-' + d.id, String(c.localId), x?.rarity && x.rarity !== 'None' ? x.rarity : '', packT(c.image || x?.image), '', cat, sp?.name_fr || '', sp?.name_en || '']);
    if (++done % 2000 === 0) log('JP', done, '/', jobs.length, 'échecs', fails);
  });
  const order = new Map(jobs.map(([, c], i) => [c.id, i]));
  const out = {
    game: 'pokemon', lang: 'ja', builtAt: new Date().toISOString(), source: 'TCGdex (api.tcgdex.net, ja)',
    fields: ['id', 'name', 'set', 'number', 'rarity', 'image', 'variant', 'type', 'name_fr', 'name_en'],
    sets: details.map((d) => ['jp-' + d.id, d.name, d.serie?.name || '', d.releaseDate || null, d.cards.length, packT(d.logo), d.cardCount?.official || null]),
    cards: [...cards.values()].sort((a, b) => order.get(a[0].slice(3)) - order.get(b[0].slice(3))),
  };
  log('Pokémon JP : catalogue', out.cards.length, 'cartes, avec image', out.cards.filter((c) => c[5]).length, 'échecs', fails);
  if (out.cards.length > 1000) writeJSON(path.join(DB, 'catalog', 'pokemon-ja.json'), out);
}

// ---------- One Piece : listes officielles FR et JP ----------
async function onePiece(lang, base, catalog) {
  const page = await get(base + '/cardlist/', { json: false });
  const series = [...page.matchAll(/<option value="(\d+)"[^>]*>([^<]*)<\/option>/g)].map((m) => [m[1], ent(m[2])]);
  const known = new Set(catalog.cards.map((c) => c[0]));
  const out = { builtAt: new Date().toISOString(), source: base + '/cardlist/', img: base + '/images/cardlist/card/', ext: '', sets: {}, cards: {} };
  log('One Piece', lang, 'séries', series.length);
  for (const [id, label] of series) {
    try {
      const t = await get(base + '/cardlist/?series=' + id, { json: false });
      const code = (/[\[【]([A-Z]+)-?(\d+)[\]】]/.exec(label) || []).slice(1).join('');
      if (code) out.sets[code] = setTitle(label, lang);
      for (const m of t.matchAll(/<dl class="modalCol" id="([^"]+)">[\s\S]*?<div class="cardName">([\s\S]*?)<\/div>[\s\S]*?data-src="[^"]*cardlist\/card\/[^".]+\.(\w+)/g)) {
        const cid = m[1], name = ent(m[2]);
        if (!out.ext) out.ext = m[3];
        if (!out.cards[cid]) out.cards[cid] = name;
      }
    } catch (e) { log('One Piece', lang, 'série', id, e.message); }
    await sleep(800);
  }
  const n = Object.keys(out.cards).length, hit = Object.keys(out.cards).filter((k) => known.has(k)).length;
  log('One Piece', lang, 'cartes', n, 'dont présentes dans le catalogue', hit, 'extensions', Object.keys(out.sets).length, 'format', out.ext);
  if (n > 100) writeJSON(path.join(DB, 'lang', `onepiece-${lang}.json`), out);
}

const pk = readJSON(path.join(DB, 'catalog', 'pokemon.json'));
const op = readJSON(path.join(DB, 'catalog', 'onepiece.json'));
const tasks = [
  ['pokemon-fr', () => pokemonFr(pk)],
  ['pokemon-ja', () => pokemonJa()],
  ['onepiece-fr', () => onePiece('fr', 'https://fr.onepiece-cardgame.com', op)],
  ['onepiece-ja', () => onePiece('ja', 'https://www.onepiece-cardgame.com', op)],
];
const failures = [];
for (const [k, fn] of tasks) { if (!want(k)) continue; try { await fn(); } catch (e) { failures.push(k + ': ' + e.message); log('ÉCHEC', k, e.message); } }
log('terminé', failures.length ? failures.join(' | ') : 'sans échec');
