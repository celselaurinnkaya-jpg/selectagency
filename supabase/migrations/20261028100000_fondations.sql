-- SELECT Agency — Fondations : agences, membres, invitations, compteurs et fonctions d'aide à la RLS.
--
-- Règles communes à toutes les migrations :
-- - chaque table métier porte organization_id : une agence ne voit jamais les données d'une autre ;
-- - les relations entre tables passent par des clés étrangères composites (organization_id, id),
--   ce qui empêche de rattacher une ligne à un enregistrement d'une autre agence ;
-- - les montants sont des entiers en unités mineures, accompagnés de leur devise ;
-- - les dates et heures sont stockées en UTC (timestamptz).

create schema if not exists private;
grant usage on schema private to authenticated;

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Vrai uniquement pendant l'import de l'agence de démonstration : les numéros, dates et auteurs
-- fournis sont alors conservés au lieu d'être attribués par les triggers.
create function private.importing() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(current_setting('select_agency.importing', true), '') = 'on';
$$;

-- Agences ---------------------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  city text not null default '' check (char_length(city) <= 80),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  timezone text not null check (char_length(timezone) between 3 and 64),
  receipt_prefix text not null default 'REC' check (receipt_prefix ~ '^[A-Z]{2,6}$'),
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_touch before update on public.organizations
for each row execute function private.touch_updated_at();

-- Membres ---------------------------------------------------------------------------------------
-- user_id est vide pour les collègues fictifs de l'agence de démonstration (ils ne se connectent pas).

create table public.members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  full_name text not null check (char_length(full_name) between 1 and 120),
  email text not null default '' check (char_length(email) <= 254),
  role text not null check (role in ('owner', 'admin', 'agent', 'accountant', 'viewer')),
  job_title text not null default '' check (char_length(job_title) <= 80),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, user_id)
);

create index members_user_idx on public.members (user_id);

-- Invitations -----------------------------------------------------------------------------------
-- Le lien d'invitation contient le jeton ; il est transmis par l'agence (e-mail, WhatsApp…).

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null check (role in ('admin', 'agent', 'accountant', 'viewer')),
  job_title text not null default '' check (char_length(job_title) <= 80),
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  foreign key (organization_id, invited_by) references public.members (organization_id, id)
);

create index invitations_org_idx on public.invitations (organization_id);
create index invitations_email_idx on public.invitations (email);

-- Compteurs de numérotation -------------------------------------------------------------------
-- Hors de l'API (schéma private). Le verrou de ligne pris par l'upsert garantit des numéros
-- uniques et sans trou, même lorsque deux paiements sont enregistrés au même moment.

create table private.counters (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null,
  value bigint not null default 0,
  primary key (organization_id, kind)
);

create function private.next_counter(p_org uuid, p_kind text) returns bigint
language sql security definer set search_path = '' as $$
  insert into private.counters as c (organization_id, kind, value) values (p_org, p_kind, 1)
  on conflict (organization_id, kind) do update set value = c.value + 1
  returning c.value;
$$;

-- Numéro lisible : PRÉFIXE-ANNÉE-00042 (année dans le fuseau de l'agence).
create function private.formatted_number(p_org uuid, p_kind text, p_prefix text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_timezone text;
begin
  select o.timezone into v_timezone from public.organizations o where o.id = p_org;
  return p_prefix || '-' || to_char(now() at time zone v_timezone, 'YYYY') || '-'
    || lpad(private.next_counter(p_org, p_kind)::text, 5, '0');
end;
$$;

-- Fonctions d'aide aux politiques RLS ------------------------------------------------------------
-- security definer : elles lisent members sans repasser par la RLS de members (sinon récursion).
-- Utilisées sous la forme « organization_id in (select private.my_org_ids()) » : évaluées une fois par requête.

create function private.my_org_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.organization_id
  from public.members m
  where m.user_id = (select auth.uid());
$$;

create function private.org_ids_with_role(p_roles text[]) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.organization_id
  from public.members m
  where m.user_id = (select auth.uid()) and m.role = any (p_roles);
$$;

create function private.has_role(p_org uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.organization_id = p_org and m.user_id = (select auth.uid()) and m.role = any (p_roles)
  );
$$;

create function private.member_id(p_org uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.members m
  where m.organization_id = p_org and m.user_id = (select auth.uid());
$$;
