// Construit le catalogue compact de NEXUS V2 à partir des fichiers data/cards-*.json
// Sortie : db/catalog/onepiece.json et db/catalog/pokemon.json
// Chaque carte : [id, nom, codeSet, numéro, rareté, image, variante, type]
// Les images sont compressées : "@o/" optcgapi, "@p/" pokemontcg.io, "@s/" scrydex.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, process.argv[2] || 'data');
const OUT = path.join(ROOT, 'db', 'catalog');
fs.mkdirSync(OUT, { recursive: true });

const PREFIX = [
  ['https://optcgapi.com/media/static/Card_Images/', '@o/'],
  ['https://images.pokemontcg.io/', '@p/'],
  ['https://images.scrydex.com/pokemon/', '@s/'],
];
const pack = (u) => {
  if (!u) return '';
  for (const [a, b] of PREFIX) if (u.startsWith(a)) return b + u.slice(a.length);
  return u;
};

// Noms français des Pokémon (PokéAPI) pour chercher « Dracaufeu » comme « Charizard »
const dexPath = path.join(SRC, 'pokedex-list.json');
const species = fs.existsSync(dexPath) ? JSON.parse(fs.readFileSync(dexPath, 'utf8')).species : (fs.existsSync(path.join(ROOT, 'db', 'species-fr.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'db', 'species-fr.json'), 'utf8')) : []);
const enFr = species.filter((x) => x.name_en && x.name_fr).map((x) => [x.name_en, x.name_fr]).sort((a, b) => b[0].length - a[0].length);
fs.mkdirSync(path.join(ROOT, 'db'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'db', 'species-fr.json'), JSON.stringify(species.map((x) => ({ name_en: x.name_en, name_fr: x.name_fr }))));
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const frRules = enFr.filter(([en, fr]) => en !== fr).map(([en, fr]) => [new RegExp('(^|[^A-Za-z])' + esc(en) + '(?![A-Za-z])'), fr]);
function frName(name) {
  for (const [re, fr] of frRules) if (re.test(name)) return name.replace(re, (m, a) => a + fr);
  return '';
}

const games = { onepiece: { sets: new Map(), cards: [] }, pokemon: { sets: new Map(), cards: [] } };
const files = fs.readdirSync(SRC).filter((f) => /^cards-\d+\.json$/.test(f));
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
  for (const s of Object.values(j.sets)) {
    const g = games[s.set.gameId];
    if (!g) continue;
    const set = s.set;
    if (!g.sets.has(set.code)) {
      g.sets.set(set.code, { code: set.code, name: set.name, series: set.series || '', date: set.releaseDate || null, logo: pack(set.logo), printed: set.printedTotal || null, count: 0 });
    }
    const meta = g.sets.get(set.code);
    for (const c of s.cards) {
      if (s.set.gameId === 'onepiece') {
        for (const v of c.variants) {
          const file = (v.image || '').split('/').pop() || '';
          const id = file.replace(/\.(jpg|png|webp)$/i, '') || c.number;
          let label = '';
          if (v.code.startsWith('parallel')) label = 'Parallèle' + (v.code === 'parallel-1' ? '' : ' ' + v.code.split('-')[1]);
          else if (v.code.startsWith('r-')) label = 'Réimpression' + (v.code === 'r-1' ? '' : ' ' + v.code.split('-')[1]);
          g.cards.push([id, c.name, set.code, c.number, c.rarity || '', pack(v.image || c.imageSmall), label, c.supertype || '']);
          meta.count++;
        }
      } else {
        const id = `${set.code}-${c.number}`;
        if (g.seen?.has(id)) continue;
        (g.seen ||= new Set()).add(id);
        g.cards.push([id, c.name, set.code, c.number, c.rarity || '', pack(c.imageSmall), '', c.supertype || '', c.supertype === 'Pokémon' ? frName(c.name) : '']);
        meta.count++;
      }
    }
  }
}

const opOrder = (code) => {
  const m = /^([A-Z]+)(\d+)/.exec(code) || [];
  const fam = { OP: 0, EB: 1, PRB: 2, ST: 3 }[m[1]] ?? 4;
  return [fam, -(+m[2] || 0)];
};
for (const [name, g] of Object.entries(games)) {
  let sets = [...g.sets.values()];
  if (name === 'onepiece') {
    sets.sort((a, b) => { const x = opOrder(a.code), y = opOrder(b.code); return x[0] - y[0] || x[1] - y[1]; });
  } else {
    sets.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.code.localeCompare(b.code));
  }
  const numKey = (n) => { const m = /(\d+)/.exec(n || ''); return m ? +m[1] : 9999; };
  g.cards.sort((a, b) => a[2].localeCompare(b[2]) || numKey(a[3]) - numKey(b[3]) || a[0].localeCompare(b[0]));
  const out = {
    game: name,
    builtAt: new Date().toISOString(),
    fields: ['id', 'name', 'set', 'number', 'rarity', 'image', 'variant', 'type', 'name_fr'],
    sets: sets.map((s) => [s.code, s.name, s.series, s.date, s.count, s.logo, s.printed]),
    cards: g.cards,
  };
  fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(out));
  console.log(name, 'sets', sets.length, 'cartes', g.cards.length);
}
