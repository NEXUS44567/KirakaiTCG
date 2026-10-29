import React, { useId } from 'react';

// ---- Identité Kirakai : vague et étincelle, emblèmes originaux des deux univers, dos de carte ----
// Kirakai : « kira » (キラ), l'éclat d'une carte brillante en japonais, et « kai » (海), la mer.
// Aucun logo officiel : la boussole-gouvernail (One Piece) et le noyau d'énergie (Pokémon) sont dessinés pour Kirakai.
const useIds = () => { const id = useId().replace(/[^a-z0-9]/gi, ''); return (n) => `${n}${id}`; };

// Glyphe : une vague dont le creux abrite une étincelle, une plus petite au-dessus
export function LogoMark({ size = 36, className = '' }) {
  const g = useIds();
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={'logo-mark ' + className} aria-hidden="true">
      <defs>
        <linearGradient id={g('w')} x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stopColor="#7df4ff" /><stop offset=".42" stopColor="#3d8cff" /><stop offset="1" stopColor="#6b2bff" /></linearGradient>
        <linearGradient id={g('s')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fffef6" /><stop offset=".55" stopColor="#ffe37a" /><stop offset="1" stopColor="#ffae2b" /></linearGradient>
        <radialGradient id={g('h')} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#ffe9a0" stopOpacity=".7" /><stop offset="1" stopColor="#ffe9a0" stopOpacity="0" /></radialGradient>
      </defs>
      <path d="M6 57C9.5 42 18.5 25 33 15.5C42.5 9.5 54 11.5 58.3 21C61.6 28.6 58.3 37 51.5 39C45.6 40.6 41.4 36.6 43.6 31.6C46.2 33 48.6 32.2 49 29.6C49.2 25.4 42 22.6 35.6 26.6C27.6 31.6 23.6 44 25.4 57Z" fill={`url(#${g('w')})`} />
      <path d="M13.4 50C16 40.5 21.5 31 30 24.2" fill="none" stroke="#fff" strokeOpacity=".32" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M18.6 52.5C20 44 23.6 36.8 29.4 31.2" fill="none" stroke="#fff" strokeOpacity=".2" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M18.2 28.2C23.4 21.6 28 18 33 15.5C42.5 9.5 54 11.5 58.3 21" fill="none" stroke="#fff" strokeOpacity=".92" strokeWidth="1.9" strokeLinecap="round" />
      <circle className="lm-glow" cx="39.6" cy="42" r="11.5" fill={`url(#${g('h')})`} />
      <path className="lm-spark" d="M39.6 31.4Q40.8 40.8 47.4 42Q40.8 43.2 39.6 52.4Q38.4 43.2 31.8 42Q38.4 40.8 39.6 31.4Z" fill={`url(#${g('s')})`} />
      <path d="M12.5 9Q13 12.5 16.5 13Q13 13.5 12.5 17Q12 13.5 8.5 13Q12 12.5 12.5 9Z" fill="#fff6d0" />
      <path d="M4 59.5C13.5 55 21.5 59.5 31.5 55.6C41.5 51.8 50 57.4 60 53.6" fill="none" stroke={`url(#${g('w')})`} strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ size = 34, tag = true }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo-word">KIRA<span className="lw-kai">KAI</span>{tag && <small lang="ja">キラカイ</small>}</span>
    </span>
  );
}

// Boussole-gouvernail du Grand Line
export function OPEmblem({ size = 64, className = '' }) {
  const g = useIds();
  const spokes = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
  const star = (r1, r2, rot = -Math.PI / 2) => Array.from({ length: 16 }, (_, k) => { const a = rot + (k * Math.PI) / 8; const r = k % 4 === 0 ? r1 : k % 2 === 0 ? r2 : r2 * 0.38; return [60 + Math.cos(a) * r, 60 + Math.sin(a) * r]; });
  const pts = star(40, 25);
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={'emblem ' + className} aria-hidden="true">
      <defs>
        <radialGradient id={g('bg')} cx=".5" cy=".42" r=".6"><stop offset="0" stopColor="#173763" /><stop offset="1" stopColor="#081428" /></radialGradient>
        <linearGradient id={g('gold')} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff1b8" /><stop offset=".45" stopColor="#ffc94a" /><stop offset="1" stopColor="#b9771b" /></linearGradient>
        <linearGradient id={g('red')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff7a6b" /><stop offset="1" stopColor="#c81e2c" /></linearGradient>
      </defs>
      <g stroke={`url(#${g('gold')})`} strokeWidth="5.5" strokeLinecap="round">
        {spokes.map((a, i) => <line key={i} x1={60 + Math.cos(a) * 30} y1={60 + Math.sin(a) * 30} x2={60 + Math.cos(a) * 54} y2={60 + Math.sin(a) * 54} />)}
      </g>
      {spokes.map((a, i) => <circle key={i} cx={60 + Math.cos(a) * 54} cy={60 + Math.sin(a) * 54} r="5.6" fill={`url(#${g('gold')})`} stroke="#5a3a0c" strokeWidth="1" />)}
      <circle cx="60" cy="60" r="44" fill={`url(#${g('bg')})`} stroke={`url(#${g('gold')})`} strokeWidth="5" />
      <circle cx="60" cy="60" r="37" fill="none" stroke="#ffc94a" strokeOpacity=".35" strokeWidth="1" strokeDasharray="2 4" />
      {pts.map((p, k) => {
        if (k % 2) return null;
        const prev = pts[(k + 15) % 16], next = pts[(k + 1) % 16];
        return <g key={k}><path d={`M60 60L${prev[0]} ${prev[1]}L${p[0]} ${p[1]}z`} fill={k % 4 === 0 ? `url(#${g('red')})` : '#ffe9a8'} opacity={k % 4 === 0 ? 1 : 0.9} /><path d={`M60 60L${p[0]} ${p[1]}L${next[0]} ${next[1]}z`} fill={k % 4 === 0 ? '#8e1420' : '#c99a33'} /></g>;
      })}
      <circle cx="60" cy="60" r="6" fill={`url(#${g('gold')})`} stroke="#5a3a0c" strokeWidth="1.2" />
    </svg>
  );
}

// Noyau d'énergie électrique
export function PKEmblem({ size = 64, className = '' }) {
  const g = useIds();
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={'emblem ' + className} aria-hidden="true">
      <defs>
        <radialGradient id={g('orb')} cx=".38" cy=".32" r=".75"><stop offset="0" stopColor="#8fb6ff" /><stop offset=".45" stopColor="#3d6dff" /><stop offset="1" stopColor="#141f6e" /></radialGradient>
        <linearGradient id={g('bolt')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fffbd1" /><stop offset=".4" stopColor="#ffe14a" /><stop offset="1" stopColor="#ffab00" /></linearGradient>
        <radialGradient id={g('glow')} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#ffe14a" stopOpacity=".55" /><stop offset="1" stopColor="#ffe14a" stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx="60" cy="60" r="58" fill={`url(#${g('glow')})`} />
      <ellipse cx="60" cy="60" rx="55" ry="20" fill="none" stroke="#ffe14a" strokeOpacity=".7" strokeWidth="2.4" transform="rotate(-28 60 60)" />
      <ellipse cx="60" cy="60" rx="55" ry="20" fill="none" stroke="#7fa6ff" strokeOpacity=".8" strokeWidth="2.4" transform="rotate(28 60 60)" />
      <circle cx="60" cy="60" r="36" fill={`url(#${g('orb')})`} stroke="#0b1240" strokeWidth="3" />
      <ellipse cx="49" cy="44" rx="13" ry="7" fill="#fff" opacity=".28" transform="rotate(-30 49 44)" />
      <path d="M66 30 42 66h15l-6 26 27-38H62z" fill={`url(#${g('bolt')})`} stroke="#3a2600" strokeWidth="3.2" strokeLinejoin="round" />
      <circle cx="108" cy="38" r="3" fill="#ffe14a" /><circle cx="14" cy="80" r="2.4" fill="#9dc0ff" /><circle cx="98" cy="96" r="2" fill="#fff" />
    </svg>
  );
}

export const Emblem = ({ game, size = 64, className }) => (game === 'onepiece' ? <OPEmblem size={size} className={className} /> : <PKEmblem size={size} className={className} />);

// Dos des cartes Kirakai (boosters, inspecteur)
export function CardBack({ game }) {
  return (
    <span className={'card-back cb-' + game} aria-hidden="true">
      <span className="cb-frame" />
      <span className="cb-pattern" />
      <span className="cb-center"><Emblem game={game} size={120} /><b>KIRAKAI</b></span>
    </span>
  );
}
