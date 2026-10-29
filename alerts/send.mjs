// Robot des alertes de prix : chaque matin, après le relevé, compare les seuils des appareils abonnés aux nouveaux prix
// et leur envoie une notification (Web Push), même si Kirakai est fermé.
// Lancé par .github/workflows/kirakai.yml avec la clé secrète Supabase (secret GitHub SUPABASE_SECRET_KEY).
// Les clés de signature des notifications (VAPID) sont créées au premier passage et gardées dans la base.
import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const DB = path.join(ROOT, '..', 'db');
const SITE = (process.env.KIRAKAI_SITE || 'https://nexus44567.github.io/KirakaiTCG/').replace(/\/?$/, '/');
const BASE = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!BASE || !KEY) { console.log('Pas de clé Supabase : alertes non envoyées.'); process.exit(0); }

// Clé « secret » (sb_secret_…) dans apikey ; une ancienne clé service_role (JWT) sert aussi d'autorisation
const H = { apikey: KEY, 'Content-Type': 'application/json', ...(KEY.startsWith('eyJ') ? { Authorization: 'Bearer ' + KEY } : {}) };
async function api(p, { method = 'GET', body, prefer } = {}) {
  const r = await fetch(BASE + p, { method, headers: { ...H, ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p.split('?')[0]} → ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DB, f), 'utf8')); } catch { return null; } };

// ---- Clés de signature ----
let keys = Object.fromEntries((await api('/rest/v1/nexus_secrets?select=name,value&name=in.(vapid_public,vapid_private)')).map((r) => [r.name, r.value]));
if (!keys.vapid_public || !keys.vapid_private) {
  const k = webpush.generateVAPIDKeys();
  await api('/rest/v1/nexus_secrets', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: [{ name: 'vapid_public', value: k.publicKey }, { name: 'vapid_private', value: k.privateKey }] });
  keys = { vapid_public: k.publicKey, vapid_private: k.privateKey };
  console.log('Clés de notification créées : les joueurs peuvent maintenant activer les alertes.');
}
webpush.setVapidDetails(SITE, keys.vapid_public, keys.vapid_private);

// ---- Prix du jour (mêmes règles que l'application : Cardmarket, sinon TCGplayer converti) ----
const P = { onepiece: read('prices/onepiece.json'), pokemon: read('prices/pokemon.json') };
const fx = read('market.json')?.fx || P.pokemon?.source?.fx || P.onepiece?.source?.fx || {};
function eurOf(game, id) {
  const v = P[game]?.items?.[id];
  if (!v) return null;
  const eur = v[0], usd = game === 'onepiece' ? v[1] : v[5];
  if (eur != null) return eur;
  if (usd != null && fx.usdEur) return Math.round(usd * fx.usdEur * 100) / 100;
  return null;
}
const fmt = (v, locale, currency) => v.toLocaleString(locale, { style: 'currency', currency, maximumFractionDigits: currency === 'JPY' ? 0 : 2 });
const money = (eur, lang) => (lang === 'en' && fx.usdEur ? fmt(eur / fx.usdEur, 'en-US', 'USD') : lang === 'ja' && fx.eurJpy ? fmt(eur * fx.eurJpy, 'ja-JP', 'JPY') : fmt(eur, 'fr-FR', 'EUR'));

// ---- Noms des cartes (français si disponible) ----
const names = new Map();
for (const g of ['onepiece', 'pokemon']) for (const [id, name, , number] of read(`catalog/${g}.json`)?.cards || []) names.set(g + ':' + id, { name, number });
for (const [id, name, , number] of read('catalog/pokemon-ja.json')?.cards || []) names.set('pokemon:' + id, { name, number });
const frPk = read('lang/pokemon-fr.json')?.cards || {}, frOp = read('lang/onepiece-fr.json')?.cards || {};
const decode = (t) => String(t).replace(/&apos;|&#39;/g, '’').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
function label(key, lang) {
  const [game, ...rest] = key.split(':'); const id = rest.join(':');
  const c = names.get(key) || { name: id, number: '' };
  let name = c.name;
  if (lang === 'fr') { const t = game === 'pokemon' ? frPk[id]?.[0] : frOp[id] || frOp[id.split('_')[0]]; if (t) name = decode(t); }
  return { name, number: c.number || id };
}
const slug = (game, id) => game + '-' + String(id).replace(/[^A-Za-z0-9._-]+/g, '-');
const pageOf = (key) => { const [game, ...rest] = key.split(':'); const id = rest.join(':'); return id.startsWith('jp-') ? SITE + '#/carte/' + encodeURIComponent(key) : SITE + 'carte/' + slug(game, id) + '.html'; };

// ---- Appareils abonnés ----
const subs = [];
for (let offset = 0; ; offset += 1000) {
  const page = await api(`/rest/v1/nexus_push?select=endpoint,p256dh,auth,alerts,lang,sent&order=created_at.asc&limit=1000&offset=${offset}`);
  subs.push(...page);
  if (page.length < 1000) break;
}

let sent = 0, gone = 0, failed = 0;
const day = new Date().toISOString().slice(0, 10);
for (const s of subs) {
  const prev = s.sent || {}, next = {}, hits = [];
  for (const [key, a] of Object.entries(s.alerts || {})) {
    const [game, ...rest] = key.split(':');
    const eur = eurOf(game, rest.join(':'));
    if (eur == null) { if (prev[key]) next[key] = prev[key]; continue; }
    const kind = a?.below != null && eur <= a.below ? 'below' : a?.above != null && eur >= a.above ? 'above' : null;
    if (!kind) continue; // seuil plus atteint : l'alerte se réarme
    const token = kind + ':' + a[kind];
    next[key] = token;
    if (prev[key] !== token) hits.push({ key, eur, kind, target: a[kind] });
  }
  if (hits.length) {
    const L = s.lang || 'fr';
    const line = (h) => { const c = label(h.key, L); return { c, txt: `${c.name} ${c.number} : ${money(h.eur, L)} (${h.kind === 'below' ? 'sous' : 'au-dessus de'} ${money(h.target, L)})` }; };
    const first = line(hits[0]);
    const payload = hits.length === 1
      ? { title: `${first.c.name} est passée ${hits[0].kind === 'below' ? 'sous' : 'au-dessus de'} ${money(hits[0].target, L)}`, body: `Prix du jour : ${money(hits[0].eur, L)} · ${first.c.number}`, url: pageOf(hits[0].key), tag: 'kirakai-' + day }
      : { title: `${hits.length} cartes ont franchi ton seuil`, body: hits.slice(0, 4).map((h) => line(h).txt).join('\n') + (hits.length > 4 ? '\n…' : ''), url: SITE + '#/suivis', tag: 'kirakai-' + day };
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 86400 });
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) { await api(`/rest/v1/nexus_push?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE', prefer: 'return=minimal' }); gone++; continue; }
      failed++; console.log('Envoi impossible', e.statusCode || '', String(e.body || e.message).slice(0, 120));
      for (const h of hits) { if (prev[h.key]) next[h.key] = prev[h.key]; else delete next[h.key]; } // nouvel essai demain
    }
  }
  if (JSON.stringify(next) !== JSON.stringify(prev)) await api(`/rest/v1/nexus_push?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'PATCH', prefer: 'return=minimal', body: { sent: next } });
}
console.log(`Alertes : ${subs.length} appareil${subs.length > 1 ? 's' : ''} abonné${subs.length > 1 ? 's' : ''}, ${sent} notification${sent > 1 ? 's' : ''} envoyée${sent > 1 ? 's' : ''}, ${gone} abonnement${gone > 1 ? 's' : ''} expiré${gone > 1 ? 's' : ''} retiré${gone > 1 ? 's' : ''}${failed ? `, ${failed} échec${failed > 1 ? 's' : ''}` : ''}.`);
