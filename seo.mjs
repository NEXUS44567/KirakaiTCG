// Pages lisibles par les moteurs de recherche : une par carte et une par extension, plus le plan du site (sitemap).
// L'application utilise des adresses en « #/… » que Google ignore ; ces pages ont une vraie adresse
// (…/carte/pokemon-base1-4.html), un titre et une description propres, un contenu lisible sans JavaScript,
// et démarrent l'application complète sur la bonne carte.
// Les prix n'y sont pas écrits (ils changent chaque jour) : l'application les affiche au chargement.
// Sans dépendance : node seo.mjs (relancé par le robot quand le catalogue ou les noms changent).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const DB = path.join(ROOT, 'db');
const SITE = (process.env.KIRAKAI_SITE || 'https://nexus44567.github.io/KirakaiTCG/').replace(/\/?$/, '/');
const BASE_PATH = new URL(SITE).pathname; // /KirakaiTCG/

const read = (p) => { try { return JSON.parse(fs.readFileSync(path.join(DB, p), 'utf8')); } catch { return null; } };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ENT = { '&apos;': '’', '&#39;': '’', '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>' };
const decode = (t) => (typeof t === 'string' && t.includes('&') ? t.replace(/&(apos|#39|quot|amp|lt|gt);/g, (m) => ENT[m]) : t);
// Même règle que pageSlug() dans app/src/lib/data.js
export const slug = (game, id) => game + '-' + String(id).replace(/[^A-Za-z0-9._-]+/g, '-');

const PREFIX = { '@o/': 'https://optcgapi.com/media/static/Card_Images/', '@p/': 'https://images.pokemontcg.io/', '@s/': 'https://images.scrydex.com/pokemon/' };
function img(u, large) {
  if (!u) return '';
  const p = u.slice(0, 3);
  let url = PREFIX[p] ? PREFIX[p] + u.slice(3) : u;
  if (p === '@t/') url = 'https://assets.tcgdex.net/' + u.slice(3) + (large ? '/high.webp' : '/low.webp');
  if (large && p === '@p/') url = url.replace(/\.png$/, '_hires.png');
  if (large && p === '@s/') url = url.replace(/\/small$/, '/large');
  return url;
}

const GAME = { onepiece: { label: 'One Piece', home: '/op', kind: 'carte One Piece' }, pokemon: { label: 'Pokémon', home: '/pk', kind: 'carte Pokémon' } };

function page({ game, title, desc, url, image, route, crumbs, body }) {
  const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map(([name, u], i) => ({ '@type': 'ListItem', position: i + 1, name, item: u })) };
  return `<!doctype html>
<html lang="fr" data-universe="${game}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<base href="${BASE_PATH}">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Kirakai"><meta property="og:locale" content="fr_FR">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<meta name="theme-color" content="#06070c">
<link rel="icon" href="icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="icon-192.png"><link rel="manifest" href="manifest.webmanifest">
<script>window.KIRAKAI_ROUTE=${JSON.stringify(route)}</script>
<script src="boot.js" defer></script>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>html{background:#06070c;color:#eef0f8}body{margin:0;font:16px/1.6 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}.seo{max-width:820px;margin:0 auto;padding:28px 16px 48px}.seo a{color:#ffcf5a}.seo img{display:block;width:240px;max-width:62%;height:auto;border-radius:12px;margin:18px 0}.seo h1{font-size:28px;line-height:1.2;margin:10px 0}.seo ul{padding-left:20px}</style>
</head>
<body>
<div id="root"><main class="seo">
<p><a href="#/">Kirakai</a> › <a href="#${GAME[game].home}">${GAME[game].label}</a>${crumbs.slice(2, -1).map(([n, u]) => ` › <a href="${esc(u.replace(SITE, ''))}">${esc(n)}</a>`).join('')}</p>
${body}
</main></div>
</body>
</html>
`;
}

function build() {
  const out = { carte: new Set(), extension: new Set() };
  const urls = { onepiece: [], pokemon: [], pages: [SITE] };
  const today = new Date().toISOString().slice(0, 10);
  const opT = read('lang/onepiece-fr.json');
  const pkT = read('lang/pokemon-fr.json');
  for (const game of ['onepiece', 'pokemon']) {
    const cat = read(`catalog/${game}.json`);
    if (!cat) continue;
    const lastmod = (cat.builtAt || today).slice(0, 10);
    const sets = new Map(cat.sets.map(([code, name, series, date, count, logo, printed]) => {
      const t = game === 'onepiece' ? opT?.sets?.[code] : pkT?.sets?.[code];
      const fr = decode(Array.isArray(t) ? t[0] : t) || '';
      return [code, { code, name: fr || name, en: name, series, date, count, printed }];
    }));
    const bySet = new Map();
    const cards = cat.cards.map(([id, name, set, number, rarity, image, variant, type, nameFr]) => {
      let fr = nameFr || '', frImg = '';
      if (game === 'pokemon') { const t = pkT?.cards?.[id]; if (t) { fr = t[0] || fr; if (t[1]) frImg = img('@t/' + t[1], true); } }
      else {
        const n = opT?.cards?.[id] || (id.includes('_') ? opT?.cards?.[id.split('_')[0]] : null);
        if (n) { fr = decode(n); if ((!id.includes('_') || /_p1$/.test(id)) && opT?.cards?.[id]) frImg = opT.img + id + '.' + (opT.ext || 'png'); }
      }
      const c = { id, game, name, fr: fr && fr !== name ? fr : '', set, number, rarity, variant, image: img(image, true), frImg };
      if (!bySet.has(set)) bySet.set(set, []);
      bySet.get(set).push(c);
      return c;
    });
    const G = GAME[game];
    for (const c of cards) {
      const s = sets.get(c.set) || { code: c.set, name: c.set };
      const num = game === 'pokemon' ? (s.printed ? `${c.number}/${s.printed}` : c.number) : c.number || c.id.split('_')[0];
      const main = c.fr || c.name;
      const both = c.fr ? `${c.fr} (${c.name})` : c.name;
      const variant = c.variant ? ` · ${c.variant}` : '';
      const title = `${main} ${num}${variant} – ${s.name} : prix et cote | Kirakai`;
      const desc = `Prix du jour de la ${G.kind} ${both} ${num}${c.variant ? ` (${c.variant})` : ''} de l’extension ${s.name}${c.rarity ? `, rareté ${c.rarity}` : ''} : cote ${game === 'pokemon' ? 'Cardmarket et TCGplayer' : 'TCGplayer en euros'}, historique et valeur selon l’état. Mis à jour chaque jour.`;
      const sl = slug(game, c.id);
      const url = SITE + 'carte/' + sl + '.html';
      const setUrl = SITE + 'extension/' + slug(game, s.code) + '.html';
      const list = bySet.get(c.set);
      const i = list.indexOf(c);
      const near = [list[i - 1], list[i + 1]].filter(Boolean);
      const body = `<h1>${esc(both)} ${esc(num)}${esc(variant)}</h1>
${c.frImg || c.image ? `<img src="${esc(c.frImg || c.image)}" alt="${esc(`${G.kind} ${main} ${num} ${s.name}`)}" width="245" height="342" loading="eager">` : ''}
<p>${G.kind[0].toUpperCase() + G.kind.slice(1)} <b>${esc(both)}</b>, n° ${esc(num)} de l’extension <b>${esc(s.name)}</b>${s.en && s.en !== s.name ? ` (${esc(s.en)})` : ''}${s.date ? `, sortie le ${esc(s.date)}` : ''}${c.rarity ? `, rareté ${esc(c.rarity)}` : ''}${c.variant ? `, version ${esc(c.variant)}` : ''}.</p>
<p>Sur Kirakai : le prix du jour de cette carte, l’historique de sa cote, sa valeur selon l’état, des alertes de prix et l’ajout à ta collection.</p>
<p><a href="#/carte/${encodeURIComponent(game + ':' + c.id)}">Voir le prix du jour</a> · <a href="extension/${slug(game, s.code)}.html">Toutes les cartes de ${esc(s.name)}</a></p>
${near.length ? `<p>Dans la même extension : ${near.map((n) => `<a href="carte/${slug(game, n.id)}.html">${esc(n.fr || n.name)} ${esc(n.number)}</a>`).join(' · ')}</p>` : ''}`;
      write('carte', sl, page({ game, title, desc, url, image: c.image || c.frImg, route: '/carte/' + game + ':' + c.id, crumbs: [['Kirakai', SITE], [G.label, SITE + '#' + G.home], [s.name, setUrl], [main, url]], body }), out);
      urls[game].push([url, lastmod]);
    }
    for (const s of sets.values()) {
      const list = bySet.get(s.code) || [];
      if (!list.length) continue;
      const sl = slug(game, s.code);
      const url = SITE + 'extension/' + sl + '.html';
      const title = `${s.name} (${s.code}) : liste des ${list.length} cartes et prix | Kirakai`;
      const desc = `Toutes les cartes ${G.label} de l’extension ${s.name}${s.en && s.en !== s.name ? ` (${s.en})` : ''}${s.date ? ` sortie le ${s.date}` : ''} : liste des ${list.length} cartes, prix du jour, cartes les plus chères et rentabilité des boosters.`;
      const body = `<h1>${esc(s.name)} <small>${esc(s.code)}</small></h1>
<p>Extension ${esc(G.label)}${s.series ? ` de la série ${esc(s.series)}` : ''}${s.date ? `, sortie le ${esc(s.date)}` : ''} : ${list.length} cartes. <a href="#/extension/${game}/${encodeURIComponent(s.code)}">Voir les prix du jour</a>.</p>
<ul>${list.map((c) => `<li><a href="carte/${slug(game, c.id)}.html">${esc(c.number)} · ${esc(c.fr ? `${c.fr} (${c.name})` : c.name)}${c.variant ? ` · ${esc(c.variant)}` : ''}</a>${c.rarity ? ` · ${esc(c.rarity)}` : ''}</li>`).join('')}</ul>`;
      write('extension', sl, page({ game, title, desc, url, image: '', route: '/extension/' + game + '/' + s.code, crumbs: [['Kirakai', SITE], [G.label, SITE + '#' + G.home], [s.name, url]], body }), out);
      urls.pages.push([url, lastmod]);
    }
  }
  // Pages devenues inutiles (carte retirée du catalogue)
  let removed = 0;
  for (const dir of ['carte', 'extension']) {
    const d = path.join(ROOT, dir);
    for (const f of fs.readdirSync(d)) if (f.endsWith('.html') && !out[dir].has(f)) { fs.unlinkSync(path.join(d, f)); removed++; }
  }
  // Plan du site : un index et un fichier par univers (moins de 50 000 adresses chacun)
  const smDir = path.join(ROOT, 'sitemaps');
  fs.mkdirSync(smDir, { recursive: true });
  const sm = (list) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${list.map((x) => { const [u, m] = Array.isArray(x) ? x : [x, today]; return `<url><loc>${esc(u)}</loc><lastmod>${m}</lastmod></url>`; }).join('\n')}\n</urlset>\n`;
  const files = [['pages.xml', urls.pages], ['cartes-onepiece.xml', urls.onepiece], ['cartes-pokemon.xml', urls.pokemon]];
  for (const [f, list] of files) writeIfChanged(path.join(smDir, f), sm(list));
  writeIfChanged(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${files.map(([f]) => `<sitemap><loc>${SITE}sitemaps/${f}</loc></sitemap>`).join('\n')}\n</sitemapindex>\n`);
  console.log(`Pages : ${out.carte.size} cartes, ${out.extension.size} extensions, ${written} écrites, ${removed} retirées.`);
}

let written = 0;
function writeIfChanged(file, text) {
  try { if (fs.readFileSync(file, 'utf8') === text) return; } catch {}
  fs.writeFileSync(file, text); written++;
}
function write(dir, sl, html, out) {
  const d = path.join(ROOT, dir);
  if (!out[dir].size) fs.mkdirSync(d, { recursive: true });
  const f = sl + '.html';
  out[dir].add(f);
  writeIfChanged(path.join(d, f), html);
}

build();
