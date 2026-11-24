-- SELECT Agency — Site web de l'agence (option des formules PRO et BUSINESS, ouverte pendant l'essai).
--
-- L'agence choisit un modèle de page, décrit son activité (l'IA rédige le site à partir de ce texte seulement),
-- modifie ce qu'elle veut, puis publie. Adresse : myselectagency.com/site/<nom-de-l-agence>.
--
-- - « draft » : le brouillon, modifié librement ; « published » : la copie mise en ligne au moment de « Publier ».
--   Une modification n'apparaît donc pas en ligne avant d'être publiée.
-- - Lecture publique du site : public_agency_website (visiteurs sans compte), seulement si le site est en ligne,
--   que l'option est incluse dans la formule et que l'agence n'est pas en lecture seule.
-- - Formulaire de contact du site : website_submit_lead crée un prospect (origine « Site web ») et une tâche
--   « Rappeler » pour le propriétaire, sans doublon pour un numéro déjà connu, avec des limites anti-abus.
-- - Images du site (logo, photo d'accueil) : bucket public « website-assets », écrit par le propriétaire et les
--   administrateurs de l'agence, dans le dossier de leur agence seulement.

-- 1. Option « website » --------------------------------------------------------------------------------------

create or replace function private.org_has_feature(p_org uuid, p_feature text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ok boolean;
begin
  if p_feature not in ('invoices', 'services', 'partners', 'auto_emails', 'custom_workflows', 'reports', 'ai_agent', 'website') then
    raise exception 'Option inconnue : %.', p_feature;
  end if;
  select o.is_demo
      or s.organization_id is null
      or s.status = 'trialing'
      or pl.tier is distinct from 'starter'
    into v_ok
  from public.organizations o
  left join public.subscriptions s on s.organization_id = o.id
  left join public.plans pl on pl.id = s.plan_id
  where o.id = p_org;
  return coalesce(v_ok, false);
end;
$$;

create or replace function private.feature_label(p_feature text) returns text
language sql immutable set search_path = '' as $$
  select case p_feature
    when 'invoices' then 'Les factures'
    when 'services' then 'Les services'
    when 'partners' then 'Les partenaires et commissions'
    when 'auto_emails' then 'Les e-mails automatiques'
    when 'custom_workflows' then 'Les modèles d''étapes personnalisés'
    when 'reports' then 'Les rapports et exports'
    when 'ai_agent' then 'L''Agent IA'
    when 'website' then 'Le site web de l''agence'
    else 'Cette option'
  end;
$$;

-- 2. Site de l'agence ----------------------------------------------------------------------------------------

create table public.agency_websites (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  -- Adresse : myselectagency.com/site/<slug> (lettres minuscules, chiffres et tirets).
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'),
  -- Description de l'agence donnée à l'IA : le site est rédigé à partir de ce texte seulement.
  brief text not null default '' check (char_length(brief) <= 6000),
  draft jsonb not null default '{}'::jsonb check (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 150000),
  published jsonb check (published is null or (jsonb_typeof(published) = 'object' and octet_length(published::text) <= 150000)),
  published_at timestamptz,
  is_online boolean not null default false,
  ai_generations_day date,
  ai_generations_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_online or published is not null)
);

create trigger agency_websites_touch before update on public.agency_websites
for each row execute function private.touch_updated_at();

alter table public.agency_websites enable row level security;
revoke all on public.agency_websites from anon;

-- Lecture par les membres de l'agence ; aucune écriture directe : tout passe par les fonctions ci-dessous.
create policy agency_websites_select on public.agency_websites for select to authenticated
  using (organization_id in (select private.member_org_ids_with_role(array['owner', 'admin', 'agent', 'accountant', 'viewer'])));

-- Adresses réservées (pages de l'application ou de SELECT).
create function private.website_slug_reserved(p_slug text) returns boolean
language sql immutable set search_path = '' as $$
  select p_slug in ('admin', 'api', 'app', 'site', 'www', 'select', 'selectagency', 'support', 'login', 'signup', 'aide', 'help', 'demo', 'test');
$$;

-- Enregistrer le brouillon (et l'adresse). Propriétaire et administrateurs, agence non en lecture seule.
create function public.save_agency_website(p_org uuid, p_slug text, p_brief text, p_draft jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_slug text := lower(trim(coalesce(p_slug, '')));
begin
  if not private.has_role(p_org, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs de l''agence modifient son site.';
  end if;
  perform private.require_feature(p_org, 'website');
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$' then
    raise exception 'Adresse du site invalide : de 3 à 48 caractères, lettres minuscules, chiffres et tirets.';
  end if;
  if private.website_slug_reserved(v_slug) then
    raise exception 'Cette adresse est réservée : choisissez-en une autre.';
  end if;
  if exists (select 1 from public.agency_websites w where w.slug = v_slug and w.organization_id <> p_org) then
    raise exception 'Cette adresse est déjà prise par une autre agence : choisissez-en une autre.';
  end if;
  if p_draft is null or jsonb_typeof(p_draft) <> 'object' then
    raise exception 'Contenu du site invalide.';
  end if;
  insert into public.agency_websites (organization_id, slug, brief, draft)
  values (p_org, v_slug, coalesce(p_brief, ''), p_draft)
  on conflict (organization_id) do update set slug = excluded.slug, brief = excluded.brief, draft = excluded.draft;
end;
$$;

-- Publier : le brouillon devient la version en ligne.
create function public.publish_agency_website(p_org uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_slug text;
begin
  if not private.has_role(p_org, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs de l''agence publient son site.';
  end if;
  perform private.require_feature(p_org, 'website');
  update public.agency_websites w set published = w.draft, published_at = now(), is_online = true
  where w.organization_id = p_org and w.draft <> '{}'::jsonb
  returning w.slug into v_slug;
  if v_slug is null then
    raise exception 'Créez et enregistrez d''abord le contenu du site.';
  end if;
  return v_slug;
end;
$$;

-- Mettre le site hors ligne (le brouillon et la dernière version publiée sont gardés).
create function public.unpublish_agency_website(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role(p_org, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs de l''agence gèrent son site.';
  end if;
  update public.agency_websites w set is_online = false where w.organization_id = p_org;
end;
$$;

-- Rédaction par l'IA : au plus 20 par jour et par agence (coût du service d'IA).
create function public.note_website_generation(p_org uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  if not private.has_role(p_org, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs de l''agence modifient son site.';
  end if;
  perform private.require_feature(p_org, 'website');
  update public.agency_websites w set
    ai_generations_count = case when w.ai_generations_day = current_date then w.ai_generations_count + 1 else 1 end,
    ai_generations_day = current_date
  where w.organization_id = p_org
  returning w.ai_generations_count into v_count;
  if v_count is null then
    raise exception 'Enregistrez d''abord l''adresse du site.';
  end if;
  if v_count > 20 then
    raise exception 'Limite atteinte : 20 rédactions par l''IA par jour. Modifiez le texte à la main, ou réessayez demain.';
  end if;
  return v_count;
end;
$$;

-- 3. Lecture publique ----------------------------------------------------------------------------------------

create function public.public_agency_website(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_site public.agency_websites;
  v_org public.organizations;
begin
  select * into v_site from public.agency_websites w
  where w.slug = lower(trim(coalesce(p_slug, ''))) and w.is_online and w.published is not null;
  if not found then
    return null;
  end if;
  if not private.org_has_feature(v_site.organization_id, 'website') or not private.org_can_write(v_site.organization_id) then
    return null;
  end if;
  select * into v_org from public.organizations o where o.id = v_site.organization_id;
  return jsonb_build_object(
    'slug', v_site.slug,
    'content', v_site.published,
    'published_at', v_site.published_at,
    'country_code', v_org.country_code
  );
end;
$$;

-- 4. Formulaire de contact du site -----------------------------------------------------------------------------

create function public.website_submit_lead(
  p_slug text, p_first_name text, p_last_name text, p_phone text, p_email text, p_service text, p_destination text, p_message text
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
      residence_country, city, assigned_to, status, source, source_detail, notes
    ) values (
      v_org.id, private.formatted_number(v_org.id, 'client', 'CLI'), 'individual', v_first, v_last, v_email, v_phone, v_phone,
      v_org.country_code, '', v_owner, 'prospect', 'website', 'Formulaire du site', v_notes
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

-- 5. Images du site : bucket public, écriture limitée au dossier de l'agence -------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('website-assets', 'website-assets', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy website_assets_select on storage.objects for select to authenticated
  using (bucket_id = 'website-assets' and private.document_path_allowed(name, array['owner', 'admin']));
create policy website_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'website-assets' and private.document_path_allowed(name, array['owner', 'admin']));
create policy website_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'website-assets' and private.document_path_allowed(name, array['owner', 'admin']));

-- Droits d'exécution -------------------------------------------------------------------------------------------

revoke all on function private.website_slug_reserved(text) from public, anon, authenticated;

revoke all on function
  public.save_agency_website(uuid, text, text, jsonb),
  public.publish_agency_website(uuid),
  public.unpublish_agency_website(uuid),
  public.note_website_generation(uuid),
  public.public_agency_website(text),
  public.website_submit_lead(text, text, text, text, text, text, text, text)
from public, anon;

grant execute on function
  public.save_agency_website(uuid, text, text, jsonb),
  public.publish_agency_website(uuid),
  public.unpublish_agency_website(uuid),
  public.note_website_generation(uuid)
to authenticated;

-- Le site et son formulaire sont publics : visiteurs sans compte compris.
grant execute on function
  public.public_agency_website(text),
  public.website_submit_lead(text, text, text, text, text, text, text, text)
to anon, authenticated;
