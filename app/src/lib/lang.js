// Langue d'affichage des cartes : EN (version internationale), FR (noms et images officiels FR),
// JP (noms et images officiels JP pour One Piece ; cartes japonaises séparées pour Pokémon).
// Les traductions sont appliquées directement aux objets cartes du catalogue (les originaux restent dans card.en).
import { normalize, BASE } from './data.js';

export const LANGS = [['en', 'EN', 'Anglais'], ['fr', 'FR', 'Français'], ['ja', 'JP', 'Japonais']];
const cache = new Map();
function load(file) {
  if (!cache.has(file)) cache.set(file, fetch(BASE + 'lang/' + file, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return cache.get(file);
}

// Quelques noms officiels arrivent avec des entités HTML (« L&apos;HÉRITAGE ») : on les décode
const ENT = { '&apos;': '’', '&#39;': '’', '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>' };
const decode = (t) => (typeof t === 'string' && t.includes('&') ? t.replace(/&(apos|#39|quot|amp|lt|gt);/g, (m) => ENT[m]) : t);

// Version locale de l'image One Piece : seulement la carte de base et la 1re parallèle (même illustration dans toutes les langues)
const opLocalOk = (id) => !id.includes('_') || /_p1$/.test(id);

export async function applyLang(cats, lang) {
  const [opT, pkT] = await Promise.all([
    lang === 'en' ? null : load(`onepiece-${lang}.json`),
    lang === 'fr' ? load('pokemon-fr.json') : null,
  ]);
  for (const [game, g] of Object.entries(cats)) {
    for (const s of g.setList) {
      s.en ??= { name: s.name, logo: s.logo };
      s.name = s.en.name; s.logo = s.en.logo; s.local = false;
    }
    for (const c of g.cards) {
      if (c.lang === 'ja') continue; // cartes japonaises Pokémon : déjà en japonais
      c.en ??= { name: c.name, image: c.image };
      c.name = c.en.name; c.image = c.en.image; c.local = '';
      if (game === 'onepiece' && opT) {
        const n = opT.cards[c.id] || (c.id.includes('_') ? opT.cards[c.id.split('_')[0]] : null);
        if (n) { c.name = decode(n); c.local = lang; if (opLocalOk(c.id) && opT.cards[c.id]) c.image = opT.img + c.id + '.' + (opT.ext || 'png'); }
      }
      if (game === 'pokemon' && pkT) {
        const t = pkT.cards[c.id];
        if (t) { c.name = t[0]; c.local = 'fr'; if (t[1]) c.image = '@t/' + t[1]; }
      }
      c.q = normalize([c.name, c.en.name, c.nameFr, c.number, c.variant, c.set].join(' '));
    }
    const setT = game === 'onepiece' ? opT?.sets : pkT?.sets;
    if (setT) for (const s of g.setList) {
      const t = setT[s.code];
      if (!t) continue;
      const name = Array.isArray(t) ? t[0] : t;
      if (name) { s.name = decode(name); s.local = lang; }
      if (Array.isArray(t) && t[1]) s.logo = '@t/' + t[1];
    }
  }
}

// Les images TCGdex sont stockées sans domaine (« ja/SV/SV1V/001 ») : on ajoute le préfixe compris par img()
const tcgdexImg = (u) => (!u ? '' : /^(@|https?:)/.test(u) ? u : '@t/' + u);

// Cartes Pokémon japonaises : catalogue séparé, ajouté au catalogue Pokémon une fois chargé
let jaPromise = null;
export function loadJapanese(cats) {
  jaPromise ??= fetch(BASE + 'catalog/pokemon-ja.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => {
    if (!j) return false;
    const g = cats.pokemon;
    for (const [code, name, series, date, count, logo, printed] of j.sets) {
      if (g.sets.has(code)) continue;
      const s = { code, name, series, date, count, logo: tcgdexImg(logo), printed, game: 'pokemon', lang: 'ja', order: g.setList.length };
      g.sets.set(code, s); g.setList.push(s);
    }
    for (const [id, name, set, number, rarity, image, variant, type, nameFr, nameEn] of j.cards) {
      if (g.byId.has(id)) continue;
      const c = { id, key: 'pokemon:' + id, game: 'pokemon', lang: 'ja', name, set, number, rarity, image: tcgdexImg(image), variant, type, nameFr: nameFr || '', nameEn: nameEn || '' };
      c.q = normalize([name, nameFr, nameEn, number, set, 'jp japonais japanese'].join(' '));
      g.cards.push(c); g.byId.set(id, c);
      if (!g.bySet.has(set)) g.bySet.set(set, []);
      g.bySet.get(set).push(c);
    }
    return true;
  });
  return jaPromise;
}
