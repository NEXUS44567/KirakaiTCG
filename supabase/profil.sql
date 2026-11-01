-- Kirakai · photo de profil et carte de membre personnalisée.
-- À coller une fois dans Supabase → SQL Editor → New query → Run (après social.sql). Peut être relancé sans risque.

-- =====================================================================
-- Profil public : photo et apparence de la carte de membre
-- =====================================================================
alter table public.nexus_public add column if not exists avatar text;
alter table public.nexus_public add column if not exists card jsonb not null default '{}'::jsonb;
do $$ begin
  -- la photo est forcément un fichier du dossier du joueur dans « avatars » (ex. <id du compte>/1730000000000.webp)
  if not exists (select 1 from pg_constraint where conname = 'nexus_public_avatar') then
    alter table public.nexus_public add constraint nexus_public_avatar
      check (avatar is null or avatar ~ ('^' || user_id::text || '/[0-9]{10,14}\.(webp|jpg)$'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nexus_public_card') then
    alter table public.nexus_public add constraint nexus_public_card
      check (jsonb_typeof(card) = 'object' and pg_column_size(card) < 1000);
  end if;
end $$;

-- Un profil par son pseudo (recréée pour renvoyer aussi les nouvelles colonnes)
create or replace function public.nexus_profile(p text) returns setof public.nexus_public
language sql stable security definer set search_path = public as $$
  select * from public.nexus_public where lower(pseudo) = lower(btrim(p)) and visible limit 1
$$;

-- =====================================================================
-- Photos de profil : dossier « avatars », lisible par tous, chacun n'écrit que dans le sien
-- (le site les réduit à 320 × 320 avant l'envoi : quelques dizaines de Ko)
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/webp', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 524288, allowed_mime_types = array['image/webp', 'image/jpeg'];

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars : mes photos') then
    create policy "avatars : mes photos" on storage.objects for select to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars : envoi') then
    create policy "avatars : envoi" on storage.objects for insert to authenticated
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and storage.extension(name) in ('webp', 'jpg'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars : remplacement') then
    create policy "avatars : remplacement" on storage.objects for update to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and storage.extension(name) in ('webp', 'jpg'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars : suppression') then
    create policy "avatars : suppression" on storage.objects for delete to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
end $$;
