import React, { useEffect, useState } from 'react';
import { href } from '../lib/hooks.js';
import { useStore, QUESTS, QUEST_REWARD, QUEST_BONUS, STREAK_BONUS, questsOf, claimQuest } from '../lib/store.js';
import { fmtNum } from '../lib/data.js';
import { SFX, burst } from '../lib/sfx.js';
import { toast } from '../lib/toast.js';
import Icon from '../ui/Icon.jsx';

// Quêtes du jour : trois petits objectifs, récompensés en Berrys et en Pokéballs, et la série de jours de visite.

const dayKey = (t = new Date()) => t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');

function useMidnight() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const f = () => { const t = new Date(), m = new Date(t); m.setHours(24, 0, 0, 0); setLeft(m - t); };
    f(); const i = setInterval(f, 30000); return () => clearInterval(i);
  }, []);
  return left;
}

export default function Quests({ compact }) {
  const q = useStore((s) => s.quests);
  const left = useMidnight();
  const today = dayKey();
  const fresh = q?.day === today ? q : { count: {}, claimed: {}, streak: q?.streak, best: q?.best };
  const ids = questsOf(today);
  const done = ids.filter((k) => fresh.claimed?.[k]).length;
  const streak = q?.last === today ? q.streak || 1 : q?.streak || 0;
  const next = Object.keys(STREAK_BONUS).map(Number).find((n) => n > streak);
  const h = Math.floor(left / 3600000), m = Math.floor(left / 60000) % 60;
  const claim = (id, e) => {
    const r = e.currentTarget.getBoundingClientRect(); // avant le nouveau rendu, qui retire le bouton
    if (!claimQuest(id)) return;
    SFX.coin();
    burst(null, 3, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
    const all = ids.every((k) => k === id || fresh.claimed?.[k]);
    toast(all ? `+${QUEST_REWARD + QUEST_BONUS} Berrys et Pokéballs : les trois quêtes sont faites !` : `+${QUEST_REWARD} Berrys et +${QUEST_REWARD} Pokéballs`, { icon: 'coin', title: all ? 'Journée parfaite' : 'Quête réussie' });
  };
  return (
    <section className={'quests panel' + (compact ? ' compact' : '')} aria-label="Quêtes du jour">
      <header className="q-head">
        <div>
          <div className="kicker">Quêtes du jour</div>
          <h3>{done === 3 ? 'Toutes réussies, reviens demain !' : `${done} / 3 réussie${done > 1 ? 's' : ''}`}</h3>
          <small className="faint">Nouvelles quêtes dans {h} h {String(m).padStart(2, '0')}</small>
        </div>
        <div className={'q-streak' + (streak >= 3 ? ' hot' : '')} title={'Meilleure série : ' + (q?.best || streak) + ' jours'}>
          <Icon name="flame" size={22} />
          <b>{streak}</b>
          <small>jour{streak > 1 ? 's' : ''} de suite{next ? ` · bonus de ${fmtNum(STREAK_BONUS[next])} à ${next} jours` : ''}</small>
        </div>
      </header>
      <ol className="q-list">
        {ids.map((id) => {
          const def = QUESTS[id], n = Math.min(def.n, fresh.count?.[id] || 0), ok = n >= def.n, got = !!fresh.claimed?.[id];
          return (
            <li key={id} className={(ok ? 'ok' : '') + (got ? ' got' : '')}>
              <span className="q-ico"><Icon name={got ? 'check' : def.icon} size={18} /></span>
              <span className="q-txt">
                <b>{def.label}</b>
                <span className="q-bar"><i style={{ width: (n / def.n) * 100 + '%' }} /></span>
              </span>
              {got ? <span className="q-done">+{QUEST_REWARD}</span>
                : ok ? <button className="btn small primary q-claim" onClick={(e) => claim(id, e)}><Icon name="coin" size={15} />+{QUEST_REWARD}</button>
                : <a className="btn small ghost" href={href(def.to)}>{n}/{def.n}<Icon name="right" size={14} /></a>}
            </li>
          );
        })}
      </ol>
      <p className="q-foot faint small">Chaque quête rapporte {QUEST_REWARD} Berrys et {QUEST_REWARD} Pokéballs, les trois réunies {QUEST_BONUS} de plus. Monnaie virtuelle pour les boosters, sans valeur réelle.</p>
    </section>
  );
}
