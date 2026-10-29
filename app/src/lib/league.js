// Classement des collectionneurs : saisons de 30 jours, score = cartes de l'extension obtenues pendant la saison.
import { SUPABASE } from './config.js';

export const SEASON_EPOCH = Date.parse('2026-10-24T23:00:00Z'); // 25 octobre 2026, minuit (heure d'hiver de Paris)
export const SEASON_LEN = 30 * 24 * 3600 * 1000;
export function seasonNow(t = Date.now()) {
  const n = Math.floor((t - SEASON_EPOCH) / SEASON_LEN) + 1;
  const start = SEASON_EPOCH + (n - 1) * SEASON_LEN;
  return { n: Math.max(1, n), start, end: start + SEASON_LEN, started: t >= SEASON_EPOCH };
}
export const leagueOn = () => !!(SUPABASE.url && SUPABASE.key);
// Les nouvelles clés « publishable » ne sont pas des jetons : elles vont seulement dans l'en-tête apikey
const H = () => ({ apikey: SUPABASE.key, ...(/^eyJ/.test(SUPABASE.key) ? { Authorization: 'Bearer ' + SUPABASE.key } : {}), 'Content-Type': 'application/json' });

export async function fetchBoard(game, season, limit = 100) {
  const q = `select=player_id,pseudo,owned,total,packs,updated_at&season=eq.${season}&game=eq.${game}&order=owned.desc,updated_at.asc&limit=${limit}`;
  const r = await fetch(`${SUPABASE.url}/rest/v1/league_scores?${q}`, { headers: H() });
  if (!r.ok) throw new Error('classement indisponible (' + r.status + ')');
  return r.json();
}
export async function fetchRank(game, season, owned, updatedAt) {
  // nombre de joueurs devant moi
  const q = `select=player_id&season=eq.${season}&game=eq.${game}&or=(owned.gt.${owned},and(owned.eq.${owned},updated_at.lt.${encodeURIComponent(updatedAt)}))`;
  const r = await fetch(`${SUPABASE.url}/rest/v1/league_scores?${q}`, { headers: { ...H(), Prefer: 'count=exact', Range: '0-0' } });
  const c = r.headers.get('content-range'); const n = c ? +c.split('/')[1] : NaN;
  return Number.isFinite(n) ? n + 1 : null;
}
export async function submitScore(p) {
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/submit_score`, { method: 'POST', headers: H(), body: JSON.stringify(p) });
  if (!r.ok) { let m = ''; try { m = (await r.json()).message; } catch {} throw new Error(m || 'envoi impossible'); }
}
export function newIdentity() {
  const a = new Uint8Array(24); crypto.getRandomValues(a);
  return { id: crypto.randomUUID ? crypto.randomUUID() : [...crypto.getRandomValues(new Uint8Array(16))].map((b, i) => (i === 6 ? (b & 15) | 64 : i === 8 ? (b & 63) | 128 : b).toString(16).padStart(2, '0')).join('').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5'), secret: [...a].map((b) => b.toString(16).padStart(2, '0')).join('') };
}
