// Construit les données compactes du Pokédex et de l'Équipage (One Piece) à partir de l'export data/
// Sortie : db/pokedex/list.json, db/pokedex/d-<n>.json (100 espèces par fichier), db/equipage.json
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'data');
const OUT = path.join(ROOT, 'db');
const read = (f) => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));

// Identifiants des cartes de l'ancien export → identifiants du catalogue V2
const crdToId = new Map();
const opNumberOf = new Map();
for (const f of fs.readdirSync(SRC).filter((f) => /^cards-\d+\.json$/.test(f))) {
  for (const s of Object.values(read(f).sets)) for (const c of s.cards) {
    if (c.gameId === 'pokemon') crdToId.set(c.id, `${s.set.code}-${c.number}`);
    else opNumberOf.set(c.id, c.number);
  }
}

// ---------- Pokédex ----------
const list = read('pokedex-list.json');
const types = read('pokedex-types.json').types.map((t) => [t.id, t.name_fr, t.name_en, t.identifier]);
const species = list.species.map((s) => [s.id, s.name_fr, s.name_en, s.generation_id, s.type1_id, s.type2_id || 0,
  s.hp + s.attack + s.defense + s.sp_attack + s.sp_defense + s.speed, (s.is_legendary ? 1 : 0) | (s.is_mythical ? 2 : 0) | (s.is_baby ? 4 : 0), s.cards || 0]);
fs.mkdirSync(path.join(OUT, 'pokedex'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'pokedex', 'list.json'), JSON.stringify({ source: 'PokéAPI (CSV, BSD-3-Clause)', types, species }));

const art = (u) => { const m = /\/(\d+)\.png$/.exec(u || ''); return m ? +m[1] : null; };
const chunks = {};
let nCards = 0;
for (const f of fs.readdirSync(SRC).filter((f) => /^dex-\d+\.json$/.test(f))) {
  for (const [id, e] of Object.entries(read(f).species)) {
    const k = Math.floor((+id - 1) / 100);
    const sp = e.species;
    const forms = e.forms.map((fo) => [
      fo.identifier, fo.formName || '', fo.isMega ? 1 : 0, fo.isBattleOnly ? 1 : 0, fo.height, fo.weight,
      ['hp', 'attack', 'defense', 'sp_attack', 'sp_defense', 'speed'].map((x) => fo.stats?.[x] ?? 0),
      (fo.types || []).map((t) => t.id), art(fo.artwork),
      (fo.abilities || []).map((a) => [a.name, a.flavor_fr || '', a.is_hidden ? 1 : 0]),
      Object.fromEntries((fo.defensive || []).filter((d) => d.multiplier !== 1).map((d) => [d.typeId, d.multiplier])),
    ]);
    const evo = (e.evolution || []).map((x) => [x.id, x.name, x.evolvesFromId || 0, (x.conditions || []).map((c) => c.text).filter(Boolean).join(' · ')]);
    const cards = [...new Set((e.cards || []).map((c) => crdToId.get(c)).filter(Boolean))];
    nCards += cards.length;
    (chunks[k] ||= {})[id] = { genus: sp.genus || '', ja: sp.nameJa || '', flavor: sp.flavor || '', fv: sp.flavorVersion || '', capture: sp.captureRate, gender: sp.genderRate, forms, evo, cards };
  }
}
for (const [k, v] of Object.entries(chunks)) fs.writeFileSync(path.join(OUT, 'pokedex', `d-${k}.json`), JSON.stringify(v));
console.log('Pokédex :', species.length, 'espèces,', Object.keys(chunks).length, 'fichiers,', nCards, 'liens vers des cartes');

// ---------- Équipage ----------
const eq = read('equipage.json');
const details = {};
for (const f of fs.readdirSync(SRC).filter((f) => /^equipage-\d+\.json$/.test(f))) Object.assign(details, read(f));
const imgId = (u) => (u || '').split('/').pop().replace(/\.(jpg|png|webp)$/i, '');
const members = eq.members.map((m) => {
  const d = details[m.slug] || {};
  const numbers = [...new Set((d.cards || []).map((c) => c.number || opNumberOf.get(c.id)).filter(Boolean))];
  return [m.slug, m.name, m.leader ? 1 : 0, m.colors || [], m.traits || [], m.attributes || [], imgId(m.image), m.cards, m.versions, d.power || null, d.cost || null, numbers];
});
fs.writeFileSync(path.join(OUT, 'equipage.json'), JSON.stringify({
  source: eq.source, attributes: eq.attributes,
  affiliations: eq.affiliations.map((a) => [a.id, a.label, a.count]),
  fields: ['slug', 'name', 'leader', 'colors', 'traits', 'attributes', 'image', 'cards', 'versions', 'power', 'cost', 'numbers'],
  members,
}));
console.log('Équipage :', members.length, 'personnages');
