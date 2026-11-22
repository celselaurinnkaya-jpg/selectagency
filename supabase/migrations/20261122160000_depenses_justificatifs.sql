-- SELECT Agency — Justificatif et validation des dépenses (rapport de re-test du 22 novembre 2026).
--
-- - Justificatif : photo ou PDF du reçu, dans un bucket privé (« expense-receipts »), chemin {agence}/{horodatage}-{nom}.
--   Lisible par les rôles qui voient la finance ; jamais supprimé (il reste la preuve de la dépense).
-- - Seuil : l'agence peut rendre le justificatif obligatoire au-delà d'un montant (dans la devise de l'agence).
-- - Validation : une dépense saisie par un autre membre que le propriétaire est « à valider » ; seul le
--   propriétaire la valide ou la refuse (motif obligatoire). Seules les dépenses validées comptent dans les
--   chiffres. Les dépenses déjà enregistrées restent validées.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy select_expense_receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'expense-receipts' and private.document_path_allowed(name, array['owner', 'admin', 'agent', 'accountant']));

create policy select_expense_receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'expense-receipts' and private.document_path_allowed(name, array['owner', 'admin', 'agent', 'accountant']));

alter table public.expenses
  add column receipt_path text check (receipt_path is null or split_part(receipt_path, '/', 1) = organization_id::text),
  add column approval_status text not null default 'approved' check (approval_status in ('pending', 'approved', 'rejected')),
  add column reviewed_by uuid,
  add column reviewed_at timestamptz,
  add column review_note text check (review_note is null or char_length(review_note) <= 300);

create table public.expense_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  -- Justificatif obligatoire au-delà de ce montant (devise de l'agence) ; vide = jamais obligatoire.
  receipt_required_above_minor bigint check (receipt_required_above_minor is null or receipt_required_above_minor >= 0),
  updated_at timestamptz not null default now()
);

alter table public.expense_settings enable row level security;
revoke all on public.expense_settings from anon;
revoke insert, update, delete on public.expense_settings from authenticated;
grant select on public.expense_settings to authenticated;
create policy expense_settings_select on public.expense_settings for select to authenticated
  using (organization_id in (select private.member_org_ids_with_role(array['owner', 'admin', 'agent', 'accountant'])));

-- À l'enregistrement : statut de validation imposé par la base, justificatif vérifié, seuil appliqué.
create function private.check_new_expense() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_threshold bigint;
  v_currency text;
begin
  -- Import de l'agence de démonstration : dépenses déjà validées.
  if private.importing() then
    new.approval_status := coalesce(new.approval_status, 'approved');
    return new;
  end if;
  if private.has_role(new.organization_id, array['owner']) then
    new.approval_status := 'approved';
    new.reviewed_by := private.member_id(new.organization_id);
    new.reviewed_at := now();
  else
    new.approval_status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;
  new.review_note := null;

  if new.receipt_path is not null and not exists (
    select 1 from storage.objects o where o.bucket_id = 'expense-receipts' and o.name = new.receipt_path
  ) then
    raise exception 'Le justificatif n''a pas été reçu : renvoyez le fichier.';
  end if;

  select s.receipt_required_above_minor into v_threshold from public.expense_settings s where s.organization_id = new.organization_id;
  select o.currency into v_currency from public.organizations o where o.id = new.organization_id;
  if v_threshold is not null and new.currency = v_currency and new.amount_minor > v_threshold and new.receipt_path is null then
    raise exception 'Justificatif obligatoire pour cette dépense (au-delà du seuil fixé par l''agence) : joignez la photo ou le PDF du reçu.';
  end if;
  return new;
end;
$$;

create trigger expenses_check_new before insert on public.expenses
for each row execute function private.check_new_expense();

-- Validation par le propriétaire. Un refus exige un motif ; la dépense refusée reste visible, hors des chiffres.
create function public.review_expense(p_expense_id uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_expense public.expenses;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into v_expense from public.expenses e where e.id = p_expense_id for update;
  if not found or not private.has_role(v_expense.organization_id, array['owner', 'admin', 'agent', 'accountant']) then
    raise exception 'Dépense introuvable.';
  end if;
  if not private.has_role(v_expense.organization_id, array['owner']) then
    raise exception 'Seul le propriétaire de l''agence valide les dépenses.';
  end if;
  if v_expense.approval_status <> 'pending' then
    raise exception 'Cette dépense a déjà été examinée.';
  end if;
  if not coalesce(p_approve, false) and char_length(coalesce(v_note, '')) < 3 then
    raise exception 'Indiquez le motif du refus.';
  end if;
  update public.expenses e set
    approval_status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = private.member_id(v_expense.organization_id),
    reviewed_at = now(),
    review_note = case when p_approve then null else v_note end
  where e.id = v_expense.id;
end;
$$;

-- Seuil du justificatif obligatoire (propriétaire et administrateurs).
create function public.save_expense_settings(p_organization_id uuid, p_receipt_required_above_minor bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role(p_organization_id, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs fixent les règles des dépenses.';
  end if;
  if p_receipt_required_above_minor is not null and p_receipt_required_above_minor < 0 then
    raise exception 'Le seuil ne peut pas être négatif.';
  end if;
  insert into public.expense_settings as s (organization_id, receipt_required_above_minor)
  values (p_organization_id, p_receipt_required_above_minor)
  on conflict (organization_id) do update set receipt_required_above_minor = excluded.receipt_required_above_minor, updated_at = now();
end;
$$;

revoke all on function private.check_new_expense() from public, anon, authenticated;
revoke all on function public.review_expense(uuid, boolean, text), public.save_expense_settings(uuid, bigint) from public, anon;
grant execute on function public.review_expense(uuid, boolean, text), public.save_expense_settings(uuid, bigint) to authenticated;
