-- SELECT Agency — Présences : heures d'arrivée et de départ des membres de l'agence.
--
-- Décisions du 7 novembre 2026 (journal, Session 26) :
-- - L'heure enregistrée est celle du serveur au moment du pointage, jamais celle du téléphone. Aucune position.
-- - Horaires de l'agence (arrivée et départ attendus, jours travaillés, tolérance) pour calculer retards et absences.
-- - Oubli : le membre déclare lui-même l'heure (dans les 7 jours, avec une raison) ; elle reste marquée « déclarée ».
--   Le propriétaire et les administrateurs peuvent corriger toute présence, avec une raison ; elle est marquée
--   « corrigée » et le nom du responsable est gardé.
-- - Un départ oublié n'est jamais inventé : la journée reste « départ non pointé » tant que personne ne le déclare.
-- - Chaque membre voit ses présences ; le propriétaire et les administrateurs voient celles de toute l'équipe.
-- - Toutes les formules ; les écritures suivent l'abonnement (private.org_can_write) comme le reste.

-- 1. Horaires de l'agence ---------------------------------------------------------------------------------

create table public.attendance_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  expected_start time not null default '08:00',
  expected_end time not null default '17:00',
  -- Jours travaillés, numérotés comme ISO 8601 : 1 = lundi … 7 = dimanche.
  work_days smallint[] not null default '{1,2,3,4,5,6}',
  grace_minutes smallint not null default 10 check (grace_minutes between 0 and 120),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  check (expected_end > expected_start),
  check (cardinality(work_days) between 1 and 7 and work_days <@ '{1,2,3,4,5,6,7}'::smallint[])
);

create trigger attendance_settings_touch before update on public.attendance_settings
for each row execute function private.touch_updated_at();

alter table public.attendance_settings enable row level security;
revoke all on public.attendance_settings from anon;
revoke insert, update, delete on public.attendance_settings from authenticated;
grant select on public.attendance_settings to authenticated;

create policy attendance_settings_select on public.attendance_settings for select to authenticated
  using (organization_id in (select private.my_org_ids()));

-- 2. Pointages --------------------------------------------------------------------------------------------

create table public.attendance_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null,
  -- Jour de l'arrivée, dans le fuseau de l'agence.
  work_day date not null,
  arrived_at timestamptz not null,
  left_at timestamptz,
  -- « clock » : pointé à l'instant ; « declared » : déclaré après coup par le membre ; « corrected » : par un responsable.
  arrival_source text not null check (arrival_source in ('clock', 'declared', 'corrected')),
  departure_source text check (departure_source in ('clock', 'declared', 'corrected')),
  -- « open » : présent en ce moment ; « closed » : départ connu ; « missing_departure » : départ jamais pointé.
  status text not null check (status in ('open', 'closed', 'missing_departure')),
  note text check (char_length(note) <= 300),
  corrected_by uuid,
  corrected_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id, member_id) references public.members (organization_id, id) on delete cascade,
  check (left_at is null or left_at > arrived_at),
  check (left_at is null or left_at <= arrived_at + interval '24 hours'),
  check ((status = 'closed') = (left_at is not null)),
  check ((left_at is null) = (departure_source is null))
);

-- Une seule présence en cours par membre.
create unique index attendance_entries_open_idx on public.attendance_entries (member_id) where status = 'open';
create index attendance_entries_day_idx on public.attendance_entries (organization_id, work_day);
create index attendance_entries_member_idx on public.attendance_entries (member_id, arrived_at);

create function private.my_member_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.members m where m.user_id = (select auth.uid());
$$;

alter table public.attendance_entries enable row level security;
revoke all on public.attendance_entries from anon;
revoke insert, update, delete on public.attendance_entries from authenticated;
grant select on public.attendance_entries to authenticated;

create policy attendance_entries_select on public.attendance_entries for select to authenticated
  using (
    member_id in (select private.my_member_ids())
    or organization_id in (select private.member_org_ids_with_role(array['owner', 'admin']))
  );

-- 3. Fonctions -------------------------------------------------------------------------------------------

-- Jour (dans le fuseau de l'agence) d'un instant.
create function private.attendance_day(p_org uuid, p_at timestamptz) returns date
language sql stable security definer set search_path = '' as $$
  select (p_at at time zone o.timezone)::date from public.organizations o where o.id = p_org;
$$;

-- Heure (HH:MM) d'un instant dans le fuseau de l'agence, pour les messages.
create function private.attendance_time(p_org uuid, p_at timestamptz) returns text
language sql stable security definer set search_path = '' as $$
  select to_char(p_at at time zone o.timezone, 'HH24:MI') from public.organizations o where o.id = p_org;
$$;

-- Membre connecté de l'agence, avec un abonnement qui permet d'écrire.
create function private.attendance_member(p_org uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_member uuid := private.member_id(p_org);
begin
  if v_member is null then
    raise exception 'Vous ne faites pas partie de cette agence.';
  end if;
  if not private.org_can_write(p_org) then
    raise exception 'L''agence est en lecture seule : le pointage reprendra dès l''activation de l''abonnement.';
  end if;
  return v_member;
end;
$$;

-- Aucune présence d'un membre ne doit en chevaucher une autre.
create function private.attendance_overlaps(p_member uuid, p_from timestamptz, p_to timestamptz, p_except uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.attendance_entries e
    where e.member_id = p_member
      and e.id is distinct from p_except
      and tstzrange(e.arrived_at, coalesce(e.left_at, case when e.status = 'open' then now() else e.arrived_at + interval '1 minute' end), '[)')
          && tstzrange(p_from, coalesce(p_to, p_from + interval '1 minute'), '[)')
  );
$$;

-- Pointer son arrivée : maintenant, à l'heure du serveur.
create function public.clock_in(p_organization_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid := private.attendance_member(p_organization_id);
  v_today date := private.attendance_day(p_organization_id, now());
  v_open public.attendance_entries;
  v_id uuid;
begin
  select * into v_open from public.attendance_entries e where e.member_id = v_member and e.status = 'open' for update;
  if found then
    if v_open.work_day = v_today then
      raise exception 'Votre arrivée est déjà pointée, à %.', private.attendance_time(p_organization_id, v_open.arrived_at);
    end if;
    -- Présence d'un jour précédent restée ouverte : le départ n'a pas été pointé (il n'est pas inventé).
    update public.attendance_entries e set status = 'missing_departure' where e.id = v_open.id;
  end if;
  insert into public.attendance_entries (organization_id, member_id, work_day, arrived_at, arrival_source, status)
  values (p_organization_id, v_member, v_today, now(), 'clock', 'open')
  returning id into v_id;
  return v_id;
end;
$$;

-- Pointer son départ : ferme la présence du jour.
create function public.clock_out(p_organization_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid := private.attendance_member(p_organization_id);
  v_today date := private.attendance_day(p_organization_id, now());
  v_open public.attendance_entries;
begin
  select * into v_open from public.attendance_entries e where e.member_id = v_member and e.status = 'open' for update;
  if not found then
    raise exception 'Aucune arrivée pointée en cours : pointez d''abord votre arrivée, ou déclarez une présence oubliée.';
  end if;
  if v_open.work_day <> v_today then
    raise exception 'Votre arrivée du % n''a pas de départ pointé : déclarez l''heure de départ oubliée dans Présences.', to_char(v_open.work_day, 'DD/MM/YYYY');
  end if;
  update public.attendance_entries e set left_at = now(), departure_source = 'clock', status = 'closed' where e.id = v_open.id;
  return v_open.id;
end;
$$;

-- Le membre déclare une heure oubliée (dans les 7 derniers jours, avec une raison) :
-- - p_entry_id renseigné : départ oublié d'une présence existante ;
-- - p_entry_id vide : arrivée oubliée (et son départ, s'il est connu).
create function public.declare_attendance(
  p_organization_id uuid,
  p_entry_id uuid,
  p_arrived_at timestamptz,
  p_left_at timestamptz,
  p_reason text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid := private.attendance_member(p_organization_id);
  v_reason text := trim(coalesce(p_reason, ''));
  v_entry public.attendance_entries;
  v_today date := private.attendance_day(p_organization_id, now());
  v_id uuid;
begin
  if char_length(v_reason) not between 3 and 300 then
    raise exception 'Indiquez la raison de l''oubli (3 à 300 caractères).';
  end if;
  if p_left_at is not null and p_left_at > now() then
    raise exception 'L''heure de départ ne peut pas être dans le futur.';
  end if;

  if p_entry_id is not null then
    select * into v_entry from public.attendance_entries e
    where e.id = p_entry_id and e.organization_id = p_organization_id and e.member_id = v_member for update;
    if not found then
      raise exception 'Présence introuvable.';
    end if;
    if v_entry.left_at is not null then
      raise exception 'Le départ de cette présence est déjà connu : demandez une correction à un responsable.';
    end if;
    if v_entry.arrived_at < now() - interval '7 days' then
      raise exception 'Cette présence date de plus de 7 jours : demandez une correction à un responsable.';
    end if;
    if p_left_at is null or p_left_at <= v_entry.arrived_at or p_left_at > v_entry.arrived_at + interval '16 hours' then
      raise exception 'L''heure de départ doit suivre l''arrivée (%) le même jour.', private.attendance_time(p_organization_id, v_entry.arrived_at);
    end if;
    if private.attendance_overlaps(v_member, v_entry.arrived_at, p_left_at, v_entry.id) then
      raise exception 'Cette présence en chevaucherait une autre.';
    end if;
    update public.attendance_entries e set
      left_at = p_left_at, departure_source = 'declared', status = 'closed', note = v_reason
    where e.id = v_entry.id;
    return v_entry.id;
  end if;

  if p_arrived_at is null or p_arrived_at > now() then
    raise exception 'Indiquez une heure d''arrivée passée.';
  end if;
  if p_arrived_at < now() - interval '7 days' then
    raise exception 'Une présence de plus de 7 jours se fait corriger par un responsable.';
  end if;
  if p_left_at is not null and (p_left_at <= p_arrived_at or p_left_at > p_arrived_at + interval '16 hours') then
    raise exception 'L''heure de départ doit suivre l''arrivée, le même jour.';
  end if;
  if private.attendance_overlaps(v_member, p_arrived_at, p_left_at, null) then
    raise exception 'Cette présence en chevaucherait une autre déjà enregistrée.';
  end if;
  if p_left_at is null and private.attendance_day(p_organization_id, p_arrived_at) <> v_today then
    raise exception 'Pour un jour passé, indiquez aussi l''heure de départ.';
  end if;
  begin
    insert into public.attendance_entries (
      organization_id, member_id, work_day, arrived_at, left_at, arrival_source, departure_source, status, note
    ) values (
      p_organization_id, v_member, private.attendance_day(p_organization_id, p_arrived_at), p_arrived_at, p_left_at,
      'declared', case when p_left_at is not null then 'declared' end,
      case when p_left_at is null then 'open' else 'closed' end, v_reason
    ) returning id into v_id;
  exception when unique_violation then
    raise exception 'Une présence est déjà en cours : pointez d''abord votre départ.';
  end;
  return v_id;
end;
$$;

-- Le propriétaire ou un administrateur corrige une présence, ou en ajoute une pour un membre, avec une raison.
create function public.correct_attendance(
  p_organization_id uuid,
  p_entry_id uuid,
  p_member_id uuid,
  p_arrived_at timestamptz,
  p_left_at timestamptz,
  p_reason text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_reason text := trim(coalesce(p_reason, ''));
  v_entry public.attendance_entries;
  v_member uuid;
  v_today date := private.attendance_day(p_organization_id, now());
  v_status text;
  v_id uuid;
begin
  if not private.has_role(p_organization_id, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs corrigent les présences.';
  end if;
  if char_length(v_reason) not between 3 and 300 then
    raise exception 'Indiquez la raison de la correction (3 à 300 caractères).';
  end if;
  if p_arrived_at is null or p_arrived_at > now() or p_arrived_at < now() - interval '400 days' then
    raise exception 'Indiquez une heure d''arrivée passée (moins d''un an).';
  end if;
  if p_left_at is not null and (p_left_at <= p_arrived_at or p_left_at > now() or p_left_at > p_arrived_at + interval '24 hours') then
    raise exception 'L''heure de départ doit suivre l''arrivée, sans dépasser 24 heures ni l''heure actuelle.';
  end if;

  if p_entry_id is not null then
    select * into v_entry from public.attendance_entries e where e.id = p_entry_id and e.organization_id = p_organization_id for update;
    if not found then
      raise exception 'Présence introuvable.';
    end if;
    v_member := v_entry.member_id;
  else
    select m.id into v_member from public.members m
    where m.id = p_member_id and m.organization_id = p_organization_id and m.removed_at is null;
    if v_member is null then
      raise exception 'Membre introuvable.';
    end if;
  end if;

  if private.attendance_overlaps(v_member, p_arrived_at, p_left_at, p_entry_id) then
    raise exception 'Cette présence en chevaucherait une autre du même membre.';
  end if;
  v_status := case
    when p_left_at is not null then 'closed'
    when private.attendance_day(p_organization_id, p_arrived_at) = v_today then 'open'
    else 'missing_departure'
  end;

  begin
    if p_entry_id is not null then
      update public.attendance_entries e set
        work_day = private.attendance_day(p_organization_id, p_arrived_at),
        arrived_at = p_arrived_at,
        left_at = p_left_at,
        arrival_source = case when e.arrived_at = p_arrived_at then e.arrival_source else 'corrected' end,
        departure_source = case
          when p_left_at is null then null
          when e.left_at = p_left_at then e.departure_source
          else 'corrected'
        end,
        status = v_status,
        note = v_reason,
        corrected_by = private.member_id(p_organization_id),
        corrected_at = now()
      where e.id = v_entry.id
      returning e.id into v_id;
    else
      insert into public.attendance_entries (
        organization_id, member_id, work_day, arrived_at, left_at, arrival_source, departure_source, status, note, corrected_by, corrected_at
      ) values (
        p_organization_id, v_member, private.attendance_day(p_organization_id, p_arrived_at), p_arrived_at, p_left_at,
        'corrected', case when p_left_at is not null then 'corrected' end, v_status, v_reason,
        private.member_id(p_organization_id), now()
      ) returning id into v_id;
    end if;
  exception when unique_violation then
    raise exception 'Ce membre a déjà une présence en cours aujourd''hui.';
  end;
  return v_id;
end;
$$;

-- Horaires de l'agence (propriétaire et administrateurs).
create function public.save_attendance_settings(
  p_organization_id uuid,
  p_expected_start time,
  p_expected_end time,
  p_work_days smallint[],
  p_grace_minutes smallint
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role(p_organization_id, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs modifient les horaires de l''agence.';
  end if;
  if p_expected_start is null or p_expected_end is null or p_expected_end <= p_expected_start then
    raise exception 'L''heure de départ attendue doit suivre l''heure d''arrivée.';
  end if;
  if p_work_days is null or cardinality(p_work_days) = 0 or not (p_work_days <@ '{1,2,3,4,5,6,7}'::smallint[]) then
    raise exception 'Choisissez au moins un jour travaillé.';
  end if;
  if p_grace_minutes is null or p_grace_minutes not between 0 and 120 then
    raise exception 'La tolérance va de 0 à 120 minutes.';
  end if;
  insert into public.attendance_settings as s (organization_id, expected_start, expected_end, work_days, grace_minutes, updated_by)
  values (
    p_organization_id, p_expected_start, p_expected_end,
    (select array_agg(distinct d order by d) from unnest(p_work_days) d), p_grace_minutes,
    private.member_id(p_organization_id)
  )
  on conflict (organization_id) do update set
    expected_start = excluded.expected_start,
    expected_end = excluded.expected_end,
    work_days = excluded.work_days,
    grace_minutes = excluded.grace_minutes,
    updated_by = excluded.updated_by;
end;
$$;

-- Droits d'exécution -----------------------------------------------------------------------------------

revoke all on function
  private.my_member_ids(),
  private.attendance_day(uuid, timestamptz),
  private.attendance_time(uuid, timestamptz),
  private.attendance_member(uuid),
  private.attendance_overlaps(uuid, timestamptz, timestamptz, uuid)
from public, anon, authenticated;
-- Lu par la règle d'accès (RLS) des présences.
grant execute on function private.my_member_ids() to authenticated;

revoke all on function
  public.clock_in(uuid),
  public.clock_out(uuid),
  public.declare_attendance(uuid, uuid, timestamptz, timestamptz, text),
  public.correct_attendance(uuid, uuid, uuid, timestamptz, timestamptz, text),
  public.save_attendance_settings(uuid, time, time, smallint[], smallint)
from public, anon;
grant execute on function
  public.clock_in(uuid),
  public.clock_out(uuid),
  public.declare_attendance(uuid, uuid, timestamptz, timestamptz, text),
  public.correct_attendance(uuid, uuid, uuid, timestamptz, timestamptz, text),
  public.save_attendance_settings(uuid, time, time, smallint[], smallint)
to authenticated;
