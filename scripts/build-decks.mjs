// Decks préconstruits de la section « Jouer » (lancé par GitHub Actions, voir .github/workflows/decks.yml) :
//  db/decks/index.json             liste des decks des deux jeux (nom, couleur, carte de couverture…)
//  db/decks/onepiece/<id>.json     One Piece : decks recommandés du site officiel (listes complètes, 1 Leader + 50 cartes),
//                                  avec le détail de chaque carte (coût, puissance, contre, effet en français si disponible)
//  db/decks/pokemon/<id>.json      Pokémon : decks à thème officiels (60 cartes, base publique pokemon-tcg-data),
//                                  avec PV, stade, attaques, talents, faiblesse, résistance et retraite
// ONLY=onepiece ou ONLY=pokemon pour ne refaire qu'un jeu ; PKDATA=<dossier> pour lire pokemon-tcg-data sur le disque.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'db', 'decks');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJSON = (p, f) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return f; } };
const writeJSON = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v)); };
const UA = 'Kirakai-decks-bot (github.com/NEXUS44567/KirakaiTCG)';
const ONLY = process.env.ONLY || '';

async function get(url, { json = false, tries = 4 } = {}) {
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
const ent = (s) => String(s ?? '').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const txt = (s) => ent(String(s ?? '').replace(/<br[^>]*>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
const isoDate = (s) => { const t = Date.parse(String(s || '') + ' 12:00 UTC'); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : ''; };
const num = (s) => { const n = parseInt(String(s).replace(/[^\d-]/g, ''), 10); return Number.isFinite(n) ? n : null; };

// =====================================================================
// One Piece
// =====================================================================
const OP_SITES = { en: 'https://en.onepiece-cardgame.com', fr: 'https://fr.onepiece-cardgame.com' };

// Toutes les cartes de la liste officielle d'une langue : id → détail
async function opCards(lang) {
  const base = OP_SITES[lang];
  const page = await get(base + '/cardlist/');
  const series = [...new Set([...page.matchAll(/<option value="(\d+)"/g)].map((m) => m[1]))];
  const cards = {};
  for (const s of series) {
    try {
      const t = await get(base + '/cardlist/?series=' + s);
      for (const m of t.matchAll(/<dl class="modalCol" id="([^"]+)">([\s\S]*?)<\/dl>/g)) {
        const id = m[1], b = m[2];
        if (id.includes('_') || cards[id]) continue;
        const info = [...(/<div class="infoCol">([\s\S]*?)<\/div>/.exec(b)?.[1] || '').matchAll(/<span>([^<]*)<\/span>/g)].map((x) => x[1].trim());
        const field = (cls) => { const r = new RegExp(`<div class="${cls}">\\s*<h3>([\\s\\S]*?)<\\/h3>([\\s\\S]*?)<\\/div>`).exec(b); return r ? { label: txt(r[1]), value: r[2] } : null; };
        const cost = field('cost'), power = field('power'), counter = field('counter'), color = field('color'), feature = field('feature'), text = field('text'), trigger = field('trigger');
        const attr = [...(/<div class="attribute">([\s\S]*?)<\/div>/.exec(b)?.[1] || '').matchAll(/<i>([^<]*)<\/i>/g)].map((x) => x[1].trim()).filter(Boolean);
        const isLife = cost && /life|vie/i.test(cost.label);
        cards[id] = {
          id, name: txt(/<div class="cardName">([\s\S]*?)<\/div>/.exec(b)?.[1]), rarity: info[1] || '', cat: (info[2] || '').toUpperCase(),
          cost: isLife ? null : num(txt(cost?.value)), life: isLife ? num(txt(cost?.value)) : null,
          power: num(txt(power?.value)), counter: num(txt(counter?.value)), color: txt(color?.value), attr: attr.join('/'),
          types: txt(feature?.value), text: txt(text?.value).replace(/^-$/, ''), trigger: txt(trigger?.value).replace(/^-$/, ''),
        };
      }
    } catch (e) { log('One Piece', lang, 'série', s, e.message); }
    await sleep(500);
  }
  log('One Piece', lang, 'séries', series.length, 'cartes', Object.keys(cards).length);
  return cards;
}

// Une page « deck recommandé » : liste (id, quantité) — 1 Leader + 50 cartes — et présentation du deck
function opDeckPage(html, cards) {
  const block = /<div class="deckCardlistCol">([\s\S]*?)<\/section>/.exec(html)?.[1] || html;
  const list = [...block.matchAll(/alt="(?:[^"]*?\s)?([A-Z]{2,4}\d{2}-\d{3})[^"]*"[\s\S]*?class="cards_(\d+)"/g)].map((m) => [m[1], +m[2]]);
  const leaders = list.filter(([id]) => cards[id]?.cat === 'LEADER');
  const n = list.reduce((a, [, q]) => a + q, 0);
  if (leaders.length !== 1 || n !== 51) return null;
  return {
    list,
    title: txt(/<h3 class="pageTit"><span>[^<]*<\/span>([\s\S]*?)<\/h3>/.exec(html)?.[1]),
    date: txt(/<span class="pageTitDate">([\s\S]*?)<\/span>/.exec(html)?.[1]),
    catch: txt(/<div class="topCatchphrase">([\s\S]*?)<\/div>/.exec(html)?.[1]),
    concept: txt(/<div class="deckPointCol">\s*<p>([\s\S]*?)<\/p>/.exec(html)?.[1]),
  };
}

async function onePiece() {
  const en = await opCards('en');
  let fr = {};
  try { fr = await opCards('fr'); } catch (e) { log('One Piece fr', e.message); }
  const decks = [];
  const pages = async (lang) => {
    const base = OP_SITES[lang] + '/feature/deck/';
    const idx = await get(base);
    const out = [];
    for (const m of idx.matchAll(/<a[^>]+href="(deck_(\d+)\.php)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const bits = [...m[3].matchAll(/>([^<]+)</g)].map((x) => ent(x[1]).trim()).filter(Boolean);
      const img = /<img[^>]+src="([^"]+)"/.exec(m[3])?.[1] || '';
      out.push({ url: base + m[1], n: m[2], bits, img });
    }
    log('One Piece', lang, 'decks recommandés', out.length, 'exemple', JSON.stringify(out[0]));
    return out;
  };
  const enPages = await pages('en');
  let frPages = []; try { frPages = await pages('fr'); } catch (e) { log('decks fr', e.message); }
  const key = (l) => JSON.stringify([...l].sort());
  const frByList = new Map();
  for (const p of frPages) {
    try { const d = opDeckPage(await get(p.url), en); if (d) frByList.set(key(d.list), d); } catch (e) { log('deck fr', p.url, e.message); }
    await sleep(300);
  }
  for (const p of enPages) {
    try {
      const d = opDeckPage(await get(p.url), en);
      if (!d) { log('deck sans liste complète', p.url); continue; }
      const f = frByList.get(key(d.list));
      const leader = d.list.find(([id]) => en[id]?.cat === 'LEADER')[0];
      const head = (t) => /^\(([^)]+)\)\s*(.*)$/.exec(t) || [null, '', t];
      const [, color, who] = head(d.title), [, colorFr, whoFr] = head(f?.title || '');
      decks.push({
        id: 'op' + p.n, game: 'onepiece', leader, name: whoFr || who, color, colorFr, date: isoDate(d.date),
        title: f?.catch || d.catch, desc: f?.concept || d.concept, lang: f ? 'fr' : 'en', src: p.url,
        cards: d.list.map(([cid, q]) => {
          const c = en[cid], x = fr[cid];
          return { id: cid, n: q, name: x?.name || c.name, name_en: c.name, cat: c.cat, cost: c.cost, life: c.life, power: c.power, counter: c.counter, color: c.color, attr: c.attr, types: x?.types || c.types, text: x?.text || c.text, trigger: x?.trigger || c.trigger };
        }),
      });
    } catch (e) { log('deck', p.url, e.message); }
    await sleep(300);
  }
  log('One Piece : decks complets', decks.length, 'dont en français', decks.filter((d) => d.lang === 'fr').length);
  return decks;
}

// =====================================================================
// Pokémon
// =====================================================================
const PK_RAW = 'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/';
const PK_ENERGY = { 'Grass Energy': 'sm1-164', 'Fire Energy': 'sm1-165', 'Water Energy': 'sm1-166', 'Lightning Energy': 'sm1-167', 'Psychic Energy': 'sm1-168', 'Fighting Energy': 'sm1-169', 'Darkness Energy': 'sm1-170', 'Metal Energy': 'sm1-171', 'Fairy Energy': 'sm1-172' };
const pkRead = async (p) => (process.env.PKDATA ? readJSON(path.join(process.env.PKDATA, p), null) : get(PK_RAW + p, { json: true }).catch(() => null));

async function pokemon() {
  const catalog = readJSON(path.join(ROOT, 'db', 'catalog', 'pokemon.json'), { sets: [], cards: [] });
  const sets = new Map(catalog.sets.map((s) => [s[0], s]));
  const known = new Set(catalog.cards.map((c) => c[0]));
  const ids = [...sets.keys()];
  const decks = [], cardSets = new Map();
  const cardOf = async (id) => {
    const set = id.slice(0, id.lastIndexOf('-'));
    if (!cardSets.has(set)) cardSets.set(set, new Map(((await pkRead(`cards/en/${set}.json`)) || []).map((c) => [c.id, c])));
    return cardSets.get(set).get(id);
  };
  for (const set of ids) {
    const list = await pkRead(`decks/en/${set}.json`);
    if (!Array.isArray(list)) continue;
    for (const d of list) {
      const merged = new Map();
      for (const c of d.cards) {
        const id = c.id.endsWith('-0') && PK_ENERGY[c.name] ? PK_ENERGY[c.name] : c.id; // énergie de base sans numéro dans la source
        merged.set(id, (merged.get(id) || 0) + c.count);
      }
      if ([...merged.keys()].some((id) => !known.has(id))) { log('Pokémon : deck incomplet', d.id); continue; }
      const cards = [];
      for (const [id, n] of merged) {
        const c = await cardOf(id);
        if (!c) { log('Pokémon : carte introuvable', id); continue; }
        cards.push({
          id, n, name: c.name, cat: c.supertype, sub: c.subtypes || [], hp: num(c.hp), types: c.types || [], evolvesFrom: c.evolvesFrom || '',
          abilities: (c.abilities || []).map((a) => ({ name: a.name, text: a.text, type: a.type })),
          attacks: (c.attacks || []).map((a) => ({ name: a.name, cost: a.cost || [], damage: a.damage || '', text: a.text || '' })),
          weak: (c.weaknesses || []).map((w) => w.type + ' ' + w.value).join(', '), resist: (c.resistances || []).map((w) => w.type + ' ' + w.value).join(', '),
          retreat: (c.retreatCost || []).length, rules: c.rules || [],
        });
      }
      if (cards.reduce((a, c) => a + c.n, 0) !== 60) { log('Pokémon : deck de', cards.reduce((a, c) => a + c.n, 0), 'cartes écarté', d.id); continue; }
      const s = sets.get(set);
      const cover = cards.filter((c) => c.cat === 'Pokémon').sort((a, b) => (b.hp || 0) - (a.hp || 0) || a.n - b.n)[0];
      decks.push({ id: d.id, game: 'pokemon', name: d.name, types: d.types || [], set, setName: s[1], series: s[2], date: s[3] || '', cover: cover?.id, cards });
    }
  }
  log('Pokémon : decks complets', decks.length);
  return decks;
}

// =====================================================================
const index = readJSON(path.join(OUT, 'index.json'), { onepiece: [], pokemon: [] });
for (const [game, fn] of [['onepiece', onePiece], ['pokemon', pokemon]]) {
  if (ONLY && ONLY !== game) continue;
  let decks;
  try { decks = await fn(); } catch (e) { log('ÉCHEC', game, e.message); continue; }
  if (decks.length < 5) { log('trop peu de decks pour', game, ': on garde les précédents'); continue; }
  fs.rmSync(path.join(OUT, game), { recursive: true, force: true });
  for (const d of decks) writeJSON(path.join(OUT, game, d.id + '.json'), d);
  index[game] = decks.map(({ cards, src, ...meta }) => ({ ...meta, count: cards.reduce((a, c) => a + c.n, 0), cover: meta.cover || meta.leader }));
}
index.builtAt = new Date().toISOString();
writeJSON(path.join(OUT, 'index.json'), index);
log('terminé :', index.onepiece.length, 'decks One Piece,', index.pokemon.length, 'decks Pokémon');
