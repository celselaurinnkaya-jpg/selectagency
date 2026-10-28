-- SELECT Agency — Stockage des pièces des clients (Supabase Storage).
--
-- Bucket privé : aucun fichier n'a d'adresse publique. L'application crée des liens signés de
-- courte durée pour les consulter. Chemin imposé : {agence}/{dossier}/{pièce}/{horodatage}-{nom}.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Le premier dossier du chemin est l'agence : on compare en texte pour ne jamais échouer sur un
-- chemin mal formé.
create function private.document_path_allowed(p_name text, p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.user_id = (select auth.uid())
      and m.organization_id::text = split_part(p_name, '/', 1)
      and m.role = any (p_roles)
  );
$$;

revoke all on function private.document_path_allowed(text, text[]) from public;
grant execute on function private.document_path_allowed(text, text[]) to authenticated;

create policy select_agency_documents_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and private.document_path_allowed(name, array['owner', 'admin', 'agent', 'accountant']));

create policy select_agency_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and private.document_path_allowed(name, array['owner', 'admin', 'agent']));

create policy select_agency_documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and private.document_path_allowed(name, array['owner', 'admin', 'agent']));
