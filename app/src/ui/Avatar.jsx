import React, { useEffect, useState } from 'react';
import { avatarUrl } from '../lib/cloud.js';

// Photo de profil d'un joueur, ou l'initiale de son pseudo si elle manque (ou ne se charge pas)
export default function Avatar({ path, name = '', className = '', children }) {
  const src = avatarUrl(path);
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  return (
    <span className={className + (src && !bad ? ' has-photo' : '')} aria-hidden="true">
      {src && !bad ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setBad(true)} /> : children ?? (name.trim().charAt(0).toUpperCase() || '?')}
    </span>
  );
}
