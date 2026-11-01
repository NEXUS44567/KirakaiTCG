// Exploration (temporaire) : où trouver les listes des decks de démarrage One Piece ?
const UA = { 'user-agent': 'Mozilla/5.0 (KirakaiBot; +https://nexus44567.github.io/KirakaiTCG/)' };
const get = async (u) => { const r = await fetch(u, { headers: UA }); const t = await r.text(); return [r.status, t]; };
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
async function tryUrl(u, f) { try { const [s, t] = await get(u); console.log('\n=====', u, s, t.length); f(t); } catch (e) { console.log('\n=====', u, 'ERREUR', e.message); } }
await tryUrl('https://en.onepiece-cardgame.com/products/decks/', (t) => console.log([...new Set([...t.matchAll(/href="([^"]*decks\/[^"]+)"/g)].map((m) => m[1]))].join(' ')));
for (const p of ['st01-04.php', 'st15-20.php', 'st21.php', 'st23-28.php', 'st29.php']) await tryUrl('https://en.onepiece-cardgame.com/products/decks/' + p, (t) => {
  const s = strip(t); const i = s.search(/[×x]\s?\d|\d\s?[×x]\b|Contents|Card list|Deck list|Recipe/i);
  console.log(s.slice(Math.max(0, i - 300), i + 2500));
  console.log('LIENS', [...new Set([...t.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => /recipe|deck|pdf|cardlist/i.test(h)))].slice(0, 40).join(' '));
});
await tryUrl('https://optcgapi.com/api/decks/ST-01/', (t) => console.log(t.slice(0, 1500)));
await tryUrl('https://optcgapi.com/api/allDecks/', (t) => console.log(t.slice(0, 1500)));
await tryUrl('https://onepiece-cardgame.fandom.com/api.php?action=query&list=search&srsearch=Straw%20Hat%20Crew%20ST-01&format=json', (t) => console.log(t.slice(0, 1500)));
await tryUrl('https://onepiece-cardgame.fandom.com/api.php?action=parse&page=ST-01&prop=wikitext&format=json&redirects=1', (t) => console.log(t.slice(0, 4000)));
await tryUrl('https://en.onepiece-cardgame.com/cardlist/', (t) => console.log([...t.matchAll(/<option value="(\d+)"[^>]*>([^<]*)<\/option>/g)].map((m) => m[1] + '=' + m[2]).join(' | ').slice(0, 3000)));
await tryUrl('https://en.onepiece-cardgame.com/cardlist/?series=569001', (t) => { const i = t.indexOf('<dl class="modalCol"'); console.log(t.slice(i, i + 3500)); });
