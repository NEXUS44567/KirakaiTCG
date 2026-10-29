import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CUR, fmtEur, fmtShort, fmtDate } from '../lib/data.js';

// Courbe lissée monotone (pas de bosse inventée entre deux relevés)
export function smoothPath(pts) {
  const n = pts.length;
  if (n < 2) return '';
  if (n === 2) return `M${pts[0][0]} ${pts[0][1]}L${pts[1][0]} ${pts[1][1]}`;
  const dx = [], dy = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; dy[i] = pts[i + 1][1] - pts[i][1]; m[i] = dy[i] / (dx[i] || 1); }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${(pts[i][0] + h).toFixed(1)} ${(pts[i][1] + h * t[i]).toFixed(1)} ${(pts[i + 1][0] - h).toFixed(1)} ${(pts[i + 1][1] - h * t[i + 1]).toFixed(1)} ${pts[i + 1][0].toFixed(1)} ${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
}

// ---- Graphique de prix (une ou plusieurs séries de [date, valeur]) ----
// Largeur réelle du conteneur : le texte du graphique garde sa taille sur mobile comme sur ordinateur
function useWidth(ref, fallback = 720) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return w;
}

export function PriceChart(props) {
  const box = useRef();
  const W = useWidth(box);
  return <div className="chart-wrap" ref={box}><ChartInner {...props} W={W} /></div>;
}

function ChartInner({ series, height = 240, empty, compact, W }) {
  const [hover, setHover] = useState(null);
  const ref = useRef();
  const gid = useId().replace(/[^a-z0-9]/gi, '');
  const pts = series.flatMap((s) => s.points);
  const dates = useMemo(() => [...new Set(pts.map((p) => p[0]))].sort(), [series]);
  if (pts.length < 2 || dates.length < 2) return <div className="chart-empty"><span className="ce-line" aria-hidden="true" />{empty || 'L’historique se construit : un relevé par jour.'}</div>;
  const H = height, L = compact ? 8 : 58, R = compact ? 8 : 14, T = 18, B = compact ? 8 : 28;
  const vals = pts.map((p) => p[1]);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min *= 0.9; max *= 1.1; }
  const pad = (max - min) * 0.14; min = Math.max(0, min - pad); max += pad;
  const di = new Map(dates.map((d, i) => [d, i]));
  const x = (d) => L + (di.get(d) / (dates.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const ticks = [0, 0.33, 0.66, 1].map((t) => min + t * (max - min));
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * (dates.length - 1));
    setHover(Math.max(0, Math.min(dates.length - 1, i)));
  };
  const hd = hover != null ? dates[hover] : null;
  const single = series.length === 1 ? series[0] : null;
  let hi = null, lo = null;
  if (single && !compact) {
    for (const p of single.points) { if (!hi || p[1] > hi[1]) hi = p; if (!lo || p[1] < lo[1]) lo = p; }
  }
  const dec = (t) => (t < 10 || (max - min) * CUR.rate < 20 ? 2 : 0);
  const xTicks = dates.length > 2 && !compact ? [0, Math.round((dates.length - 1) / 2), dates.length - 1] : [0, dates.length - 1];
  return (
    <div className={'chart' + (compact ? ' compact' : '')}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width={W} height={H} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label="Évolution du prix">
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={gid + 'a' + i} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: s.color, stopOpacity: 0.35 }} /><stop offset="1" style={{ stopColor: s.color, stopOpacity: 0 }} />
            </linearGradient>
          ))}
        </defs>
        {!compact && ticks.map((t, i) => <g key={i}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="grid" /><text x={L - 10} y={y(t) + 4} className="ylab">{fmtEur(t, { decimals: dec(t) })}</text></g>)}
        {!compact && xTicks.map((k, i) => <text key={k} x={x(dates[k])} y={H - 8} className={'xlab' + (i === 0 ? ' start' : i === xTicks.length - 1 ? ' end' : '')}>{fmtDate(dates[k], { day: 'numeric', month: 'short' })}</text>)}
        {series.map((s, i) => {
          const p = s.points.map((q) => [x(q[0]), y(q[1])]);
          const d = smoothPath(p);
          return (
            <g key={i} className="serie">
              {(series.length === 1) && p.length > 1 && <path d={d + `L${p.at(-1)[0]} ${H - B}L${p[0][0]} ${H - B}Z`} fill={`url(#${gid}a${i})`} className="area" />}
              <path d={d} className="line" style={{ stroke: s.color }} pathLength="1" />
              {p.length < 14 && p.map((q, k) => <circle key={k} cx={q[0]} cy={q[1]} r="3.5" className="dot" style={{ fill: s.color }} />)}
            </g>
          );
        })}
        {hi && hi !== lo && <g className="mark hi"><circle cx={x(hi[0])} cy={y(hi[1])} r="5" /><text x={Math.min(W - R - 24, Math.max(L + 24, x(hi[0])))} y={y(hi[1]) - 10}>{fmtShort(hi[1])}</text></g>}
        {lo && hi !== lo && <g className="mark lo"><circle cx={x(lo[0])} cy={y(lo[1])} r="5" /><text x={Math.max(L + 24, x(lo[0]))} y={y(lo[1]) + 20 > H - B ? y(lo[1]) - 12 : y(lo[1]) + 20}>{fmtShort(lo[1])}</text></g>}
        {hd && <line x1={x(hd)} x2={x(hd)} y1={T} y2={H - B} className="cursor" />}
        {hd && series.map((s, i) => { const p = s.points.find((q) => q[0] === hd); return p ? <circle key={i} cx={x(hd)} cy={y(p[1])} r="6" className="cursor-dot" style={{ fill: s.color }} /> : null; })}
      </svg>
      {hd && (
        <div className="chart-tip" style={{ left: Math.min(88, Math.max(12, (x(hd) / W) * 100)) + '%' }}>
          <b>{fmtDate(hd, { day: 'numeric', month: 'short', year: 'numeric' })}</b>
          {series.map((s, i) => { const p = s.points.find((q) => q[0] === hd); return p ? <span key={i}><i style={{ background: s.color }} />{s.label ? s.label + ' · ' : ''}{fmtEur(p[1])}</span> : null; })}
        </div>
      )}
    </div>
  );
}

export function Sparkline({ points, color = 'currentColor', width = 96, height = 30 }) {
  if (!points || points.length < 2) return null;
  const v = points.map((p) => p[1]);
  const min = Math.min(...v), max = Math.max(...v);
  const p = v.map((n, i) => [(i / (v.length - 1)) * width, height - 3 - ((n - min) / (max - min || 1)) * (height - 6)]);
  return <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true"><path d={smoothPath(p)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" /></svg>;
}

// Anneau en parts (répartition d'une collection)
export function Donut({ parts, size = 180, stroke = 22, center }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Répartition">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={stroke} />
        {parts.map((p, i) => {
          const len = (p.value / total) * c, off = acc; acc += len;
          return <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={stroke} strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-off} transform={`rotate(-90 ${size / 2} ${size / 2})`} className="donut-seg" style={{ '--i': i }}><title>{p.label}</title></circle>;
        })}
      </svg>
      {center && <div className="donut-center">{center}</div>}
    </div>
  );
}

// Toile d'araignée des statistiques (Pokédex)
export function Radar({ values, labels, max = 200, color = 'var(--a1)', size = 260 }) {
  const n = values.length, cx = size / 2, cy = size / 2, R = size / 2 - 34;
  const pt = (i, v) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v]; };
  const poly = (k) => Array.from({ length: n }, (_, i) => pt(i, k).join(',')).join(' ');
  const shape = values.map((v, i) => pt(i, Math.min(1, v / max)).join(',')).join(' ');
  return (
    <svg className="radar" viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size }} role="img" aria-label="Statistiques">
      {[0.25, 0.5, 0.75, 1].map((k) => <polygon key={k} points={poly(k)} className="radar-grid" />)}
      {values.map((_, i) => { const [x2, y2] = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x2} y2={y2} className="radar-axis" />; })}
      <polygon points={shape} className="radar-shape" style={{ fill: color, stroke: color }} />
      {values.map((v, i) => { const [x, y] = pt(i, Math.min(1, v / max)); return <circle key={i} cx={x} cy={y} r="3.5" style={{ fill: color }} />; })}
      {labels.map((l, i) => { const [x, y] = pt(i, 1.22); return <text key={i} x={x} y={y} className="radar-label">{l}<tspan x={x} dy="13" className="radar-val">{values[i]}</tspan></text>; })}
    </svg>
  );
}

// Barres horizontales simples
export function HBars({ rows, format = fmtShort, color }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="hbars">
      {rows.map((r, i) => {
        const Tag = r.href ? 'a' : 'div';
        return (
          <Tag key={r.label + i} className="hb" href={r.href} style={{ '--i': i }}>
            <span className="hb-label">{r.label}{r.sub && <small>{r.sub}</small>}</span>
            <span className="hb-track"><i style={{ width: (r.value / max) * 100 + '%', background: r.color || color }} /></span>
            <b>{format(r.value)}</b>
          </Tag>
        );
      })}
    </div>
  );
}
