// Exploration (temporaire) : structure d'une page « deck recommandé » du site officiel One Piece
const UA = { 'user-agent': 'Mozilla/5.0 (KirakaiBot; +https://nexus44567.github.io/KirakaiTCG/)' };
const get = async (u) => { const r = await fetch(u, { headers: UA }); const t = await r.text(); return [r.status, t]; };
async function tryUrl(u, f) { try { const [s, t] = await get(u); console.log('\n=====', u, s, t.length); return f(t); } catch (e) { console.log('\n=====', u, 'ERREUR', e.message); } }
for (const p of ['deck_113.php', 'deck_001.php']) await tryUrl('https://en.onepiece-cardgame.com/feature/deck/' + p, (t) => {
  const i = t.search(/[A-Z]{2,3}\d{2}-\d{3}/);
  console.log('HTML', t.slice(Math.max(0, i - 2500), i + 4000));
  console.log('IDS', [...t.matchAll(/([A-Z]{2,3}\d{2}-\d{3}[A-Z_0-9]*)/g)].map((m) => m[1]).join(' ').slice(0, 1500));
});
await tryUrl('https://fr.onepiece-cardgame.com/feature/deck/', (t) => console.log('LIENS FR', [...new Set([...t.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => /deck_/i.test(h)))].length, t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(t.indexOf('RECOMMENDED') > 0 ? 0 : 0, 1500)));
