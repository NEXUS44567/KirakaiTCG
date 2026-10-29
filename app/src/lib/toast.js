// Petites notifications en bas de l'écran (succès débloqués, copies de liens, ajouts)
import { useSyncExternalStore } from 'react';

let list = [];
const subs = new Set();
const emit = () => subs.forEach((f) => f());
let n = 0;

export function toast(msg, { icon = 'check', tone = 'info', ms = 3200, title } = {}) {
  const id = ++n;
  list = [...list, { id, msg, icon, tone, title }].slice(-4);
  emit();
  setTimeout(() => { list = list.filter((t) => t.id !== id); emit(); }, ms);
}
export const useToasts = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => list);
