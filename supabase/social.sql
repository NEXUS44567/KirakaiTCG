-- Kirakai · profils publics, classement des collectionneurs et alertes de prix sur le téléphone.
-- À coller une fois dans Supabase → SQL Editor → New query → Run (après comptes.sql). Peut être relancé sans risque.

-- =====================================================================
-- Profils publics : ce que chaque joueur choisit de montrer (pseudo, chiffres de sa collection, vitrine)
-- =====================================================================
create table if not exists public.nexus_public (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pseudo text not null check (char_length(pseudo) between 2 and 20),
  visible boolean not null default true,
  value_op numeric not null default 0 check (value_op between 0 and 10000000),
  value_pk numeric not null default 0 check (value_pk between 0 and 10000000),
  value_eur numeric generated always as (value_op + value_pk) stored,
  cards int not null default 0 check (cards between 0 and 1000000),
  stats jsonb not null default '{}'::jsonb check (pg_column_size(stats) < 20000),
  showcase jsonb not null default '[]'::jsonb check (jsonb_typeof(showcase) = 'array' and jsonb_array_length(showcase) <= 12),
  member_since timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists nexus_public_pseudo on public.nexus_public (lower(pseudo));
create index if not exists nexus_public_op on public.nexus_public (value_op desc) where visible;
create index if not exists nexus_public_pk on public.nexus_public (value_pk desc) where visible;
create index if not exists nexus_public_total on public.nexus_public (value_eur desc) where visible;

alter table public.nexus_public enable row level security;
drop policy if exists "profils visibles par tous" on public.nexus_public;
drop policy if exists "mon profil : lecture" on public.nexus_public;
drop policy if exists "mon profil : création" on public.nexus_public;
drop policy if exists "mon profil : mise à jour" on public.nexus_public;
drop policy if exists "mon profil : suppression" on public.nexus_public;
create policy "profils visibles par tous" on public.nexus_public for select to anon, authenticated using (visible);
create policy "mon profil : lecture" on public.nexus_public for select to authenticated using ((select auth.uid()) = user_id);
create policy "mon profil : création" on public.nexus_public for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "mon profil : mise à jour" on public.nexus_public for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "mon profil : suppression" on public.nexus_public for delete to authenticated using ((select auth.uid()) = user_id);
grant select on public.nexus_public to anon, authenticated;
grant insert, update, delete on public.nexus_public to authenticated;

-- Le pseudo affiché est toujours celui du compte (impossible de se faire passer pour un autre joueur)
create or replace function public.nexus_public_pseudo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select pseudo into new.pseudo from public.nexus_saves where user_id = new.user_id;
  if new.pseudo is null then raise exception 'Choisis d''abord un pseudo dans ton compte'; end if;
  select created_at into new.member_since from auth.users where id = new.user_id;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists nexus_public_pseudo on public.nexus_public;
create trigger nexus_public_pseudo before insert or update on public.nexus_public for each row execute function public.nexus_public_pseudo();

-- Changement de pseudo dans le compte : le profil public suit
create or replace function public.nexus_saves_pseudo_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pseudo is distinct from old.pseudo and new.pseudo is not null then
    update public.nexus_public set pseudo = new.pseudo where user_id = new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists nexus_saves_pseudo_sync on public.nexus_saves;
create trigger nexus_saves_pseudo_sync after update of pseudo on public.nexus_saves for each row execute function public.nexus_saves_pseudo_sync();

-- Un profil par son pseudo (sans tenir compte des majuscules)
create or replace function public.nexus_profile(p text) returns setof public.nexus_public
language sql stable security definer set search_path = public as $$
  select * from public.nexus_public where lower(pseudo) = lower(btrim(p)) and visible limit 1
$$;
revoke all on function public.nexus_profile(text) from public;
grant execute on function public.nexus_profile(text) to anon, authenticated;

-- =====================================================================
-- Alertes de prix sur le téléphone (notifications, même site fermé)
-- Chaque appareil abonné envoie ses seuils ; le robot du dépôt (GitHub Actions) les compare chaque matin
-- aux nouveaux prix et envoie les notifications. Rien n'est lisible depuis le site.
-- =====================================================================
create table if not exists public.nexus_push (
  endpoint text primary key check (char_length(endpoint) between 20 and 1000 and endpoint like 'https://%'),
  p256dh text not null check (char_length(p256dh) < 200),
  auth text not null check (char_length(auth) < 100),
  alerts jsonb not null default '{}'::jsonb check (pg_column_size(alerts) < 60000),
  lang text not null default 'fr' check (lang in ('fr', 'en', 'ja')),
  sent jsonb not null default '{}'::jsonb,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.nexus_push enable row level security; -- aucune règle : illisible depuis le site
revoke all on public.nexus_push from anon, authenticated;

-- Clés de signature des notifications : créées et lues par le robot seulement
create table if not exists public.nexus_secrets (name text primary key, value text not null);
alter table public.nexus_secrets enable row level security;
revoke all on public.nexus_secrets from anon, authenticated;

-- Enregistrer (ou mettre à jour) l'abonnement de cet appareil et ses seuils
create or replace function public.nexus_push_save(p_endpoint text, p_p256dh text, p_auth text, p_alerts jsonb, p_lang text default 'fr') returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.nexus_push (endpoint, p256dh, auth, alerts, lang, user_id)
  values (p_endpoint, p_p256dh, p_auth, coalesce(p_alerts, '{}'::jsonb), coalesce(p_lang, 'fr'), auth.uid())
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, alerts = excluded.alerts, lang = excluded.lang,
        user_id = coalesce(auth.uid(), public.nexus_push.user_id), updated_at = now();
end $$;
revoke all on function public.nexus_push_save(text, text, text, jsonb, text) from public;
grant execute on function public.nexus_push_save(text, text, text, jsonb, text) to anon, authenticated;

create or replace function public.nexus_push_delete(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from public.nexus_push where endpoint = p_endpoint
$$;
revoke all on function public.nexus_push_delete(text) from public;
grant execute on function public.nexus_push_delete(text) to anon, authenticated;

-- Clé publique des notifications (le navigateur en a besoin pour s'abonner)
create or replace function public.nexus_push_key() returns text
language sql stable security definer set search_path = public as $$
  select value from public.nexus_secrets where name = 'vapid_public'
$$;
revoke all on function public.nexus_push_key() from public;
grant execute on function public.nexus_push_key() to anon, authenticated;
