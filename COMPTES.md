# Activer les comptes joueurs (Kirakai)

Les comptes permettent à chacun de retrouver sa collection, ses boosters, son classeur et ses succès sur tous ses appareils.
Ils reposent sur [Supabase](https://supabase.com) (offre gratuite). Tant que la configuration n'est pas faite, le site
fonctionne comme avant : tout reste dans le navigateur, et la page « Mon compte » annonce que les comptes arrivent bientôt.

## 1. Créer le projet Supabase

1. Crée un compte sur supabase.com, puis **New project** (nom : `Kirakai`, région : Europe, choisis un mot de passe de base de données et garde-le).
2. Ouvre **SQL Editor → New query**, colle tout le contenu de [`supabase/comptes.sql`](supabase/comptes.sql) et clique sur **Run**.
   Fais pareil avec [`supabase/classement.sql`](supabase/classement.sql) (classement des boosters) et
   [`supabase/social.sql`](supabase/social.sql) (profils publics et alertes sur le téléphone), puis
   [`supabase/profil.sql`](supabase/profil.sql) (photos de profil et cartes de membre personnalisées).

## 2. Régler la connexion

Dans **Authentication** :

- **URL Configuration** : *Site URL* = `https://nexus44567.github.io/KirakaiTCG/`,
  et dans *Redirect URLs*, ajoute `https://nexus44567.github.io/KirakaiTCG/**`.
- **Sign In / Providers → Email** : laisse « Email » activé et **désactive « Confirm email »**.
  Sans serveur d'e-mails à toi, Supabase n'envoie des e-mails qu'aux membres de ton équipe Supabase (et au plus 2 par heure) :
  avec la confirmation activée, les visiteurs ne pourraient pas s'inscrire.

Le lien « Mot de passe oublié » envoie un e-mail : pour qu'il marche pour tout le monde, branche un serveur d'e-mails
(par exemple Resend ou Brevo, gratuits pour un petit volume) dans **Authentication → Emails → SMTP Settings**.
Tu pourras alors réactiver « Confirm email » si tu veux vérifier les adresses.

## 3. Brancher le site

Dans **Project Settings → API Keys** (et **Data API** pour l'adresse), copie :

- l'adresse du projet, du type `https://abcdefgh.supabase.co` ;
- la clé **publishable** (`sb_publishable_…`), ou à défaut la clé **anon public** de l'onglet « Legacy ».

Ces deux valeurs sont publiques par conception : elles ne donnent accès qu'à ce que les règles de la base autorisent
(chacun ne lit et ne modifie que sa propre sauvegarde). Ne communique jamais la clé **secret** ni la clé **service_role**.

Colle-les dans [`app/src/lib/config.js`](app/src/lib/config.js), puis :

```
npm run build
```

Le classement des collectionneurs s'active en même temps.

## Connexion avec Google, Apple ou Discord (facultatif)

Les boutons « Continuer avec Google / Apple / Discord » apparaissent d'eux-mêmes sur la page « Mon compte » dès que le
fournisseur est activé dans Supabase (**Authentication → Sign In / Providers**) : il n'y a rien à changer sur le site.
Pour chacun, il faut créer une application chez le fournisseur, y coller l'adresse de retour de Supabase
(`https://<projet>.supabase.co/auth/v1/callback`, affichée dans le panneau du fournisseur),
puis recopier dans Supabase l'identifiant (*Client ID*) et le secret (*Client Secret*) qu'il donne.

- **Discord** (gratuit, le plus simple) : discord.com/developers/applications → *New Application* → *OAuth2* →
  *Redirects* : ajouter l'adresse de retour → copier *Client ID* et *Client Secret* (*Reset Secret*).
- **Google** (gratuit) : console.cloud.google.com → nouveau projet → *Google Auth Platform* (écran de consentement :
  nom de l'application, e-mail, public « Externe ») → *Clients* → *Créer un client* « Application Web » →
  *URI de redirection autorisés* : l'adresse de retour → copier l'ID client et le code secret.
- **Apple** : nécessite l'abonnement Apple Developer Program (99 € par an). Il faut un *Services ID*, une clé
  « Sign in with Apple » (fichier .p8) et générer un secret qui **expire tous les 6 mois** : sans renouvellement,
  la connexion avec Apple cesse de fonctionner.

Avec Discord, le pseudo Discord est proposé ; avec Google et Apple, le joueur choisit son pseudo à la première connexion
(on ne propose pas son vrai nom).

## Ce qui est enregistré

Tout ce qui est dans le navigateur (collection, suivis et alertes, comparateur, boosters, Berrys et Pokéballs,
classeur, succès, identité au classement, langue des cartes), sauf les réglages propres à l'appareil (effets visuels, sons,
mode administrateur). Chaque changement part vers le compte quelques secondes après ; en revenant sur le site, la dernière
version du compte est reprise. Si deux appareils ont changé chacun de leur côté, les deux progressions sont fusionnées.

À la première connexion, ce que le visiteur avait déjà fait sur l'appareil rejoint son compte. À la déconnexion,
l'appareil repart d'une progression vide (elle reste dans le compte).

## Profils publics, classement et alertes sur le téléphone

1. **La base** : [`supabase/social.sql`](supabase/social.sql), passé à l'étape 1. Profils publics et classement
   fonctionnent dès cette étape.
2. **La clé du robot** (pour les alertes sur le téléphone) : dans Supabase → **Project Settings → API Keys**,
   section **Secret keys**, crée ou copie une clé `sb_secret_…`. Puis sur GitHub, dans le dépôt :
   **Settings → Secrets and variables → Actions → New repository secret**, nom `SUPABASE_SECRET_KEY`,
   valeur : la clé. Cette clé donne tous les droits sur la base : ne la colle nulle part ailleurs.
3. **Premier passage du robot** : sur GitHub → **Actions** → **Kirakai (pages des cartes et alertes)** →
   **Run workflow**. Il crée les clés de signature des notifications (gardées dans la base) ; ensuite il
   repasse tout seul chaque matin après le relevé des prix.

Les joueurs activent les alertes depuis la page « Mes alertes de prix ». Sur iPhone, il faut d'abord installer Kirakai
sur l'écran d'accueil (Partager → Sur l'écran d'accueil), puis l'ouvrir depuis son icône.

## Être trouvé sur Google

Chaque carte et chaque extension a sa page (`carte/…html`, `extension/…html`), listée dans `sitemap.xml`.
Pour que Google les découvre vite : [Google Search Console](https://search.google.com/search-console)
→ **Ajouter une propriété** → **Préfixe de l'URL** : `https://nexus44567.github.io/KirakaiTCG/` → validation par
**balise HTML** (donne-moi le code `content="…"`, je l'ajoute au site) → puis **Sitemaps** → `sitemap.xml`.
