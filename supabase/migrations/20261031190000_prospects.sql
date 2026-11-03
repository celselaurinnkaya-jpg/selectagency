-- SELECT Agency — Prospects et origine des contacts.
--
-- Un prospect est une fiche de la table clients, au statut « prospect » : la même fiche devient
-- client, sans copie ni doublon, et garde tout son historique (rendez-vous, relances, échanges).
-- Elle devient client à la main (convert_prospect) ou dès que l'agence travaille pour elle :
-- premier dossier ouvert, ou ajout à un service. L'origine du contact (Facebook, Instagram,
-- WhatsApp, recommandation…) se note pour les prospects comme pour les clients.

alter table public.clients
  add column status text not null default 'client' check (status in ('prospect', 'client')),
  add column source text check (source in ('facebook', 'instagram', 'whatsapp', 'tiktok', 'referral', 'walk_in', 'website', 'phone', 'other')),
  add column source_detail text check (char_length(source_detail) <= 120),
  add column converted_at timestamptz,
  add constraint clients_converted_check check (status = 'client' or converted_at is null);

create index clients_status_idx on public.clients (organization_id, status);

-- L'import de la démonstration insère des lignes complètes (colonne absente = vide) : une fiche
-- sans statut est un client, comme toutes les fiches créées avant les prospects.
create function private.default_client_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.status := coalesce(new.status, 'client');
  return new;
end;
$$;

create trigger clients_default_status before insert on public.clients
for each row execute function private.default_client_status();

-- Prospect devenu client à la main (bouton « Transformer en client » de la fiche).
create function public.convert_prospect(p_client_id uuid, p_event text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_client public.clients;
begin
  select * into v_client from public.clients c where c.id = p_client_id for update;
  if not found or not private.has_role(v_client.organization_id, array['owner', 'admin', 'agent']) then
    raise exception 'Fiche introuvable, ou vous n''avez pas le droit de la modifier.';
  end if;
  if v_client.status <> 'prospect' then
    raise exception 'Cette personne est déjà cliente de l''agence.';
  end if;
  if v_client.archived_at is not null then
    raise exception 'Cette fiche est archivée : restaurez-la avant de la transformer en client.';
  end if;
  update public.clients c set status = 'client', converted_at = now() where c.id = v_client.id;
  insert into public.activity_events (organization_id, actor_id, client_id, text)
  values (v_client.organization_id, private.member_id(v_client.organization_id), v_client.id, p_event);
end;
$$;

-- Prospect devenu client automatiquement : premier dossier ouvert ou ajout à un service.
create function private.convert_prospect_on_work() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.clients c set status = 'client', converted_at = now()
  where c.id = new.client_id and c.organization_id = new.organization_id and c.status = 'prospect';
  if found then
    insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
    values (
      new.organization_id, private.member_id(new.organization_id), new.client_id,
      case when tg_table_name = 'cases' then new.id end,
      case when tg_table_name = 'cases' then 'Prospect devenu client : premier dossier ouvert.' else 'Prospect devenu client : ajouté à un service de l''agence.' end
    );
  end if;
  return new;
end;
$$;

create trigger cases_convert_prospect after insert on public.cases
for each row execute function private.convert_prospect_on_work();

create trigger service_clients_convert_prospect after insert on public.service_clients
for each row execute function private.convert_prospect_on_work();

revoke all on function private.convert_prospect_on_work(), private.default_client_status() from public, anon, authenticated;
revoke all on function public.convert_prospect(uuid, text) from public, anon;
grant execute on function public.convert_prospect(uuid, text) to authenticated;
