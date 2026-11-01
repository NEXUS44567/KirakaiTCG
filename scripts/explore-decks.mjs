// Exploration (temporaire) : decks recommandés du site officiel One Piece (listes avec quantités ?)
const UA = { 'user-agent': 'Mozilla/5.0 (KirakaiBot; +https://nexus44567.github.io/KirakaiTCG/)' };
const get = async (u) => { const r = await fetch(u, { headers: UA }); const t = await r.text(); return [r.status, t]; };
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
async function tryUrl(u, f) { try { const [s, t] = await get(u); console.log('\n=====', u, s, t.length); return f(t); } catch (e) { console.log('\n=====', u, 'ERREUR', e.message); } }
const links = await tryUrl('https://en.onepiece-cardgame.com/feature/deck/', (t) => {
  const l = [...new Set([...t.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => /deck/i.test(h)))];
  console.log('LIENS', l.join(' '));
  const s = strip(t); console.log(s.slice(0, 2500));
  return l;
}) || [];
const pages = links.filter((h) => /feature\/deck\/.+/.test(h)).slice(0, 3);
for (const h of pages) await tryUrl(new URL(h, 'https://en.onepiece-cardgame.com/feature/deck/').href, (t) => {
  const i = t.search(/[×x]\s?\d|deckList|recipe|cardList/i);
  console.log('HTML', t.slice(Math.max(0, i - 1500), i + 3500));
});
await tryUrl('https://www.onepiece-cardgame.com/feature/deck/', (t) => console.log('LIENS JP', [...new Set([...t.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => /deck/i.test(h)))].slice(0, 60).join(' ')));
await tryUrl('https://www.onepiece-cardgame.com/products/decks/st01.php', (t) => { const s = strip(t); const i = s.search(/[×x]\s?\d|レシピ|収録/); console.log(s.slice(Math.max(0, i - 200), i + 2000)); console.log('LIENS', [...new Set([...t.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => /recipe|deck|pdf/i.test(h)))].slice(0, 40).join(' ')); });
