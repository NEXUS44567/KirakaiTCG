// Profil public : chiffres de la collection calculés ici, publiés dans la table nexus_public quand le joueur le veut.
import { useEffect } from 'react';
import { getState, onStore, useStore } from './store.js';
import { collectionValue } from './coll.js';
import { eurOf, resolveKey, setCards } from './data.js';
import { useData } from './hooks.js';
import { useCloud, cloudOn, publishProfile, scoped } from './cloud.js';

const r2 = (x) => Math.round((x || 0) * 100) / 100;

export function profileStats(d, s = getState()) {
  const per = {};
  for (const g of ['onepiece', 'pokemon']) {
    const coll = s.collection.filter((e) => e.key.startsWith(g + ':'));
    const V = collectionValue(coll, d);
    const owned = new Map();
    for (const e of coll) { const c = resolveKey(d.cats, e.key); if (!c) continue; if (!owned.has(c.set)) owned.set(c.set, new Set()); owned.get(c.set).add(c.id); }
    let complete = 0;
    for (const [set, ids] of owned) { const n = setCards(d.cats, g, set).length; if (n && ids.size >= n) complete++; }
    per[g] = { value: r2(V.total), cards: V.count, unique: V.unique, sets: owned.size, complete, best: V.best ? { key: V.best.c.key, eur: r2(V.best.eur) } : null };
  }
  const packs = Object.values(s.wallet || {}).reduce((n, w) => n + (w?.opened || 0), 0);
  return { per, ach: Object.keys(s.achievements || {}).length, packs, streak: s.quests?.best || s.quests?.streak || 0 };
}

// Vitrine : les cartes choisies, sinon les 12 plus chères
export function showcaseOf(d, s = getState()) {
  const have = new Set(s.collection.map((e) => e.key));
  const chosen = (s.profile?.showcase || []).filter((k) => have.has(k));
  if (chosen.length) return chosen.slice(0, 12);
  return [...have].map((k) => [k, eurOf(resolveKey(d.cats, k), d.P, d.fx) || 0]).sort((a, b) => b[1] - a[1]).slice(0, 12).map((x) => x[0]);
}

export function profileRow(d, s = getState()) {
  const st = profileStats(d, s);
  return { visible: true, value_op: st.per.onepiece.value, value_pk: st.per.pokemon.value, cards: st.per.onepiece.cards + st.per.pokemon.cards, stats: st, showcase: showcaseOf(d, s) };
}

// Publication automatique (profil visible, joueur connecté) : au démarrage puis après chaque changement
const LAST = scoped('pub');
let timer = 0;
export function useProfileSync() {
  const d = useData();
  const on = useStore((s) => !!s.profile?.public);
  const user = useCloud((c) => c.user?.id);
  const pseudo = useCloud((c) => c.pseudo);
  useEffect(() => {
    if (!cloudOn() || !d.ready || !on || !user || !pseudo) return;
    const push = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const row = profileRow(d);
        const sig = JSON.stringify([user, row]);
        let last = ''; try { last = localStorage.getItem(LAST) || ''; } catch {}
        if (sig === last) return;
        try { await publishProfile(row); localStorage.setItem(LAST, sig); } catch {}
      }, 4000);
    };
    push();
    return onStore(push);
  }, [d.ready, d.v, on, user, pseudo]);
}
export const forgetPublished = () => { try { localStorage.removeItem(LAST); } catch {} };
