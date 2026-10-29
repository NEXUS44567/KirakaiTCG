import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useData, href, cardHref } from '../lib/hooks.js';
import { addToCollection, condOf } from '../lib/store.js';
import { eurOf, search, fmtEur } from '../lib/data.js';
import { toCanvas, detectCard, fitRatio, crop, analyze, gradeLabel, readCard, matchCandidates } from '../lib/scan.js';
import { unlock } from '../lib/achievements.js';
import { SFX } from '../lib/sfx.js';
import { CardArt, GameTag, Price } from '../ui/Card.jsx';
import { Loading } from '../ui/Kit.jsx';
import Icon from '../ui/Icon.jsx';

// Scanner : photo ou caméra → cadrage → analyse (centrage, coins, bords, surface) → lecture du numéro → collection.
// Tout se passe dans le navigateur : la photo n'est envoyée nulle part.
export default function ScannerPage() {
  const [step, setStep] = useState('start'); // start → camera → adjust → result
  const [source, setSource] = useState(null);
  const [rect, setRect] = useState(null);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const fileRef = useRef();
  const loadFile = (f) => {
    if (!f) return;
    const im = new Image();
    im.onload = () => { const c = toCanvas(im); setSource(c); setRect(detectCard(c).rect); setResult(null); setStep('adjust'); URL.revokeObjectURL(im.src); };
    im.onerror = () => setErr('Cette image ne peut pas être lue.');
    im.src = URL.createObjectURL(f);
  };
  const steps = [['start', 'Photo'], ['adjust', 'Cadrage'], ['result', 'Analyse']];
  const si = step === 'camera' ? 0 : steps.findIndex((s) => s[0] === step);
  return (
    <div className="page scanner-page">
      <div className="kicker">Outils · 100 % dans ton navigateur</div>
      <h1 className="page-title">Scanner une <span className="grad">carte</span></h1>
      <ol className="scan-steps">{steps.map(([k, l], i) => <li key={k} className={i < si ? 'done' : i === si ? 'on' : ''}><span>{i < si ? <Icon name="check" size={14} stroke={3} /> : i + 1}</span>{l}</li>)}</ol>
      {step === 'start' && (
        <div className="scan-start">
          <p className="lead">Prends ta carte en photo : Kirakai lit son numéro pour la retrouver, puis analyse le centrage, les coins, les bords et la surface pour lui donner une note sur 10.</p>
          <div className="scan-choices">
            <button className="scan-choice cam" onClick={() => { setErr(''); setStep('camera'); }}>
              <span className="sc-visual"><span className="sc-frame"><i /><i /><i /><i /></span><span className="sc-laser" /></span>
              <b>Utiliser la caméra</b><span>Cadre la carte dans le guide</span>
            </button>
            <button className="scan-choice" onClick={() => fileRef.current.click()}>
              <span className="sc-visual up"><Icon name="upload" size={40} /></span>
              <b>Importer une photo</b><span>JPG, PNG ou WebP</span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => loadFile(e.target.files[0])} />
          </div>
          <ul className="scan-tips">
            <li><Icon name="layers" size={18} /><span><b>Fond uni et sombre</b> : la carte se détache mieux.</span></li>
            <li><Icon name="sparkle" size={18} /><span><b>Lumière douce</b>, sans reflet direct sur la carte.</span></li>
            <li><Icon name="scan" size={18} /><span><b>Carte à plat</b>, bien droite, qui remplit le cadre.</span></li>
            <li><Icon name="info" size={18} /><span>Sors-la de son sleeve si possible : le plastique crée des reflets.</span></li>
          </ul>
          {err && <p className="notice">{err}</p>}
        </div>
      )}
      {step === 'camera' && <Camera onCancel={() => setStep('start')} onShot={(c, guide) => { setSource(c); setRect(detectCard(c, guide).rect); setStep('adjust'); }} onError={(m) => { setErr(m); setStep('start'); }} />}
      {step === 'adjust' && source && (
        <Adjust source={source} rect={rect} setRect={setRect} onBack={() => setStep('start')} onGo={() => {
          const c = crop(source, rect);
          setResult({ card: c, analysis: analyze(c), url: c.toDataURL('image/jpeg', 0.85) });
          setStep('result'); SFX.charge();
        }} />
      )}
      {step === 'result' && result && <Result result={result} onRestart={() => { setResult(null); setSource(null); setStep('start'); }} onAdjust={() => setStep('adjust')} />}
    </div>
  );
}

function Camera({ onShot, onCancel, onError }) {
  const video = useRef();
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(null);
  useEffect(() => {
    let stream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        video.current.srcObject = stream; await video.current.play(); setReady(true);
        const track = stream.getVideoTracks()[0];
        if (track.getCapabilities?.()?.torch) setTorch({ track, on: false });
      } catch (e) { onError(e.name === 'NotAllowedError' ? 'Accès à la caméra refusé. Autorise-le dans ton navigateur, ou importe une photo.' : 'Caméra indisponible sur cet appareil. Importe une photo à la place.'); }
    })();
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);
  const shoot = () => {
    const v = video.current;
    const c = toCanvas(v, 1600);
    const vw = v.videoWidth, vh = v.videoHeight;
    const box = v.getBoundingClientRect();
    const scale = Math.max(box.width / vw, box.height / vh);
    const dispW = vw * scale, dispH = vh * scale;
    const gh = box.height * 0.72, gw = gh * (63 / 88);
    const gx = (box.width - gw) / 2 + (dispW - box.width) / 2, gy = (box.height - gh) / 2 + (dispH - box.height) / 2;
    const k = c.width / dispW;
    SFX.flip();
    onShot(c, { x: gx * k, y: gy * k, w: gw * k, h: gh * k });
  };
  return (
    <div className="camera">
      <video ref={video} playsInline muted />
      <div className="cam-guide" aria-hidden="true"><i /><i /><i /><i /><span className="sc-laser" /></div>
      <p className="cam-hint">{ready ? 'Place la carte dans le cadre, bien à plat' : 'Ouverture de la caméra…'}</p>
      <div className="cam-bar">
        <button className="btn ghost" onClick={onCancel}>Annuler</button>
        <button className="shutter" onClick={shoot} disabled={!ready} aria-label="Prendre la photo" />
        {torch ? <button className="btn ghost" onClick={async () => { await torch.track.applyConstraints({ advanced: [{ torch: !torch.on }] }); setTorch({ ...torch, on: !torch.on }); }}>{torch.on ? 'Lampe ●' : 'Lampe ○'}</button> : <span style={{ width: 90 }} />}
      </div>
    </div>
  );
}

function Adjust({ source, rect, setRect, onBack, onGo }) {
  const wrap = useRef();
  const url = useMemo(() => source.toDataURL('image/jpeg', 0.85), [source]);
  const drag = useRef(null);
  const toPct = (r) => ({ left: (r.x / source.width) * 100 + '%', top: (r.y / source.height) * 100 + '%', width: (r.w / source.width) * 100 + '%', height: (r.h / source.height) * 100 + '%' });
  const onDown = (handle) => (e) => { e.preventDefault(); e.stopPropagation(); drag.current = { handle, x: e.clientX, y: e.clientY, r: { ...rect } }; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const onMove = (e) => {
    const g = drag.current; if (!g) return;
    const box = wrap.current.getBoundingClientRect();
    const dx = ((e.clientX - g.x) / box.width) * source.width, dy = ((e.clientY - g.y) / box.height) * source.height;
    const r = { ...g.r };
    if (g.handle === 'move') { r.x += dx; r.y += dy; }
    if (g.handle.includes('l')) { r.x += dx; r.w -= dx; }
    if (g.handle.includes('r')) r.w += dx;
    if (g.handle.includes('t')) { r.y += dy; r.h -= dy; }
    if (g.handle.includes('b')) r.h += dy;
    r.w = Math.max(40, r.w); r.h = Math.max(56, r.h);
    r.x = Math.max(0, Math.min(source.width - r.w, r.x)); r.y = Math.max(0, Math.min(source.height - r.h, r.y));
    setRect(r);
  };
  return (
    <div className="adjust">
      <p className="lead">Ajuste le cadre sur les bords de la carte, au plus près : c’est sa précision qui rend la note fiable.</p>
      <div className="adjust-img" ref={wrap} onPointerMove={onMove} onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)}>
        <img src={url} alt="Photo de la carte" draggable="false" />
        <div className="crop" style={toPct(rect)} onPointerDown={onDown('move')}>
          <span className="crop-grid" />
          {['tl', 'tr', 'bl', 'br', 't', 'b', 'l', 'r'].map((h) => <span key={h} className={'h h-' + h} onPointerDown={onDown(h)} />)}
        </div>
      </div>
      <div className="row center">
        <button className="btn ghost" onClick={onBack}><Icon name="camera" size={18} />Reprendre</button>
        <button className="btn ghost" onClick={() => setRect(detectCard(source).rect)}><Icon name="refresh" size={18} />Détection auto</button>
        <button className="btn ghost" onClick={() => setRect(fitRatio({ x: rect.x, y: rect.y, w: rect.w, h: rect.h }))}><Icon name="grid" size={18} />Format carte</button>
        <button className="btn primary big" onClick={onGo}><Icon name="scan" size={20} />Analyser</button>
      </div>
    </div>
  );
}

// Jauge circulaire de la note
function Gauge({ value }) {
  const r = 70, c = Math.PI * r * 1.5, v = Math.max(0, Math.min(1, value / 10));
  const hue = Math.round(v * 130);
  return (
    <svg className="gauge" viewBox="0 0 180 160" aria-hidden="true">
      <path d="M 40.5 139.5 A 70 70 0 1 1 139.5 139.5" className="g-bg" />
      <path d="M 40.5 139.5 A 70 70 0 1 1 139.5 139.5" className="g-fg" style={{ stroke: `hsl(${hue} 85% 58%)`, strokeDasharray: c, strokeDashoffset: c * (1 - v), filter: `drop-shadow(0 0 10px hsl(${hue} 85% 58%))` }} />
    </svg>
  );
}

function Bar({ label, value, hint }) {
  const v = typeof value === 'number' ? value : null;
  return (
    <div className="gbar">
      <span>{label}</span>
      <div className="track"><i style={{ width: v != null ? v * 10 + '%' : '0%' }} className={v == null ? '' : v >= 8.5 ? 'good' : v >= 6 ? 'mid' : 'bad'} /></div>
      <b>{v != null ? v.toLocaleString('fr-FR') : 'n/m'}</b>
      {hint && <small>{hint}</small>}
    </div>
  );
}

function Result({ result, onRestart, onAdjust }) {
  const d = useData();
  const a = result.analysis;
  const G = gradeLabel(a.grade);
  const [ocr, setOcr] = useState({ status: 'idle' });
  const [picked, setPicked] = useState(null);
  const [q, setQ] = useState('');
  const [added, setAdded] = useState(false);
  useEffect(() => {
    let alive = true;
    setOcr({ status: 'reading', p: 0 });
    readCard(result.card, (p) => alive && setOcr((o) => ({ ...o, p })))
      .then((parsed) => { if (!alive) return; const cands = d.ready ? matchCandidates(parsed, d.cats) : []; setOcr({ status: 'done', parsed, cands }); if (cands.length === 1) setPicked(cands[0]); })
      .catch((e) => alive && setOcr({ status: 'error', message: e.message }));
    return () => { alive = false; };
  }, [result]);
  const manual = useMemo(() => (q.length >= 2 && d.ready ? search(d.cats, q, { limit: 8, P: d.P }) : []), [q]);
  const b = a.details.borders;
  const W = result.card.width, H = result.card.height;
  const eur = picked && eurOf(picked, d.P, d.fx);
  const centerHint = a.details.lr || a.details.tb ? `G/D ${a.details.lr ? (100 - Math.round(a.details.lr)) + '/' + Math.round(a.details.lr) : '—'} · H/B ${a.details.tb ? (100 - Math.round(a.details.tb)) + '/' + Math.round(a.details.tb) : '—'}` : 'bordure non détectée';
  const add = () => {
    addToCollection(picked.key, { cond: G.cond, grade: a.grade, scan: { date: new Date().toISOString(), parts: a.parts, confidence: a.confidence } });
    setAdded(true); SFX.success(); unlock('scan', a.grade >= 9 && 'scan-9');
  };
  return (
    <div className="scan-result">
      <div className="sr-visual">
        <div className="sr-card">
          <img src={result.url} alt="Carte analysée" />
          <svg viewBox={`0 0 ${W} ${H}`} className="sr-overlay" aria-hidden="true">
            {b.left.ok && <line x1={b.left.width} x2={b.left.width} y1="0" y2={H} />}
            {b.right.ok && <line x1={W - b.right.width} x2={W - b.right.width} y1="0" y2={H} />}
            {b.top.ok && <line y1={b.top.width} y2={b.top.width} x1="0" x2={W} />}
            {b.bottom.ok && <line y1={H - b.bottom.width} y2={H - b.bottom.width} x1="0" x2={W} />}
            {a.details.cornerF.map((f, i) => { const cz = a.details.cz; const x = i % 2 ? W - cz : 0, y = i > 1 ? H - cz : 0; return <rect key={i} x={x} y={y} width={cz} height={cz} className={f > 0.06 ? 'bad' : f > 0.02 ? 'mid' : 'good'} />; })}
          </svg>
          <span className="sr-scan" aria-hidden="true" />
        </div>
        <div className="corners">{[0, 1, 2, 3].map((i) => <Corner key={i} src={result.url} i={i} f={a.details.cornerF[i]} />)}</div>
      </div>

      <div className="sr-info">
        <div className="grade-card panel glow-edge">
          <div className="gc-dial">
            <Gauge value={a.grade} />
            <span className="gc-num"><b>{a.grade.toLocaleString('fr-FR')}</b><small>/10</small></span>
          </div>
          <div className="gc-txt">
            <span className="kicker">Note Kirakai</span>
            <b className="glabel">{G.label}</b>
            <p>{G.text}</p>
            <span className="conf">Fiabilité de l’analyse : {Math.round(a.confidence * 100)} %</span>
          </div>
        </div>
        <div className="gbars panel pad">
          <Bar label="Centrage" value={a.parts.centering} hint={centerHint} />
          <Bar label="Coins" value={a.parts.corners} hint={a.details.whiteBorder ? 'non mesurable (bordure claire)' : 'blanchiment des 4 coins'} />
          <Bar label="Bords" value={a.parts.edges} hint={a.details.whiteBorder ? 'non mesurable (bordure claire)' : `${a.details.chips} petites marques repérées`} />
          <Bar label="Surface" value={a.parts.surface} hint="rayures, points, reflets" />
        </div>
        {a.warnings.length > 0 && <ul className="warn-list">{a.warnings.map((w) => <li key={w}><Icon name="info" size={15} />{w}</li>)}</ul>}
        <p className="source-note">Estimation par analyse de photo, à titre indicatif. Elle ne remplace pas une notation professionnelle (PSA, CGC, PCA) qui examine la carte en main.</p>

        <div className="ident panel pad">
          <h3>Quelle est cette carte ?</h3>
          {ocr.status === 'reading' && <div className="ocr-prog"><span>Lecture du numéro… {Math.round((ocr.p || 0) * 100)} %</span><div className="progress"><i style={{ width: (ocr.p || 0) * 100 + '%' }} /></div></div>}
          {ocr.status === 'error' && <p className="muted">{ocr.message}. Cherche la carte ci-dessous.</p>}
          {ocr.status === 'done' && (
            <>
              <p className="muted">{ocr.parsed.onepiece ? `Numéro lu : ${ocr.parsed.onepiece}` : ocr.parsed.pokemon ? `Numéro lu : ${ocr.parsed.pokemon.promo || ocr.parsed.pokemon.number + '/' + ocr.parsed.pokemon.total}` : 'Aucun numéro lu sur la photo.'}{ocr.cands.length > 1 ? ' · choisis la bonne version :' : ''}</p>
              {ocr.cands.length > 0 && <div className="cands">{ocr.cands.map((c) => <button key={c.key} className={'cand' + (picked?.key === c.key ? ' on' : '')} onClick={() => setPicked(c)}><CardArt card={c} tilt={false} fx={0} /><span>{c.name}<small><GameTag game={c.game} /> {c.number}{c.variant ? ' · ' + c.variant : ''}</small></span></button>)}</div>}
            </>
          )}
          <div className="searchbox small"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pas la bonne ? Cherche-la par nom ou numéro" aria-label="Chercher la carte" /></div>
          {manual.length > 0 && <div className="cands">{manual.map((c) => <button key={c.key} className={'cand' + (picked?.key === c.key ? ' on' : '')} onClick={() => { setPicked(c); setQ(''); }}><CardArt card={c} tilt={false} fx={0} /><span>{c.name}<small><GameTag game={c.game} /> {c.number}{c.variant ? ' · ' + c.variant : ''}</small></span></button>)}</div>}
        </div>

        {picked && (
          <div className="picked panel">
            <CardArt card={picked} className="mini" tilt={false} />
            <div><b>{picked.name}</b><small><GameTag game={picked.game} /> {picked.number}{picked.variant ? ' · ' + picked.variant : ''}</small>
              <span>Prix du jour (NM) : <Price card={picked} /></span>
              {eur != null && <span>Valeur estimée en état {condOf(G.cond).label} : <b>{fmtEur(eur * condOf(G.cond).factor)}</b></span>}
            </div>
          </div>
        )}
        <div className="row">
          <button className="btn primary big" disabled={!picked || added} onClick={add}>
            {added ? <><Icon name="check" size={20} />Ajoutée à ta collection</> : <><Icon name="plus" size={20} />Ajouter avec la note {a.grade.toLocaleString('fr-FR')}</>}
          </button>
          {added && <a className="btn ghost" href={href('/collection')}>Voir ma collection</a>}
          {picked && <a className="btn ghost" href={cardHref(picked)}>Fiche de la carte</a>}
        </div>
        <div className="row"><button className="btn ghost small" onClick={onAdjust}><Icon name="grid" size={16} />Réajuster le cadre</button><button className="btn ghost small" onClick={onRestart}><Icon name="camera" size={16} />Scanner une autre carte</button></div>
      </div>
    </div>
  );
}

function Corner({ src, i, f }) {
  const pos = ['0% 0%', '100% 0%', '0% 100%', '100% 100%'][i];
  const name = ['Haut gauche', 'Haut droit', 'Bas gauche', 'Bas droit'][i];
  return <div className={'corner ' + (f > 0.06 ? 'bad' : f > 0.02 ? 'mid' : 'good')}><div style={{ backgroundImage: `url(${src})`, backgroundPosition: pos }} /><small>{name}</small></div>;
}
