import React, { useEffect, useMemo, useRef, useState } from 'react';
import { href, useData, useNow } from '../lib/hooks.js';
import { useStore, update } from '../lib/store.js';
import { profileRow, profileStats, forgetPublished } from '../lib/social.js';
import { THEMES, MOTIFS, FINISHES, EMBLEMS, TITLES, lookOf, themeStyle, titleLabel, titleOk } from '../lib/look.js';
import { fmtDate, fmtNum, fmtShort, fmtEur, eurOf, resolveKey } from '../lib/data.js';
import { collectionValue } from '../lib/coll.js';
import { toast } from '../lib/toast.js';
import {
  useCloud, cloudOn, signIn, signUp, signInWith, signOut, resetPassword, resendConfirmation, pseudoFree,
  changePassword, changePseudo, deleteAccount, syncNow, isDirty, dismissRecovery, cleanPseudo, clearLinkError, publishProfile, hideProfile,
  uploadAvatar, removeAvatar,
} from '../lib/cloud.js';
import { Seg, Modal } from '../ui/Kit.jsx';
import { CardArt } from '../ui/Card.jsx';
import { LogoMark, Emblem } from '../ui/Brand.jsx';
import Icon from '../ui/Icon.jsx';
import Avatar from '../ui/Avatar.jsx';

// Compte Kirakai : connexion, inscription, carte de membre et état de la sauvegarde en ligne.

const PROVIDERS = { google: 'Google', apple: 'Apple', discord: 'Discord' };
const joinFr = (a) => (a.length > 1 ? a.slice(0, -1).join(', ') + ' et ' + a[a.length - 1] : a[0] || '');

// Logos officiels des connexions en un clic (Google en couleurs, Apple et Discord en blanc ou noir selon le bouton)
function BrandLogo({ p }) {
  if (p === 'google') return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
  if (p === 'apple') return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" /></svg>
  );
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" /></svg>
  );
}

// Connexion en un clic : compte créé à la première fois, retrouvé ensuite
function Social({ list }) {
  const [going, setGoing] = useState('');
  if (!list?.length) return null;
  return (
    <div className="acc-social">
      {list.map((p) => (
        <button key={p} type="button" className={'btn block oauth ' + p} disabled={!!going} onClick={() => { setGoing(p); signInWith(p); }}>
          {going === p ? <span className="acc-spin" /> : <BrandLogo p={p} />}Continuer avec {PROVIDERS[p]}
        </button>
      ))}
      <span className="acc-or">ou avec ton e-mail</span>
    </div>
  );
}

export default function AccountPage() {
  const c = useCloud();
  if (!cloudOn()) return <Closed />;
  if (c.user && c.recovery) return <div className="page account-page"><NewPassword /></div>;
  return c.user ? <Profile /> : <Welcome />;
}

// Chiffres de la progression (sur cet appareil, ou dans le compte une fois connecté)
function useProgress() {
  const d = useData();
  const coll = useStore((s) => s.collection);
  const opened = useStore((s) => Object.values(s.wallet || {}).reduce((n, w) => n + (w?.opened || 0), 0) || s.packs?.opened || 0);
  const ach = useStore((s) => Object.keys(s.achievements || {}).length);
  const watch = useStore((s) => Object.keys(s.watch || {}).length);
  const wallet = useStore((s) => s.wallet);
  const value = useMemo(() => (d.ready ? collectionValue(coll, d) : null), [coll, d.ready, d.v]);
  const cards = coll.reduce((n, e) => n + (e.qty || 0), 0);
  return { cards, value, opened, ach, watch, wallet };
}

// Carte de membre holographique (aperçu pendant l'inscription, vraie carte une fois connecté),
// avec la photo et l'apparence choisies par le joueur (look : voir lib/look.js)
export function MemberCard({ pseudo, since, code, stats, preview, avatar, look: raw }) {
  const d = useData();
  const look = lookOf(raw);
  const fav = look.fav && d.ready ? resolveKey(d.cats, look.fav) : null;
  const name = pseudo || 'Ton pseudo';
  return (
    <div className={`member mo-${look.motif} fi-${look.finish}` + (preview ? ' preview' : '')} style={themeStyle(look.theme)} data-tilt>
      <div className="member-in">
        <div className="member-top">
          <LogoMark size={28} />
          <span>KIRAKAI<small>Carte de membre</small></span>
          <em>{code ? 'N° ' + code : 'N° ······'}</em>
        </div>
        <div className="member-id">
          <Avatar className="member-avatar" path={avatar} name={name} />
          <div>
            <b className={'member-name' + (pseudo ? '' : ' blank')}>{name}</b>
            <small className="member-title">{titleLabel(look.title)}</small>
            {since && <small>Membre depuis {fmtDate(since, { month: 'long', year: 'numeric' })}</small>}
          </div>
          {fav && <span className="member-fav" title={fav.name}><CardArt card={fav} tilt={false} fx={0} /></span>}
        </div>
        <div className="member-stats">
          {stats.map(([v, l]) => <span key={l}><b>{v}</b><small>{l}</small></span>)}
        </div>
        <div className="member-foot">
          <span className="member-chip" aria-hidden="true" />
          <span className="member-emb">{look.emb !== 'pokemon' && <Emblem game="onepiece" size={26} />}{look.emb !== 'onepiece' && <Emblem game="pokemon" size={26} />}</span>
        </div>
      </div>
      <i className="member-holo" aria-hidden="true" />
    </div>
  );
}

const statsOf = (p) => [
  [fmtNum(p.cards), p.cards > 1 ? 'cartes' : 'carte'],
  [p.value ? fmtShort(p.value.total) : '—', 'de valeur'],
  [fmtNum(p.opened), p.opened > 1 ? 'boosters' : 'booster'],
  [fmtNum(p.ach), 'succès'],
];

// ---------- Pas encore de serveur de comptes ----------
function Closed() {
  return (
    <div className="page account-page">
      <div className="acc-hero">
        <div className="kicker">Compte Kirakai</div>
        <h1 className="page-title">Les comptes <span className="grad">arrivent bientôt</span></h1>
        <p className="lead">En attendant, ta collection, tes boosters et tes succès sont enregistrés dans ce navigateur. Dès l’ouverture des comptes, tout ce que tu as déjà fait ici rejoindra ton compte.</p>
        <div className="row"><a className="btn primary" href={href('/collection')}><Icon name="album" size={18} />Ma collection</a><a className="btn ghost" href={href('/reglages')}><Icon name="download" size={18} />Exporter une sauvegarde</a></div>
      </div>
    </div>
  );
}

// ---------- Connexion et inscription ----------
function Welcome() {
  const c = useCloud();
  const p = useProgress();
  const [mode, setMode] = useState('signup');
  const [pseudo, setPseudo] = useState('');
  const [sent, setSent] = useState(null); // { kind: 'confirm' | 'reset', email }
  const social = useCloud((x) => x.providers);
  useEffect(() => { if (c.expired) setMode('login'); }, [c.expired]);
  const has = p.cards || p.opened || p.ach;
  return (
    <div className="page account-page">
      <div className="acc-hero">
        <div className="kicker">Compte Kirakai · gratuit</div>
        <h1 className="page-title">Ta progression, <span className="grad">partout avec toi</span></h1>
        <p className="lead">Crée ton compte pour retrouver ta collection, tes boosters, ton classeur et tes succès sur ton téléphone comme sur ton ordinateur.</p>
      </div>
      <div className="acc-grid">
        <section className="panel pad acc-card glow-edge" aria-label="Connexion">
          {c.linkError && <p className="notice">{c.linkError}</p>}
          {c.expired && !c.linkError && <p className="notice soft">Ta session a expiré. Reconnecte-toi : ce que tu as fait entre-temps sera envoyé dans ton compte.</p>}
          {sent ? <Sent sent={sent} back={() => { setSent(null); setMode('login'); }} /> : (
            <>
              {mode !== 'forgot' && <Seg value={mode} onChange={setMode} label="Connexion ou inscription" options={[['signup', 'Créer un compte'], ['login', 'Se connecter']]} />}
              {mode !== 'forgot' && <Social list={social} />}
              {mode === 'signup' && <SignupForm pseudo={pseudo} setPseudo={setPseudo} onSent={(email) => setSent({ kind: 'confirm', email })} />}
              {mode === 'login' && <LoginForm forgot={() => setMode('forgot')} />}
              {mode === 'forgot' && <ForgotForm back={() => setMode('login')} onSent={(email) => setSent({ kind: 'reset', email })} />}
            </>
          )}
        </section>
        <aside className="acc-pitch">
          <MemberCard pseudo={mode === 'signup' ? cleanPseudo(pseudo) || pseudo.trim() : ''} stats={statsOf(p)} preview />
          <ul className="acc-perks">
            <li><Icon name="cloud" size={20} /><span><b>Sauvegarde automatique</b>Chaque carte ajoutée, chaque booster ouvert part dans ton compte en quelques secondes.</span></li>
            <li><Icon name="swap" size={20} /><span><b>Sur tous tes appareils</b>Connecte-toi ailleurs : ta collection et ton classeur sont déjà là.</span></li>
            <li><Icon name="trophy" size={20} /><span><b>Ton pseudo te suit</b>Jusque dans le classement des collectionneurs.</span></li>
            <li><Icon name="sparkle" size={20} /><span><b>Rien n’est perdu</b>{has ? `Ce que tu as déjà fait ici (${fmtNum(p.cards)} carte${p.cards > 1 ? 's' : ''}, ${fmtNum(p.opened)} booster${p.opened > 1 ? 's' : ''}) rejoint ton compte dès la connexion.` : 'Ce que tu as déjà fait sur cet appareil rejoint ton compte dès la connexion.'}</span></li>
          </ul>
        </aside>
      </div>
    </div>
  );
}

function Field({ icon, label, children, hint, state }) {
  return (
    <label className={'acc-field' + (state ? ' ' + state : '')}>
      <span>{label}</span>
      <span className="acc-input"><Icon name={icon} size={18} />{children}</span>
      {hint && <small className="acc-hint">{hint}</small>}
    </label>
  );
}
function Password({ value, onChange, autoComplete = 'current-password', label = 'Mot de passe', hint, state }) {
  const [show, setShow] = useState(false);
  return (
    <Field icon="lock" label={label} hint={hint} state={state}>
      <input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required minLength={autoComplete === 'new-password' ? 8 : undefined} maxLength={72} />
      <button type="button" className="acc-eye" onClick={() => setShow(!show)} aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}><Icon name={show ? 'eyeoff' : 'eye'} size={18} /></button>
    </Field>
  );
}
// Force du mot de passe : longueur, puis variété des caractères
function strength(pw) {
  if (pw.length < 8) return 1;
  let s = 2;
  if (pw.length >= 12) s++;
  if (/[a-z]/i.test(pw) && /\d/.test(pw)) s++;
  if (/[^a-z0-9]/i.test(pw) || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) s++;
  return Math.min(4, s);
}
const STRENGTH = ['', 'Trop court', 'Correct', 'Solide', 'Excellent'];
function Meter({ pw }) {
  if (!pw) return null;
  const s = strength(pw);
  return <span className={'acc-meter s' + s} aria-live="polite"><i /><i /><i /><i /><small>{pw.length < 8 ? `Encore ${8 - pw.length} caractère${8 - pw.length > 1 ? 's' : ''}` : STRENGTH[s]}</small></span>;
}

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = (fn) => async (e) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true); setErr(''); clearLinkError();
    try { await fn(); } catch (x) { setErr(x.message || 'Une erreur est survenue.'); } finally { setBusy(false); }
  };
  return { busy, err, setErr, run };
}

function SignupForm({ pseudo, setPseudo, onSent }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [free, setFree] = useState(null); // null · 'checking' · true · false
  const { busy, err, setErr, run } = useSubmit();
  const clean = cleanPseudo(pseudo);
  useEffect(() => {
    setFree(null);
    if (!clean) return;
    let ok = true; setFree('checking');
    const t = setTimeout(() => pseudoFree(clean).then((v) => ok && setFree(v)), 450);
    return () => { ok = false; clearTimeout(t); };
  }, [clean]);
  const submit = run(async () => {
    if (!clean) { setErr('Ton pseudo doit faire entre 2 et 20 caractères.'); return; }
    if (free === false) { setErr('Ce pseudo est déjà pris : choisis-en un autre.'); return; }
    if (pw.length < 8) { setErr('Ton mot de passe doit faire au moins 8 caractères.'); return; }
    const r = await signUp({ email, password: pw, pseudo: clean });
    if (r.confirm) onSent(email.trim());
  });
  const pState = !clean ? '' : free === false ? 'bad' : free === true ? 'good' : '';
  return (
    <form className="acc-form" onSubmit={submit} noValidate>
      <Field icon="user" label="Pseudo" state={pState} hint={free === false ? 'Déjà pris : essaie une variante.' : free === true ? 'Disponible !' : 'Visible dans le classement. Évite ton vrai nom.'}>
        <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} maxLength={20} autoComplete="nickname" placeholder="Ex. RoiDesPirates" required />
        {free === 'checking' && <span className="acc-spin" aria-hidden="true" />}
        {free === true && <Icon name="check" size={18} className="acc-ok" />}
      </Field>
      <Field icon="mail" label="E-mail" hint="Il sert seulement à te connecter et à retrouver ton mot de passe.">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" placeholder="toi@exemple.fr" required />
      </Field>
      <Password value={pw} onChange={setPw} autoComplete="new-password" />
      <Meter pw={pw} />
      {err && <p className="notice" role="alert">{err}</p>}
      <button className="btn primary big block" disabled={busy}>{busy ? <><span className="acc-spin" />Création du compte…</> : <><Icon name="sparkle" size={19} />Créer mon compte</>}</button>
    </form>
  );
}

function LoginForm({ forgot }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const { busy, err, run } = useSubmit();
  const submit = run(() => signIn({ email, password: pw }));
  return (
    <form className="acc-form" onSubmit={submit}>
      <Field icon="mail" label="E-mail">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" placeholder="toi@exemple.fr" required />
      </Field>
      <Password value={pw} onChange={setPw} />
      <button type="button" className="link small acc-forgot" onClick={forgot}>Mot de passe oublié ?</button>
      {err && <p className="notice" role="alert">{err}</p>}
      <button className="btn primary big block" disabled={busy}>{busy ? <><span className="acc-spin" />Connexion…</> : <><Icon name="user" size={19} />Se connecter</>}</button>
    </form>
  );
}

function ForgotForm({ back, onSent }) {
  const [email, setEmail] = useState('');
  const { busy, err, run } = useSubmit();
  const submit = run(async () => { await resetPassword(email); onSent(email.trim()); });
  return (
    <form className="acc-form" onSubmit={submit}>
      <h2 className="acc-h">Mot de passe oublié</h2>
      <p className="muted small">Indique l’adresse de ton compte : tu recevras un lien pour choisir un nouveau mot de passe.</p>
      <Field icon="mail" label="E-mail">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" placeholder="toi@exemple.fr" required autoFocus />
      </Field>
      {err && <p className="notice" role="alert">{err}</p>}
      <button className="btn primary big block" disabled={busy}>{busy ? <><span className="acc-spin" />Envoi…</> : <><Icon name="mail" size={19} />Recevoir le lien</>}</button>
      <button type="button" className="link small" onClick={back}><Icon name="left" size={15} />Retour à la connexion</button>
    </form>
  );
}

function Sent({ sent, back }) {
  const [again, setAgain] = useState('');
  const resend = async () => {
    try { if (sent.kind === 'confirm') await resendConfirmation(sent.email); else await resetPassword(sent.email); setAgain('Nouvel e-mail envoyé.'); }
    catch (e) { setAgain(e.message); }
  };
  return (
    <div className="acc-sent">
      <span className="acc-sent-ico"><Icon name="mail" size={30} /></span>
      <h2 className="acc-h">Vérifie ta boîte mail</h2>
      <p className="muted">{sent.kind === 'confirm'
        ? <>Un lien de confirmation vient de partir à <b>{sent.email}</b>. Clique dessus : ton compte s’ouvrira directement ici.</>
        : <>Si un compte existe avec <b>{sent.email}</b>, un lien pour choisir un nouveau mot de passe vient de partir.</>}</p>
      <p className="faint small">Rien reçu après quelques minutes ? Regarde dans les indésirables.</p>
      <div className="row center">
        <button className="btn ghost small" onClick={resend}><Icon name="refresh" size={16} />Renvoyer l’e-mail</button>
        <button className="btn ghost small" onClick={back}><Icon name="user" size={16} />Se connecter</button>
      </div>
      {again && <p className="ok-msg small">{again}</p>}
    </div>
  );
}

function NewPassword({ inline }) {
  const [pw, setPw] = useState('');
  const { busy, err, run } = useSubmit();
  const [done, setDone] = useState(false);
  const submit = run(async () => {
    if (pw.length < 8) throw new Error('Ton mot de passe doit faire au moins 8 caractères.');
    await changePassword(pw); setPw(''); setDone(true);
    toast('Ton nouveau mot de passe est enregistré.', { icon: 'lock' });
  });
  return (
    <form className={inline ? 'acc-form' : 'panel pad acc-card glow-edge acc-form acc-narrow'} onSubmit={submit}>
      {!inline && <><div className="kicker">Compte Kirakai</div><h1 className="acc-h big">Choisis un nouveau mot de passe</h1></>}
      <Password value={pw} onChange={setPw} autoComplete="new-password" label="Nouveau mot de passe" />
      <Meter pw={pw} />
      {err && <p className="notice" role="alert">{err}</p>}
      {done && inline && <p className="ok-msg small">Mot de passe changé.</p>}
      <div className="row">
        <button className="btn primary" disabled={busy || !pw}>{busy ? <><span className="acc-spin" />Enregistrement…</> : <><Icon name="lock" size={18} />Enregistrer</>}</button>
        {!inline && <button type="button" className="btn ghost" onClick={dismissRecovery}>Plus tard</button>}
      </div>
    </form>
  );
}

// ---------- Connecté ----------
function ago(t, now) {
  if (!t) return '';
  const s = Math.max(0, Math.round((now - new Date(t)) / 1000));
  if (s < 10) return 'à l’instant';
  if (s < 60) return `il y a ${s} s`;
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return 'le ' + fmtDate(t, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}
export const STATUS = {
  idle: ['check', 'Tout est enregistré dans ton compte'],
  dirty: ['cloud', 'Changements en attente d’envoi…'],
  sync: ['refresh', 'Enregistrement en cours…'],
  offline: ['cloudoff', 'Hors ligne : l’envoi reprendra dès le retour du réseau'],
  error: ['info', 'La sauvegarde n’a pas pu être envoyée'],
  off: ['user', 'Non connecté'],
};

function SyncPanel() {
  const c = useCloud();
  const now = useNow();
  const [st, txt] = STATUS[c.status] || STATUS.idle;
  return (
    <section className={'panel pad acc-sync st-' + c.status} aria-live="polite">
      <span className="acc-sync-ico"><Icon name={st} size={22} /></span>
      <div>
        <b>{txt}</b>
        <small>{c.status === 'error' ? c.error : c.at ? 'Dernier enregistrement ' + ago(c.at, now) : 'Synchronisation automatique activée'}</small>
      </div>
      <button className="btn ghost small" onClick={() => syncNow()} disabled={c.status === 'sync'}><Icon name="refresh" size={16} />Synchroniser</button>
    </section>
  );
}

function Profile() {
  const c = useCloud();
  const p = useProgress();
  const prof = useStore((s) => s.profile);
  const [studio, setStudio] = useState(null);
  const user = c.user;
  const pseudo = c.pseudo || '';
  const code = user.id.replace(/-/g, '').slice(0, 6).toUpperCase();
  const coins = (g) => p.wallet?.[g]?.coins;
  const via = user.providers?.length ? user.providers : [user.provider];
  // Discord donne déjà un pseudo ; Google et Apple donnent le vrai nom, qu'on ne propose pas
  const suggest = user.provider === 'discord' ? cleanPseudo(user.meta?.custom_claims?.global_name) || cleanPseudo(user.meta?.full_name) || cleanPseudo(user.meta?.name) : '';
  return (
    <div className="page account-page">
      <div className="acc-hero">
        <div className="kicker">Mon compte</div>
        <h1 className="page-title">{pseudo ? <>Salut, <span className="grad">{pseudo}</span></> : <>Ton <span className="grad">compte</span></>}</h1>
        <p className="lead">Tout ce que tu fais sur Kirakai est enregistré dans ton compte et te suit sur tous tes appareils.</p>
      </div>
      {!pseudo && <div className="acc-first"><PseudoPanel current="" suggest={suggest} /></div>}
      <div className="acc-grid profile">
        <div className="acc-col">
          <MemberCard pseudo={pseudo || 'Nouveau joueur'} since={user.created_at} code={code} stats={statsOf(p)} avatar={prof?.avatar} look={prof?.card} />
          <div className="row acc-card-actions">
            <button className="btn primary" onClick={() => setStudio('main')}><Icon name="sparkle" size={18} />Personnaliser ma carte</button>
            <button className="btn ghost" onClick={() => setStudio('photo')}><Icon name="camera" size={18} />{prof?.avatar ? 'Changer ma photo' : 'Ajouter une photo'}</button>
          </div>
          <CardStudio view={studio} setView={setStudio} pseudo={pseudo || 'Nouveau joueur'} since={user.created_at} code={code} stats={statsOf(p)} progress={p} />
          <SyncPanel />
          <section className="panel pad acc-saved">
            <h2 className="acc-h"><Icon name="cloud" size={20} />Enregistré dans ton compte</h2>
            <div className="acc-saved-grid">
              <a href={href('/collection')}><b>{fmtNum(p.cards)}</b><small>carte{p.cards > 1 ? 's' : ''} en collection</small></a>
              <a href={href('/boosters')}><b>{fmtNum(p.opened)}</b><small>booster{p.opened > 1 ? 's' : ''} ouvert{p.opened > 1 ? 's' : ''}</small></a>
              <a href={href('/succes')}><b>{fmtNum(p.ach)}</b><small>succès</small></a>
              <a href={href('/suivis')}><b>{fmtNum(p.watch)}</b><small>alerte{p.watch > 1 ? 's' : ''} de prix</small></a>
              <a href={href('/boutique?u=onepiece')}><b>{coins('onepiece') != null ? fmtNum(coins('onepiece')) : '—'}</b><small>Berrys</small></a>
              <a href={href('/boutique?u=pokemon')}><b>{coins('pokemon') != null ? fmtNum(coins('pokemon')) : '—'}</b><small>Pokéballs</small></a>
            </div>
            <p className="faint small">Le classeur, l’historique des boosters, le comparateur et la langue des cartes sont aussi enregistrés. Les effets visuels et les sons restent propres à chaque appareil.</p>
          </section>
        </div>
        <div className="acc-col">
          {pseudo && <PseudoPanel current={pseudo} />}
          <PublicPanel pseudo={pseudo} />
          <section className="panel pad acc-block">
            <h2 className="acc-h"><Icon name="mail" size={20} />Connexion</h2>
            <p className="muted small">Tu te connectes avec {joinFr(via.map((x) => (x === 'email' ? 'ton e-mail' : PROVIDERS[x] || x)))}{user.email ? <> (<b>{user.email}</b>)</> : null}.</p>
            {via.includes('email') && <details className="acc-details"><summary><Icon name="lock" size={17} />Changer de mot de passe</summary><NewPassword inline /></details>}
          </section>
          <LogoutPanel />
          <DeletePanel pseudo={pseudo} />
        </div>
      </div>
    </div>
  );
}

// Profil public : visible dans le classement des collectionneurs, avec une vitrine de cartes
function PublicPanel({ pseudo }) {
  const d = useData();
  const pub = useStore((s) => !!s.profile?.public);
  const n = useStore((s) => (s.profile?.showcase || []).length);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pick, setPick] = useState(false);
  const toggle = async () => {
    setErr(''); setBusy(true);
    try {
      if (pub) {
        await hideProfile(); forgetPublished();
        update((s) => { s.profile = { ...(s.profile || {}), public: false }; });
        toast('Ton profil n’est plus visible.', { icon: 'eyeoff' });
      } else {
        if (!pseudo) throw new Error('Choisis d’abord un pseudo.');
        if (!d.ready) throw new Error('Les cartes sont encore en train de charger, réessaie dans un instant.');
        await publishProfile(profileRow(d));
        update((s) => { s.profile = { ...(s.profile || {}), public: true }; });
        toast('Ton profil est visible dans le classement des collectionneurs.', { icon: 'trophy', title: 'Profil public' });
      }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <section className={'panel pad acc-block' + (pub ? '' : ' acc-promo')}>
      <h2 className="acc-h"><Icon name="trophy" size={20} />Profil public</h2>
      <p className="muted small">{pub
        ? <>Ton profil est visible par tous : <a className="link" href={href('/joueur/' + encodeURIComponent(pseudo))}>voir mon profil</a>. Tu apparais dans le <a className="link" href={href('/collectionneurs')}>classement des collectionneurs</a>.</>
        : 'Montre ta collection : ta carte de membre, la valeur de ta collection et une vitrine de tes plus belles cartes, sous ton pseudo. Ton e-mail reste privé.'}</p>
      <div className="row">
        <button className={'btn ' + (pub ? 'ghost' : 'primary')} onClick={toggle} disabled={busy}>{busy ? <span className="acc-spin" /> : <Icon name={pub ? 'eyeoff' : 'eye'} size={18} />}{pub ? 'Rendre mon profil privé' : 'Rendre mon profil public'}</button>
        <button className="btn ghost" onClick={() => setPick(true)}><Icon name="star" size={17} />Ma vitrine{n ? ` (${n})` : ''}</button>
      </div>
      {err && <p className="notice" role="alert">{err}</p>}
      <ShowcasePicker open={pick} onClose={() => setPick(false)} />
    </section>
  );
}

// Choix des cartes de la vitrine (12 au plus) ; sans choix, ce sont les 12 plus chères
function ShowcasePicker({ open, onClose }) {
  const d = useData();
  const coll = useStore((s) => s.collection);
  const chosen = useStore((s) => s.profile?.showcase || []);
  const list = useMemo(() => {
    if (!open || !d.ready) return [];
    const keys = [...new Set(coll.map((e) => e.key))];
    return keys.map((k) => { const c = resolveKey(d.cats, k); return c && { c, eur: eurOf(c, d.P, d.fx) || 0 }; }).filter(Boolean).sort((a, b) => b.eur - a.eur).slice(0, 120);
  }, [open, coll, d.ready, d.v]);
  const toggle = (k) => update((s) => {
    const cur = s.profile?.showcase || [];
    const next = cur.includes(k) ? cur.filter((x) => x !== k) : cur.length >= 12 ? cur : [...cur, k];
    s.profile = { ...(s.profile || {}), showcase: next };
  });
  return (
    <Modal open={open} onClose={onClose} title="Ma vitrine" wide>
      <p className="muted small">Choisis jusqu’à 12 cartes à montrer sur ton profil ({chosen.length}/12). Sans choix, ce sont tes 12 cartes les plus chères.</p>
      {chosen.length > 0 && <button className="btn small ghost" onClick={() => update((s) => { s.profile = { ...(s.profile || {}), showcase: [] }; })}>Revenir au choix automatique</button>}
      {list.length === 0 ? <p className="muted">Ajoute des cartes à ta collection pour remplir ta vitrine.</p> : (
        <div className="sc-grid">
          {list.map(({ c, eur }) => {
            const on = chosen.includes(c.key);
            return (
              <button key={c.key} type="button" className={'sc-item' + (on ? ' on' : '')} onClick={() => toggle(c.key)} aria-pressed={on} disabled={!on && chosen.length >= 12}>
                <CardArt card={c} tilt={false} fx={0} />
                <span>{c.name}</span>
                <small>{fmtEur(eur)}</small>
                {on && <i className="sc-check"><Icon name="check" size={14} stroke={3} /></i>}
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

// ---------- Personnalisation de la carte de membre (et photo de profil) ----------
const setLook = (k, v) => update((s) => { s.profile = { ...(s.profile || {}), card: { ...lookOf(s.profile?.card), [k]: v } }; });

function CardStudio({ view, setView, pseudo, since, code, stats, progress }) {
  const d = useData();
  const prof = useStore((s) => s.profile) || {};
  const streak = useStore((s) => s.quests?.best || s.quests?.streak || 0);
  const coll = useStore((s) => s.collection);
  const look = lookOf(prof.card);
  // Titres à débloquer : chiffres de la progression, dont les extensions complètes
  const unlock = useMemo(() => {
    if (!view) return null;
    const st = d.ready ? profileStats(d) : null;
    return { cards: progress.cards, value: progress.value?.total || 0, opened: progress.opened, ach: progress.ach, watch: progress.watch, streak, completeOp: st?.per.onepiece.complete || 0, completePk: st?.per.pokemon.complete || 0 };
  }, [view, d.ready, d.v, coll, progress.opened, progress.ach, progress.watch, streak]);
  const close = () => setView(null);
  const title = view === 'photo' ? 'Ma photo de profil' : view === 'fav' ? 'Ma carte fétiche' : 'Personnaliser ma carte';
  return (
    <Modal open={!!view} onClose={close} title={title} wide className="studio">
      {view === 'photo' ? <PhotoEditor current={prof.avatar} name={pseudo} onDone={() => setView('main')} onCancel={() => setView('main')} />
        : view === 'fav' ? <FavPicker current={look.fav} onDone={() => setView('main')} />
        : (
          <div className="studio-grid">
            <div className="studio-preview"><MemberCard pseudo={pseudo} since={since} code={code} stats={stats} avatar={prof.avatar} look={look} /></div>
            <div className="studio-opts">
              <section>
                <h4>Photo de profil</h4>
                <div className="studio-photo">
                  <Avatar className="acc-av huge" path={prof.avatar} name={pseudo} />
                  <button className="btn small ghost" onClick={() => setView('photo')}><Icon name="camera" size={16} />{prof.avatar ? 'Changer' : 'Ajouter une photo'}</button>
                </div>
              </section>
              <section>
                <h4>Couleur <small>{THEMES[look.theme].label}</small></h4>
                <div className="studio-swatches" role="radiogroup" aria-label="Couleur de la carte">
                  {Object.entries(THEMES).map(([id, t]) => (
                    <button key={id} type="button" role="radio" aria-checked={look.theme === id} aria-label={t.label} title={t.label} className={'swatch' + (look.theme === id ? ' on' : '') + (t.c ? '' : ' auto')} style={themeStyle(id)} onClick={() => setLook('theme', id)} />
                  ))}
                </div>
              </section>
              <Choice label="Motif" value={look.motif} options={MOTIFS} onPick={(v) => setLook('motif', v)} />
              <Choice label="Finition" value={look.finish} options={FINISHES} onPick={(v) => setLook('finish', v)} />
              <section>
                <h4>Titre</h4>
                <div className="studio-titles">
                  {TITLES.map((t) => {
                    const ok = titleOk(t.id, unlock);
                    return (
                      <button key={t.id} type="button" className={'studio-title' + (look.title === t.id ? ' on' : '')} disabled={!ok} aria-pressed={look.title === t.id} onClick={() => setLook('title', t.id)}>
                        <span>{t.label}</span>
                        {!ok ? <small><Icon name="lock" size={13} />{t.need}</small> : look.title === t.id ? <Icon name="check" size={16} stroke={3} /> : null}
                      </button>
                    );
                  })}
                </div>
              </section>
              <section>
                <h4>Carte fétiche</h4>
                <p className="faint small">Une carte de ta collection, affichée sur ta carte de membre.</p>
                <div className="row">
                  <button className="btn small ghost" onClick={() => setView('fav')}><Icon name="star" size={16} />{look.fav ? 'Changer de carte' : 'Choisir une carte'}</button>
                  {look.fav && <button className="btn small ghost" onClick={() => setLook('fav', null)}>Retirer</button>}
                </div>
              </section>
              <Choice label="Emblèmes" value={look.emb} options={EMBLEMS} onPick={(v) => setLook('emb', v)} />
              <p className="faint small">Ta carte est enregistrée dans ton compte et s’affiche sur ton profil public.</p>
            </div>
          </div>
        )}
    </Modal>
  );
}

function Choice({ label, value, options, onPick }) {
  return (
    <section>
      <h4>{label}</h4>
      <div className="chips">
        {Object.entries(options).map(([id, l]) => <button key={id} type="button" className={'chip' + (value === id ? ' on' : '')} aria-pressed={value === id} onClick={() => onPick(id)}>{l}</button>)}
      </div>
    </section>
  );
}

// Carte fétiche : une carte de la collection (les plus chères d'abord)
function FavPicker({ current, onDone }) {
  const d = useData();
  const coll = useStore((s) => s.collection);
  const list = useMemo(() => {
    if (!d.ready) return [];
    return [...new Set(coll.map((e) => e.key))].map((k) => { const c = resolveKey(d.cats, k); return c && { c, eur: eurOf(c, d.P, d.fx) || 0 }; }).filter(Boolean).sort((a, b) => b.eur - a.eur).slice(0, 120);
  }, [coll, d.ready, d.v]);
  const pick = (k) => { setLook('fav', k); onDone(); };
  return (
    <>
      <button className="btn small ghost" onClick={onDone}><Icon name="left" size={16} />Retour</button>
      {list.length === 0 ? <p className="muted">Ajoute des cartes à ta collection pour choisir ta carte fétiche.</p> : (
        <div className="sc-grid">
          {list.map(({ c, eur }) => (
            <button key={c.key} type="button" className={'sc-item' + (current === c.key ? ' on' : '')} onClick={() => pick(c.key)} aria-pressed={current === c.key}>
              <CardArt card={c} tilt={false} fx={0} />
              <span>{c.name}</span>
              <small>{fmtEur(eur)}</small>
              {current === c.key && <i className="sc-check"><Icon name="check" size={14} stroke={3} /></i>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// Photo de profil : choix d'une image, cadrage dans le rond (glisser, pincer ou curseur), envoi en 320 × 320
const VIEW = 260, OUT = 320;
function PhotoEditor({ current, name, onDone, onCancel }) {
  const [img, setImg] = useState(null);
  const [z, setZ] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);
  const ptrs = useRef(new Map());
  const start = useRef(null);
  const base = img ? VIEW / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const clamp = (p, zz) => {
    const k = base * zz, mw = Math.max(0, (img.naturalWidth * k - VIEW) / 2), mh = Math.max(0, (img.naturalHeight * k - VIEW) / 2);
    return { x: Math.max(-mw, Math.min(mw, p.x)), y: Math.max(-mh, Math.min(mh, p.y)) };
  };
  const zoomTo = (zz) => { const v = Math.max(1, Math.min(4, zz)); setZ(v); setPos((p) => clamp(p, v)); };
  useEffect(() => () => { if (img?.src.startsWith('blob:')) URL.revokeObjectURL(img.src); }, [img]);
  const load = (f) => {
    setErr('');
    if (!f) return;
    if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|heic|heif|gif)$/i.test(f.name)) { setErr('Choisis une image (photo JPEG, PNG…).'); return; }
    if (f.size > 25e6) { setErr('Cette image est trop lourde (25 Mo au plus).'); return; }
    const im = new Image();
    im.onload = () => { setImg(im); setZ(1); setPos({ x: 0, y: 0 }); };
    im.onerror = () => setErr('Cette image ne peut pas être lue ici. Essaie une photo JPEG ou PNG.');
    im.src = URL.createObjectURL(f);
  };
  const snap = () => { const pts = [...ptrs.current.values()]; start.current = { pos, z, pts, dist: pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0 }; };
  const down = (e) => { e.currentTarget.setPointerCapture?.(e.pointerId); ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); snap(); };
  const move = (e) => {
    if (!img || !ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const st = start.current, pts = [...ptrs.current.values()];
    if (pts.length > 1 && st.dist) {
      const v = Math.max(1, Math.min(4, st.z * Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / st.dist));
      setZ(v); setPos(clamp(st.pos, v));
    } else if (st.pts[0]) setPos(clamp({ x: st.pos.x + pts[0].x - st.pts[0].x, y: st.pos.y + pts[0].y - st.pts[0].y }, z));
  };
  const up = (e) => { ptrs.current.delete(e.pointerId); snap(); };
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const cv = document.createElement('canvas'); cv.width = cv.height = OUT;
      const ctx = cv.getContext('2d'), k = OUT / VIEW, w = img.naturalWidth * base * z, h = img.naturalHeight * base * z;
      ctx.fillStyle = '#0b0d16'; ctx.fillRect(0, 0, OUT, OUT);
      ctx.drawImage(img, (VIEW / 2 + pos.x - w / 2) * k, (VIEW / 2 + pos.y - h / 2) * k, w * k, h * k);
      const enc = (type) => new Promise((res) => cv.toBlob(res, type, 0.86));
      let blob = await enc('image/webp');
      if (!blob || blob.type !== 'image/webp') blob = await enc('image/jpeg');
      if (!blob) throw new Error('La photo n’a pas pu être préparée.');
      const path = await uploadAvatar(blob);
      update((s) => { s.profile = { ...(s.profile || {}), avatar: path }; });
      if (current && current !== path) removeAvatar(current).catch(() => {});
      toast('Ta photo est sur ta carte de membre.', { icon: 'camera', title: 'Photo enregistrée' });
      onDone();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const drop = async () => {
    setBusy(true);
    update((s) => { s.profile = { ...(s.profile || {}), avatar: null }; });
    await removeAvatar(current).catch(() => {});
    setBusy(false);
    toast('Photo retirée.', { icon: 'trash' });
    onDone();
  };
  const w = img ? img.naturalWidth * base * z : 0, h = img ? img.naturalHeight * base * z : 0;
  return (
    <div className="ph-edit">
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { load(e.target.files?.[0]); e.target.value = ''; }} />
      {!img ? (
        <div className="ph-start">
          <Avatar className="acc-av giant" path={current} name={name} />
          <p className="muted small">Choisis une photo dans ta galerie ou prends-en une. Tu pourras la cadrer avant de l’enregistrer.</p>
          <div className="row">
            <button className="btn primary" onClick={() => fileRef.current?.click()}><Icon name="camera" size={18} />Choisir une photo</button>
            {current && <button className="btn ghost" onClick={drop} disabled={busy}><Icon name="trash" size={17} />Retirer ma photo</button>}
          </div>
        </div>
      ) : (
        <div className="ph-crop">
          <div className="ph-view" style={{ width: VIEW, height: VIEW }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            onWheel={(e) => zoomTo(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}>
            <img src={img.src} alt="" draggable={false} style={{ width: w, height: h, transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }} />
            <i className="ph-ring" aria-hidden="true" />
          </div>
          <label className="ph-zoom"><Icon name="minus" size={16} /><input type="range" min="1" max="4" step="0.01" value={z} onChange={(e) => zoomTo(Number(e.target.value))} aria-label="Zoom" /><Icon name="plus" size={16} /></label>
          <p className="faint small">Fais glisser la photo pour la placer dans le rond, pince ou utilise le curseur pour zoomer.</p>
          <div className="row">
            <button className="btn primary" onClick={save} disabled={busy}>{busy ? <span className="acc-spin" /> : <Icon name="check" size={18} />}Enregistrer</button>
            <button className="btn ghost" onClick={() => fileRef.current?.click()} disabled={busy}>Autre photo</button>
          </div>
        </div>
      )}
      {err && <p className="notice" role="alert">{err}</p>}
      <button className="btn small ghost ph-back" onClick={onCancel} disabled={busy}><Icon name="left" size={16} />Retour à ma carte</button>
      <p className="faint small">Ta photo est visible par les autres joueurs si ton profil est public. Pas de photo choquante ni d’informations personnelles.</p>
    </div>
  );
}

function PseudoPanel({ current, suggest = '' }) {
  const [v, setV] = useState(current || suggest);
  const { busy, err, run } = useSubmit();
  const [ok, setOk] = useState(false);
  useEffect(() => setV(current || suggest), [current]);
  const submit = run(async () => { setOk(false); await changePseudo(v); setOk(true); });
  const missing = !current;
  return (
    <section className={'panel pad acc-block' + (missing ? ' glow-edge acc-need' : '')}>
      <h2 className="acc-h"><Icon name="user" size={20} />{missing ? 'Choisis ton pseudo' : 'Pseudo'}</h2>
      {missing && <p className="muted small">Il apparaîtra sur ta carte de membre et dans le classement des collectionneurs.</p>}
      <form className="acc-inline" onSubmit={submit}>
        <span className="acc-input"><Icon name="user" size={18} /><input value={v} onChange={(e) => { setV(e.target.value); setOk(false); }} maxLength={20} autoComplete="nickname" aria-label="Pseudo" placeholder="Ton pseudo" /></span>
        <button className="btn primary" disabled={busy || !cleanPseudo(v) || cleanPseudo(v) === current}>{busy ? <span className="acc-spin" /> : 'Enregistrer'}</button>
      </form>
      {err && <p className="notice" role="alert">{err}</p>}
      {ok && <p className="ok-msg small">Pseudo enregistré.</p>}
    </section>
  );
}

function LogoutPanel() {
  const [warn, setWarn] = useState(false);
  const [busy, setBusy] = useState(false);
  const out = async (force) => {
    setBusy(true);
    try { await signOut({ force }); forgetPublished(); toast('Tu es déconnecté. Ta progression t’attend dans ton compte.', { icon: 'logout' }); location.hash = '#/compte'; }
    catch (e) { if (e.code === 'dirty') setWarn(true); else toast(e.message, { icon: 'info' }); }
    finally { setBusy(false); }
  };
  return (
    <section className="panel pad acc-block">
      <h2 className="acc-h"><Icon name="logout" size={20} />Se déconnecter</h2>
      <p className="muted small">Ta progression reste dans ton compte. Cet appareil repart d’une collection vide jusqu’à ta prochaine connexion.</p>
      {!warn ? <button className="btn ghost" onClick={() => out(false)} disabled={busy}>{busy ? <span className="acc-spin" /> : <Icon name="logout" size={18} />}Se déconnecter</button> : (
        <div className="acc-confirm">
          <p className="notice">{isDirty() ? 'Tes derniers changements n’ont pas pu être envoyés (pas de réseau ?). Si tu te déconnectes maintenant, ils seront perdus.' : 'Tout est maintenant enregistré.'}</p>
          <div className="row"><button className="btn danger" onClick={() => out(true)} disabled={busy}>Me déconnecter quand même</button><button className="btn ghost" onClick={() => { setWarn(false); syncNow(); }}>Réessayer l’envoi</button></div>
        </div>
      )}
    </section>
  );
}

function DeletePanel({ pseudo }) {
  const [open, setOpen] = useState(false);
  const [txt, setTxt] = useState('');
  const { busy, err, run } = useSubmit();
  const word = 'SUPPRIMER';
  const submit = run(async () => { await deleteAccount(); toast('Ton compte et sa sauvegarde ont été supprimés.', { icon: 'trash' }); location.hash = '#/compte'; });
  return (
    <section className="panel pad acc-block">
      <h2 className="acc-h danger-h"><Icon name="trash" size={20} />Supprimer mon compte</h2>
      {!open ? <button className="btn danger" onClick={() => setOpen(true)}>Supprimer mon compte…</button> : (
        <form className="acc-form" onSubmit={submit}>
          <p className="muted small">Ton compte{pseudo ? ` « ${pseudo} »` : ''} et toute sa sauvegarde seront effacés définitivement, sur tous tes appareils. Pense à exporter ta collection avant si tu veux la garder.</p>
          <Field icon="trash" label={`Pour confirmer, écris ${word}`}><input value={txt} onChange={(e) => setTxt(e.target.value)} autoComplete="off" /></Field>
          {err && <p className="notice" role="alert">{err}</p>}
          <div className="row"><button className="btn danger" disabled={busy || txt.trim().toUpperCase() !== word}>{busy ? <span className="acc-spin" /> : <Icon name="trash" size={18} />}Supprimer définitivement</button><button type="button" className="btn ghost" onClick={() => { setOpen(false); setTxt(''); }}>Annuler</button></div>
        </form>
      )}
    </section>
  );
}

// ---------- Bouton de la barre du haut ----------
export function AccountButton() {
  const c = useCloud();
  if (!cloudOn()) return null;
  const av = useStore((s) => s.profile?.avatar);
  const name = c.pseudo || c.user?.meta?.pseudo || '';
  const label = c.user ? `Mon compte (${STATUS[c.status]?.[1] || ''})` : 'Se connecter ou créer un compte';
  return (
    <a className={'icon-btn acc-btn' + (c.user ? ' in st-' + c.status : '')} href={href('/compte')} aria-label={label} title={c.user ? name : 'Se connecter'}>
      {c.user ? <Avatar className="acc-av" path={av} name={name}>{name ? undefined : <Icon name="user" size={15} />}</Avatar> : <Icon name="user" />}
      {c.user && <i className="acc-dot" aria-hidden="true" />}
    </a>
  );
}

// Encart du menu latéral
export function AccountDrawer({ tab }) {
  const c = useCloud();
  const av = useStore((s) => s.profile?.avatar);
  if (!cloudOn()) return null;
  if (!c.user) return (
    <a className="drawer-acc out" href={href('/compte')} tabIndex={tab}>
      <span className="acc-av big"><Icon name="user" size={22} /></span>
      <span><b>Se connecter</b><small>Crée ton compte pour tout sauvegarder</small></span>
      <Icon name="right" size={16} />
    </a>
  );
  const name = c.pseudo || c.user.meta?.pseudo || '';
  return (
    <a className={'drawer-acc st-' + c.status} href={href('/compte')} tabIndex={tab}>
      <span className="acc-av-wrap"><Avatar className="acc-av big" path={av} name={name}>{name ? undefined : <Icon name="user" size={20} />}</Avatar><i className="acc-dot" /></span>
      <span><b>{name || 'Choisis ton pseudo'}</b><small>{STATUS[c.status]?.[1]}</small></span>
      <Icon name="right" size={16} />
    </a>
  );
}
