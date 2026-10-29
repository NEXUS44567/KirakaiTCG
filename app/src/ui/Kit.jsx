import React, { useEffect, useRef, useState } from 'react';
import { useData, useCountUp } from '../lib/hooks.js';
import { useToasts } from '../lib/toast.js';
import { fmtEur } from '../lib/data.js';
import Icon from './Icon.jsx';

export function Section({ title, kicker, action, children, id, className = '', lead }) {
  return (
    <section className={'section ' + className} id={id}>
      <header className="section-head">
        <div>
          {kicker && <div className="kicker">{kicker}</div>}
          {title && <h2>{title}</h2>}
          {lead && <p className="section-lead">{lead}</p>}
        </div>
        {action && <div className="section-action">{action}</div>}
      </header>
      {children}
    </section>
  );
}

// Contrôle segmenté avec pastille qui glisse vers l'option choisie
export function Seg({ value, onChange, options, label, size }) {
  const ref = useRef(null);
  const [pill, setPill] = useState(null);
  useEffect(() => {
    const el = ref.current?.querySelector('[aria-checked="true"]');
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, options.length]);
  useEffect(() => {
    const ro = new ResizeObserver(() => { const el = ref.current?.querySelector('[aria-checked="true"]'); if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth }); });
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div className={'seg' + (size ? ' ' + size : '')} role="radiogroup" aria-label={label} ref={ref}>
      {pill && <span className="seg-pill" style={{ transform: `translateX(${pill.left}px)`, width: pill.width }} aria-hidden="true" />}
      {options.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

// Fenêtre : panneau centré sur grand écran, feuille qui monte du bas sur mobile
export function Modal({ open, onClose, title, children, wide, className = '' }) {
  useEffect(() => {
    if (!open) return;
    const f = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', f);
    document.body.classList.add('modal-open');
    return () => { document.removeEventListener('keydown', f); document.body.classList.remove('modal-open'); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '') + ' ' + className} role="dialog" aria-modal="true" aria-label={title}>
        <span className="sheet-grip" aria-hidden="true" />
        <header><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Fermer"><Icon name="x" /></button></header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ icon = 'album', title, children, action }) {
  return <div className="empty"><span className="empty-ico"><Icon name={icon} size={30} /></span><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>;
}

export function Loading({ label = 'Chargement…', grid }) {
  const d = useData();
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 12000); return () => clearTimeout(t); }, []);
  if (d.error) return (
    <div className="loading error-box">
      <Icon name="refresh" size={26} />
      <b>Impossible de charger les données</b>
      <span>Vérifie ta connexion, puis réessaie.</span>
      <button className="btn primary" onClick={() => location.reload()}>Réessayer</button>
    </div>
  );
  return (
    <div className="loading">
      {grid ? <div className="skel-grid">{Array.from({ length: 12 }, (_, i) => <span key={i} className="skel skel-card" style={{ '--i': i }} />)}</div> : <span className="loader" aria-hidden="true"><i /><i /><i /></span>}
      <span className="loading-label">{label}</span>
      {slow && <small className="slow-hint">Ça prend plus de temps que d’habitude… <button className="link" onClick={() => location.reload()}>Recharger</button></small>}
    </div>
  );
}

// Anneau de progression (complétion d'une extension, du Pokédex…)
export function Ring({ value, size = 64, stroke = 7, label, sub, color }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value || 0));
  return (
    <span className="ring" style={{ width: size, height: size, '--rc': color }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-fg" strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - v)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="ring-in">{label ?? Math.round(v * 100) + '%'}{sub && <small>{sub}</small>}</span>
    </span>
  );
}

// Montant qui défile jusqu'à sa valeur
export function Money({ value, className = '' }) {
  const v = useCountUp(value);
  return <span className={'money ' + className}>{fmtEur(v)}</span>;
}
export function Count({ value, className = '' }) {
  const v = useCountUp(value);
  return <span className={className}>{Math.round(v ?? 0).toLocaleString('fr-FR')}</span>;
}

export function Stat({ label, value, sub, tone, icon, href }) {
  const Tag = href ? 'a' : 'div';
  return (
    <Tag className={'stat' + (tone ? ' ' + tone : '')} href={href}>
      <span className="stat-label">{icon && <Icon name={icon} size={14} />}{label}</span>
      <b className="stat-value">{value}</b>
      {sub && <small className="stat-sub">{sub}</small>}
    </Tag>
  );
}

export function Toasts() {
  const list = useToasts();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={'toast ' + t.tone}>
          <span className="toast-ico"><Icon name={t.icon} size={18} /></span>
          <span>{t.title && <b>{t.title}</b>}{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

export function Progress({ value, big, label }) {
  return <div className={'progress' + (big ? ' big' : '')} role="progressbar" aria-valuenow={Math.round((value || 0) * 100)} aria-valuemin="0" aria-valuemax="100" aria-label={label}><i style={{ width: Math.min(100, (value || 0) * 100) + '%' }} /></div>;
}

export function Crumbs({ items }) {
  return <nav className="crumbs" aria-label="Fil d’Ariane">{items.map(([l, h], i) => <React.Fragment key={i}>{i > 0 && <Icon name="right" size={12} />}{h ? <a href={h}>{l}</a> : <span>{l}</span>}</React.Fragment>)}</nav>;
}
