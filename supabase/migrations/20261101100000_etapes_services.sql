-- SELECT Agency — Étapes des services.
--
-- Chaque service a sa liste d'étapes, que l'agence adapte à son activité (par défaut : de « Demande
-- reçue » à « Service terminé »). Un client ajouté à un service reçoit une copie de ces étapes :
-- modifier la liste plus tard ne change pas les suivis déjà en cours (comme un dossier garde les
-- étapes de son modèle). Cocher une étape la note dans l'historique du client ; quand toutes sont
-- faites, le suivi passe « Terminé » ; décocher une étape d'un suivi terminé le remet « En cours ».

-- Étapes d'un service ---------------------------------------------------------------------------------

create table public.service_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  service_id uuid not null,
  position integer not null check (position between 1 and 30),
  label text not null check (char_length(label) between 2 and 120),
  created_at timestamptz not null default now(),
  unique (service_id, position),
  foreign key (organization_id, service_id) references public.services (organization_id, id) on delete cascade
);

create index service_steps_org_idx on public.service_steps (organization_id, service_id);

-- Étapes d'un client suivi (copie faite à l'ajout) -----------------------------------------------------

alter table public.service_clients add constraint service_clients_org_id_key unique (organization_id, id);

create table public.service_client_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  service_client_id uuid not null,
  position integer not null check (position between 1 and 30),
  label text not null check (char_length(label) between 2 and 120),
  done_at timestamptz,
  done_by uuid,
  unique (service_client_id, position),
  check ((done_at is null) = (done_by is null)),
  foreign key (organization_id, service_client_id) references public.service_clients (organization_id, id) on delete cascade,
  foreign key (organization_id, done_by) references public.members (organization_id, id)
);

create index service_client_steps_org_idx on public.service_client_steps (organization_id, service_client_id);
create index service_client_steps_done_by_idx on public.service_client_steps (organization_id, done_by);

alter table public.service_steps enable row level security;
alter table public.service_client_steps enable row level security;
revoke all on public.service_steps, public.service_client_steps from anon;
revoke insert, update, delete on public.service_steps, public.service_client_steps from authenticated;
grant select on public.service_steps, public.service_client_steps to authenticated;

create policy service_steps_select on public.service_steps for select to authenticated
  using (organization_id in (select private.my_org_ids()));
create policy service_client_steps_select on public.service_client_steps for select to authenticated
  using (organization_id in (select private.my_org_ids()));

-- Étapes proposées à la création d'un service ----------------------------------------------------------

create function private.default_service_steps() returns text[]
language sql immutable set search_path = '' as $$
  select array[
    'Demande reçue',
    'Documents attendus',
    'Documents reçus',
    'Paiement vérifié (si nécessaire)',
    'Dossier transmis au partenaire',
    'Réception confirmée',
    'Traitement en cours',
    'Résultat reçu',
    'Résultat transmis au client',
    'Service terminé'
  ];
$$;

create function private.seed_service_steps() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.service_steps (organization_id, service_id, position, label)
  select new.organization_id, new.id, s.position, s.label
  from unnest(private.default_service_steps()) with ordinality as s(label, position);
  return new;
end;
$$;

create trigger services_seed_steps after insert on public.services
for each row execute function private.seed_service_steps();

-- Copie des étapes du service pour chaque client ajouté.
create function private.copy_service_steps() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.service_client_steps (organization_id, service_client_id, position, label)
  select new.organization_id, new.id, st.position, st.label
  from public.service_steps st
  where st.service_id = new.service_id
  order by st.position;
  return new;
end;
$$;

create trigger service_clients_copy_steps after insert on public.service_clients
for each row execute function private.copy_service_steps();

-- Services et suivis existants : étapes par défaut ; un suivi déjà terminé a toutes ses étapes faites.
insert into public.service_steps (organization_id, service_id, position, label)
select sv.organization_id, sv.id, s.position, s.label
from public.services sv
cross join unnest(private.default_service_steps()) with ordinality as s(label, position);

insert into public.service_client_steps (organization_id, service_client_id, position, label, done_at, done_by)
select sc.organization_id, sc.id, st.position, st.label,
  case when sc.status = 'completed' then sc.updated_at end,
  case when sc.status = 'completed' then sc.added_by end
from public.service_clients sc
join public.service_steps st on st.service_id = sc.service_id;

-- Fonctions ---------------------------------------------------------------------------------------------

-- Nouvelle liste d'étapes d'un service (les suivis en cours gardent la leur).
create function public.save_service_steps(p_service_id uuid, p_labels text[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_service public.services;
  v_labels text[];
begin
  select * into v_service from public.services s where s.id = p_service_id for update;
  if not found or not private.has_role(v_service.organization_id, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs peuvent modifier les étapes d''un service.';
  end if;
  select coalesce(array_agg(regexp_replace(trim(l), '\s+', ' ', 'g') order by n), '{}')
    into v_labels
  from unnest(coalesce(p_labels, '{}')) with ordinality as x(l, n)
  where trim(coalesce(l, '')) <> '';
  if cardinality(v_labels) = 0 then
    raise exception 'Gardez au moins une étape.';
  end if;
  if cardinality(v_labels) > 30 then
    raise exception 'Trente étapes au plus par service.';
  end if;
  if exists (select 1 from unnest(v_labels) l where char_length(l) not between 2 and 120) then
    raise exception 'Chaque étape doit compter de 2 à 120 caractères.';
  end if;

  delete from public.service_steps st where st.service_id = v_service.id;
  insert into public.service_steps (organization_id, service_id, position, label)
  select v_service.organization_id, v_service.id, s.position, s.label
  from unnest(v_labels) with ordinality as s(label, position);
  return cardinality(v_labels);
end;
$$;

-- Cocher ou décocher une étape d'un client suivi ; l'état du suivi suit (Terminé quand tout est fait).
create function public.set_service_client_step(p_step_id uuid, p_done boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_step public.service_client_steps;
  v_link public.service_clients;
  v_service_name text;
  v_remaining integer;
  v_status text;
begin
  select * into v_step from public.service_client_steps st where st.id = p_step_id;
  if not found or not private.has_role(v_step.organization_id, array['owner', 'admin', 'agent']) then
    raise exception 'Étape introuvable, ou vous n''avez pas le droit de la modifier.';
  end if;
  select * into v_link from public.service_clients sc where sc.id = v_step.service_client_id for update;
  select * into v_step from public.service_client_steps st where st.id = p_step_id for update;
  if v_link.status = 'cancelled' then
    raise exception 'Ce suivi est annulé : remettez-le en cours pour avancer ses étapes.';
  end if;
  if coalesce(p_done, false) = (v_step.done_at is not null) then
    return v_link.status;
  end if;

  update public.service_client_steps st set
    done_at = case when p_done then now() end,
    done_by = case when p_done then private.member_id(v_step.organization_id) end
  where st.id = v_step.id;

  select count(*) into v_remaining from public.service_client_steps st where st.service_client_id = v_link.id and st.done_at is null;
  v_status := case
    when v_remaining = 0 then 'completed'
    when v_link.status = 'completed' then 'in_progress'
    else v_link.status
  end;
  if v_status <> v_link.status then
    update public.service_clients sc set status = v_status where sc.id = v_link.id;
  end if;

  select s.name into v_service_name from public.services s where s.id = v_link.service_id;
  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (
    v_link.organization_id, private.member_id(v_link.organization_id), v_link.client_id, v_link.case_id,
    format('Service « %s » : étape « %s » %s%s', v_service_name, v_step.label,
      case when p_done then 'faite' else 'à refaire' end,
      case when v_status <> v_link.status then format(' (suivi %s).', private.service_status_label(v_status)) else '.' end)
  );
  return v_status;
end;
$$;

revoke all on function private.default_service_steps(), private.seed_service_steps(), private.copy_service_steps() from public, anon, authenticated;
revoke all on function public.save_service_steps(uuid, text[]), public.set_service_client_step(uuid, boolean) from public, anon;
grant execute on function public.save_service_steps(uuid, text[]), public.set_service_client_step(uuid, boolean) to authenticated;
