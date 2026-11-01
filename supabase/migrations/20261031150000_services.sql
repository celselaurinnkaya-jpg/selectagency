-- SELECT Agency — Services de l'agence, et clients suivis dans chaque service.
--
-- Chaque agence tient sa propre liste de services (hébergement, garant, AVI, Campus France…) : un
-- nom, une description et, si elle le souhaite, un tarif indicatif (repris dans les factures).
-- Un client s'ajoute à un service avec un état de suivi et, au besoin, le dossier concerné.
-- Le service ne porte aucune somme due : la finance reste dans les dossiers (prestations, paiements,
-- reçus) et dans les factures.
--
-- Lecture : tous les membres de l'agence. Liste des services : propriétaire et administrateurs.
-- Clients d'un service : propriétaire, administrateurs et conseillers. Les écritures passent par des
-- fonctions, qui notent chaque changement dans l'historique du client.

-- Services ------------------------------------------------------------------------------------------

create table public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '' check (char_length(description) <= 500),
  price_minor bigint check (price_minor > 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((price_minor is null) = (currency is null)),
  unique (organization_id, id)
);

-- Deux services de la même agence ne portent pas le même nom (majuscules comprises).
create unique index services_name_idx on public.services (organization_id, lower(name));

create trigger services_touch before update on public.services
for each row execute function private.touch_updated_at();

-- Clients suivis dans un service ----------------------------------------------------------------------

create table public.service_clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  service_id uuid not null,
  client_id uuid not null,
  case_id uuid,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'waiting_client', 'waiting_external', 'completed', 'cancelled')),
  note text not null default '' check (char_length(note) <= 500),
  added_by uuid not null,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, client_id),
  foreign key (organization_id, service_id) references public.services (organization_id, id) on delete cascade,
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete cascade,
  foreign key (organization_id, case_id) references public.cases (organization_id, id) on delete set null (case_id),
  foreign key (organization_id, added_by) references public.members (organization_id, id)
);

create index service_clients_client_idx on public.service_clients (organization_id, client_id);
create index service_clients_case_idx on public.service_clients (organization_id, case_id);
create index service_clients_added_by_idx on public.service_clients (organization_id, added_by);

create trigger service_clients_touch before update on public.service_clients
for each row execute function private.touch_updated_at();

alter table public.services enable row level security;
alter table public.service_clients enable row level security;

revoke all on public.services, public.service_clients from anon;
revoke insert, update, delete on public.services, public.service_clients from authenticated;
grant select on public.services, public.service_clients to authenticated;

create policy services_select on public.services for select to authenticated
  using (organization_id in (select private.my_org_ids()));
create policy service_clients_select on public.service_clients for select to authenticated
  using (organization_id in (select private.my_org_ids()));

-- Fonctions -------------------------------------------------------------------------------------------

-- Libellé d'un état de suivi, tel qu'il apparaît dans l'historique (voir src/lib/domain/labels.ts).
create function private.service_status_label(p_status text) returns text
language sql immutable set search_path = '' as $$
  select case p_status
    when 'in_progress' then 'en cours'
    when 'waiting_client' then 'en attente du client'
    when 'waiting_external' then 'en attente d''un tiers'
    when 'completed' then 'terminé'
    when 'cancelled' then 'annulé'
  end;
$$;

-- Crée (p_service_id vide) ou modifie un service. Le tarif est facultatif : montant et devise vont
-- ensemble. Un service désactivé reste visible avec ses clients, mais n'en accepte plus de nouveaux.
create function public.save_service(
  p_organization_id uuid,
  p_service_id uuid,
  p_name text,
  p_description text,
  p_price_minor bigint,
  p_currency text,
  p_is_active boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_description text := trim(coalesce(p_description, ''));
begin
  if not private.has_role(p_organization_id, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs peuvent gérer la liste des services.';
  end if;
  if char_length(v_name) not between 2 and 80 then
    raise exception 'Donnez un nom au service (de 2 à 80 caractères).';
  end if;
  if char_length(v_description) > 500 then
    raise exception 'Description trop longue (500 caractères au plus).';
  end if;
  if (p_price_minor is null) <> (p_currency is null) or p_price_minor <= 0 or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'Tarif invalide : indiquez un montant positif et sa devise, ou laissez le tarif vide.';
  end if;

  begin
    if p_service_id is null then
      insert into public.services (organization_id, name, description, price_minor, currency, is_active)
      values (p_organization_id, v_name, v_description, p_price_minor, p_currency, coalesce(p_is_active, true))
      returning id into v_id;
    else
      update public.services s set
        name = v_name,
        description = v_description,
        price_minor = p_price_minor,
        currency = p_currency,
        is_active = coalesce(p_is_active, s.is_active)
      where s.id = p_service_id and s.organization_id = p_organization_id
      returning s.id into v_id;
      if v_id is null then
        raise exception 'Service introuvable.';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'Un service s''appelle déjà « % » dans votre agence.', v_name;
  end;
  return v_id;
end;
$$;

-- Supprime un service. Ses clients en sont retirés (leurs fiches, dossiers et paiements ne changent
-- pas) et l'historique de chacun le note. Renvoie le nombre de clients retirés.
create function public.delete_service(p_service_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_service public.services;
  v_count integer;
begin
  select * into v_service from public.services s where s.id = p_service_id for update;
  if not found or not private.has_role(v_service.organization_id, array['owner', 'admin']) then
    raise exception 'Service introuvable, ou vous n''avez pas le droit de le supprimer.';
  end if;

  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  select sc.organization_id, private.member_id(sc.organization_id), sc.client_id, sc.case_id,
    format('Service « %s » supprimé de la liste de l''agence : client retiré de ce service.', v_service.name)
  from public.service_clients sc
  where sc.service_id = v_service.id;
  get diagnostics v_count = row_count;

  delete from public.services s where s.id = v_service.id;
  return v_count;
end;
$$;

-- Ajoute un client à un service (une seule fois par service), avec le dossier concerné s'il y en a un.
create function public.add_service_client(p_service_id uuid, p_client_id uuid, p_case_id uuid, p_status text, p_note text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_service public.services;
  v_client public.clients;
  v_note text := trim(coalesce(p_note, ''));
  v_id uuid;
begin
  select * into v_service from public.services s where s.id = p_service_id;
  if not found or not private.has_role(v_service.organization_id, array['owner', 'admin', 'agent']) then
    raise exception 'Service introuvable, ou vous n''avez pas le droit d''y ajouter des clients.';
  end if;
  if not v_service.is_active then
    raise exception 'Ce service est désactivé : réactivez-le avant d''y ajouter des clients.';
  end if;
  select * into v_client from public.clients c where c.id = p_client_id and c.organization_id = v_service.organization_id;
  if not found then
    raise exception 'Client introuvable.';
  end if;
  if v_client.archived_at is not null then
    raise exception 'Ce client est archivé : il ne peut pas être ajouté à un service.';
  end if;
  if p_case_id is not null and not exists (
    select 1 from public.cases c where c.id = p_case_id and c.organization_id = v_service.organization_id and c.client_id = v_client.id
  ) then
    raise exception 'Ce dossier n''appartient pas à ce client.';
  end if;
  if private.service_status_label(p_status) is null then
    raise exception 'État de suivi inconnu.';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'Remarque trop longue (500 caractères au plus).';
  end if;

  begin
    insert into public.service_clients (organization_id, service_id, client_id, case_id, status, note, added_by)
    values (v_service.organization_id, v_service.id, v_client.id, p_case_id, p_status, v_note, private.member_id(v_service.organization_id))
    returning id into v_id;
  exception when unique_violation then
    raise exception '% % suit déjà le service « % ».', v_client.first_name, v_client.last_name, v_service.name;
  end;

  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (v_service.organization_id, private.member_id(v_service.organization_id), v_client.id, p_case_id,
    format('Ajouté au service « %s » (%s).', v_service.name, private.service_status_label(p_status)));
  return v_id;
end;
$$;

-- Change l'état de suivi, le dossier concerné ou la remarque. Un changement d'état est noté dans
-- l'historique du client.
create function public.update_service_client(p_id uuid, p_status text, p_case_id uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_link public.service_clients;
  v_service_name text;
  v_note text := trim(coalesce(p_note, ''));
begin
  select * into v_link from public.service_clients sc where sc.id = p_id for update;
  if not found or not private.has_role(v_link.organization_id, array['owner', 'admin', 'agent']) then
    raise exception 'Suivi introuvable, ou vous n''avez pas le droit de le modifier.';
  end if;
  if p_case_id is not null and not exists (
    select 1 from public.cases c where c.id = p_case_id and c.organization_id = v_link.organization_id and c.client_id = v_link.client_id
  ) then
    raise exception 'Ce dossier n''appartient pas à ce client.';
  end if;
  if private.service_status_label(p_status) is null then
    raise exception 'État de suivi inconnu.';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'Remarque trop longue (500 caractères au plus).';
  end if;

  update public.service_clients sc set status = p_status, case_id = p_case_id, note = v_note where sc.id = v_link.id;

  if p_status <> v_link.status then
    select s.name into v_service_name from public.services s where s.id = v_link.service_id;
    insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
    values (v_link.organization_id, private.member_id(v_link.organization_id), v_link.client_id, p_case_id,
      format('Service « %s » : %s.', v_service_name, private.service_status_label(p_status)));
  end if;
end;
$$;

-- Retire un client d'un service. Sa fiche, ses dossiers et ses paiements ne changent pas.
create function public.remove_service_client(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_link public.service_clients;
  v_service_name text;
begin
  select * into v_link from public.service_clients sc where sc.id = p_id for update;
  if not found or not private.has_role(v_link.organization_id, array['owner', 'admin', 'agent']) then
    raise exception 'Suivi introuvable, ou vous n''avez pas le droit de le retirer.';
  end if;
  select s.name into v_service_name from public.services s where s.id = v_link.service_id;
  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (v_link.organization_id, private.member_id(v_link.organization_id), v_link.client_id, v_link.case_id,
    format('Retiré du service « %s ».', v_service_name));
  delete from public.service_clients sc where sc.id = v_link.id;
end;
$$;

revoke all on function private.service_status_label(text) from public, anon, authenticated;

revoke all on function
  public.save_service(uuid, uuid, text, text, bigint, text, boolean),
  public.delete_service(uuid),
  public.add_service_client(uuid, uuid, uuid, text, text),
  public.update_service_client(uuid, text, uuid, text),
  public.remove_service_client(uuid)
from public, anon;

grant execute on function
  public.save_service(uuid, uuid, text, text, bigint, text, boolean),
  public.delete_service(uuid),
  public.add_service_client(uuid, uuid, uuid, text, text),
  public.update_service_client(uuid, text, uuid, text),
  public.remove_service_client(uuid)
to authenticated;
