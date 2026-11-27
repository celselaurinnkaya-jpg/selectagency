-- SELECT Agency — Personnes invitées et messages du site web (demande de l'utilisateur du 26/11).
--
-- 1. Une personne invitée par un lien (espace client ou espace partenaire) qui se connecte sans repasser par
--    son lien : l'application retrouve ce lien d'après l'adresse e-mail du compte, et l'y renvoie au lieu de lui
--    proposer de créer une agence. (Les invitations d'équipe ont déjà my_invitations().)
-- 2. « Messages reçus » : chaque demande envoyée par le formulaire du site de l'agence est gardée dans une liste
--    à part, avec son texte complet, à traiter puis marquer « traitée ». La demande crée toujours le prospect et
--    la tâche « Rappeler » comme avant ; un client déjà connu (même numéro) a désormais aussi sa ligne ici.

-- 1. Liens d'espace client et d'espace partenaire en attente pour le compte connecté ----------------------------

create function public.my_pending_accesses()
returns table (kind text, token uuid, agency_name text)
language sql stable security definer set search_path = '' as $$
  select 'client', a.token, o.name
  from public.client_portal_access a
  join public.organizations o on o.id = a.organization_id
  where a.token is not null
    and a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
    and a.user_id is distinct from (select auth.uid())
  union all
  select 'partner', p.access_token, o.name
  from public.partners p
  join public.organizations o on o.id = p.organization_id
  where p.access_token is not null
    and p.is_active
    and p.access_email = lower(coalesce(auth.jwt() ->> 'email', ''))
    and p.user_id is distinct from (select auth.uid());
$$;

revoke all on function public.my_pending_accesses() from public, anon;
grant execute on function public.my_pending_accesses() to authenticated;

-- 2. Messages reçus par le site web ------------------------------------------------------------------------------

create table public.website_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid,
  bureau_id uuid references public.bureaux (id) on delete set null,
  first_name text not null,
  last_name text not null,
  phone_e164 text not null default '',
  email text,
  service text not null default '' check (char_length(service) <= 120),
  destination text not null default '' check (char_length(destination) <= 120),
  message text not null default '' check (char_length(message) <= 1500),
  -- Vrai : la demande a créé une nouvelle fiche prospect ; faux : le numéro était déjà celui d'un client.
  is_new_client boolean not null default true,
  received_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references public.members (id) on delete set null,
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete set null (client_id)
);

create index website_messages_org_idx on public.website_messages (organization_id, received_at desc);
create index website_messages_to_handle_idx on public.website_messages (organization_id) where handled_at is null;
create index website_messages_client_idx on public.website_messages (client_id);

alter table public.website_messages enable row level security;
revoke all on public.website_messages from anon;
revoke insert, update, delete on public.website_messages from authenticated;
grant select on public.website_messages to authenticated;

-- Lecture : tout membre de l'agence (comme les fiches clients).
create policy website_messages_select on public.website_messages for select to authenticated
  using (organization_id in (select private.my_org_ids()));

-- Visibilité par bureau : comme la fiche du client (ou, sans fiche, d'après le bureau choisi par le visiteur).
create policy website_messages_bureau on public.website_messages as restrictive for all to authenticated
  using (
    organization_id not in (select private.my_restricted_org_ids())
    or client_id in (select private.restricted_visible_client_ids())
    or (client_id is null and (bureau_id is null or bureau_id in (select private.my_bureau_ids())))
  );

-- Marquer un message « traité » (ou le remettre « à traiter ») : propriétaire, administrateur, conseiller.
create function public.set_website_message_handled(p_id uuid, p_handled boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_message public.website_messages;
  v_visible boolean;
begin
  select * into v_message from public.website_messages m where m.id = p_id for update;
  if not found or not private.has_role(v_message.organization_id, array['owner', 'admin', 'agent']) then
    raise exception 'Message introuvable, ou vous n''avez pas le droit de le modifier.';
  end if;
  -- Visibilité par bureau : même règle que la lecture.
  v_visible := coalesce(
    v_message.organization_id not in (select private.my_restricted_org_ids())
    or (v_message.client_id is not null and v_message.client_id in (select private.restricted_visible_client_ids()))
    or (v_message.client_id is null and (v_message.bureau_id is null or v_message.bureau_id in (select private.my_bureau_ids()))),
    false
  );
  if not v_visible then
    raise exception 'Message introuvable, ou vous n''avez pas le droit de le modifier.';
  end if;
  update public.website_messages m set
    handled_at = case when coalesce(p_handled, false) then coalesce(m.handled_at, now()) end,
    handled_by = case when coalesce(p_handled, false) then coalesce(m.handled_by, private.member_id(v_message.organization_id)) end
  where m.id = p_id;
end;
$$;

revoke all on function public.set_website_message_handled(uuid, boolean) from public, anon;
grant execute on function public.set_website_message_handled(uuid, boolean) to authenticated;

-- Formulaire du site : identique à la version des bureaux (20261125100000), plus la ligne dans « Messages reçus ».
create or replace function public.website_submit_lead(
  p_slug text, p_first_name text, p_last_name text, p_phone text, p_email text, p_service text, p_destination text, p_message text,
  p_service_motive text default null, p_bureau_id uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_site public.agency_websites;
  v_org public.organizations;
  v_owner uuid;
  v_phone text := trim(coalesce(p_phone, ''));
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_first text := trim(coalesce(p_first_name, ''));
  v_last text := trim(coalesce(p_last_name, ''));
  v_motive text := case
    when p_service_motive in ('study_abroad', 'tourist_visa', 'business_travel', 'family_reunion', 'administrative', 'custom_trip', 'other')
    then p_service_motive
  end;
  v_bureau uuid;
  v_client_id uuid;
  v_reference text;
  v_notes text;
  v_new boolean := false;
begin
  select * into v_site from public.agency_websites w
  where w.slug = lower(trim(coalesce(p_slug, ''))) and w.is_online and w.published is not null;
  if not found or not private.org_has_feature(v_site.organization_id, 'website') or not private.org_can_write(v_site.organization_id) then
    raise exception 'Ce site n''est pas disponible.';
  end if;
  if char_length(v_first) not between 1 and 80 or char_length(v_last) not between 1 and 80 then
    raise exception 'Indiquez votre prénom et votre nom.';
  end if;
  if v_phone !~ '^\+[0-9]{6,15}$' then
    raise exception 'Numéro de téléphone invalide.';
  end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Adresse e-mail invalide.';
  end if;
  if char_length(coalesce(p_service, '')) > 120 or char_length(coalesce(p_destination, '')) > 120 or char_length(coalesce(p_message, '')) > 1500 then
    raise exception 'Message trop long.';
  end if;

  select * into v_org from public.organizations o where o.id = v_site.organization_id;
  -- Bureau choisi par le visiteur : seulement un bureau ouvert de cette agence.
  select b.id into v_bureau from public.bureaux b where b.id = p_bureau_id and b.organization_id = v_org.id and b.archived_at is null;

  -- Anti-abus : au plus 3 demandes par numéro et par jour, 100 demandes par jour pour un site.
  if (
    select count(*) from public.activity_events e
    join public.clients c on c.id = e.client_id
    where e.organization_id = v_org.id and c.phone_e164 = v_phone
      and e.at > now() - interval '1 day' and e.text like '%par le site web de l''agence%'
  ) >= 3 then
    raise exception 'Votre demande a déjà été reçue : l''agence vous recontacte rapidement.';
  end if;
  if (
    select count(*) from public.activity_events e
    where e.organization_id = v_org.id and e.at > now() - interval '1 day' and e.text like '%par le site web de l''agence%'
  ) >= 100 then
    raise exception 'Trop de demandes aujourd''hui : réessayez demain, ou contactez l''agence par téléphone.';
  end if;

  select m.id into v_owner from public.members m
  where m.organization_id = v_org.id and m.role = 'owner' and m.removed_at is null
  order by m.created_at limit 1;
  if v_owner is null then
    raise exception 'Ce site n''est pas disponible.';
  end if;

  v_notes := left(concat_ws(E'\n',
    'Demande reçue par le site web de l''agence.',
    case when v_bureau is not null then 'Bureau choisi : ' || (select b.name from public.bureaux b where b.id = v_bureau) end,
    case when coalesce(trim(p_service), '') <> '' then 'Service souhaité : ' || trim(p_service) end,
    case when coalesce(trim(p_destination), '') <> '' then 'Destination : ' || trim(p_destination) end,
    case when coalesce(trim(p_message), '') <> '' then 'Message : ' || trim(p_message) end
  ), 2000);

  perform set_config('select_agency.importing', 'on', true);

  select c.id, c.reference into v_client_id, v_reference from public.clients c
  where c.organization_id = v_org.id and c.phone_e164 = v_phone and c.archived_at is null
  order by c.registered_at limit 1;

  if v_client_id is null then
    v_new := true;
    insert into public.clients (
      organization_id, reference, client_type, first_name, last_name, email, phone_e164, whatsapp_e164,
      residence_country, city, assigned_to, status, source, source_detail, notes, service_motive, bureau_id
    ) values (
      v_org.id, private.formatted_number(v_org.id, 'client', 'CLI'), 'individual', v_first, v_last, v_email, v_phone, v_phone,
      v_org.country_code, '', v_owner, 'prospect', 'website', 'Formulaire du site', v_notes, v_motive, v_bureau
    ) returning id, reference into v_client_id, v_reference;
    insert into public.activity_events (organization_id, actor_id, at, client_id, text)
    values (v_org.id, v_owner, now(), v_client_id,
            format('Prospect %s reçu par le site web de l''agence (formulaire de contact).', v_reference));
  else
    insert into public.activity_events (organization_id, actor_id, at, client_id, text)
    values (v_org.id, v_owner, now(), v_client_id,
            left(format('Nouvelle demande reçue par le site web de l''agence. %s', replace(v_notes, E'\n', ' · ')), 600));
  end if;

  insert into public.tasks (organization_id, title, assigned_to, due_at, priority, status, client_id)
  values (v_org.id, left(format('Rappeler %s %s (demande du site web)', v_first, v_last), 160), v_owner, now(), 'high', 'todo', v_client_id);

  -- « Messages reçus » : le texte complet de la demande, tel qu'envoyé par le visiteur.
  insert into public.website_messages (
    organization_id, client_id, bureau_id, first_name, last_name, phone_e164, email, service, destination, message, is_new_client
  ) values (
    v_org.id, v_client_id, v_bureau, v_first, v_last, v_phone, v_email,
    coalesce(trim(p_service), ''), coalesce(trim(p_destination), ''), coalesce(trim(p_message), ''), v_new
  );

  perform set_config('select_agency.importing', 'off', true);
end;
$$;

-- Demandes déjà reçues avant cette mise à jour : retrouvées d'après les fiches créées par le formulaire.
-- « À traiter » si la fiche est encore un prospect avec sa tâche « Rappeler » ouverte, sinon « traitée ».
insert into public.website_messages (
  organization_id, client_id, bureau_id, first_name, last_name, phone_e164, email, service, destination, message,
  is_new_client, received_at, handled_at
)
select
  c.organization_id, c.id, c.bureau_id, c.first_name, c.last_name, coalesce(c.phone_e164, ''), c.email,
  left(coalesce(substring(c.notes from 'Service souhaité : ([^\n]*)'), ''), 120),
  left(coalesce(substring(c.notes from 'Destination : ([^\n]*)'), ''), 120),
  left(coalesce(substring(c.notes from 'Message : (.*)$'), ''), 1500),
  true,
  c.registered_at,
  case
    when c.status = 'prospect' and exists (
      select 1 from public.tasks t
      where t.client_id = c.id and t.status in ('todo', 'in_progress') and t.title like '%(demande du site web)'
    ) then null
    else now()
  end
from public.clients c
where c.source = 'website' and c.source_detail = 'Formulaire du site';
