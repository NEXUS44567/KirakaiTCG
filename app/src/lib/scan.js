// Analyse d'une photo de carte, entièrement dans le navigateur.
// 1. repérer les bords de la carte  2. mesurer le centrage  3. chercher le blanchiment des coins et des bords
// 4. chercher les rayures et reflets  5. donner une note indicative sur 10.
// C'est une estimation par analyse d'image : elle ne remplace pas une notation professionnelle (PSA, CGC…).

const CARD_RATIO = 88 / 63; // hauteur / largeur

export function toCanvas(src, maxSide = 1400) {
  const w0 = src.naturalWidth || src.videoWidth || src.width, h0 = src.naturalHeight || src.videoHeight || src.height;
  const k = Math.min(1, maxSide / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function gray(data, w, h) {
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
  return g;
}
const smooth = (a, r = 3) => {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) { let s = 0, n = 0; for (let k = -r; k <= r; k++) { const v = a[i + k]; if (v !== undefined) { s += v; n++; } } out[i] = s / n; }
  return out;
};
function argmaxIn(a, from, to) { let best = from, bv = -Infinity; for (let i = Math.max(0, from); i < Math.min(a.length, to); i++) if (a[i] > bv) { bv = a[i]; best = i; } return [best, bv]; }

// Repère le rectangle de la carte (alignée avec la photo) par les profils de gradient.
export function detectCard(canvas, hint) {
  const w = canvas.width, h = canvas.height;
  const { data } = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);
  const g = gray(data, w, h);
  const H = hint || { x: 0, y: 0, w, h };
  const colP = new Float32Array(w), rowP = new Float32Array(h);
  const y0 = Math.round(H.y + H.h * 0.2), y1 = Math.round(H.y + H.h * 0.8);
  const x0 = Math.round(H.x + H.w * 0.2), x1 = Math.round(H.x + H.w * 0.8);
  for (let y = Math.max(1, y0); y < Math.min(h - 1, y1); y += 2) for (let x = 1; x < w - 1; x++) colP[x] += Math.abs(g[y * w + x + 1] - g[y * w + x - 1]);
  for (let x = Math.max(1, x0); x < Math.min(w - 1, x1); x += 2) for (let y = 1; y < h - 1; y++) rowP[y] += Math.abs(g[(y + 1) * w + x] - g[(y - 1) * w + x]);
  const cs = smooth(colP, 2), rs = smooth(rowP, 2);
  const mx = H.w * 0.12, my = H.h * 0.12;
  const [L, lv] = argmaxIn(cs, Math.round(H.x - mx), Math.round(H.x + H.w * 0.35));
  const [R, rv] = argmaxIn(cs, Math.round(H.x + H.w * 0.65), Math.round(H.x + H.w + mx));
  const [T, tv] = argmaxIn(rs, Math.round(H.y - my), Math.round(H.y + H.h * 0.35));
  const [B, bv] = argmaxIn(rs, Math.round(H.y + H.h * 0.65), Math.round(H.y + H.h + my));
  const meanC = cs.reduce((s, v) => s + v, 0) / cs.length, meanR = rs.reduce((s, v) => s + v, 0) / rs.length;
  const strength = Math.min(lv, rv) / (meanC || 1) + Math.min(tv, bv) / (meanR || 1);
  const rect = { x: L, y: T, w: R - L, h: B - T };
  const ratio = rect.h / Math.max(1, rect.w);
  const ok = rect.w > w * 0.2 && rect.h > h * 0.2 && Math.abs(ratio / CARD_RATIO - 1) < 0.14 && strength > 3;
  return { rect: ok ? rect : fitRatio(H), found: ok, strength, ratio };
}

export function fitRatio(r) {
  // plus grand rectangle au format carte centré dans r
  let w = r.w, h = w * CARD_RATIO;
  if (h > r.h) { h = r.h; w = h / CARD_RATIO; }
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
}

export function crop(canvas, r, outW = 630) {
  const c = document.createElement('canvas');
  c.width = outW; c.height = Math.round(outW * (r.h / r.w));
  c.getContext('2d', { willReadFrequently: true }).drawImage(canvas, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  return c;
}

const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
const sat = (d, i) => { const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]); return mx ? (mx - mn) / mx : 0; };
const dist = (d, i, c) => Math.hypot(d[i] - c[0], d[i + 1] - c[1], d[i + 2] - c[2]);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

// Largeur de la bordure imprimée sur chaque côté (en pixels de l'image recadrée)
function borders(d, w, h) {
  const at = (x, y) => (y * w + x) * 4;
  const sides = {};
  const probe = (side) => {
    const widths = [];
    const n = 21;
    for (let k = 0; k < n; k++) {
      const t = 0.25 + (0.5 * k) / (n - 1);
      const horiz = side === 'left' || side === 'right';
      const len = horiz ? w : h;
      const max = Math.round(len * 0.2);
      const start = Math.round(len * 0.012);
      const pos = (s) => { const s2 = side === 'left' || side === 'top' ? s : len - 1 - s; return horiz ? at(s2, Math.round(t * (h - 1))) : at(Math.round(t * (w - 1)), s2); };
      // couleur de la bordure : moyenne près du bord
      const ref = [0, 0, 0]; let m = 0;
      for (let s = start; s < start + Math.max(3, Math.round(len * 0.01)); s++) { const i = pos(s); ref[0] += d[i]; ref[1] += d[i + 1]; ref[2] += d[i + 2]; m++; }
      ref[0] /= m; ref[1] /= m; ref[2] /= m;
      let found = null, run = 0;
      for (let s = start + 2; s < max; s++) { if (dist(d, pos(s), ref) > 55) { if (++run >= 3) { found = s - 2; break; } } else run = 0; }
      if (found != null) widths.push(found);
    }
    const ok = widths.length >= n * 0.6;
    const med = median(widths);
    const spread = widths.length ? median(widths.map((x) => Math.abs(x - med))) : 99;
    return { width: med, ok: ok && spread <= Math.max(2, med * 0.15) && med > 2, samples: widths.length };
  };
  for (const s of ['left', 'right', 'top', 'bottom']) sides[s] = probe(s);
  return sides;
}

const centerScore = (worst) => {
  // worst = part du plus grand côté, en % (50 = parfait)
  const steps = [[55, 10], [60, 9], [65, 8], [70, 7], [75, 6], [80, 5], [85, 4], [90, 3], [100, 2]];
  let prev = [50, 10];
  for (const s of steps) { if (worst <= s[0]) { const t = (worst - prev[0]) / (s[0] - prev[0]); return +(prev[1] + (s[1] - prev[1]) * Math.max(0, t)).toFixed(1); } prev = s; }
  return 2;
};

export function analyze(card) {
  const w = card.width, h = card.height;
  const ctx = card.getContext('2d', { willReadFrequently: true });
  const { data: d } = ctx.getImageData(0, 0, w, h);
  const at = (x, y) => (y * w + x) * 4;

  // Netteté : variance du laplacien sur l'image en niveaux de gris
  const g = gray(d, w, h);
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 2; y < h - 2; y += 2) for (let x = 2; x < w - 2; x += 2) { const v = 4 * g[y * w + x] - g[y * w + x - 1] - g[y * w + x + 1] - g[(y - 1) * w + x] - g[(y + 1) * w + x]; sum += v; sum2 += v * v; n++; }
  const sharp = sum2 / n - (sum / n) ** 2;

  // Centrage
  const b = borders(d, w, h);
  let centering = null, lr = null, tb = null;
  if (b.left.ok && b.right.ok) lr = (Math.max(b.left.width, b.right.width) / (b.left.width + b.right.width)) * 100;
  if (b.top.ok && b.bottom.ok) tb = (Math.max(b.top.width, b.bottom.width) / (b.top.width + b.bottom.width)) * 100;
  if (lr != null || tb != null) centering = centerScore(Math.max(lr ?? 50, tb ?? 50));

  // Couleur de bordure moyenne (pour savoir si un pixel clair est un défaut)
  const bandIn = Math.max(3, Math.round(w * 0.012)), bandOut = Math.max(bandIn + 3, Math.round(w * 0.03));
  const refs = [];
  for (let k = 0; k < 40; k++) { const x = Math.round(w * (0.2 + 0.6 * (k / 39))); refs.push(at(x, bandOut), at(x, h - 1 - bandOut)); }
  let br = 0; for (const i of refs) br += lum(d, i); br /= refs.length;
  const whiteBorder = br > 200;
  const isWhite = (i) => lum(d, i) > Math.max(215, br + 35) && sat(d, i) < 0.18;

  // Coins : blanchiment dans une zone carrée près de chaque coin, sur la bande intérieure
  const cz = Math.round(w * 0.09);
  const cornerF = [];
  for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    let white = 0, tot = 0;
    for (let yy = 0; yy < cz; yy++) for (let xx = 0; xx < cz; xx++) {
      const inBand = (xx >= bandIn && xx < bandOut) || (yy >= bandIn && yy < bandOut);
      if (!inBand || xx < bandIn - 1 || yy < bandIn - 1) continue;
      if (xx + yy < cz * 0.35) continue; // arrondi du coin
      const x = cx ? w - 1 - xx : xx, y = cy ? h - 1 - yy : yy;
      tot++; if (isWhite(at(x, y))) white++;
    }
    cornerF.push(tot ? white / tot : 0);
  }
  // Bords : même mesure le long des 4 côtés, hors coins
  const edgeF = [];
  const side = (fn, len) => { let white = 0, tot = 0, runs = 0, inRun = false; for (let s = cz; s < len - cz; s++) { let wcol = 0; for (let k = bandIn; k < bandOut; k++) { tot++; if (isWhite(fn(s, k))) { white++; wcol++; } } const hit = wcol >= 2; if (hit && !inRun) runs++; inRun = hit; } return { f: tot ? white / tot : 0, runs }; };
  const sides = [side((s, k) => at(s, k), w), side((s, k) => at(s, h - 1 - k), w), side((s, k) => at(k, s), h), side((s, k) => at(w - 1 - k, s), h)];
  for (const s of sides) edgeF.push(s.f);
  const chips = sides.reduce((t, s) => t + s.runs, 0);

  // Surface : petits points ou traits clairs isolés (rayures) et grandes zones blanches (reflets)
  const ix0 = Math.round(w * 0.1), ix1 = Math.round(w * 0.9), iy0 = Math.round(h * 0.1), iy1 = Math.round(h * 0.9);
  let specks = 0, glare = 0, area = 0;
  for (let y = iy0 + 2; y < iy1 - 2; y += 2) for (let x = ix0 + 2; x < ix1 - 2; x += 2) {
    area++;
    const i = at(x, y);
    const L = lum(d, i);
    if (L > 245 && sat(d, i) < 0.08) glare++;
    const local = (g[y * w + x - 2] + g[y * w + x + 2] + g[(y - 2) * w + x] + g[(y + 2) * w + x]) / 4;
    if (L - local > 45 && sat(d, i) < 0.25) specks++;
  }
  const glareF = glare / area, speckF = specks / area;

  const cornerScore = (f) => +Math.max(1, 10 - f * 60).toFixed(1);
  const corners = +Math.min(...cornerF.map(cornerScore)).toFixed(1);
  const cornersAvg = cornerF.reduce((s, f) => s + cornerScore(f), 0) / 4;
  const edges = +Math.max(1, 10 - Math.max(...edgeF) * 80 - Math.max(0, chips - 6) * 0.15).toFixed(1);
  const surface = +Math.max(1, 10 - speckF * 400 - Math.max(0, glareF - 0.04) * 20).toFixed(1);

  const parts = { centering: centering ?? '—', corners: whiteBorder ? '—' : +((corners + cornersAvg) / 2).toFixed(1), edges: whiteBorder ? '—' : edges, surface };
  const nums = Object.values(parts).filter((v) => typeof v === 'number');
  const weights = { centering: 0.2, corners: 0.3, edges: 0.25, surface: 0.25 };
  let ws = 0, wsum = 0;
  for (const [k, v] of Object.entries(parts)) if (typeof v === 'number') { ws += v * weights[k]; wsum += weights[k]; }
  const avg = ws / wsum;
  let grade = Math.min(avg, Math.min(...nums) + 1.5);
  grade = Math.max(1, Math.min(10, Math.round(grade * 2) / 2));

  const warnings = [];
  if (sharp < 60) warnings.push('Photo un peu floue : rapproche-toi ou fais la mise au point, la note sera plus fiable.');
  if (glareF > 0.04) warnings.push('Reflet détecté sur la carte : incline-la légèrement ou éloigne la lumière.');
  if (centering == null) warnings.push('Centrage non mesurable : la bordure n’est pas assez nette (carte pleine illustration ou recadrage approximatif).');
  if (whiteBorder) warnings.push('Bordure claire : le blanchiment des coins et des bords ne peut pas être mesuré de façon fiable.');
  const confidence = Math.max(0.2, Math.min(1, (sharp > 150 ? 1 : sharp / 150) * (glareF > 0.04 ? 0.7 : 1) * (centering == null ? 0.85 : 1) * (whiteBorder ? 0.75 : 1)));

  return {
    grade, parts, confidence: +confidence.toFixed(2), warnings,
    details: { borders: b, lr: lr && +lr.toFixed(1), tb: tb && +tb.toFixed(1), cornerF, edgeF, chips, glareF, speckF, sharp: Math.round(sharp), whiteBorder, bandIn, bandOut, cz },
  };
}

export function gradeLabel(g) {
  if (g >= 9.5) return { cond: 'MT', label: 'Mint', text: 'Impeccable : candidate sérieuse à une note professionnelle élevée.' };
  if (g >= 8.5) return { cond: 'NM', label: 'Near Mint', text: 'Quasi parfaite : défauts minimes à peine visibles.' };
  if (g >= 7) return { cond: 'EX', label: 'Excellent', text: 'Belle carte avec une usure légère sur un coin ou un bord.' };
  if (g >= 5.5) return { cond: 'GD', label: 'Good', text: 'Usure visible : blanchiment ou petits défauts de surface.' };
  if (g >= 4) return { cond: 'LP', label: 'Light Played', text: 'Usure nette, la carte a été jouée.' };
  if (g >= 2.5) return { cond: 'PL', label: 'Played', text: 'Très jouée : nombreux défauts.' };
  return { cond: 'PO', label: 'Poor', text: 'Carte abîmée.' };
}

// ---- Lecture du numéro (OCR, via Tesseract.js chargé à la demande) ----
let tessP;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  tessP ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.onload = () => res(window.Tesseract); s.onerror = () => { tessP = null; rej(new Error('Lecteur de texte indisponible (connexion ?)')); };
    document.head.appendChild(s);
  });
  return tessP;
}
let workerP;
async function worker(onProgress) {
  const T = await loadTesseract();
  workerP ||= T.createWorker('eng', 1, { logger: (m) => m.status === 'recognizing text' && onProgress?.(m.progress) });
  return workerP;
}

function strip(card, y0, y1, x0 = 0, x1 = 1, scale = 2.5, invert = false) {
  const w = card.width, h = card.height;
  const sx = Math.round(w * x0), sy = Math.round(h * y0), sw = Math.round(w * (x1 - x0)), sh = Math.round(h * (y1 - y0));
  const c = document.createElement('canvas'); c.width = sw * scale; c.height = sh * scale;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(card, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const im = ctx.getImageData(0, 0, c.width, c.height); const d = im.data;
  let mean = 0; for (let i = 0; i < d.length; i += 4) mean += lum(d, i); mean /= d.length / 4;
  for (let i = 0; i < d.length; i += 4) { let v = lum(d, i); v = (v - mean) * 1.8 + 128; if (invert) v = 255 - v; v = Math.max(0, Math.min(255, v)); d[i] = d[i + 1] = d[i + 2] = v; }
  ctx.putImageData(im, 0, 0);
  return c;
}

export async function readCard(card, onProgress) {
  const wk = await worker(onProgress);
  const zones = [strip(card, 0.86, 1, 0, 1), strip(card, 0.86, 1, 0, 1, 2.5, true), strip(card, 0, 0.14, 0, 1), strip(card, 0.80, 0.9, 0.5, 1)];
  const texts = [];
  for (const z of zones) { const r = await wk.recognize(z); texts.push(r.data.text || ''); }
  return parseText(texts.join('\n'));
}

export function parseText(text) {
  const t = text.replace(/[|]/g, '1').replace(/[Oo](?=\d)/g, '0');
  const op = /\b(OP|EB|ST|PRB)\s?[-—–]?\s?(\d{2})\s?[-—–]\s?(\d{3})\b/i.exec(t.replace(/0P/g, 'OP'));
  const promo = /\bP\s?[-—–]\s?(\d{3})\b/.exec(t);
  const pk = /\b(\d{1,3})\s?\/\s?(\d{2,3})\b/.exec(t);
  const pkPromo = /\b(SVP|SWSH|SM|XY|BW|MEP)\s?(\d{2,3})\b/i.exec(t);
  const words = (t.match(/[A-Za-zÀ-ÿ'.-]{3,}/g) || []).slice(0, 40);
  return {
    raw: text,
    onepiece: op ? `${op[1].toUpperCase()}${op[2]}-${op[3]}` : promo ? `P-${promo[1]}` : null,
    pokemon: pk ? { number: String(+pk[1]), total: +pk[2] } : pkPromo ? { promo: pkPromo[1].toUpperCase() + pkPromo[2] } : null,
    words,
  };
}

// Associe le texte lu aux cartes du catalogue
export function matchCandidates(parsed, cats) {
  const out = [];
  if (parsed.onepiece) {
    for (const c of cats.onepiece.cards) if (c.number === parsed.onepiece) out.push([100 - (c.variant ? 5 : 0), c]);
  }
  if (parsed.pokemon) {
    const wset = new Set(parsed.words.map((w) => w.toLowerCase()));
    for (const c of cats.pokemon.cards) {
      let s = 0;
      if (parsed.pokemon.promo) { if (c.number.toUpperCase() === parsed.pokemon.promo) s = 80; }
      else if (c.number === parsed.pokemon.number) {
        const set = cats.pokemon.sets.get(c.set);
        s = 40;
        if (set?.printed === parsed.pokemon.total) s += 40;
        else if (set && Math.abs((set.printed || set.count) - parsed.pokemon.total) <= 2) s += 15;
      }
      if (!s) continue;
      for (const part of c.name.toLowerCase().split(/[\s-]+/)) if (part.length >= 3 && wset.has(part)) s += 15;
      out.push([s, c]);
    }
  }
  return out.sort((a, b) => b[0] - a[0]).slice(0, 12).map((x) => x[1]);
}
