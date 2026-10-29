// Valeur d'une collection au prix du jour, selon l'état de chaque exemplaire
import { eurOf, resolveKey } from './data.js';
import { condOf } from './store.js';

export function collectionValue(coll, d) {
  let total = 0, totalNM = 0, count = 0, priced = 0, paid = 0, best = null;
  const keys = new Set();
  for (const e of coll) {
    const c = resolveKey(d.cats, e.key); if (!c) continue;
    count += e.qty; keys.add(e.key);
    if (e.paid) paid += e.paid * e.qty;
    const eur = eurOf(c, d.P, d.fx);
    if (eur == null) continue;
    priced += e.qty;
    total += eur * condOf(e.cond).factor * e.qty; totalNM += eur * e.qty;
    if (!best || eur > best.eur) best = { c, eur };
  }
  return { total, totalNM, count, unique: keys.size, priced, paid, best };
}
export const entryValue = (e, c, d) => (eurOf(c, d.P, d.fx) || 0) * condOf(e.cond).factor * e.qty;
