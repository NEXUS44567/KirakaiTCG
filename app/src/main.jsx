// En premier : les liens reçus par e-mail (#access_token=…) sont lus avant le routeur
import './lib/cloud.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { startPushSync } from './lib/push.js';
import { installTilt } from './ui/Card.jsx';
import './styles/base.css';
import './styles/cards.css';
import './styles/shell.css';
import './styles/pages.css';
import './styles/market.css';
import './styles/boosters.css';
import './styles/collection.css';
import './styles/scanner.css';
import './styles/worlds.css';
import './styles/account.css';
import './styles/play.css';

try { sessionStorage.removeItem('nexus3.heal'); } catch {}
installTilt();
startPushSync();
createRoot(document.getElementById('root')).render(<App />);

// Ouverture instantanée et consultation hors ligne : service worker propre à la V3 (portée v3/)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {}));
}
