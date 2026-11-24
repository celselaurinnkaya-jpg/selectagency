-- Site web de l'agence : corrections du rapport de test du 23/11/2026.
--
-- 1. Le service choisi dans le formulaire du site remplit le « Projet » de la fiche prospect (service_motive).
-- 2. website_is_online : vérification légère (oui / non) d'une adresse, pour répondre « 404 » quand le site
--    n'existe pas ou est hors ligne (avant, la page répondait 200 avec un message).
-- 3. public_website_slugs : liste des sites en ligne, pour le plan du site (sitemap) lu par Google.

-- 1. Formulaire du site : même fonction, avec le projet du prospect en plus.
drop function public.website_submit_lead(text, text, text, text, text, text, text, text);

create function public.website_submit_lead(
  p_slug text, p_first_name text, p_last_name text, p_phone text, p_email text, p_service text, p_destination text, p_message text,
  p_service_motive text default null
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
  v_client_id uuid;
  v_reference text;
  v_notes text;
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
    case when coalesce(trim(p_service), '') <> '' then 'Service souhaité : ' || trim(p_service) end,
    case when coalesce(trim(p_destination), '') <> '' then 'Destination : ' || trim(p_destination) end,
    case when coalesce(trim(p_message), '') <> '' then 'Message : ' || trim(p_message) end
  ), 2000);

  -- Écriture « système » : pas de membre connecté (visiteur du site). Les historiques sont écrits ci-dessous,
  -- au nom du propriétaire de l'agence, qui reçoit la demande.
  perform set_config('select_agency.importing', 'on', true);

  -- Numéro déjà connu (client ou prospect) : pas de doublon, la demande est ajoutée à sa fiche.
  select c.id, c.reference into v_client_id, v_reference from public.clients c
  where c.organization_id = v_org.id and c.phone_e164 = v_phone and c.archived_at is null
  order by c.registered_at limit 1;

  if v_client_id is null then
    insert into public.clients (
      organization_id, reference, client_type, first_name, last_name, email, phone_e164, whatsapp_e164,
      residence_country, city, assigned_to, status, source, source_detail, notes, service_motive
    ) values (
      v_org.id, private.formatted_number(v_org.id, 'client', 'CLI'), 'individual', v_first, v_last, v_email, v_phone, v_phone,
      v_org.country_code, '', v_owner, 'prospect', 'website', 'Formulaire du site', v_notes, v_motive
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

  perform set_config('select_agency.importing', 'off', true);
end;
$$;

-- 2. Le site existe-t-il et est-il en ligne ? (réponse « 404 » sinon)
create function public.website_is_online(p_slug text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.agency_websites w
    where w.slug = lower(trim(coalesce(p_slug, ''))) and w.is_online and w.published is not null
      and private.org_has_feature(w.organization_id, 'website') and private.org_can_write(w.organization_id)
  );
$$;

-- 3. Sites en ligne, pour le plan du site.
create function public.public_website_slugs()
returns table (slug text, published_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select w.slug, w.published_at from public.agency_websites w
  where w.is_online and w.published is not null
    and private.org_has_feature(w.organization_id, 'website') and private.org_can_write(w.organization_id)
  order by w.published_at desc
  limit 5000;
$$;

revoke all on function
  public.website_submit_lead(text, text, text, text, text, text, text, text, text),
  public.website_is_online(text),
  public.public_website_slugs()
from public;

grant execute on function
  public.website_submit_lead(text, text, text, text, text, text, text, text, text),
  public.website_is_online(text),
  public.public_website_slugs()
to anon, authenticated;
