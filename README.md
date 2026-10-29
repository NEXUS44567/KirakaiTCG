# Kirakai

Kirakai (« kira » キラ, l'éclat d'une carte brillante, et « kai » 海, la mer) : le site des prix des cartes One Piece et Pokémon,
de leurs boosters et de ta collection.
En ligne : `https://nexus44567.github.io/KirakaiTCG/`

Né de NEXUS TCG (l'ancienne version reste en ligne sur `https://nexus44567.github.io/nexus-tcg/`), avec les mêmes adresses (`#/op`, `#/carte/…`, `#/collection`…) :

- écran de choix des deux univers, accueil One Piece et accueil Pokémon
- fiche carte : prix du jour sourcé, moyennes, historique, valeur selon l'état, alertes, comparateur, partage
- recherche, Top 100, extensions, Pokédex, Équipage, scanner avec note d'état
- boosters virtuels (Berrys / Pokéballs, display, taux, collection virtuelle, saison), boutique
- collection : valeur, courbe, classeur, grille, liste, progression par extension, export / import, lien de partage (même format que la V2)
- langues FR / EN / JP et devise associée, application installable, consultation hors ligne

En plus dans Kirakai :

- recherche rapide partout (Ctrl/⌘ + K ou `/`) : cartes, extensions, Pokémon, personnages, pages
- reflets holographiques selon la rareté, inspecteur plein écran (la carte se tourne, recto / verso)
- page « Marché » : valeur cumulée, prix médian, extensions les plus précieuses, répartition des prix, prix moyen par rareté, indice du top 50
- boosters : choix parmi les dernières extensions, valeur réelle du tirage carte après carte, journal des tirages
- classeur 3D : couverture en cuir qui s'ouvre, feuilles qui se tournent, mode « Organiser » pour placer chaque carte, export CSV
- Équipage en avis de recherche (la prime est la valeur de la carte la plus chère), Pokédex avec radar des statistiques et cri du Pokémon
- succès à débloquer, réglages (effets allégés, sons, sauvegarde, reprise des données de la V2)
- rentabilité des boosters : valeur moyenne et médiane d'un booster et d'un display pour chaque extension (taux estimés ×
  prix du jour), chances d'obtenir les cartes phares, calcul selon le prix payé, classement « Quelle extension ouvrir ? »
- compléter une extension : cartes manquantes, coût au prix du jour, ajout d'un coup à la liste de souhaits
- liste de souhaits : budget total, baisses de prix depuis l'ajout, cartes que mon budget permet d'acheter
- ce qui monte et ce qui baisse dans ma collection
- quêtes du jour et série de jours de visite, récompensées en Berrys et en Pokéballs
- profils publics avec vitrine de cartes et classement des plus belles collections (`#/collectionneurs`, `#/joueur/<pseudo>`)
- alertes de prix sur le téléphone, même site fermé (notifications envoyées par le robot `alerts/send.mjs` après le relevé)
- une vraie page par carte et par extension pour Google (`seo.mjs` → `carte/`, `extension/`, `sitemap.xml`), qui démarre
  l'application sur la bonne carte ; les liens partagés affichent l'image et le nom de la carte
- comptes joueurs : inscription, connexion, carte de membre, progression enregistrée en ligne et synchronisée
  entre appareils (à activer avec Supabase, voir [COMPTES.md](COMPTES.md))

## Données de l'utilisateur

Kirakai garde ses données dans le navigateur (`localStorage` « nexus.v3 », la même clé que l'ancienne adresse `nexus-tcg/v3/` :
le site étant sur le même domaine, rien n'est perdu au déménagement). Au premier lancement, il reprend une copie des données
de NEXUS V2 du même navigateur, sans jamais écrire dans celles-ci.
Avec un compte, ces données sont aussi enregistrées en ligne (table `nexus_saves`, une ligne par joueur) et reprises
sur chaque appareil où le joueur se connecte.

## Prix et robots

Les prix sont relevés chaque matin par GitHub Actions et rangés dans `db/` :

- **Relevé des prix** (`scripts/fetch-prices.mjs`) : prix du jour, historique, marché ;
- **Langues (FR / JP)** (`scripts/build-lang.mjs`) : noms et images français et japonais, chaque lundi ;
- **Kirakai (pages des cartes et alertes)** : juste après, met à jour les pages lues par Google (`seo.mjs`) et envoie
  les alertes de prix sur les téléphones (`alerts/send.mjs`).

`data/` contient l'export d'origine du catalogue (pour reconstruire `db/catalog` avec `scripts/build-catalog.mjs`
et le Pokédex / l'Équipage avec `scripts/build-universes.mjs`).

## Développement

```
npm install
npm run build      # → index.html, assets/, sw.js, manifest.webmanifest, boot.js
node seo.mjs       # → carte/, extension/, sitemaps/, sitemap.xml
```

Sources dans `app/` (React 18, esbuild). Le site est publié par GitHub Pages depuis la branche `main` (dossier racine).
Les comptes joueurs reposent sur Supabase : voir [COMPTES.md](COMPTES.md).

Logo (vague et étincelle) et emblèmes dessinés pour Kirakai (aucun logo officiel). One Piece © Eiichiro Oda / Shueisha, Toei Animation, Bandai.
Pokémon © Nintendo, Creatures, GAME FREAK, The Pokémon Company. Site de fan non officiel.
