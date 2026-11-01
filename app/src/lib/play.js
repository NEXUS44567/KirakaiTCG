// Section « Jouer » : partie en mode bac à sable sur un tapis de jeu.
// Le site gère les zones, le mélange, la pioche, les vies / récompenses, les DON!!, les dégâts et les états ;
// les joueurs appliquent eux-mêmes les règles, comme à une vraie table. Rien n'est envoyé en ligne :
// la partie en cours est gardée dans ce navigateur (clé PLAY_KEY) pour la reprendre plus tard.
import { useSyncExternalStore } from 'react';
import { load } from './data.js';

export const PLAY_KEY = 'kirakai.play';
const HISTORY = 60;

// ---- Decks ----
export const deckIndex = () => load('decks/index.json');
export const deckFile = (game, id) => load(`decks/${game}/${id}.json`);
export const deckSize = (d) => d.cards.reduce((a, c) => a + c.n, 0);
// Carte de couverture d'un deck (clé du catalogue)
export const coverKey = (meta) => meta.game + ':' + (meta.cover || meta.leader);

export const OP_COLORS = { Red: 'Rouge', Green: 'Vert', Blue: 'Bleu', Purple: 'Violet', Black: 'Noir', Yellow: 'Jaune' };
export const PK_TYPES = { Grass: 'Plante', Fire: 'Feu', Water: 'Eau', Lightning: 'Électrique', Psychic: 'Psy', Fighting: 'Combat', Darkness: 'Obscurité', Metal: 'Métal', Fairy: 'Fée', Dragon: 'Dragon', Colorless: 'Incolore' };
export const colorFr = (c) => String(c || '').split('/').map((x) => OP_COLORS[x.trim()] || x.trim()).join(' / ');
export const PK_COND = { asleep: 'Endormi', confused: 'Confus', paralyzed: 'Paralysé', poisoned: 'Empoisonné', burned: 'Brûlé' };

// Zones de chaque jeu : [id, nom, visible par l'adversaire]
export const ZONES = {
  onepiece: { deck: 'Deck', hand: 'Main', leader: 'Leader', chars: 'Personnages', stage: 'Lieu', trash: 'Défausse', life: 'Vie' },
  pokemon: { deck: 'Deck', hand: 'Main', active: 'Pokémon actif', bench: 'Banc', stadium: 'Stade', discard: 'Défausse', prizes: 'Récompenses' },
};
export const FIELD = { onepiece: ['leader', 'chars', 'stage'], pokemon: ['active', 'bench', 'stadium'] };
export const LIMIT = { chars: 5, bench: 5, active: 1, leader: 1, stage: 1, stadium: 1 };
export const TRASH = { onepiece: 'trash', pokemon: 'discard' };

// ---- Hasard (mélange de Fisher-Yates avec le générateur du navigateur) ----
const rnd = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
export function shuffleArr(a) { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export const coin = () => (rnd(2) ? 'pile' : 'face');
export const dice = () => 1 + rnd(6);

// ---- État de la partie (observable, enregistré dans le navigateur, avec annulation) ----
let S = null, past = [];
const subs = new Set();
const emit = () => subs.forEach((f) => f());
function persist() { try { if (S) localStorage.setItem(PLAY_KEY, JSON.stringify(S)); else localStorage.removeItem(PLAY_KEY); } catch {} }
try { S = JSON.parse(localStorage.getItem(PLAY_KEY)) || null; if (S && S.v !== 1) S = null; } catch { S = null; }
export const usePlay = (sel = (s) => s) => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => sel(S));
export const getPlay = () => S;
export const canUndo = () => past.length > 0;
export function undo() { if (!past.length) return; S = past.pop(); persist(); emit(); }
export function quit() { S = null; past = []; persist(); emit(); }

// Applique une action : copie de l'état, modification, journal, enregistrement
export function act(fn, ...args) {
  if (!S) return;
  const prev = S;
  const s = structuredClone(S);
  const msg = fn(s, ...args);
  if (msg === false) return;
  if (msg) s.log = [...s.log.slice(-199), [Date.now(), s.cur, msg]];
  past = [...past.slice(-(HISTORY - 1)), prev];
  S = s; persist(); emit();
}

// ---- Création d'une partie ----
const ON = (g) => (g === 'onepiece');
export function newGame({ game, decks, mode }) {
  const s = { v: 1, game, mode, turn: 1, cur: 0, first: 0, phase: 'mulligan', seq: 0, cards: {}, pl: [], log: [], startedAt: new Date().toISOString(), view: 0, peek: false, auto: true, winner: null };
  decks.forEach((d, p) => {
    const z = Object.fromEntries(Object.keys(ZONES[game]).map((k) => [k, []]));
    const pl = { deck: d.id, name: d.name, label: p === 0 ? 'Joueur 1' : 'Joueur 2', z, don: { deck: 10, active: 0, rested: 0 }, kept: false, mull: 0, lifeN: d.cards.find((c) => c.cat === 'LEADER')?.life || 5 };
    for (const c of d.cards) for (let i = 0; i < c.n; i++) {
      const uid = 'c' + ++s.seq;
      s.cards[uid] = { uid, id: c.id, p, up: false, rest: false, dmg: 0, pow: 0, don: 0, att: [], cond: [] };
      if (ON(game) && c.cat === 'LEADER') { pl.z.leader.push(uid); s.cards[uid].up = true; } else pl.z.deck.push(uid);
    }
    shuffleArr(pl.z.deck);
    s.pl.push(pl);
  });
  s.first = rnd(2); s.cur = s.first; s.view = s.first;
  const hand = ON(game) ? 5 : 7;
  s.pl.forEach((pl, p) => drawN(s, p, hand));
  s.log.push([Date.now(), s.first, `Tirage au sort : ${s.pl[s.first].label} commence.`]);
  past = []; S = s; persist(); emit();
  return s;
}

// ---- Outils ----
const P = (s, p) => s.pl[p];
export const zoneOf = (s, uid) => {
  const c = s.cards[uid]; if (!c) return null;
  for (const [k, list] of Object.entries(s.pl[c.p].z)) if (list.includes(uid)) return k;
  return null; // carte attachée sous une autre
};
const take = (s, uid) => { for (const pl of s.pl) for (const k of Object.keys(pl.z)) { const i = pl.z[k].indexOf(uid); if (i >= 0) { pl.z[k].splice(i, 1); return k; } } for (const c of Object.values(s.cards)) { const i = c.att.indexOf(uid); if (i >= 0) { c.att.splice(i, 1); return 'att'; } } return null; };
function drawN(s, p, n) {
  const pl = P(s, p); let k = 0;
  for (; k < n && pl.z.deck.length; k++) { const uid = pl.z.deck.shift(); s.cards[uid].up = true; pl.z.hand.push(uid); }
  return k;
}
export const nameOf = (s, uid, defs) => defs?.[s.cards[uid]?.p]?.[s.cards[uid]?.id]?.name || s.cards[uid]?.id || 'une carte';
const reset = (c) => { c.rest = false; c.dmg = 0; c.pow = 0; c.cond = []; };
// Une carte quitte le terrain : ses DON!! retournent (inclinés) dans la zone de coût, ses cartes attachées la suivent
function leaveField(s, uid, to) {
  const c = s.cards[uid], pl = P(s, c.p);
  if (c.don) { pl.don.rested += c.don; c.don = 0; }
  for (const a of c.att) { const x = s.cards[a]; reset(x); x.up = true; pl.z[to].push(a); }
  c.att = [];
  reset(c);
}

// ---- Actions (chacune renvoie la ligne du journal, ou false si rien ne change) ----
export const A = {
  // Main de départ : garder ou repiocher (One Piece : une fois ; Pokémon : sans Pokémon de base)
  keep(s, p) {
    const pl = P(s, p); pl.kept = true;
    let msg = `${pl.label} garde sa main.`;
    if (s.pl.every((x) => x.kept)) {
      s.phase = 'play';
      s.pl.forEach((x) => {
        if (ON(s.game)) for (let k = 0; k < x.lifeN && x.z.deck.length; k++) x.z.life.unshift(x.z.deck.shift());
        else for (let k = 0; k < 6 && x.z.deck.length; k++) x.z.prizes.push(x.z.deck.shift());
      });
      msg += ON(s.game) ? ' Les cartes Vie sont posées : la partie commence !' : ' Les 6 cartes Récompense sont posées : la partie commence !';
      s.log.push([Date.now(), p, msg]); msg = '';
      startTurn(s, ON(s.game));
    }
    return msg;
  },
  mulligan(s, p) {
    const pl = P(s, p);
    pl.z.deck.push(...pl.z.hand.splice(0)); pl.z.deck.forEach((u) => { s.cards[u].up = false; });
    shuffleArr(pl.z.deck); pl.mull++;
    drawN(s, p, ON(s.game) ? 5 : 7);
    if (ON(s.game)) { pl.kept = false; return A.keep(s, p).replace('garde sa main', 'reprend une nouvelle main (mulligan) et la garde'); }
    return `${pl.label} remélange sa main dans son deck et repioche 7 cartes (mulligan n° ${pl.mull}).`;
  },
  draw(s, p, n = 1) { const k = drawN(s, p, n); return k ? `${P(s, p).label} pioche ${k} carte${k > 1 ? 's' : ''}.` : `${P(s, p).label} ne peut plus piocher : son deck est vide !`; },
  shuffle(s, p) { shuffleArr(P(s, p).z.deck); return `${P(s, p).label} mélange son deck.`; },
  mill(s, p, n = 1) { const pl = P(s, p); let k = 0; for (; k < n && pl.z.deck.length; k++) { const u = pl.z.deck.shift(); s.cards[u].up = true; pl.z[TRASH[s.game]].unshift(u); } return `${pl.label} défausse ${k} carte${k > 1 ? 's' : ''} du dessus de son deck.`; },
  // Déplacer une carte vers une zone (place : 'top' ou 'bottom' pour le deck)
  move(s, uid, to, { place = 'top', down = false, slot } = {}, label = '') {
    const c = s.cards[uid]; if (!c) return false;
    const from = zoneOf(s, uid);
    const pl = P(s, c.p);
    if (LIMIT[to] && pl.z[to].length >= LIMIT[to] && from !== to) return false;
    const onField = (z) => FIELD[s.game].includes(z);
    if (onField(from) && !onField(to)) leaveField(s, uid, to === 'deck' || to === 'hand' ? TRASH[s.game] : to);
    if (from === 'att') { reset(c); }
    take(s, uid);
    if (to === 'deck') { c.up = false; c.rest = false; if (place === 'bottom') pl.z.deck.push(uid); else pl.z.deck.unshift(uid); }
    else if (to === 'life' || to === 'prizes') { c.up = false; pl.z[to].unshift(uid); }
    else { c.up = !down; if (to === TRASH[s.game] || to === 'hand') reset(c); if (slot != null) pl.z[to].splice(slot, 0, uid); else pl.z[to].push(uid); }
    const where = to === 'deck' ? (place === 'bottom' ? 'sous son deck' : 'sur son deck') : { hand: 'dans sa main', trash: 'à la défausse', discard: 'à la défausse', chars: 'sur le terrain', bench: 'sur le banc', active: 'en Pokémon actif', stage: 'en Lieu', stadium: 'en Stade', life: 'dans ses Vies', prizes: 'dans ses Récompenses', leader: 'en Leader' }[to];
    return `${pl.label} met ${down || to === 'deck' || to === 'life' || to === 'prizes' ? 'une carte' : label || 'une carte'} ${where}.`;
  },
  rest(s, uid, label) { const c = s.cards[uid]; c.rest = !c.rest; return `${P(s, c.p).label} ${c.rest ? 'incline' : 'redresse'} ${label}.`; },
  flip(s, uid, label) { const c = s.cards[uid]; c.up = !c.up; return `${P(s, c.p).label} retourne ${c.up ? label : 'une carte'} face ${c.up ? 'visible' : 'cachée'}.`; },
  // One Piece : DON!!
  donDraw(s, p, n = 1) { const d = P(s, p).don; const k = Math.min(n, d.deck); if (!k) return false; d.deck -= k; d.active += k; return `${P(s, p).label} ajoute ${k} DON!! à sa zone de coût.`; },
  donRest(s, p, n = 1) { const d = P(s, p).don; const k = Math.min(n, d.active); if (!k) return false; d.active -= k; d.rested += k; return `${P(s, p).label} incline ${k} DON!!.`; },
  donStand(s, p) { const d = P(s, p).don; if (!d.rested) return false; d.active += d.rested; d.rested = 0; return `${P(s, p).label} redresse ses DON!!.`; },
  donGive(s, uid, label) { const c = s.cards[uid], d = P(s, c.p).don; if (!d.active) return false; d.active--; c.don++; return `${P(s, c.p).label} donne un DON!! à ${label} (${c.don}).`; },
  donTake(s, uid, label) { const c = s.cards[uid], d = P(s, c.p).don; if (!c.don) return false; c.don--; d.rested++; return `${P(s, c.p).label} retire un DON!! de ${label}.`; },
  donBack(s, p, n = 1) { const d = P(s, p).don; const k = Math.min(n, d.active + d.rested); if (!k) return false; const a = Math.min(k, d.active); d.active -= a; d.rested -= k - a; d.deck += k; return `${P(s, p).label} renvoie ${k} DON!! dans son deck DON!!.`; },
  power(s, uid, v, label) { const c = s.cards[uid]; c.pow += v; return `${label} : puissance ${v > 0 ? '+' : ''}${v} (${c.pow > 0 ? '+' : ''}${c.pow}).`; },
  // One Piece : perdre une Vie (elle va dans la main)
  life(s, p) { const pl = P(s, p); if (!pl.z.life.length) return `${pl.label} n’a plus de Vie : la prochaine attaque réussie sur son Leader le fait perdre !`; const u = pl.z.life.shift(); s.cards[u].up = true; pl.z.hand.push(u); return `${pl.label} perd une Vie et la prend en main (${pl.z.life.length} restante${pl.z.life.length > 1 ? 's' : ''}).`; },
  // Pokémon : dégâts, états, énergies, évolution, récompenses
  dmg(s, uid, v, label) { const c = s.cards[uid]; c.dmg = Math.max(0, c.dmg + v); return `${label} : ${v > 0 ? '+' + v : v} dégâts (${c.dmg}).`; },
  cond(s, uid, k, label) { const c = s.cards[uid]; c.cond = c.cond.includes(k) ? c.cond.filter((x) => x !== k) : [...c.cond.filter((x) => !(['asleep', 'confused', 'paralyzed'].includes(k) && ['asleep', 'confused', 'paralyzed'].includes(x))), k]; return `${label} : ${c.cond.includes(k) ? '' : 'n’est plus '}${PK_COND[k].toLowerCase()}.`; },
  attach(s, uid, target, label, tlabel) { const t = s.cards[target]; take(s, uid); s.cards[uid].up = true; t.att.push(uid); return `${P(s, t.p).label} attache ${label} à ${tlabel}.`; },
  evolve(s, uid, target, label, tlabel) {
    const t = s.cards[target], c = s.cards[uid], pl = P(s, t.p);
    const z = zoneOf(s, target), i = pl.z[z].indexOf(target);
    take(s, uid); pl.z[z][i] = uid;
    c.up = true; c.dmg = t.dmg; c.att = [...t.att, target]; c.rest = false; c.cond = [];
    t.att = []; reset(t);
    return `${pl.label} fait évoluer ${tlabel} en ${label}.`;
  },
  detach(s, uid, label) { const owner = Object.values(s.cards).find((c) => c.att.includes(uid)); if (!owner) return false; take(s, uid); P(s, owner.p).z[TRASH[s.game]].unshift(uid); return `${P(s, owner.p).label} défausse ${label}.`; },
  swap(s, a, b) { const ca = s.cards[a], pl = P(s, ca.p); const za = zoneOf(s, a), zb = zoneOf(s, b); const ia = pl.z[za].indexOf(a), ib = pl.z[zb].indexOf(b); pl.z[za][ia] = b; pl.z[zb][ib] = a; for (const u of [a, b]) s.cards[u].cond = []; return `${pl.label} échange son Pokémon actif avec un Pokémon de son banc.`; },
  ko(s, uid, label) { const c = s.cards[uid]; const pl = P(s, c.p); leaveField(s, uid, TRASH[s.game]); take(s, uid); pl.z[TRASH[s.game]].unshift(uid); return `${label} est K.O. !`; },
  prize(s, p) { const pl = P(s, p); if (!pl.z.prizes.length) return false; const u = pl.z.prizes.shift(); s.cards[u].up = true; pl.z.hand.push(u); if (!pl.z.prizes.length) s.winner = p; return pl.z.prizes.length ? `${pl.label} prend une carte Récompense (${pl.z.prizes.length} restante${pl.z.prizes.length > 1 ? 's' : ''}).` : `${pl.label} prend sa dernière carte Récompense et gagne la partie !`; },
  // Pile ou face, dé
  coin(s, p, r) { return `${P(s, p).label} lance une pièce : ${r} !`; },
  dice(s, p, r) { return `${P(s, p).label} lance un dé : ${r}.`; },
  // Fin du tour : au tour de l'autre joueur (début de tour automatique si activé)
  end(s) {
    const was = s.cur;
    s.cur = 1 - s.cur; if (s.cur === s.first) s.turn++;
    if (s.mode === 'duo') s.view = s.cur; else s.view = s.cur;
    const msg = `${P(s, was).label} termine son tour.`;
    if (s.auto) startTurn(s, false);
    return msg;
  },
  auto(s) { s.auto = !s.auto; return `Début de tour automatique ${s.auto ? 'activé' : 'désactivé'}.`; },
  peek(s) { s.peek = !s.peek; return false; },
  win(s, p) { s.winner = p; return `${P(s, p).label} remporte la partie !`; },
};

// Début du tour : One Piece — redresser, piocher, +2 DON!! ; Pokémon — piocher. Le premier tour du premier joueur
// ne pioche pas (One Piece) et ne reçoit qu'un DON!!.
function startTurn(s, first) {
  const p = s.cur, pl = P(s, p);
  const firstTurn = first || (s.turn === 1 && p === s.first);
  const lines = [];
  if (ON(s.game)) {
    for (const z of ['leader', 'chars', 'stage']) for (const u of pl.z[z]) { const c = s.cards[u]; if (c.don) { pl.don.active += c.don; c.don = 0; } c.rest = false; c.pow = 0; }
    pl.don.active += pl.don.rested; pl.don.rested = 0;
    if (!firstTurn) { const k = drawN(s, p, 1); lines.push(k ? 'pioche 1 carte' : 'ne peut plus piocher'); }
    const n = Math.min(firstTurn ? 1 : 2, pl.don.deck); pl.don.deck -= n; pl.don.active += n;
    lines.push(`reçoit ${n} DON!!`);
    s.log.push([Date.now(), p, `Tour ${s.turn} — ${pl.label} redresse ses cartes, ${lines.join(' et ')}.`]);
  } else if (!first) {
    const k = drawN(s, p, 1);
    s.log.push([Date.now(), p, `Tour ${s.turn} — ${pl.label} ${k ? 'pioche 1 carte' : 'ne peut plus piocher : il perd la partie !'}.`]);
  }
}

// Détail des cartes des deux decks (par joueur) : id → carte du fichier de deck
export async function loadDefs(s) {
  const out = [];
  for (const pl of s.pl) { const d = await deckFile(s.game, pl.deck); out.push(Object.fromEntries(d.cards.map((c) => [c.id, c]))); }
  return out;
}
