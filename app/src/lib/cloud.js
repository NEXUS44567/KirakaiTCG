// Comptes joueurs (Supabase Auth) et sauvegarde en ligne de la progression.
// Sans compte, tout reste dans ce navigateur. Connecté, chaque changement part vers le compte quelques secondes plus tard ;
// en revenant sur le site, ou sur un autre appareil, la dernière version du compte est reprise.
// Si deux appareils ont changé chacun de leur côté, les deux progressions sont fusionnées : rien n'est perdu.
// Ce module est importé avant le routeur : il récupère les jetons des liens reçus par e-mail (#access_token=…).
import { useSyncExternalStore } from 'react';
import { SUPABASE } from './config.js';
import { getState, onStore, update, syncedPart, normalizeSynced, replaceSynced, clearProgress, hasProgress } from './store.js';
import { toast } from './toast.js';

export const cloudOn = () => !!(SUPABASE.url && SUPABASE.key);
// Clés rangées par projet Supabase : une session ou un compte d'un autre projet n'est jamais repris par erreur
const REF = (SUPABASE.url.match(/^https?:\/\/([^./]+)/) || [])[1] || 'local';
export const scoped = (k) => 'kirakai.' + k + ':' + REF;
const AUTH_KEY = scoped('auth');
const META_KEY = scoped('sync');
// Connexions en un clic proposées sur le site, dans cet ordre, si elles sont activées dans Supabase
export const SOCIAL = ['google', 'apple', 'discord'];
const PROV_KEY = scoped('providers');
const api = (p) => SUPABASE.url.replace(/\/+$/, '') + p;
const back = () => encodeURIComponent(location.origin + location.pathname);

const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k)) || null; } catch { return null; } };
const writeJSON = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// ---- État observable par l'interface ----
// status : off (pas connecté) · idle (à jour) · dirty (changements en attente) · sync (envoi) · offline · error
let snap = { user: null, pseudo: null, status: 'off', at: null, error: '', recovery: false, expired: false, linkError: '', providers: cloudOn() ? readJSON(PROV_KEY) || [] : [] };
const subs = new Set();
function set(patch) { snap = { ...snap, ...patch }; subs.forEach((f) => f()); }
export const useCloud = (sel = (s) => s) => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => sel(snap));
export const getCloud = () => snap;

// ---- Messages d'erreur en français ----
const MSG = {
  invalid_credentials: 'E-mail ou mot de passe incorrect.',
  invalid_grant: 'E-mail ou mot de passe incorrect.',
  email_not_confirmed: 'Confirme d’abord ton adresse : clique sur le lien reçu par e-mail.',
  user_already_exists: 'Un compte existe déjà avec cet e-mail : connecte-toi.',
  email_exists: 'Un compte existe déjà avec cet e-mail : connecte-toi.',
  weak_password: 'Mot de passe trop faible : 8 caractères au moins, avec des lettres et des chiffres.',
  same_password: 'Le nouveau mot de passe doit être différent de l’ancien.',
  over_email_send_rate_limit: 'Trop d’e-mails envoyés. Réessaie dans quelques minutes.',
  over_request_rate_limit: 'Trop de tentatives. Réessaie dans quelques minutes.',
  signup_disabled: 'Les inscriptions sont fermées pour le moment.',
  email_address_invalid: 'Cette adresse e-mail n’est pas valide.',
  validation_failed: 'Vérifie l’adresse e-mail et le mot de passe.',
  otp_expired: 'Ce lien a expiré ou a déjà servi. Demande-en un nouveau.',
  access_denied: 'Connexion refusée.',
  session_not_found: 'Ta session a expiré : reconnecte-toi.',
  refresh_token_not_found: 'Ta session a expiré : reconnecte-toi.',
  refresh_token_already_used: 'Ta session a expiré : reconnecte-toi.',
  user_not_found: 'Compte introuvable.',
  email_address_not_authorized: 'L’envoi d’e-mails n’est pas encore activé sur Kirakai. Réessaie plus tard.',
  23505: 'Ce pseudo est déjà pris.',
  23514: 'Sauvegarde trop volumineuse pour ton compte.',
};
class CloudError extends Error { constructor(msg, code, status) { super(msg); this.code = code; this.status = status; } }
function frMessage(j, status) {
  const code = j?.error_code || j?.code || j?.error;
  if (code != null && MSG[code]) return MSG[code];
  const raw = j?.msg || j?.error_description || j?.message || '';
  if (/invalid login credentials/i.test(raw)) return MSG.invalid_credentials;
  if (/already (been )?registered/i.test(raw)) return MSG.user_already_exists;
  if (/not confirmed/i.test(raw)) return MSG.email_not_confirmed;
  if (/password should|password is (too|weak)/i.test(raw)) return MSG.weak_password;
  if (/rate limit/i.test(raw) || status === 429) return MSG.over_request_rate_limit;
  if (status >= 500) return 'Le serveur des comptes ne répond pas. Réessaie dans un instant.';
  return raw || 'Une erreur est survenue (' + status + ').';
}

// ---- Appels HTTP (Auth et base) ----
async function call(path, { method = 'GET', body, token, prefer, keepalive, file, extra } = {}) {
  // Les clés « publishable » ne sont pas des jetons : seule une clé « anon » (JWT) peut aussi servir d'autorisation
  const headers = { apikey: SUPABASE.key, 'Content-Type': file ? file.type : 'application/json', ...extra };
  if (token) headers.Authorization = 'Bearer ' + token;
  else if (/^eyJ/.test(SUPABASE.key)) headers.Authorization = 'Bearer ' + SUPABASE.key;
  if (prefer) headers.Prefer = prefer;
  let r;
  try { r = await fetch(api(path), { method, headers, body: file || (body === undefined ? undefined : JSON.stringify(body)), keepalive }); }
  catch { throw new CloudError('Pas de connexion : vérifie ton réseau.', 'network', 0); }
  const text = await r.text();
  let j = null; try { j = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) throw new CloudError(frMessage(j, r.status), String(j?.error_code || j?.code || j?.error || r.status), r.status);
  return j;
}

// ---- Session ----
const slimUser = (u) => u && { id: u.id, email: u.email, created_at: u.created_at, meta: u.user_metadata || {}, provider: u.app_metadata?.provider || 'email', providers: u.app_metadata?.providers || null };
const toSession = (r, user) => ({
  access_token: r.access_token, refresh_token: r.refresh_token,
  expires_at: Number(r.expires_at) || Math.floor(Date.now() / 1000) + (Number(r.expires_in) || 3600),
  user: slimUser(r.user) || user,
});
let session = cloudOn() ? readJSON(AUTH_KEY) : null;
let meta = readJSON(META_KEY) || {}; // { uid, rev, sig, at } : à quel compte appartient la progression locale, et sa dernière version envoyée
const uid = () => session?.user?.id;
function saveSession(s) { session = s; writeJSON(AUTH_KEY, s); set({ user: s?.user || null }); }
function saveMeta(patch) { meta = patch ? { ...meta, ...patch } : {}; writeJSON(META_KEY, patch ? meta : null); if (meta.at) set({ at: meta.at }); }

let refreshing = null;
async function token(force) {
  if (!session) throw new CloudError('Non connecté', 'no_session', 401);
  // un autre onglet a peut-être déjà renouvelé la session
  const stored = readJSON(AUTH_KEY);
  if (stored?.user?.id === uid() && stored.expires_at > session.expires_at) session = stored;
  if (!force && session.expires_at * 1000 - Date.now() > 60000) return session.access_token;
  if (!refreshing) refreshing = (async () => {
    try {
      const r = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } });
      saveSession(toSession(r, session.user));
    } catch (e) {
      if (e.status >= 400 && e.status < 500) expire();
      throw e;
    } finally { refreshing = null; }
  })();
  await refreshing;
  return session.access_token;
}
// Appel connecté : jeton renouvelé au besoin, une seconde chance si la base le refuse
async function authed(path, opts = {}) {
  try { return await call(path, { ...opts, token: await token() }); }
  catch (e) { if (e.status !== 401 || !session) throw e; return call(path, { ...opts, token: await token(true) }); }
}
// Session expirée : la progression locale reste là, la synchronisation reprend à la prochaine connexion
function expire() {
  saveSession(null);
  set({ status: 'off', expired: true, pseudo: null });
}

// ---- Empreinte d'une progression (pour savoir si elle a changé depuis le dernier envoi) ----
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v) ?? 'null';
}
function sig(v) {
  const s = stable(v);
  let a = 0xdeadbeef, b = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 2654435761); b = Math.imul(b ^ c, 1597334677); }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return (b >>> 0).toString(36) + (a >>> 0).toString(36);
}
const linked = () => !!session && meta.uid === uid();
export const isDirty = () => linked() && sig(syncedPart(getState())) !== meta.sig;

// ---- Fusion de deux progressions (b, celle de l'appareil, l'emporte en cas de doute) ----
const maxMap = (x = {}, y = {}) => { const o = { ...x }; for (const [k, v] of Object.entries(y)) o[k] = Math.max(o[k] || 0, v || 0); return o; };
export function mergeSaves(a, b) {
  const o = { ...a, ...b };
  const mine = new Set((b.collection || []).map((e) => e.uid));
  const extra = (a.collection || []).filter((e) => !mine.has(e.uid));
  o.collection = extra.length ? [...(b.collection || []), ...extra].sort((x, y) => String(y.addedAt || '').localeCompare(String(x.addedAt || ''))) : b.collection || [];
  o.watch = { ...a.watch, ...b.watch };
  o.wish = { ...a.wish, ...b.wish };
  o.notified = { ...a.notified, ...b.notified };
  o.compare = [...new Set([...(a.compare || []), ...(b.compare || [])])].slice(-4);
  o.recent = [...new Set([...(b.recent || []), ...(a.recent || [])])].slice(0, 16);
  const hist = new Map(); for (const h of [...(a.packs?.history || []), ...(b.packs?.history || [])]) hist.set(h.at + h.set, h);
  o.packs = { ...a.packs, ...b.packs, opened: Math.max(a.packs?.opened || 0, b.packs?.opened || 0), virtual: maxMap(a.packs?.virtual, b.packs?.virtual), sel: { ...a.packs?.sel, ...b.packs?.sel }, history: [...hist.values()].sort((x, y) => String(y.at).localeCompare(String(x.at))).slice(0, 20) };
  o.binder = { ...a.binder, ...b.binder, name: b.binder?.name || a.binder?.name || '', covers: { ...a.binder?.covers, ...b.binder?.covers }, order: { ...a.binder?.order, ...b.binder?.order } };
  const sa = a.season || {}, sb = b.season || {};
  o.season = (sa.n || 0) !== (sb.n || 0) ? ((sa.n || 0) > (sb.n || 0) ? sa : sb) : { ...sa, ...sb, cards: { ...sa.cards, ...sb.cards }, packs: maxMap(sa.packs, sb.packs) };
  o.league = a.league?.id && a.league.id !== b.league?.id ? a.league : b.league?.id ? b.league : a.league;
  o.wallet = { ...a.wallet };
  for (const [g, w] of Object.entries(b.wallet || {})) {
    const v = a.wallet?.[g];
    if (!v) { o.wallet[g] = w; continue; }
    const late = String(w.day) >= String(v.day) ? w : v;
    const best = (w.best?.lv ?? -1) >= (v.best?.lv ?? -1) ? w.best || v.best : v.best;
    o.wallet[g] = { ...v, ...late, coins: Math.max(v.coins || 0, w.coins || 0), opened: Math.max(v.opened || 0, w.opened || 0), best };
  }
  o.achievements = { ...b.achievements };
  for (const [k, t] of Object.entries(a.achievements || {})) if (!o.achievements[k] || t < o.achievements[k]) o.achievements[k] = t;
  return o;
}

// ---- Lecture et envoi de la sauvegarde ----
const SAVES = '/rest/v1/nexus_saves';
const HEAD = 'select=rev,pseudo,updated_at';
async function fetchRow(full) {
  const rows = await authed(`${SAVES}?user_id=eq.${uid()}&${full ? 'select=rev,pseudo,data,updated_at' : HEAD}`);
  return rows?.[0] || null;
}
function adopt(row) {
  replaceSynced(row.data || {});
  saveMeta({ uid: uid(), rev: row.rev, sig: sig(syncedPart(getState())), at: row.updated_at });
}
// Fusionne la version du compte avec celle de l'appareil ; l'envoi suit
function mergeWith(row) {
  const base = normalizeSynced(row.data);
  replaceSynced(mergeSaves(base, syncedPart(getState())));
  saveMeta({ uid: uid(), rev: row.rev, sig: sig(base), at: row.updated_at });
}
async function createRow() {
  const data = syncedPart(getState());
  let pseudo = cleanPseudo(session.user.meta?.pseudo) || null;
  for (let i = 0; i < 2; i++) {
    try {
      const rows = await authed(`${SAVES}?${HEAD}`, { method: 'POST', prefer: 'return=representation', body: { user_id: uid(), pseudo, data, rev: 1 } });
      saveMeta({ uid: uid(), rev: 1, sig: sig(data), at: rows?.[0]?.updated_at || new Date().toISOString() });
      set({ pseudo });
      return;
    } catch (e) {
      if (e.code !== '23505') throw e;
      if (pseudo) { pseudo = null; continue; } // pseudo pris entre-temps : à choisir sur la page du compte
      return pull(true); // la sauvegarde existe déjà
    }
  }
}
// Reprend la version du compte si elle est plus récente que celle de l'appareil
async function pull(force) {
  const head = await fetchRow(false);
  if (!head) return createRow();
  set({ pseudo: head.pseudo });
  if (!force && head.rev === meta.rev) return;
  const row = await fetchRow(true);
  if (!row) return;
  const local = syncedPart(getState());
  if (sig(local) === meta.sig) adopt(row); else mergeWith(row);
}

let timer = 0, busy = false, again = false, lastPull = 0;
function schedule(ms = 2500) { clearTimeout(timer); timer = setTimeout(flush, ms); }
async function flush(keepalive) {
  if (!linked() || (!navigator.onLine && !keepalive)) { if (linked()) set({ status: 'offline' }); return; }
  if (busy) { again = true; return; }
  busy = true; clearTimeout(timer);
  try {
    for (let i = 0; i < 4; i++) {
      const data = syncedPart(getState());
      const s = sig(data);
      if (s === meta.sig) { set({ status: 'idle', error: '' }); break; }
      set({ status: 'sync' });
      const body = { data, rev: (meta.rev ?? 0) + 1 };
      // à la fermeture de la page, le navigateur n'accepte d'envoyer qu'un petit volume
      const small = keepalive && JSON.stringify(body).length < 60000;
      const rows = await authed(`${SAVES}?user_id=eq.${uid()}&rev=eq.${meta.rev ?? 0}&select=rev,updated_at`, { method: 'PATCH', prefer: 'return=representation', body, keepalive: small });
      if (rows?.length) { saveMeta({ rev: rows[0].rev, sig: s, at: rows[0].updated_at }); continue; }
      // Un autre appareil a enregistré entre-temps : on reprend sa version, on fusionne, puis on renvoie
      await pull(true);
    }
  } catch (e) { fail(e); }
  finally { busy = false; if (again) { again = false; schedule(400); } }
}
function fail(e) {
  if (!session) return;
  if (e.code === 'network' || !navigator.onLine) set({ status: 'offline', error: '' });
  else set({ status: 'error', error: e.message });
  schedule(30000);
}
async function sync() {
  if (!linked()) return;
  lastPull = Date.now();
  try { set({ status: 'sync' }); await pull(); set({ status: isDirty() ? 'dirty' : 'idle', error: '' }); if (isDirty()) await flush(); }
  catch (e) { fail(e); }
}
export function syncNow() { return linked() ? sync() : Promise.resolve(); }

// ---- Connexion : la progression de l'appareil rejoint celle du compte ----
async function attach() {
  const id = uid();
  if (meta.uid === id) { await sync(); return 'same'; }
  const other = !!meta.uid; // la progression locale appartient à un autre compte : on ne la mélange pas
  const head = await fetchRow(false);
  if (!head) {
    if (other) clearProgress();
    saveMeta({ uid: id, rev: 0, sig: null });
    await createRow();
    set({ status: 'idle' });
    return hasProgress(getState()) ? 'uploaded' : 'new';
  }
  set({ pseudo: head.pseudo });
  const row = await fetchRow(true);
  let how;
  if (other || !hasProgress(getState())) { adopt(row); how = hasProgress(row.data || {}) ? 'adopted' : 'new'; }
  else if (!hasProgress(row.data || {})) { saveMeta({ uid: id, rev: row.rev, sig: sig(normalizeSynced(row.data)) }); how = 'uploaded'; }
  else { mergeWith(row); how = 'merged'; }
  await flush();
  if (snap.status === 'sync') set({ status: 'idle' });
  return how;
}
async function signedIn(r) {
  saveSession(toSession(r));
  set({ status: 'sync', expired: false, error: '', linkError: '' });
  let how;
  try { how = await attach(); } catch (e) { fail(e); how = 'later'; }
  const name = snap.pseudo || session?.user?.meta?.pseudo || '';
  const txt = {
    merged: 'Ta progression sur cet appareil a été ajoutée à celle de ton compte.',
    uploaded: 'Ta progression est maintenant enregistrée dans ton compte.',
    adopted: 'Ta progression a été reprise de ton compte.',
    new: 'Tout ce que tu feras sera enregistré dans ton compte.',
    same: 'Ta progression est à jour.',
    later: 'Tu es connecté. La synchronisation reprendra dès que possible.',
  }[how];
  toast(txt, { title: name ? `Bienvenue, ${name} !` : 'Bienvenue !', icon: 'user', ms: 4800 });
  return how;
}

// ---- Actions du compte ----
export const cleanPseudo = (p) => { const v = String(p || '').trim().replace(/\s+/g, ' '); return v.length >= 2 && v.length <= 20 ? v : ''; };
export async function signUp({ email, password, pseudo }) {
  const r = await call('/auth/v1/signup?redirect_to=' + back(), { method: 'POST', body: { email: email.trim(), password, data: { pseudo: cleanPseudo(pseudo) } } });
  if (r?.access_token) { await signedIn(r); return { done: true }; }
  // Supabase ne dit pas qu'une adresse est déjà prise, mais renvoie alors un compte sans identité
  if (Array.isArray(r?.identities) && r.identities.length === 0) throw new CloudError(MSG.user_already_exists, 'user_already_exists', 422);
  // Confirmation par e-mail activée : le compte s'ouvre en cliquant sur le lien reçu
  return { confirm: true };
}
export async function signIn({ email, password }) {
  const r = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email.trim(), password } });
  return signedIn(r);
}
export function signInWith(provider) { location.href = api(`/auth/v1/authorize?provider=${encodeURIComponent(provider)}&redirect_to=${back()}`); }
export const resetPassword = (email) => call('/auth/v1/recover?redirect_to=' + back(), { method: 'POST', body: { email: email.trim() } });
export const resendConfirmation = (email) => call('/auth/v1/resend?redirect_to=' + back(), { method: 'POST', body: { type: 'signup', email: email.trim() } });
export const pseudoFree = (p) => call('/rest/v1/rpc/nexus_pseudo_libre', { method: 'POST', body: { p: cleanPseudo(p) } }).then((x) => x !== false).catch(() => true);
export async function changePassword(password) {
  const u = await authed('/auth/v1/user', { method: 'PUT', body: { password } });
  if (u?.id) saveSession({ ...session, user: slimUser(u) });
  set({ recovery: false });
}
export async function changePseudo(p) {
  const pseudo = cleanPseudo(p);
  if (!pseudo) throw new CloudError('Ton pseudo doit faire entre 2 et 20 caractères.', 'pseudo', 400);
  const rows = await authed(`${SAVES}?user_id=eq.${uid()}&select=pseudo`, { method: 'PATCH', prefer: 'return=representation', body: { pseudo } });
  if (!rows?.length) throw new CloudError('Sauvegarde introuvable : réessaie dans un instant.', 'missing', 404);
  const old = snap.pseudo;
  set({ pseudo });
  // le pseudo du classement suit celui du compte s'il n'en avait pas d'autre
  update((s) => { if (s.league?.id && (!s.league.pseudo || s.league.pseudo === old)) s.league.pseudo = pseudo; });
  return pseudo;
}
// Déconnexion : on envoie d'abord ce qui reste, puis l'appareil repart d'une progression vierge
export async function signOut({ force } = {}) {
  if (isDirty()) { await flush(); if (isDirty() && !force) throw new CloudError('Des changements ne sont pas encore enregistrés dans ton compte.', 'dirty', 0); }
  const t = session?.access_token;
  if (t) call('/auth/v1/logout', { method: 'POST', token: t }).catch(() => {});
  forget();
}
export async function deleteAccount() {
  await removeAvatar(getState().profile?.avatar).catch(() => {});
  await authed('/rest/v1/rpc/nexus_delete_account', { method: 'POST', body: {} });
  forget();
}
function forget() {
  clearTimeout(timer);
  saveSession(null);
  saveMeta(null);
  clearProgress();
  set({ status: 'off', pseudo: null, at: null, error: '', recovery: false, expired: false });
}
export const dismissRecovery = () => set({ recovery: false });
export const clearLinkError = () => { if (snap.linkError) set({ linkError: '' }); };

// ---- Profils publics et alertes sur le téléphone (voir supabase/social.sql) ----
// Appel d'une fonction de la base, connecté si possible
export const rpc = (name, body = {}) => (session ? authed(`/rest/v1/rpc/${name}`, { method: 'POST', body }) : call(`/rest/v1/rpc/${name}`, { method: 'POST', body }));
export const restGet = (path) => (session ? authed(path) : call(path));
export const myId = () => uid();
export function publishProfile(row) {
  return authed('/rest/v1/nexus_public?on_conflict=user_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { ...row, user_id: uid() } });
}
export const hideProfile = () => authed(`/rest/v1/nexus_public?user_id=eq.${uid()}`, { method: 'DELETE', prefer: 'return=minimal' });

// ---- Photo de profil : un fichier par envoi dans le dossier du joueur (« avatars/<id>/<date>.webp », voir supabase/profil.sql) ----
const AVATAR_RE = /^[0-9a-f-]{36}\/\d{10,14}\.(webp|jpg)$/;
export const avatarUrl = (path) => (cloudOn() && typeof path === 'string' && AVATAR_RE.test(path) ? api('/storage/v1/object/public/avatars/' + path) : null);
export async function uploadAvatar(blob) {
  if (!uid()) throw new CloudError('Connecte-toi pour ajouter une photo.', 'no_session', 401);
  const path = `${uid()}/${Date.now()}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
  await authed('/storage/v1/object/avatars/' + path, { method: 'POST', file: blob, extra: { 'cache-control': 'max-age=31536000', 'x-upsert': 'true' } });
  return path;
}
export async function removeAvatar(path) {
  if (!uid() || typeof path !== 'string' || !path.startsWith(uid() + '/')) return;
  await authed('/storage/v1/object/avatars', { method: 'DELETE', body: { prefixes: [path] } });
}

// ---- Liens reçus par e-mail (confirmation, mot de passe oublié) et retour des connexions Google, Discord… ----
function readLink() {
  const h = location.hash.slice(1);
  if (!h || h.startsWith('/') || !/(^|&)(access_token|error|error_description)=/.test(h)) return null;
  const q = Object.fromEntries(new URLSearchParams(h));
  history.replaceState(null, '', location.pathname + location.search + '#/compte');
  return q;
}
async function openLink(q) {
  if (q.error || q.error_description) {
    set({ linkError: MSG[q.error_code] || MSG[q.error] || q.error_description || 'Ce lien ne fonctionne pas.' });
    return;
  }
  try {
    const u = await call('/auth/v1/user', { token: q.access_token });
    set({ recovery: q.type === 'recovery' });
    await signedIn({ ...q, user: u });
  } catch (e) { set({ linkError: e.message }); }
}

// Fournisseurs activés dans Supabase (réglages publics du service de comptes), gardés pour l'affichage suivant
async function loadProviders() {
  try {
    const s = await call('/auth/v1/settings');
    const list = SOCIAL.filter((p) => s?.external?.[p]);
    writeJSON(PROV_KEY, list);
    set({ providers: list });
  } catch {}
}

// ---- Démarrage ----
function start() {
  if (!cloudOn()) return;
  loadProviders();
  const link = readLink();
  if (session) set({ user: session.user, status: 'idle', at: meta.at || null });
  if (link) openLink(link);
  else if (session) {
    if (linked()) sync();
    else attach().catch(fail); // connexion interrompue avant la première synchronisation
  }
  // Chaque changement de la progression part vers le compte quelques secondes plus tard
  let chk = 0;
  onStore(() => {
    if (!linked()) return;
    clearTimeout(chk);
    chk = setTimeout(() => { if (isDirty()) { if (snap.status !== 'sync') set({ status: navigator.onLine ? 'dirty' : 'offline' }); schedule(); } }, 300);
  });
  // Retour sur l'onglet : on reprend ce qui a pu changer ailleurs ; départ : on envoie tout de suite
  document.addEventListener('visibilitychange', () => {
    if (!linked()) return;
    if (document.visibilityState === 'hidden') { if (isDirty()) flush(true); }
    else if (Date.now() - lastPull > 15000) sync();
  });
  addEventListener('online', () => { if (linked()) sync(); });
  addEventListener('offline', () => { if (linked()) set({ status: 'offline' }); });
  setInterval(() => { if (linked() && document.visibilityState === 'visible' && Date.now() - lastPull > 180000) sync(); }, 30000);
  // Connexion ou déconnexion dans un autre onglet
  addEventListener('storage', (e) => {
    if (e.key === META_KEY) meta = readJSON(META_KEY) || {};
    if (e.key !== AUTH_KEY) return;
    const s = readJSON(AUTH_KEY);
    if (s?.user?.id === uid()) { session = s; return; }
    session = s;
    set({ user: s?.user || null, status: s ? 'idle' : 'off', pseudo: s ? snap.pseudo : null });
    if (s) sync();
  });
}
start();
