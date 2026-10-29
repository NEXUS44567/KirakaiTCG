-- NEXUS TCG V3 · comptes joueurs : la progression de chacun est enregistrée dans son compte.
-- À coller une fois dans Supabase → SQL Editor → New query → Run. Peut être relancé sans risque.
-- Les comptes eux-mêmes (e-mail, mot de passe) sont gérés par Supabase Auth ; ce script ajoute la sauvegarde.

-- Une sauvegarde par compte : collection, suivis, boosters, classeur, succès… (le contenu du navigateur, en JSON).
create table if not exists public.nexus_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pseudo text check (pseudo is null or char_length(pseudo) between 2 and 20),
  data jsonb not null default '{}'::jsonb,
  rev bigint not null default 0,            -- numéro de version : évite qu'un appareil écrase les changements d'un autre
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 1,5 Mo au plus par sauvegarde (une collection de plusieurs milliers de cartes tient largement)
alter table public.nexus_saves drop constraint if exists nexus_saves_taille;
alter table public.nexus_saves add constraint nexus_saves_taille check (pg_column_size(data) < 1500000);
-- Un pseudo n'appartient qu'à un seul joueur (sans tenir compte des majuscules)
create unique index if not exists nexus_saves_pseudo on public.nexus_saves (lower(pseudo));

-- Chacun ne voit et ne modifie que sa propre sauvegarde
alter table public.nexus_saves enable row level security;
drop policy if exists "ma sauvegarde : lecture" on public.nexus_saves;
drop policy if exists "ma sauvegarde : création" on public.nexus_saves;
drop policy if exists "ma sauvegarde : mise à jour" on public.nexus_saves;
create policy "ma sauvegarde : lecture" on public.nexus_saves for select to authenticated using ((select auth.uid()) = user_id);
create policy "ma sauvegarde : création" on public.nexus_saves for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "ma sauvegarde : mise à jour" on public.nexus_saves for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.nexus_saves from anon;
grant select, insert, update on public.nexus_saves to authenticated;

-- Date de mise à jour tenue par la base
create or replace function public.nexus_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists nexus_saves_touch on public.nexus_saves;
create trigger nexus_saves_touch before update on public.nexus_saves for each row execute function public.nexus_touch();

-- À l'inscription : création de la sauvegarde avec le pseudo choisi (laissé vide s'il est déjà pris).
-- Ne bloque jamais l'inscription.
create or replace function public.nexus_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare p text := nullif(btrim(new.raw_user_meta_data->>'pseudo'), '');
begin
  begin
    if p is not null and (char_length(p) not between 2 and 20 or exists (select 1 from public.nexus_saves where lower(pseudo) = lower(p))) then p := null; end if;
    insert into public.nexus_saves (user_id, pseudo) values (new.id, p) on conflict (user_id) do nothing;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists nexus_on_signup on auth.users;
create trigger nexus_on_signup after insert on auth.users for each row execute function public.nexus_new_user();

-- Le pseudo est-il libre ? (formulaire d'inscription)
create or replace function public.nexus_pseudo_libre(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.nexus_saves where lower(pseudo) = lower(btrim(p)))
$$;
revoke all on function public.nexus_pseudo_libre(text) from public;
grant execute on function public.nexus_pseudo_libre(text) to anon, authenticated;

-- Suppression de son propre compte (et de sa sauvegarde) depuis la page « Mon compte »
create or replace function public.nexus_delete_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.nexus_delete_account() from public, anon;
grant execute on function public.nexus_delete_account() to authenticated;
