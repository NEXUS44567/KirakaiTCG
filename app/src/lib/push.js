// Alertes de prix sur le téléphone : abonnement aux notifications de cet appareil et envoi de ses seuils.
// Le robot du dépôt (v3/alerts/send.mjs) les compare chaque matin aux nouveaux prix et envoie les notifications.
import { cloudOn, rpc } from './cloud.js';
import { getState, onStore, update } from './store.js';

export const pushSupported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// Sur iPhone et iPad, les notifications ne marchent que dans l'application installée sur l'écran d'accueil
export const needsInstall = () => isIos() && !standalone();

const key = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
export const alertsOf = (s = getState()) => Object.fromEntries(Object.entries(s.watch || {}).filter(([, w]) => w.below != null || w.above != null).map(([k, w]) => [k, { below: w.below ?? null, above: w.above ?? null }]));

async function save(sub) {
  const j = sub.toJSON();
  await rpc('nexus_push_save', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_alerts: alertsOf(), p_lang: getState().lang || 'fr' });
}

export async function enablePush() {
  if (!cloudOn() || !pushSupported()) throw new Error('Ce navigateur ne gère pas les notifications.');
  if (needsInstall()) throw new Error('Sur iPhone, installe d’abord Kirakai sur ton écran d’accueil (Partager › Sur l’écran d’accueil) et ouvre-le depuis son icône.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications refusées : tu peux les autoriser dans les réglages de ton navigateur.');
  const pub = await rpc('nexus_push_key');
  if (!pub) throw new Error('Les notifications de Kirakai se mettent en place : réessaie demain.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(pub) }));
  await save(sub);
  update((s) => { s.settings = { ...s.settings, push: true }; });
}

export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await rpc('nexus_push_delete', { p_endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
  } finally { update((s) => { s.settings = { ...s.settings, push: false }; }); }
}

// Seuils modifiés (ou langue) : renvoyés quelques secondes plus tard
let timer = 0, last = '';
export function startPushSync() {
  if (!cloudOn() || !pushSupported()) return;
  const run = async () => {
    const s = getState();
    if (!s.settings?.push) return;
    const sig = JSON.stringify([alertsOf(s), s.lang]);
    if (sig === last) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) { update((x) => { x.settings = { ...x.settings, push: false }; }); return; } // autorisation retirée
      await save(sub); last = sig;
    } catch {}
  };
  onStore(() => { clearTimeout(timer); timer = setTimeout(run, 3000); });
  setTimeout(run, 6000);
}
