-- SELECT Agency — Pièces : plusieurs fichiers par pièce (recto-verso, plusieurs relevés…),
-- suppression d'un fichier, modification et retrait d'une pièce de la liste.
--
-- Les fichiers d'une pièce sont dans document_files (bucket privé « documents », même chemin
-- imposé {agence}/{dossier}/{pièce}/…). Les colonnes storage_path et file_name de la pièce restent
-- tenues à jour avec le dernier fichier reçu, pour les écrans qui ne lisent que celles-ci.
-- Toutes les écritures passent par des fonctions qui vérifient le rôle et l'abonnement (has_role).
-- Ajouter ou retirer un fichier remet la pièce « à vérifier » : son contenu a changé.

alter table public.document_requirements
  add constraint document_requirements_organization_id_id_key unique (organization_id, id);

create table public.document_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  requirement_id uuid not null,
  storage_path text not null unique check (char_length(storage_path) <= 400),
  file_name text not null check (char_length(file_name) between 1 and 200),
  uploaded_by uuid,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (organization_id, requirement_id) references public.document_requirements (organization_id, id) on delete cascade,
  foreign key (organization_id, uploaded_by) references public.members (organization_id, id)
);

create index document_files_requirement_idx on public.document_files (organization_id, requirement_id, created_at);
create index document_files_uploaded_by_idx on public.document_files (organization_id, uploaded_by);

alter table public.document_files enable row level security;
revoke all on public.document_files from anon;
revoke insert, update, delete on public.document_files from authenticated;
grant select on public.document_files to authenticated;

-- Mêmes lecteurs que les pièces elles-mêmes dans Storage (pas la lecture seule).
create policy document_files_select on public.document_files for select to authenticated
  using (organization_id in (select private.member_org_ids_with_role(array['owner', 'admin', 'agent', 'accountant'])));

-- Reprise des fichiers déjà reçus (un par pièce jusqu'ici).
insert into public.document_files (organization_id, requirement_id, storage_path, file_name, created_at)
select r.organization_id, r.id, r.storage_path, coalesce(nullif(trim(r.file_name), ''), 'document'), coalesce(r.received_at, r.created_at)
from public.document_requirements r
where r.storage_path is not null
on conflict (storage_path) do nothing;

-- Pièce modifiable par la personne connectée (propriétaire, administrateur ou conseiller d'une
-- agence qui peut écrire), dans un dossier actif. Verrouillée pour la suite de l'opération.
create function private.editable_requirement(p_requirement_id uuid) returns public.document_requirements
language plpgsql security definer set search_path = '' as $$
declare
  v_req public.document_requirements;
begin
  select * into v_req from public.document_requirements r where r.id = p_requirement_id for update;
  if not found or not private.has_role(v_req.organization_id, array['owner', 'admin', 'agent']) then
    raise exception 'Pièce introuvable, ou vous n''avez pas le droit de la modifier.';
  end if;
  if not exists (select 1 from public.cases c where c.id = v_req.case_id and c.status = 'active') then
    raise exception 'Ce dossier n''est plus actif : sa liste de pièces n''est pas modifiable.';
  end if;
  return v_req;
end;
$$;

create function private.log_requirement_event(p_req public.document_requirements, p_event text) returns void
language sql security definer set search_path = '' as $$
  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  select p_req.organization_id, private.member_id(p_req.organization_id), c.client_id, c.id, p_event
  from public.cases c where c.id = p_req.case_id;
$$;

-- Ajoute un fichier déposé par le navigateur dans Storage à une pièce.
create function public.add_requirement_file(p_requirement_id uuid, p_storage_path text, p_file_name text, p_event text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_req public.document_requirements := private.editable_requirement(p_requirement_id);
  v_id uuid;
begin
  if p_storage_path not like v_req.organization_id || '/' || v_req.case_id || '/' || v_req.id || '/%' then
    raise exception 'Emplacement du fichier invalide.';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name = p_storage_path) then
    raise exception 'Le fichier n''a pas été reçu. Recommencez l''envoi.';
  end if;
  if (select count(*) from public.document_files f where f.requirement_id = v_req.id) >= 20 then
    raise exception 'Une pièce compte au plus 20 fichiers : retirez-en un avant d''en ajouter.';
  end if;

  insert into public.document_files (organization_id, requirement_id, storage_path, file_name, uploaded_by)
  values (v_req.organization_id, v_req.id, p_storage_path, left(trim(p_file_name), 200), private.member_id(v_req.organization_id))
  returning id into v_id;

  update public.document_requirements r set
    status = 'received', storage_path = p_storage_path, file_name = left(trim(p_file_name), 200), received_at = now(),
    review_comment = null, reviewed_at = null, reviewed_by = null
  where r.id = v_req.id;

  perform private.log_requirement_event(v_req, p_event);
  return v_id;
end;
$$;

-- Retire un fichier d'une pièce. Renvoie son emplacement, que l'application supprime de Storage.
-- Sans fichier restant, la pièce redevient « non reçue » ; sinon une pièce vérifiée redevient « reçue ».
create function public.remove_requirement_file(p_file_id uuid, p_event text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_file public.document_files;
  v_req public.document_requirements;
  v_last public.document_files;
begin
  select * into v_file from public.document_files f where f.id = p_file_id;
  -- Même réponse qu'il n'existe pas ou qu'il appartienne à une autre agence.
  if not found or not private.has_role(v_file.organization_id, array['owner', 'admin', 'agent']) then
    raise exception 'Fichier introuvable, ou vous n''avez pas le droit de le supprimer.';
  end if;
  v_req := private.editable_requirement(v_file.requirement_id);

  delete from public.document_files f where f.id = v_file.id;
  select * into v_last from public.document_files f where f.requirement_id = v_req.id order by f.created_at desc limit 1;

  if v_last.id is null then
    update public.document_requirements r set
      status = 'not_received', storage_path = null, file_name = null, received_at = null,
      review_comment = null, reviewed_at = null, reviewed_by = null
    where r.id = v_req.id;
  else
    update public.document_requirements r set
      storage_path = v_last.storage_path, file_name = v_last.file_name,
      status = case when r.status = 'validated' then 'received' else r.status end,
      reviewed_at = case when r.status = 'validated' then null else r.reviewed_at end,
      reviewed_by = case when r.status = 'validated' then null else r.reviewed_by end
    where r.id = v_req.id;
  end if;

  perform private.log_requirement_event(v_req, p_event);
  return v_file.storage_path;
end;
$$;

-- Modifie le nom, le caractère obligatoire et la date d'expiration d'une pièce.
create function public.update_requirement(p_requirement_id uuid, p_label text, p_is_required boolean, p_expires_at date, p_event text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_req public.document_requirements := private.editable_requirement(p_requirement_id);
begin
  if char_length(trim(coalesce(p_label, ''))) < 2 then
    raise exception 'Indiquez le nom de la pièce.';
  end if;
  update public.document_requirements r set
    label = left(trim(p_label), 160), is_required = coalesce(p_is_required, r.is_required), expires_at = p_expires_at
  where r.id = v_req.id;
  perform private.log_requirement_event(v_req, p_event);
end;
$$;

-- Retire une pièce de la liste du dossier, avec ses fichiers. Renvoie leurs emplacements, que
-- l'application supprime de Storage.
create function public.delete_requirement(p_requirement_id uuid, p_event text) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  v_req public.document_requirements := private.editable_requirement(p_requirement_id);
  v_paths text[];
begin
  select coalesce(array_agg(f.storage_path), '{}') into v_paths from public.document_files f where f.requirement_id = v_req.id;
  if v_req.storage_path is not null and not v_req.storage_path = any (v_paths) then
    v_paths := v_paths || v_req.storage_path;
  end if;
  delete from public.document_requirements r where r.id = v_req.id;
  perform private.log_requirement_event(v_req, p_event);
  return v_paths;
end;
$$;

-- register_requirement_file (versions précédentes de l'application) : même contrat qu'avant —
-- le nouveau fichier remplace l'ancien, dont l'emplacement est renvoyé pour suppression —, mais
-- tenu en cohérence avec document_files.
create or replace function public.register_requirement_file(p_requirement_id uuid, p_storage_path text, p_file_name text, p_event text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_req public.document_requirements;
begin
  select * into v_req from public.document_requirements r where r.id = p_requirement_id for update;
  if not found or not private.has_role(v_req.organization_id, array['owner', 'admin', 'agent']) then
    raise exception 'Pièce introuvable, ou vous n''avez pas le droit de la modifier.';
  end if;
  if p_storage_path not like v_req.organization_id || '/' || v_req.case_id || '/' || v_req.id || '/%' then
    raise exception 'Emplacement du fichier invalide.';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name = p_storage_path) then
    raise exception 'Le fichier n''a pas été reçu. Recommencez l''envoi.';
  end if;

  delete from public.document_files f where f.requirement_id = v_req.id and f.storage_path = v_req.storage_path;
  insert into public.document_files (organization_id, requirement_id, storage_path, file_name, uploaded_by)
  values (v_req.organization_id, v_req.id, p_storage_path, left(p_file_name, 200), private.member_id(v_req.organization_id))
  on conflict (storage_path) do nothing;

  update public.document_requirements r set
    status = 'received', file_name = left(p_file_name, 200), storage_path = p_storage_path, received_at = now(),
    review_comment = null, reviewed_at = null, reviewed_by = null
  where r.id = p_requirement_id;

  perform private.log_requirement_event(v_req, p_event);
  return v_req.storage_path;
end;
$$;

revoke all on function
  private.editable_requirement(uuid),
  private.log_requirement_event(public.document_requirements, text)
from public, anon, authenticated;

revoke all on function
  public.add_requirement_file(uuid, text, text, text),
  public.remove_requirement_file(uuid, text),
  public.update_requirement(uuid, text, boolean, date, text),
  public.delete_requirement(uuid, text)
from public, anon;

grant execute on function
  public.add_requirement_file(uuid, text, text, text),
  public.remove_requirement_file(uuid, text),
  public.update_requirement(uuid, text, boolean, date, text),
  public.delete_requirement(uuid, text)
to authenticated;
