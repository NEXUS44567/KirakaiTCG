// Apparence de la carte de membre : couleur, motif, finition, titre, emblèmes et carte fétiche.
// Seuls des choix de ces listes sont enregistrés et publiés (aucun texte libre) ; une valeur inconnue revient au défaut.

// Couleurs : trois teintes (lueur haute, éclat, lueur basse) ; « kirakai » suit l'univers du moment
export const THEMES = {
  kirakai: { label: 'Kirakai', c: null },
  ocean: { label: 'Grand Line', c: ['#1fa2ff', '#12d8fa', '#1d4ed8'] },
  shanks: { label: 'Le Roux', c: ['#ff4d4f', '#ff9f43', '#9f1239'] },
  tresor: { label: 'Trésor', c: ['#ffd36b', '#f59e0b', '#a16207'] },
  eclair: { label: 'Éclair', c: ['#ffe14d', '#ffb300', '#ca8a04'] },
  psy: { label: 'Psy', c: ['#b57bff', '#ff6bd6', '#6d28d9'] },
  foret: { label: 'Forêt', c: ['#34d399', '#a3e635', '#047857'] },
  minuit: { label: 'Minuit', c: ['#6366f1', '#22d3ee', '#312e81'] },
  sakura: { label: 'Sakura', c: ['#ff8fc7', '#ffd1e8', '#be185d'] },
  givre: { label: 'Givre', c: ['#a5f3fc', '#e0f2fe', '#0e7490'] },
};
export const MOTIFS = { lignes: 'Lignes', vagues: 'Vagues', etoiles: 'Étoiles', hexa: 'Alvéoles', aucun: 'Uni' };
export const FINISHES = { holo: 'Holographique', or: 'Feuille d’or', mat: 'Mat' };
export const EMBLEMS = { both: 'Les deux', onepiece: 'One Piece', pokemon: 'Pokémon' };

// Titres : certains se débloquent en jouant (p = { cards, value, opened, ach, watch, streak, completeOp, completePk })
export const TITLES = [
  { id: 'collectionneur', label: 'Collectionneur One Piece et Pokémon' },
  { id: 'pirate', label: 'Pirate de Grand Line' },
  { id: 'dresseur', label: 'Dresseur Pokémon' },
  { id: 'chasseur', label: 'Chasseur de cartes', need: '10 cartes en collection', ok: (p) => p.cards >= 10 },
  { id: 'ouvreur', label: 'Ouvreur de boosters', need: '25 boosters ouverts', ok: (p) => p.opened >= 25 },
  { id: 'marche', label: 'Œil du marché', need: '5 alertes de prix', ok: (p) => p.watch >= 5 },
  { id: 'fidele', label: 'Fidèle au poste', need: '7 jours de suite', ok: (p) => p.streak >= 7 },
  { id: 'tresor', label: 'Gardien du trésor', need: 'collection de plus de 1 000 €', ok: (p) => p.value >= 1000 },
  { id: 'legende', label: 'Légende vivante', need: '20 succès', ok: (p) => p.ach >= 20 },
  { id: 'empereur', label: 'Empereur des mers', need: 'une extension One Piece complète', ok: (p) => p.completeOp >= 1 },
  { id: 'maitre', label: 'Maître Pokémon', need: 'une extension Pokémon complète', ok: (p) => p.completePk >= 1 },
];
const TITLE = Object.fromEntries(TITLES.map((t) => [t.id, t]));
export const titleOk = (id, p) => !!TITLE[id] && (!TITLE[id].ok || (p && TITLE[id].ok(p)));
export const titleLabel = (id) => TITLE[id]?.label || TITLES[0].label;

const KEY_RE = /^(onepiece|pokemon):[A-Za-z0-9._-]{1,40}$/;
export const DEFAULT_LOOK = { theme: 'kirakai', motif: 'lignes', finish: 'holo', title: 'collectionneur', emb: 'both', fav: null };

// Apparence propre à partir de n'importe quoi (sauvegarde, profil public d'un autre joueur)
export function lookOf(x) {
  const o = x && typeof x === 'object' ? x : {};
  return {
    theme: THEMES[o.theme] ? o.theme : DEFAULT_LOOK.theme,
    motif: MOTIFS[o.motif] ? o.motif : DEFAULT_LOOK.motif,
    finish: FINISHES[o.finish] ? o.finish : DEFAULT_LOOK.finish,
    title: TITLE[o.title] ? o.title : DEFAULT_LOOK.title,
    emb: EMBLEMS[o.emb] ? o.emb : DEFAULT_LOOK.emb,
    fav: typeof o.fav === 'string' && KEY_RE.test(o.fav) ? o.fav : null,
  };
}

// Variables CSS de la carte pour une couleur
export function themeStyle(theme) {
  const c = THEMES[theme]?.c;
  return c ? { '--m1': c[0], '--m2': c[1], '--m3': c[2] } : undefined;
}
