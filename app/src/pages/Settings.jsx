import React, { useEffect, useRef, useState } from 'react';
import { href } from '../lib/hooks.js';
import { useStore, update, exportData, importData, hasV2, syncFromV2, resetAll, tryAdmin } from '../lib/store.js';
import { toast } from '../lib/toast.js';
import { useCloud, cloudOn } from '../lib/cloud.js';
import { LANGS } from '../lib/lang.js';
import { Seg } from '../ui/Kit.jsx';
import Icon from '../ui/Icon.jsx';

export function SettingsPage() {
  const lang = useStore((s) => s.lang || 'fr');
  const fx = useStore((s) => s.settings?.fx || 'full');
  const sound = useStore((s) => s.settings?.sound !== false);
  const n = useStore((s) => s.collection.length);
  const [confirm, setConfirm] = useState(false);
  const account = useCloud((c) => (c.user ? c.pseudo || c.user.email : null));
  const file = useRef();
  const setSetting = (patch) => update((s) => { s.settings = { ...s.settings, ...patch }; });
  const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([exportData()], { type: 'application/json' })); a.download = 'kirakai-sauvegarde-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  const doImport = async (f) => { try { const k = importData(await f.text()); toast(`${k} carte${k > 1 ? 's' : ''} importée${k > 1 ? 's' : ''}.`, { icon: 'download' }); } catch (e) { toast('Import impossible : ' + e.message, { icon: 'info' }); } };
  return (
    <div className="page settings-page">
      <div className="kicker">Kirakai</div>
      <h1 className="page-title">Réglages</h1>
      <div className="settings">
        <section className="panel pad set-block">
          <h2><Icon name="globe" size={20} />Langue des cartes et devise</h2>
          <Seg value={lang} onChange={(v) => update((s) => { s.lang = v; })} label="Langue" options={LANGS.map(([v, l, t]) => [v, l + ' · ' + t])} />
          <p className="muted small">FR : noms et images officiels français, prix en euros. EN : version internationale, prix en dollars. JP : noms et images japonais (One Piece) et cartes japonaises (Pokémon), prix en yens. Les prix sont convertis au taux du jour du relevé.</p>
        </section>
        <section className="panel pad set-block">
          <h2><Icon name="sparkle" size={20} />Effets visuels</h2>
          <Seg value={fx} onChange={(v) => setSetting({ fx: v })} label="Effets" options={[['full', 'Complets'], ['lite', 'Allégés']]} />
          <p className="muted small">Allégés : pas de reflets holographiques, d’aurores animées ni de transitions entre les pages. Utile sur un appareil ancien ou pour économiser la batterie.</p>
          <h2 style={{ marginTop: 18 }}><Icon name={sound ? 'sound' : 'mute'} size={20} />Sons</h2>
          <Seg value={sound ? 'on' : 'off'} onChange={(v) => setSetting({ sound: v === 'on' })} label="Sons" options={[['on', 'Activés'], ['off', 'Coupés']]} />
        </section>
        <section className="panel pad set-block">
          <h2><Icon name="download" size={20} />Sauvegarde</h2>
          {account
            ? <p className="muted small">Ta collection ({n} entrée{n > 1 ? 's' : ''}), tes suivis, tes boosters et tes succès sont enregistrés dans ton compte <b>{account}</b> et synchronisés automatiquement. <a className="link" href={href('/compte')}>Mon compte</a></p>
            : <p className="muted small">Ta collection ({n} entrée{n > 1 ? 's' : ''}), tes suivis, tes boosters et tes succès sont enregistrés dans ce navigateur.{cloudOn() && <> <a className="link" href={href('/compte')}>Crée un compte</a> pour les retrouver sur tous tes appareils.</>}</p>}
          <div className="row">
            <button className="btn ghost" onClick={download}><Icon name="download" size={18} />Exporter</button>
            <button className="btn ghost" onClick={() => file.current.click()}><Icon name="upload" size={18} />Importer</button>
            <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files[0] && doImport(e.target.files[0])} />
            {hasV2() && <button className="btn ghost" onClick={() => { try { const k = syncFromV2(); toast(k ? `${k} carte${k > 1 ? 's' : ''} reprise${k > 1 ? 's' : ''} de l’ancienne version.` : 'Tout est déjà à jour avec l’ancienne version.', { icon: 'refresh' }); } catch (e) { toast(e.message, { icon: 'info' }); } }}><Icon name="refresh" size={18} />Reprendre les nouveautés de l’ancienne version</button>}
          </div>
          <p className="muted small">Kirakai garde ses propres données : ce que tu fais ici ne modifie jamais l’ancienne version du site.</p>
        </section>
        <section className="panel pad set-block">
          <h2><Icon name="info" size={20} />Application</h2>
          <div className="row">
            <button className="btn ghost" onClick={() => { update((s) => { s.installHidden = false; }); toast('Le bandeau d’installation réapparaît quand ton navigateur le permet.', { icon: 'info' }); }}><Icon name="download" size={18} />Installer l’application</button>
            <a className="btn ghost" href="https://nexus44567.github.io/nexus-tcg/"><Icon name="ext" size={18} />Ouvrir l’ancienne version</a>
          </div>
          <h2 className="danger-h" style={{ marginTop: 18 }}><Icon name="trash" size={20} />Tout effacer</h2>
          {!confirm ? <button className="btn danger" onClick={() => setConfirm(true)}>Effacer mes données Kirakai</button> : (
            <div className="row"><span className="muted small">Collection, suivis, boosters et succès seront supprimés de ce navigateur{account ? ' et de ton compte' : ''}.</span><button className="btn danger" onClick={() => { resetAll(); setConfirm(false); toast('Données effacées.', { icon: 'trash' }); }}>Confirmer</button><button className="btn ghost" onClick={() => setConfirm(false)}>Annuler</button></div>
          )}
        </section>
      </div>
    </div>
  );
}

export function AdminPage({ code }) {
  const [res, setRes] = useState(null);
  const admin = useStore((s) => !!s.admin);
  useEffect(() => { tryAdmin(code).then(setRes); }, [code]);
  return (
    <div className="page">
      <h1 className="page-title">Mode administrateur</h1>
      {res === null && <p className="muted">Vérification…</p>}
      {res === 'bad' && <p className="error">Lien non valide.</p>}
      {res !== null && res !== 'bad' && (
        <>
          <p className="lead">{admin ? 'Activé sur cet appareil : Berrys et Pokéballs illimités pour ouvrir autant de boosters et de displays que tu veux.' : 'Désactivé sur cet appareil : tu retrouves ton solde normal.'}</p>
          <div className="row">
            <a className="btn primary" href={href('/boosters?u=onepiece')} onClick={() => update((s) => { s.universe = 'onepiece'; })}>Boosters One Piece</a>
            <a className="btn alt" href={href('/boosters?u=pokemon')} onClick={() => update((s) => { s.universe = 'pokemon'; })}>Boosters Pokémon</a>
            {admin && <a className="btn ghost" href={href('/admin/off')}>Désactiver le mode administrateur</a>}
          </div>
        </>
      )}
    </div>
  );
}
