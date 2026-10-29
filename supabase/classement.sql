-- Kirakai · classement des boosters (saisons de 30 jours)
-- À coller une fois dans Supabase → SQL Editor → New query → Run.

create extension if not exists pgcrypto with schema extensions;

-- Joueurs : un identifiant aléatoire + l'empreinte d'un secret gardé dans le navigateur du joueur.
create table if not exists public.league_players (
  player_id uuid primary key,
  secret_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.league_players enable row level security; -- aucune règle : illisible depuis le site

-- Scores : une ligne par joueur, saison et univers.
create table if not exists public.league_scores (
  player_id uuid not null references public.league_players(player_id) on delete cascade,
  season int not null,
  game text not null check (game in ('onepiece', 'pokemon')),
  pseudo text not null check (char_length(pseudo) between 2 and 20),
  set_code text,
  owned int not null check (owned >= 0),
  total int not null check (total > 0 and owned <= total),
  packs int not null default 0 check (packs >= 0),
  updated_at timestamptz not null default now(),
  primary key (player_id, season, game)
);
create index if not exists league_scores_board on public.league_scores (season, game, owned desc, updated_at);
alter table public.league_scores enable row level security;
drop policy if exists "scores lisibles par tous" on public.league_scores;
create policy "scores lisibles par tous" on public.league_scores for select to anon, authenticated using (true);
revoke insert, update, delete on public.league_scores from anon, authenticated;
grant select on public.league_scores to anon, authenticated;

-- Saison en cours : la saison 1 commence le dimanche 25 octobre 2026 (minuit, heure d'hiver de Paris), puis une saison tous les 30 jours.
create or replace function public.league_season() returns int language sql stable as $$
  select (floor(extract(epoch from (now() - timestamptz '2026-10-24 23:00:00+00')) / 2592000))::int + 1
$$;

-- Seule porte d'écriture : vérifie le secret du joueur, la saison et la cohérence du score.
create or replace function public.submit_score(
  p_player uuid, p_secret text, p_game text, p_season int, p_pseudo text,
  p_set text, p_owned int, p_total int, p_packs int
) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare h text; last timestamptz;
begin
  if p_season is distinct from public.league_season() then raise exception 'Cette saison est terminée'; end if;
  if p_game not in ('onepiece', 'pokemon') then raise exception 'Univers inconnu'; end if;
  if p_pseudo is null or char_length(btrim(p_pseudo)) not between 2 and 20 then raise exception 'Pseudo : 2 à 20 caractères'; end if;
  if p_secret is null or char_length(p_secret) < 32 then raise exception 'Identifiant invalide'; end if;
  if p_total is null or p_total < 1 or p_total > 3000 or p_owned < 0 or p_owned > p_total or p_packs < 0 or p_packs > 100000 then raise exception 'Score invalide'; end if;
  if p_owned > p_packs * 7 then raise exception 'Score impossible'; end if;

  select secret_hash into h from public.league_players where player_id = p_player;
  if h is null then
    insert into public.league_players (player_id, secret_hash) values (p_player, crypt(p_secret, gen_salt('bf')));
  elsif h <> crypt(p_secret, h) then
    raise exception 'Non autorisé';
  end if;

  select updated_at into last from public.league_scores where player_id = p_player and season = p_season and game = p_game;
  if last is not null and last > now() - interval '1 second' then return; end if;

  insert into public.league_scores (player_id, season, game, pseudo, set_code, owned, total, packs, updated_at)
  values (p_player, p_season, p_game, btrim(p_pseudo), left(p_set, 20), p_owned, p_total, p_packs, now())
  on conflict (player_id, season, game) do update
    set pseudo = excluded.pseudo, set_code = excluded.set_code, total = excluded.total,
        packs = greatest(public.league_scores.packs, excluded.packs),
        updated_at = case when excluded.owned > public.league_scores.owned then now() else public.league_scores.updated_at end,
        owned = greatest(public.league_scores.owned, excluded.owned);
end $$;
revoke all on function public.submit_score(uuid, text, text, int, text, text, int, int, int) from public;
grant execute on function public.submit_score(uuid, text, text, int, text, text, int, int, int) to anon, authenticated;
grant execute on function public.league_season() to anon, authenticated;
