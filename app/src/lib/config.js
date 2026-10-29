// Connexion à Supabase : comptes joueurs (sauvegarde de la progression) et classement en ligne.
// Les boutons « Continuer avec Google / Apple / Discord » apparaissent d'eux-mêmes dès que le fournisseur
// est activé dans Supabase (Authentication → Sign In / Providers) : rien à changer ici.
// Tant que ces deux champs sont vides, le site fonctionne sans compte (tout reste dans le navigateur).
// La clé publique (« publishable » ou « anon public ») est faite pour être visible : elle ne donne accès qu'à ce que
// les règles de la base autorisent (voir supabase/comptes.sql, supabase/classement.sql et supabase/social.sql).
export const SUPABASE = {
  url: 'https://rkuxozxrzqbdhxxvwpjf.supabase.co',   // ex. https://abcdefgh.supabase.co  (Project Settings → Data API)
  key: 'sb_publishable_cyG2-VVr3QhGsZd26z1-qw_gcUGJCXi',   // clé « publishable » ou « anon public » (Project Settings → API Keys)
};
