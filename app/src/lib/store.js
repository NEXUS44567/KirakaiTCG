// État persistant : collection, suivis, comparateur, boosters, classeur, réglages.
// Toujours enregistré dans ce navigateur ; avec un compte, recopié aussi en ligne (voir cloud.js).
// La V3 a sa propre clé ; au premier lancement elle reprend une copie des données de la V2 (même navigateur),
// sans jamais écrire dans celles-ci.
import { useSyncExternalStore } from 'react';

const KEY = 'nexus.v3';
const V2_KEY = 'nexus.v2';
const DEFAULT = {
  collection: [],          // { uid, key, qty, cond, grade, lang, addedAt, paid, scan }
  watch: {},               // key → { addedAt, below, above, baseline }
  wish: {},                // liste de souhaits : key → { addedAt, eur (prix au moment de l'ajout) }
  profile: { public: false, showcase: [] }, // profil public (compte) : visible ou non, vitrine choisie
  compare: [],             // clés (4 au plus)
  packs: { opened: 0, virtual: {}, sel: {}, history: [] },
  recent: [],              // cartes consultées
  binder: { name: '', covers: {}, order: {} },
  season: { n: 0, cards: {}, packs: {} },
  league: { id: '', secret: '', pseudo: '' },
  lang: 'fr',              // langue des cartes : en, fr, ja (fixe aussi la devise)
  notified: {},
  universe: null,
  wallet: {},              // univers → { coins, day, openedToday, opened, best }
  achievements: {},        // id → date d'obtention
  settings: { sound: true, fx: 'full' },
  importedV2: null,
};

function merge(v) {
  const d = structuredClone(DEFAULT);
  return { ...d, ...v, packs: { ...d.packs, ...(v.packs || {}) }, binder: { ...d.binder, ...(v.binder || {}) }, settings: { ...d.settings, ...(v.settings || {}) } };
}

function readV2() {
  try { const raw = localStorage.getItem(V2_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return merge(JSON.parse(raw));
    // Premier lancement : copie des données de la V2 si elles existent
    const v2 = readV2();
    if (v2) {
      const s = merge({
        collection: v2.collection || [], watch: v2.watch || {}, compare: v2.compare || [], recent: v2.recent || [],
        packs: { virtual: v2.packs?.virtual || {}, opened: v2.packs?.opened || 0 }, binder: { name: v2.binder?.name || '', covers: v2.binder?.covers || {}, order: {} },
        season: v2.season, league: v2.league, lang: v2.lang || 'fr', universe: v2.universe, wallet: v2.wallet || {}, admin: v2.admin || false, notified: v2.notified || {},
      });
      s.importedV2 = new Date().toISOString();
      return s;
    }
  } catch {}
  return structuredClone(DEFAULT);
}

let state = read();
const subs = new Set();
function emit() { for (const f of subs) f(); }
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }
save();

export function update(fn) {
  const next = structuredClone(state);
  fn(next);
  state = next;
  save();
  emit();
}
export const getState = () => state;
export function onStore(f) { subs.add(f); return () => subs.delete(f); }
export function useStore(sel = (s) => s) {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => sel(state));
}
window.addEventListener('storage', (e) => { if (e.key === KEY) { state = read(); emit(); } });

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ---- Collection ----
export const CONDITIONS = [
  { id: 'MT', label: 'Mint', short: 'MT', factor: 1.15, hint: 'Parfaite, comme sortie du booster' },
  { id: 'NM', label: 'Near Mint', short: 'NM', factor: 1, hint: 'Quasi parfaite, défauts invisibles' },
  { id: 'EX', label: 'Excellent', short: 'EX', factor: 0.8, hint: 'Légère usure sur un bord ou un coin' },
  { id: 'GD', label: 'Good', short: 'GD', factor: 0.6, hint: 'Usure visible, blanchiment' },
  { id: 'LP', label: 'Light Played', short: 'LP', factor: 0.45, hint: 'Usure nette, petits plis' },
  { id: 'PL', label: 'Played', short: 'PL', factor: 0.3, hint: 'Très jouée, plis, rayures' },
  { id: 'PO', label: 'Poor', short: 'PO', factor: 0.15, hint: 'Abîmée' },
];
export const condOf = (id) => CONDITIONS.find((c) => c.id === id) || CONDITIONS[1];

export function addToCollection(key, { qty = 1, cond = 'NM', grade = null, lang = 'en', paid = null, scan = null } = {}) {
  update((s) => {
    const same = !scan && s.collection.find((e) => e.key === key && e.cond === cond && e.lang === lang && !e.grade);
    if (same) same.qty += qty;
    else s.collection.unshift({ uid: uid(), key, qty, cond, grade, lang, paid, scan, addedAt: new Date().toISOString() });
    questStep(s, 'add');
    if (scan) questStep(s, 'scan');
  });
}
export const updateEntry = (u, patch) => update((s) => { const e = s.collection.find((x) => x.uid === u); if (e) Object.assign(e, patch); });
export const removeEntry = (u) => update((s) => {
  s.collection = s.collection.filter((x) => x.uid !== u);
  for (const g of Object.keys(s.binder.order || {})) s.binder.order[g] = s.binder.order[g].map((x) => (x === u ? null : x));
});

// ---- Suivis et alertes ----
export const toggleWatch = (key, baseline) => update((s) => {
  if (s.watch[key]) delete s.watch[key];
  else { s.watch[key] = { addedAt: new Date().toISOString(), below: null, above: null, baseline: baseline ?? null }; questStep(s, 'watch'); }
});
export const setAlert = (key, patch) => update((s) => { s.watch[key] = { addedAt: new Date().toISOString(), below: null, above: null, baseline: null, ...(s.watch[key] || {}), ...patch }; });

// ---- Liste de souhaits ----
export const toggleWish = (key, eur) => update((s) => {
  s.wish ||= {};
  if (s.wish[key]) delete s.wish[key];
  else { s.wish[key] = { addedAt: new Date().toISOString(), eur: eur ?? null }; questStep(s, 'wish'); }
});
export function addWishes(list) {
  let n = 0;
  update((s) => { s.wish ||= {}; for (const [key, eur] of list) if (!s.wish[key]) { s.wish[key] = { addedAt: new Date().toISOString(), eur: eur ?? null }; n++; } if (n) questStep(s, 'wish'); });
  return n;
}
export const removeWish = (key) => update((s) => { if (s.wish) delete s.wish[key]; });

// ---- Comparateur ----
export const toggleCompare = (key) => update((s) => {
  if (s.compare.includes(key)) s.compare = s.compare.filter((k) => k !== key);
  else { s.compare.push(key); if (s.compare.length > 4) s.compare.shift(); if (s.compare.length >= 2) questStep(s, 'compare'); }
});
export const pushRecent = (key) => update((s) => { s.recent = [key, ...s.recent.filter((k) => k !== key)].slice(0, 16); questStep(s, 'view'); });

// ---- Sauvegarde ----
export function exportData() { return JSON.stringify({ app: 'Kirakai', version: 3, exportedAt: new Date().toISOString(), ...state }, null, 1); }
export function importData(text) {
  const v = JSON.parse(text);
  if (!v || !Array.isArray(v.collection)) throw new Error('fichier non reconnu');
  return mergeFrom(v);
}
// Fusion d'une autre sauvegarde (fichier exporté, ou données de la V2 du même navigateur)
function mergeFrom(v) {
  let added = 0;
  update((s) => {
    const known = new Set(s.collection.map((e) => e.uid));
    for (const e of v.collection || []) if (e.key && !known.has(e.uid)) { s.collection.push({ ...e, uid: e.uid || uid() }); added++; }
    for (const [k, w] of Object.entries(v.watch || {})) if (!s.watch[k]) s.watch[k] = w;
    for (const [k, n] of Object.entries(v.packs?.virtual || {})) s.packs.virtual[k] = Math.max(s.packs.virtual[k] || 0, n);
  });
  return added;
}
export const hasV2 = () => !!readV2();
export function syncFromV2() { const v2 = readV2(); if (!v2) throw new Error('aucune donnée de la V2 dans ce navigateur'); return mergeFrom(v2); }
export function resetAll() { try { localStorage.removeItem(KEY); } catch {} state = structuredClone(DEFAULT); save(); emit(); }

// ---- Partie enregistrée dans le compte : tout sauf ce qui est propre à cet appareil ----
export const LOCAL_ONLY = ['settings', 'universe', 'installHidden', 'importedV2', 'importedV2Told', 'admin'];
export function syncedPart(s = state) {
  const o = {};
  for (const k of Object.keys(s)) if (!LOCAL_ONLY.includes(k)) o[k] = s[k];
  return o;
}
const localPart = () => Object.fromEntries(LOCAL_ONLY.filter((k) => k in state).map((k) => [k, state[k]]));
// Remplace la progression par celle du compte (les réglages de l'appareil restent)
export function replaceSynced(data) { state = merge({ ...structuredClone(data || {}), ...localPart() }); save(); emit(); }
// Forme complète (valeurs par défaut comprises) d'une progression venue du compte
export const normalizeSynced = (data) => syncedPart(merge(structuredClone(data || {})));
// Progression vierge (déconnexion), réglages de l'appareil conservés
export function clearProgress() { state = merge({ ...localPart(), importedV2Told: true }); save(); emit(); }
// La progression contient-elle quelque chose qui mérite d'être gardé ?
export function hasProgress(s = state) {
  return !!(s.collection?.length || Object.keys(s.watch || {}).length || Object.keys(s.wish || {}).length || s.packs?.opened || Object.keys(s.packs?.virtual || {}).length
    || Object.keys(s.achievements || {}).length || Object.values(s.wallet || {}).some((w) => w?.opened) || s.league?.id);
}

// ---- Berrys (One Piece) et Pokéballs (Pokémon) : 1 000 au départ, +200 par jour, même les jours d'absence ----
const dayKey = (t = new Date()) => t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
const dayDiff = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 86400000);
export function claimDaily(game, start = 1000, daily = 200) {
  const today = dayKey();
  const w = state.wallet?.[game];
  if (w && w.day === today) return 0;
  let gained = 0;
  update((s) => {
    s.wallet ||= {};
    const cur = s.wallet[game];
    if (!cur) { s.wallet[game] = { coins: start, day: today, openedToday: 0, opened: 0, best: null }; return; }
    const days = Math.max(0, Math.min(30, dayDiff(cur.day, today)));
    gained = days * daily;
    cur.coins += gained; cur.day = today; cur.openedToday = 0; cur.lastGain = gained;
  });
  return gained;
}
export function spendCoins(game, amount) {
  if (state.admin) { if (!state.wallet?.[game]) claimDaily(game); return true; }
  const w = state.wallet?.[game];
  if (!w || w.coins < amount) return false;
  update((s) => { s.wallet[game].coins -= amount; });
  return true;
}
export const refund = (game, amount) => { if (!state.admin) update((s) => { s.wallet[game].coins += amount; }); };

// ---- Mode administrateur : Berrys et Pokéballs illimités sur cet appareil (même lien secret que la V2) ----
const ADMIN_HASH = '5f6ec8114b0e48bd4bcb01814655127164e61618d7c4e7d69ac11fdf821dcc49';
export async function tryAdmin(code) {
  if (code === 'off') { update((s) => { s.admin = false; }); return 'off'; }
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex !== ADMIN_HASH) return 'bad';
  update((s) => { s.admin = true; });
  return 'on';
}

// ---- Quêtes du jour et série de jours de visite ----
// Trois quêtes tirées chaque jour (les mêmes pour tout le monde ce jour-là), récompensées en Berrys et en Pokéballs.
export const QUESTS = {
  open: { n: 3, label: 'Ouvre 3 boosters', icon: 'pack', to: '/boosters' },
  add: { n: 1, label: 'Ajoute une carte à ta collection', icon: 'album', to: '/recherche' },
  view: { n: 5, label: 'Consulte 5 fiches de cartes', icon: 'eye', to: '/classement' },
  wish: { n: 1, label: 'Ajoute une carte à ta liste de souhaits', icon: 'heart', to: '/classement' },
  watch: { n: 1, label: 'Suis le prix d’une carte', icon: 'bell', to: '/marche' },
  market: { n: 1, label: 'Consulte le marché du jour', icon: 'market', to: '/marche' },
  set: { n: 2, label: 'Explore 2 extensions', icon: 'sets', to: '/extensions' },
  compare: { n: 1, label: 'Compare deux cartes', icon: 'compare', to: '/comparateur' },
  scan: { n: 1, label: 'Scanne une carte', icon: 'scan', to: '/scanner' },
};
export const QUEST_REWARD = 100, QUEST_BONUS = 250;
export const STREAK_BONUS = { 3: 150, 7: 400, 14: 800, 30: 2000 };
const yesterday = (t = new Date()) => { const y = new Date(t); y.setDate(y.getDate() - 1); return dayKey(y); };
export function questsOf(day = dayKey()) {
  // tirage déterministe : la date sert de graine
  let h = [...day].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
  const ids = Object.keys(QUESTS).filter((k) => k !== 'open');
  const pick = ['open'];
  while (pick.length < 3) { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; const k = ids[h % ids.length]; if (!pick.includes(k)) pick.push(k); }
  return pick;
}
function questDay(s) {
  const today = dayKey();
  if (!s.quests || s.quests.day !== today) s.quests = { ...(s.quests || {}), day: today, count: {}, claimed: {}, bonus: false };
  return s.quests;
}
export function questStep(s, id, k = 1) {
  const q = questDay(s);
  if (!questsOf(q.day).includes(id)) return;
  q.count[id] = (q.count[id] || 0) + k;
}
const giveCoins = (s, n) => {
  s.wallet ||= {};
  for (const g of ['onepiece', 'pokemon']) {
    if (!s.wallet[g]) s.wallet[g] = { coins: 1000, day: dayKey(), openedToday: 0, opened: 0, best: null };
    s.wallet[g].coins += n;
  }
};
export function claimQuest(id) {
  let ok = false;
  update((s) => {
    const q = questDay(s);
    if (q.claimed[id] || (q.count[id] || 0) < QUESTS[id].n) return;
    q.claimed[id] = true; giveCoins(s, QUEST_REWARD); ok = true;
    if (!q.bonus && questsOf(q.day).every((k) => q.claimed[k])) { q.bonus = true; giveCoins(s, QUEST_BONUS); }
  });
  return ok;
}
// Première visite du jour : la série continue si on est venu hier
export function touchStreak() {
  let gain = 0, streak = 0;
  update((s) => {
    const q = questDay(s), today = dayKey();
    if (q.last === today) { streak = q.streak; return; }
    q.streak = q.last === yesterday() ? (q.streak || 0) + 1 : 1;
    q.last = today; q.best = Math.max(q.best || 0, q.streak); streak = q.streak;
    gain = STREAK_BONUS[q.streak] || (q.streak > 30 && q.streak % 30 === 0 ? STREAK_BONUS[30] : 0);
    if (gain) giveCoins(s, gain);
  });
  return { gain, streak };
}
