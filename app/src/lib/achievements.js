// Succès à débloquer (nouveauté V3) : boosters, collection, scanner, marché.
import { getState, update, condOf } from './store.js';
import { eurOf, resolveKey } from './data.js';
import { toast } from './toast.js';

export const ACHIEVEMENTS = [
  { id: 'first-pack', icon: 'pack', title: 'Premier déchirage', text: 'Ouvre ton premier booster.' },
  { id: 'both-worlds', icon: 'swap', title: 'Deux mondes', text: 'Ouvre un booster One Piece et un booster Pokémon.' },
  { id: 'packs-10', icon: 'pack', title: 'Habitué', text: 'Ouvre 10 boosters.' },
  { id: 'packs-50', icon: 'flame', title: 'Accro au papier alu', text: 'Ouvre 50 boosters.' },
  { id: 'packs-150', icon: 'crown', title: 'Centurion', text: 'Ouvre 150 boosters.' },
  { id: 'display', icon: 'box', title: 'Grand format', text: 'Ouvre une display entière.' },
  { id: 'hit-3', icon: 'sparkle', title: 'Ça brille !', text: 'Tire une carte très rare.' },
  { id: 'hit-5', icon: 'crown', title: 'Légende vivante', text: 'Tire une carte légendaire (parallèle spéciale, hyper rare…).' },
  { id: 'pull-50', icon: 'coin', title: 'Jackpot', text: 'Un seul booster qui vaut plus de 50 € au prix du jour.' },
  { id: 'set-50', icon: 'album', title: 'À mi-chemin', text: 'Remplis la moitié d’une extension virtuelle.' },
  { id: 'set-100', icon: 'trophy', title: 'Set complet', text: 'Obtiens toutes les cartes d’une extension virtuelle.' },
  { id: 'coll-1', icon: 'plus', title: 'Première pièce', text: 'Ajoute une carte à ta collection.' },
  { id: 'coll-50', icon: 'album', title: 'Collectionneur', text: '50 cartes dans ta collection.' },
  { id: 'coll-1000', icon: 'gem', title: 'Coffre au trésor', text: 'Une collection estimée à plus de 1 000 €.' },
  { id: 'scan', icon: 'scan', title: 'Œil de lynx', text: 'Scanne une carte et ajoute-la avec sa note.' },
  { id: 'scan-9', icon: 'star', title: 'Quasi parfaite', text: 'Obtiens une note de 9 ou plus au scanner.' },
  { id: 'watch', icon: 'bell', title: 'Vigie', text: 'Pose une alerte de prix sur une carte.' },
  { id: 'compare', icon: 'compare', title: 'Œil d’expert', text: 'Compare 4 cartes en même temps.' },
  { id: 'share', icon: 'share', title: 'Vitrine', text: 'Partage ton classeur.' },
];
export const achievementOf = (id) => ACHIEVEMENTS.find((a) => a.id === id);

export function unlock(...ids) {
  const s = getState();
  const fresh = ids.filter((id) => id && !s.achievements?.[id] && achievementOf(id));
  if (!fresh.length) return;
  update((x) => { x.achievements ||= {}; for (const id of fresh) x.achievements[id] = new Date().toISOString(); });
  fresh.forEach((id, i) => {
    const a = achievementOf(id);
    setTimeout(() => toast(a.text, { title: 'Succès débloqué · ' + a.title, icon: a.icon, tone: 'gold', ms: 4200 }), i * 600);
  });
}

// Vérifie les succès liés à la collection, aux suivis et au comparateur
export function checkCollection(d) {
  const s = getState();
  const ids = [];
  const n = s.collection.reduce((t, e) => t + e.qty, 0);
  if (n >= 1) ids.push('coll-1');
  if (n >= 50) ids.push('coll-50');
  if (Object.values(s.watch).some((w) => w.below != null || w.above != null)) ids.push('watch');
  if (s.compare.length >= 4) ids.push('compare');
  if (d?.ready) {
    let v = 0;
    for (const e of s.collection) { const c = resolveKey(d.cats, e.key); const eur = c && eurOf(c, d.P, d.fx); if (eur) v += eur * condOf(e.cond).factor * e.qty; }
    if (v >= 1000) ids.push('coll-1000');
  }
  unlock(...ids);
}
