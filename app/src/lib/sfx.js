// Sons de synthèse (aucun fichier à charger) et petits effets de particules.
import { getState } from './store.js';
import { reduceMotion } from './hooks.js';

let actx = null;
const soundOn = () => getState().settings?.sound !== false && !getState().muted;
function ac() { if (!soundOn()) return null; try { actx ??= new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); return actx; } catch { return null; } }
function tone(f, at, dur, type = 'triangle', vol = 0.12) {
  const c = ac(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0, c.currentTime + at); g.gain.linearRampToValueAtTime(vol, c.currentTime + at + 0.01); g.gain.exponentialRampToValueAtTime(1e-4, c.currentTime + at + dur);
  o.connect(g).connect(c.destination); o.start(c.currentTime + at); o.stop(c.currentTime + at + dur + 0.05);
}
function noise(dur, { from = 900, to = 3800, type = 'bandpass', vol = 0.3, decay = 2, at = 0 } = {}) {
  const c = ac(); if (!c) return;
  const n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** decay;
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = b; f.type = type; f.frequency.setValueAtTime(from, c.currentTime + at); f.frequency.linearRampToValueAtTime(to, c.currentTime + at + dur);
  g.gain.value = vol; s.connect(f).connect(g).connect(c.destination); s.start(c.currentTime + at);
}
export const SFX = {
  tear() { noise(0.45); },
  whoosh() { noise(0.35, { from: 400, to: 1800, vol: 0.12, decay: 1.4 }); },
  haki() { const c = ac(); if (!c) return; const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.setValueAtTime(90, c.currentTime); o.frequency.exponentialRampToValueAtTime(38, c.currentTime + 0.8); g.gain.setValueAtTime(1e-4, c.currentTime); g.gain.exponentialRampToValueAtTime(0.18, c.currentTime + 0.05); g.gain.exponentialRampToValueAtTime(1e-4, c.currentTime + 0.9); f.type = 'lowpass'; f.frequency.value = 400; o.connect(f).connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 1); },
  thunder() { for (let k = 0; k < 3; k++) noise(0.18, { from: 1800, to: 1800, type: 'highpass', vol: 0.3, decay: 3, at: k * 0.12 }); },
  flip() { tone(1250, 0, 0.05, 'square', 0.035); tone(620, 0.02, 0.08, 'triangle', 0.06); },
  tick() { tone(1800, 0, 0.03, 'square', 0.02); },
  coin() { tone(988, 0, 0.08, 'square', 0.05); tone(1319, 0.07, 0.25, 'square', 0.05); },
  charge() { const c = ac(); if (!c) return; const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(220, c.currentTime); o.frequency.exponentialRampToValueAtTime(880, c.currentTime + 0.8); g.gain.setValueAtTime(1e-4, c.currentTime); g.gain.exponentialRampToValueAtTime(0.09, c.currentTime + 0.6); g.gain.exponentialRampToValueAtTime(1e-4, c.currentTime + 0.85); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.9); },
  rare(lv) { const n = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98, 2093]; for (let i = 0; i < Math.min(n.length, 2 + lv); i++) tone(n[i], i * 0.07, 0.5, 'triangle', 0.1); if (lv >= 3) tone(2093, 0.5, 0.9, 'sine', 0.06); },
  success() { [659.25, 830.61, 987.77, 1318.5].forEach((f, i) => tone(f, i * 0.06, 0.35, 'triangle', 0.07)); },
};
export const vibrate = (p) => { try { navigator.vibrate?.(p); } catch {} };

// ---- Gerbe de particules (confettis, étincelles) sur un canvas plein écran ----
const PALETTES = {
  1: ['#7cc4ff', '#ffffff'], 2: ['#b48bff', '#7cc4ff', '#ffffff'], 3: ['#ffd76a', '#fff3c2', '#ffb347', '#ffffff'],
  4: ['#ff6b9a', '#ffd76a', '#7cf5c4', '#7cc4ff', '#b48bff'], 5: ['#ffd76a', '#ffffff', '#ff6b9a', '#7cf5c4', '#7cc4ff', '#b48bff', '#ff9f43'],
};
export function burst(target, lv = 2, { x, y } = {}) {
  if (lv < 1 || reduceMotion()) return;
  const r = target?.getBoundingClientRect?.() || { left: x ?? innerWidth / 2, top: y ?? innerHeight / 2, width: 0, height: 0 };
  const cv = document.createElement('canvas'); cv.className = 'fx-canvas';
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; document.body.appendChild(cv);
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const pal = PALETTES[Math.min(5, lv)], n = 40 + lv * 40, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const ps = Array.from({ length: n }, (_, i) => {
    const a = Math.random() * Math.PI * 2, v = 3 + Math.random() * (5 + lv * 2.2);
    return { x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, s: 2 + Math.random() * 5, c: pal[i % pal.length], r: Math.random() * 6, star: i % 4 === 0 };
  });
  const t0 = performance.now();
  const step = (t) => {
    const u = (t - t0) / 1700; g.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of ps) {
      p.vy += 0.17; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += 0.18;
      g.save(); g.globalAlpha = Math.max(0, 1 - u); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c;
      if (p.star) { g.beginPath(); for (let k = 0; k < 8; k++) { const rr = k % 2 ? p.s * 0.35 : p.s; g.lineTo(Math.cos((k * Math.PI) / 4) * rr, Math.sin((k * Math.PI) / 4) * rr); } g.fill(); }
      else g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      g.restore();
    }
    if (u < 1) requestAnimationFrame(step); else cv.remove();
  };
  requestAnimationFrame(step);
}
