import React, { useEffect, useMemo, useState } from 'react';
import { useStore, update } from '../lib/store.js';
import { fmtNum, GAMES } from '../lib/data.js';
import { useNow } from '../lib/hooks.js';
import { seasonNow, leagueOn, fetchBoard, fetchRank, submitScore, newIdentity } from '../lib/league.js';
import { Progress } from '../ui/Kit.jsx';
import { useCloud } from '../lib/cloud.js';

// Classement des collectionneurs : qui a rempli le plus l'extension des boosters pendant la saison de 30 jours.

const pad = (n) => String(n).padStart(2, '0');

function Countdown({ end, now }) {
  const left = Math.max(0, end - now);
  const d = Math.floor(left / 86400000), h = Math.floor(left / 3600000) % 24, m = Math.floor(left / 60000) % 60, s = Math.floor(left / 1000) % 60;
  const urgent = left < 3 * 86400000;
  return (
    <div className={'lg-count' + (urgent ? ' urgent' : '')} role="timer" aria-label={`Fin de saison dans ${d} jours ${h} heures ${m} minutes`}>
      {[[d, 'jours'], [pad(h), 'heures'], [pad(m), 'min'], [pad(s), 'sec']].map(([v, l]) => <span key={l} className="lg-unit"><b>{v}</b><small>{l}</small></span>)}
    </div>
  );
}

export function League({ prod }) {
  const game = prod.game;
  const now = useNow();
  const sn = seasonNow(now);
  const season = useStore((s) => s.season);
  const me = useStore((s) => s.league);
  const admin = useStore((s) => !!s.admin);
  const cur = season?.n === sn.n ? season : { cards: {}, packs: {} };
  const total = prod.cards.length;
  const owned = useMemo(() => prod.cards.reduce((n, c) => n + (cur.cards[c.key] ? 1 : 0), 0), [cur, prod]);
  const packs = cur.packs?.[game] || 0;
  const pct = total ? (owned / total) * 100 : 0;
  const on = leagueOn();
  const [board, setBoard] = useState(null);
  const [err, setErr] = useState('');
  const [rank, setRank] = useState(null);
  const [all, setAll] = useState(false);
  const account = useCloud((c) => (c.user ? c.pseudo || c.user.meta?.pseudo || '' : null));
  const [pseudo, setPseudo] = useState(me?.pseudo || account || '');
  useEffect(() => { if (account && !pseudo) setPseudo(account); }, [account]);
  const [tick, setTick] = useState(0);
  const joined = !!(me?.id && me?.pseudo);

  // Chargement du classement (toutes les minutes)
  useEffect(() => {
    if (!on || !sn.started) return;
    let ok = true;
    const load = () => fetchBoard(game, sn.n).then((b) => { if (ok) { setBoard(b); setErr(''); } }, (e) => ok && setErr(e.message));
    load(); const i = setInterval(load, 60000);
    return () => { ok = false; clearInterval(i); };
  }, [on, game, sn.n, tick]);

  // Envoi automatique de mon score après chaque ouverture
  useEffect(() => {
    if (!on || !joined || admin || !sn.started || packs === 0) return;
    const t = setTimeout(() => {
      submitScore({ p_player: me.id, p_secret: me.secret, p_game: game, p_season: sn.n, p_pseudo: me.pseudo, p_set: prod.code || prod.name, p_owned: owned, p_total: total, p_packs: packs })
        .then(() => setTick((x) => x + 1), (e) => setErr(e.message));
    }, 1500);
    return () => clearTimeout(t);
  }, [on, joined, admin, owned, packs, me?.pseudo, sn.n, game]);

  const mine = board?.find((r) => r.player_id === me?.id);
  useEffect(() => {
    if (!on || !mine || !board) { setRank(null); return; }
    const i = board.indexOf(mine);
    if (i >= 0) setRank(i + 1); else fetchRank(game, sn.n, mine.owned, mine.updated_at).then(setRank, () => {});
  }, [board, mine?.owned]);

  const join = (e) => {
    e.preventDefault();
    const p = pseudo.trim().replace(/\s+/g, ' ');
    if (p.length < 2 || p.length > 20) { setErr('Ton pseudo doit faire entre 2 et 20 caractères.'); return; }
    setErr('');
    update((s) => { if (!s.league?.id) s.league = { ...newIdentity(), pseudo: p }; else s.league.pseudo = p; });
  };

  const rows = board ? (all ? board : board.slice(0, 10)) : [];
  const endTxt = new Date(sn.end).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

  return (
    <section className={'section league panel ' + game} id="classement">
      <header className="lg-head">
        <div>
          <div className="kicker">Classement des collectionneurs · {GAMES[game].label}</div>
          <h2>Saison {sn.n} · {prod.name}</h2>
          <p className="muted small">Remplis l’extension le plus possible en 30 jours. Seules les cartes obtenues pendant la saison comptent ; à égalité, le premier arrivé passe devant. Fin le {endTxt}.</p>
        </div>
        {sn.started ? <Countdown end={sn.end} now={now} /> : <div className="lg-count"><small>La saison 1 commence bientôt</small></div>}
      </header>

      <div className="lg-me">
        <div className="lg-me-score">
          <span className="kicker">Ta saison</span>
          <b>{owned} / {total}</b>
          <span className="muted small">cartes · {pct.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % · {fmtNum(packs)} booster{packs > 1 ? 's' : ''}</span>
          <Progress value={pct / 100} big label="Progression de la saison" />
        </div>
        <div className="lg-me-rank">
          {!on ? <p className="muted small">Le classement en ligne s’active bientôt : ton score de la saison est déjà compté.</p>
            : admin ? <p className="muted small">Mode administrateur : tes scores ne sont pas envoyés au classement.</p>
            : joined ? (
              <>
                <span className="kicker">Ta place</span>
                <b className="lg-rank">{rank ? '#' + rank : packs ? '…' : '—'}</b>
                <span className="muted small">{packs ? `en tant que ${me.pseudo}` : 'Ouvre un booster pour entrer dans le classement'}</span>
                <button className="link small" onClick={() => setPseudo('') || update((s) => { s.league.pseudo = ''; })}>Changer de pseudo</button>
              </>
            ) : (
              <form className="lg-join" onSubmit={join}>
                <label htmlFor="lg-pseudo">Choisis ton pseudo pour apparaître dans le classement</label>
                <div className="row"><input id="lg-pseudo" value={pseudo} maxLength={20} placeholder="Ton pseudo" autoComplete="nickname" onChange={(e) => setPseudo(e.target.value)} /><button className="btn primary">Rejoindre</button></div>
                <small className="faint">{account != null ? 'Ton identité de joueur est enregistrée dans ton compte. Évite ton vrai nom.' : <>Ton identité de joueur reste dans ce navigateur. <a className="link" href="#/compte">Crée un compte</a> pour la garder sur tous tes appareils. Évite ton vrai nom.</>}</small>
              </form>
            )}
        </div>
      </div>

      {err && <p className="notice">{err}</p>}

      {on && sn.started && (
        <div className="lg-board">
          {!board ? <p className="muted small">Chargement du classement…</p>
            : board.length === 0 ? <p className="muted small">Personne n’est encore classé cette saison : ouvre un booster et prends la première place !</p>
            : (
              <ol>
                {rows.map((r, i) => {
                  const p = (r.owned / r.total) * 100;
                  return (
                    <li key={r.player_id} className={(i < 3 ? 'top top' + (i + 1) : '') + (r.player_id === me?.id ? ' me' : '')}>
                      <span className="lg-pos">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
                      <span className="lg-name">{r.pseudo}{r.player_id === me?.id && <em> (toi)</em>}</span>
                      <span className="lg-bar"><i style={{ width: p + '%' }} /></span>
                      <span className="lg-val"><b>{r.owned}/{r.total}</b><small>{p.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %</small></span>
                    </li>
                  );
                })}
              </ol>
            )}
          {board?.length > 10 && <button className="btn ghost small" onClick={() => setAll(!all)}>{all ? 'Voir le top 10' : `Voir les ${board.length} premiers`}</button>}
        </div>
      )}
    </section>
  );
}
