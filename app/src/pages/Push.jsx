import React, { useState } from 'react';
import { useStore } from '../lib/store.js';
import { cloudOn } from '../lib/cloud.js';
import { pushSupported, needsInstall, enablePush, disablePush } from '../lib/push.js';
import { toast } from '../lib/toast.js';
import Icon from '../ui/Icon.jsx';

// Encart « Reçois tes alertes sur ton téléphone » (page des alertes, réglages)
export default function PushPanel({ count }) {
  const on = useStore((s) => !!s.settings?.push);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!cloudOn()) return null;
  const install = needsInstall();
  const can = pushSupported() && !install;
  const go = async () => {
    setBusy(true); setErr('');
    try {
      if (on) { await disablePush(); toast('Alertes sur ce téléphone désactivées.', { icon: 'bell' }); }
      else { await enablePush(); toast('Tu recevras une notification quand une carte franchit ton seuil.', { icon: 'bell', title: 'Alertes activées' }); }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <section className={'push-panel panel' + (on ? ' on' : '')}>
      <span className="push-ico"><Icon name="bell" size={22} /></span>
      <div className="push-txt">
        <b>{on ? 'Alertes sur ce téléphone : activées' : 'Reçois tes alertes sur ton téléphone'}</b>
        <small>{on
          ? 'Chaque matin, après le relevé des prix, une notification te prévient quand une de tes cartes franchit ton seuil, même si Kirakai est fermé.'
          : install ? 'Sur iPhone : installe Kirakai sur ton écran d’accueil (Partager › Sur l’écran d’accueil), ouvre-le depuis son icône, puis reviens ici.'
          : !pushSupported() ? 'Ce navigateur ne gère pas les notifications. Essaie avec Chrome, Edge, Firefox ou Safari récent.'
          : 'Une notification chaque matin quand une carte passe sous ou au-dessus de ton seuil, même quand Kirakai est fermé.'}</small>
        {count === 0 && <small className="faint">Fixe d’abord un seuil sur une carte (« Sous » ou « Au-dessus »).</small>}
        {err && <p className="notice" role="alert">{err}</p>}
      </div>
      {can && <button className={'btn ' + (on ? 'ghost' : 'primary')} onClick={go} disabled={busy}>{busy ? <span className="acc-spin" /> : <Icon name="bell" size={17} />}{on ? 'Désactiver' : 'Activer'}</button>}
    </section>
  );
}
