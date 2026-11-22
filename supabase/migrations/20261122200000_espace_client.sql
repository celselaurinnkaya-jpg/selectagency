-- SELECT Agency — Espace client (rapport de test du 21/11, fonctionnalité 9 ; plan v2, point 17).
--
-- Sur le modèle de l'espace partenaire : l'agence crée un lien personnel lié à une adresse e-mail ; le client crée
-- son compte avec cette adresse et ouvre son espace. Il y voit, en lecture seule, l'avancement de ses dossiers
-- (étapes, pièces attendues, prochain rendez-vous) et y dépose lui-même ses pièces manquantes ou à corriger.
-- Il ne voit jamais : les montants, les notes internes, les justificatifs des étapes, ni les autres clients.
-- L'accès est gardé dans une table à part (et non dans la fiche client) : la fiche client n'est pas modifiée.

create table public.client_portal_access (
  client_id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  token uuid unique,
  user_id uuid references auth.users (id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete cascade
);

create index client_portal_access_user_idx on public.client_portal_access (user_id);
alter table public.client_portal_access enable row level security;
revoke all on public.client_portal_access from anon;
revoke insert, update, delete on public.client_portal_access from authenticated;
grant select on public.client_portal_access to authenticated;
-- L'agence voit si un client a ouvert son espace (le jeton n'est utile qu'à elle, pour retransmettre le lien).
create policy client_portal_access_select on public.client_portal_access for select to authenticated
  using (organization_id in (select private.member_org_ids_with_role(array['owner', 'admin', 'agent'])));

-- Agence : ouvre (ou renouvelle) le lien personnel d'un client.
create function public.create_client_portal_access(p_client_id uuid, p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_client public.clients;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_token uuid := gen_random_uuid();
begin
  select * into v_client from public.clients c where c.id = p_client_id;
  if not found or not private.has_role(v_client.organization_id, array['owner', 'admin', 'agent']) then
    raise exception 'Client introuvable, ou vous n''avez pas le droit d''ouvrir son espace.';
  end if;
  if v_client.is_demo_fixture then
    raise exception 'Un client fictif de la démonstration n''a pas d''espace client.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse e-mail invalide.';
  end if;
  insert into public.client_portal_access as a (client_id, organization_id, email, token, created_by)
  values (v_client.id, v_client.organization_id, v_email, v_token, private.member_id(v_client.organization_id))
  on conflict (client_id) do update set
    email = excluded.email,
    token = excluded.token,
    created_by = excluded.created_by,
    created_at = now(),
    -- Nouvelle adresse : l'ancien compte perd l'accès ; même adresse : il le garde.
    user_id = case when a.email = excluded.email then a.user_id end,
    accepted_at = case when a.email = excluded.email then a.accepted_at end;
  return v_token;
end;
$$;

create function public.revoke_client_portal_access(p_client_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_access public.client_portal_access;
begin
  select * into v_access from public.client_portal_access a where a.client_id = p_client_id;
  if not found or not private.has_role(v_access.organization_id, array['owner', 'admin', 'agent']) then
    raise exception 'Espace client introuvable.';
  end if;
  delete from public.client_portal_access a where a.client_id = p_client_id;
end;
$$;

-- Ce que voit la personne qui ouvre le lien (le jeton fait office de secret).
create function public.get_client_portal_access(p_token uuid)
returns table (agency_name text, client_first_name text, email text)
language sql stable security definer set search_path = '' as $$
  select o.name, c.first_name, a.email
  from public.client_portal_access a
  join public.clients c on c.id = a.client_id
  join public.organizations o on o.id = a.organization_id
  where a.token = p_token;
$$;

create function public.accept_client_portal_access(p_token uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_access public.client_portal_access;
begin
  if v_uid is null then
    raise exception 'Connectez-vous pour ouvrir votre espace client.';
  end if;
  select * into v_access from public.client_portal_access a where a.token = p_token for update;
  if not found then
    raise exception 'Lien introuvable ou déjà utilisé : demandez-en un nouveau à l''agence.';
  end if;
  if v_access.email <> v_email then
    raise exception 'Ce lien est destiné à une autre adresse e-mail (%).', v_access.email;
  end if;
  update public.client_portal_access a set user_id = v_uid, token = null, accepted_at = now() where a.client_id = v_access.client_id;
end;
$$;

create function public.is_portal_client() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.client_portal_access a where a.user_id = auth.uid());
$$;

-- Espace client : avancement des dossiers, pièces attendues et prochain rendez-vous. Rien d'autre.
create function public.client_portal() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'organization_id', o.id,
    'agency_name', o.name,
    'agency_timezone', o.timezone,
    'agency_phone', coalesce(inv.phone, ''),
    'agency_email', coalesce(inv.email, ''),
    'client_first_name', cl.first_name,
    'cases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'reference', c.reference,
        'title', c.title,
        'status', c.status,
        'outcome', c.outcome,
        'destination_country', c.destination_country,
        'steps', coalesce((
          select jsonb_agg(jsonb_build_object('label', s.label, 'status', s.status, 'kind', s.kind) order by s.position)
          from public.case_steps s where s.case_id = c.id
        ), '[]'::jsonb),
        'requirements', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', r.id,
            'label', r.label,
            'status', r.status,
            'is_required', r.is_required,
            'comment', case when r.status = 'to_correct' then r.review_comment end
          ) order by r.is_required desc, r.label)
          from public.document_requirements r where r.case_id = c.id and r.status <> 'waived'
        ), '[]'::jsonb),
        'next_appointment', (
          select jsonb_build_object('title', ap.title, 'starts_at', ap.starts_at, 'all_day', ap.all_day, 'location', ap.location)
          from public.appointments ap
          where ap.case_id = c.id and ap.status in ('planned', 'awaiting_confirmation', 'confirmed') and ap.starts_at > now()
          order by ap.starts_at limit 1
        )
      ) order by c.opened_at desc)
      from public.cases c where c.client_id = cl.id and c.status in ('active', 'on_hold', 'closed')
    ), '[]'::jsonb)
  ) order by o.name), '[]'::jsonb)
  from public.client_portal_access a
  join public.clients cl on cl.id = a.client_id
  join public.organizations o on o.id = a.organization_id
  left join public.invoice_settings inv on inv.organization_id = o.id
  where a.user_id = auth.uid();
$$;

-- Dépôt d'une pièce par le client : seulement une pièce de SES dossiers en cours, encore attendue.
create function private.portal_requirement(p_requirement_id uuid) returns public.document_requirements
language plpgsql stable security definer set search_path = '' as $$
declare
  v_req public.document_requirements;
begin
  select r.* into v_req
  from public.document_requirements r
  join public.cases c on c.id = r.case_id and c.organization_id = r.organization_id
  join public.client_portal_access a on a.client_id = c.client_id and a.organization_id = c.organization_id
  where r.id = p_requirement_id and a.user_id = auth.uid() and c.status = 'active'
    and r.status in ('not_received', 'to_correct', 'expired');
  if v_req.id is null then
    raise exception 'Pièce introuvable, ou elle n''est plus attendue.';
  end if;
  return v_req;
end;
$$;

create function private.portal_document_path_allowed(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.document_requirements r
    join public.cases c on c.id = r.case_id and c.organization_id = r.organization_id
    join public.client_portal_access a on a.client_id = c.client_id and a.organization_id = c.organization_id
    where a.user_id = (select auth.uid())
      and c.status = 'active'
      and r.status in ('not_received', 'to_correct', 'expired')
      and split_part(p_name, '/', 1) = r.organization_id::text
      and split_part(p_name, '/', 2) = c.id::text
      and split_part(p_name, '/', 3) = r.id::text
  );
$$;

revoke all on function private.portal_document_path_allowed(text) from public;
grant execute on function private.portal_document_path_allowed(text) to authenticated;

-- Le client dépose ses fichiers dans le bucket privé des pièces ; il ne peut ni les relire ni les supprimer.
create policy select_agency_documents_portal_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and private.portal_document_path_allowed(name));

create function public.portal_add_requirement_file(p_requirement_id uuid, p_storage_path text, p_file_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_req public.document_requirements := private.portal_requirement(p_requirement_id);
  v_case public.cases;
  v_id uuid;
  v_name text := left(trim(coalesce(p_file_name, '')), 200);
begin
  if p_storage_path not like v_req.organization_id || '/' || v_req.case_id || '/' || v_req.id || '/%' then
    raise exception 'Emplacement du fichier invalide.';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name = p_storage_path) then
    raise exception 'Le fichier n''a pas été reçu. Recommencez l''envoi.';
  end if;
  if (select count(*) from public.document_files f where f.requirement_id = v_req.id) >= 20 then
    raise exception 'Cette pièce a déjà 20 fichiers : contactez l''agence.';
  end if;
  if v_name = '' then
    v_name := 'document';
  end if;
  select * into v_case from public.cases c where c.id = v_req.case_id;

  insert into public.document_files (organization_id, requirement_id, storage_path, file_name, uploaded_by)
  values (v_req.organization_id, v_req.id, p_storage_path, v_name, null)
  returning id into v_id;

  update public.document_requirements r set
    status = 'received', storage_path = p_storage_path, file_name = v_name, received_at = now(),
    review_comment = null, reviewed_at = null, reviewed_by = null
  where r.id = v_req.id;

  -- Historique du dossier : l'auteur est le client (écrit en toutes lettres) ; la ligne est rattachée au
  -- conseiller du dossier, seul membre de l'agence concerné. Écriture système (comme les e-mails automatiques) :
  -- le client n'est pas membre de l'agence.
  perform set_config('select_agency.system_email', 'on', true);
  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (
    v_req.organization_id, v_case.assigned_to, v_case.client_id, v_case.id,
    format('Document déposé par le client depuis son espace : %s (%s), à vérifier.', v_req.label, v_name)
  );
  perform set_config('select_agency.system_email', 'off', true);
  return v_id;
end;
$$;

revoke all on function private.portal_requirement(uuid) from public, anon, authenticated;
revoke all on function
  public.create_client_portal_access(uuid, text),
  public.revoke_client_portal_access(uuid),
  public.get_client_portal_access(uuid),
  public.accept_client_portal_access(uuid),
  public.is_portal_client(),
  public.client_portal(),
  public.portal_add_requirement_file(uuid, text, text)
from public, anon;
grant execute on function
  public.create_client_portal_access(uuid, text),
  public.revoke_client_portal_access(uuid),
  public.get_client_portal_access(uuid),
  public.accept_client_portal_access(uuid),
  public.is_portal_client(),
  public.client_portal(),
  public.portal_add_requirement_file(uuid, text, text)
to authenticated;
grant execute on function public.get_client_portal_access(uuid) to anon;
