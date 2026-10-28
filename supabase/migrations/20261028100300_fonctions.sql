-- SELECT Agency — Fonctions appelées par l'application (RPC).
--
-- Une écriture composée (plusieurs tables) passe par une fonction : elle s'exécute dans une seule
-- transaction. Les fonctions « security invoker » restent soumises à la RLS ; les fonctions
-- « security definer » contrôlent elles-mêmes l'appartenance et le rôle, explicitement.
-- Les messages d'erreur sont écrits pour être affichés tels quels à l'utilisateur.

-- Agences ---------------------------------------------------------------------------------------

-- Un compte appartient à une seule agence (règle de lancement).
create function public.create_organization(
  p_name text,
  p_city text,
  p_country_code text,
  p_currency text,
  p_timezone text,
  p_receipt_prefix text,
  p_full_name text,
  p_job_title text,
  p_is_demo boolean default false,
  p_member_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'Connectez-vous pour créer une agence.';
  end if;
  if exists (select 1 from public.members m where m.user_id = v_uid) then
    raise exception 'Votre compte est déjà rattaché à une agence.';
  end if;

  insert into public.organizations (name, city, country_code, currency, timezone, receipt_prefix, is_demo, created_by)
  values (trim(p_name), trim(coalesce(p_city, '')), p_country_code, p_currency, p_timezone, p_receipt_prefix, coalesce(p_is_demo, false), v_uid)
  returning id into v_org;

  insert into public.members (id, organization_id, user_id, full_name, email, role, job_title)
  values (coalesce(p_member_id, gen_random_uuid()), v_org, v_uid, trim(p_full_name), lower(coalesce(auth.jwt() ->> 'email', '')), 'owner', trim(coalesce(p_job_title, '')));

  return v_org;
end;
$$;

-- Force l'agence (et d'éventuels champs) sur chaque élément d'un tableau JSON.
create function private.with_org(p_items jsonb, p_org uuid, p_extra jsonb default '{}') returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(e || jsonb_build_object('organization_id', p_org) || p_extra), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e;
$$;

-- Remplit une agence de démonstration avec les données fictives préparées par l'application.
-- Réservé au propriétaire, aux agences marquées « démonstration » et encore vides. Les collègues
-- fictifs n'ont jamais de compte (user_id forcé à vide) ; l'agence est forcée sur chaque ligne.
create function public.import_demo_data(p_org uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role(p_org, array['owner']) then
    raise exception 'Action réservée au propriétaire de l''agence.';
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_org and o.is_demo) then
    raise exception 'Les données fictives ne peuvent être chargées que dans une agence de démonstration.';
  end if;
  if exists (select 1 from public.clients c where c.organization_id = p_org) then
    raise exception 'Cette agence contient déjà des données.';
  end if;

  perform set_config('select_agency.importing', 'on', true);

  insert into public.members
    select * from jsonb_populate_recordset(null::public.members, private.with_org(p_data -> 'members', p_org, '{"user_id": null}'));
  insert into public.clients
    select * from jsonb_populate_recordset(null::public.clients, private.with_org(p_data -> 'clients', p_org));
  insert into public.cases
    select * from jsonb_populate_recordset(null::public.cases, private.with_org(p_data -> 'cases', p_org));
  insert into public.case_steps
    select * from jsonb_populate_recordset(null::public.case_steps, private.with_org(p_data -> 'case_steps', p_org));
  insert into public.document_requirements
    select * from jsonb_populate_recordset(null::public.document_requirements, private.with_org(p_data -> 'document_requirements', p_org, '{"storage_path": null}'));
  insert into public.appointments
    select * from jsonb_populate_recordset(null::public.appointments, private.with_org(p_data -> 'appointments', p_org));
  insert into public.tasks
    select * from jsonb_populate_recordset(null::public.tasks, private.with_org(p_data -> 'tasks', p_org));
  insert into public.charges
    select * from jsonb_populate_recordset(null::public.charges, private.with_org(p_data -> 'charges', p_org));
  insert into public.payments
    select * from jsonb_populate_recordset(null::public.payments, private.with_org(p_data -> 'payments', p_org));
  insert into public.payment_allocations
    select * from jsonb_populate_recordset(null::public.payment_allocations, private.with_org(p_data -> 'payment_allocations', p_org));
  insert into public.expenses
    select * from jsonb_populate_recordset(null::public.expenses, private.with_org(p_data -> 'expenses', p_org));
  insert into public.activity_events
    select * from jsonb_populate_recordset(null::public.activity_events, private.with_org(p_data -> 'activity_events', p_org));

  insert into private.counters (organization_id, kind, value)
    select p_org, c.key, c.value::bigint from jsonb_each_text(coalesce(p_data -> 'counters', '{}'::jsonb)) c
  on conflict (organization_id, kind) do update set value = excluded.value;

  perform set_config('select_agency.importing', 'off', true);
end;
$$;

-- Crée l'agence de démonstration et la remplit en une seule transaction : si l'import échoue, rien
-- n'est créé et le compte reste libre. p_member_id est l'identifiant (préparé par l'application)
-- que les données fictives utilisent pour le propriétaire.
create function public.create_demo_organization(p_name text, p_full_name text, p_member_id uuid, p_data jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  v_org := public.create_organization(p_name, 'Douala', 'CM', 'XAF', 'Africa/Douala', 'REC', p_full_name, 'Directeur d''agence', true, p_member_id);
  perform public.import_demo_data(v_org, p_data);
  return v_org;
end;
$$;

-- Supprime l'agence de démonstration de la personne connectée (propriétaire), avec toutes ses
-- données fictives, pour qu'elle puisse ensuite créer sa vraie agence.
create function public.leave_demo_organization() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select m.organization_id into v_org
  from public.members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = auth.uid() and m.role = 'owner' and o.is_demo;
  if v_org is null then
    raise exception 'Seul le propriétaire d''une agence de démonstration peut la supprimer.';
  end if;
  delete from public.organizations o where o.id = v_org;
end;
$$;

-- Dossiers --------------------------------------------------------------------------------------

-- Ouvre un dossier avec sa copie du modèle d'étapes et sa liste de pièces (préparées par
-- l'application à partir des modèles). Le numéro DOS-… est attribué par la base.
create function public.create_case(p_case jsonb, p_steps jsonb, p_requirements jsonb, p_template_name text)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_case public.cases;
begin
  insert into public.cases (
    organization_id, client_id, category, title, destination_country, residence_country, priority,
    assigned_to, next_action, next_action_due_at, planned_departure_date, billing_currency,
    applicant_tags, details, template_key
  )
  select
    r.organization_id, r.client_id, r.category, r.title, r.destination_country, coalesce(r.residence_country, ''),
    coalesce(r.priority, 'normal'), r.assigned_to, r.next_action, r.next_action_due_at, r.planned_departure_date,
    r.billing_currency, coalesce(r.applicant_tags, '{}'), coalesce(r.details, '{}'), r.template_key
  from jsonb_populate_record(null::public.cases, p_case) r
  returning * into v_case;

  insert into public.case_steps (
    organization_id, case_id, position, key, label, kind, is_optional, outcome, next, status, confirmation_level
  )
  select
    v_case.organization_id, v_case.id, s.position, s.key, s.label, s.kind, coalesce(s.is_optional, false),
    s.outcome, s.next, coalesce(s.status, 'pending'), s.confirmation_level
  from jsonb_populate_recordset(null::public.case_steps, coalesce(p_steps, '[]'::jsonb)) s;

  insert into public.document_requirements (organization_id, case_id, document_type_code, label, category, is_required, status)
  select v_case.organization_id, v_case.id, d.document_type_code, d.label, coalesce(d.category, ''), coalesce(d.is_required, true), 'not_received'
  from jsonb_populate_recordset(null::public.document_requirements, coalesce(p_requirements, '[]'::jsonb)) d;

  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (
    v_case.organization_id, private.member_id(v_case.organization_id), v_case.client_id, v_case.id,
    format('Dossier %s ouvert (%s).', v_case.reference, p_template_name)
  );

  return jsonb_build_object('id', v_case.id, 'reference', v_case.reference);
end;
$$;

-- Enregistre un changement d'étape calculé par l'application (règles de src/features/workflows).
-- p_version doit être la version lue avant le calcul : sinon quelqu'un a modifié le dossier entre-temps.
create function public.apply_case_transition(p_case_id uuid, p_version integer, p_steps jsonb, p_case jsonb, p_event text)
returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_case public.cases;
begin
  select * into v_case from public.cases c where c.id = p_case_id for update;
  if not found then
    raise exception 'Dossier introuvable, ou vous n''avez pas le droit de le modifier.';
  end if;
  if v_case.status <> 'active' then
    raise exception 'Ce dossier n''est pas modifiable.';
  end if;
  if v_case.version <> p_version then
    raise exception 'Ce dossier vient d''être modifié par une autre personne. Rechargez la page, puis recommencez.';
  end if;

  update public.case_steps s set
    status = x.status,
    confirmation_level = x.confirmation_level,
    evidence_ref = x.evidence_ref,
    source_note = x.source_note,
    note = x.note,
    completed_at = x.completed_at,
    completed_by = x.completed_by
  from jsonb_populate_recordset(null::public.case_steps, p_steps) x
  where s.id = x.id and s.case_id = p_case_id;

  update public.cases c set
    status = coalesce(p_case ->> 'status', c.status),
    outcome = coalesce(p_case ->> 'outcome', c.outcome),
    next_action = case when p_case ? 'next_action' then p_case ->> 'next_action' else c.next_action end,
    next_action_due_at = case when p_case ? 'next_action_due_at' then (p_case ->> 'next_action_due_at')::timestamptz else c.next_action_due_at end,
    closed_at = case when p_case ? 'closed_at' then (p_case ->> 'closed_at')::timestamptz else c.closed_at end,
    version = c.version + 1
  where c.id = p_case_id;

  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (v_case.organization_id, private.member_id(v_case.organization_id), v_case.client_id, v_case.id, p_event);

  return v_case.version + 1;
end;
$$;

-- Pièces ----------------------------------------------------------------------------------------

-- Vérification interne d'une pièce (« vérifiée par l'agence » n'est jamais une validation officielle).
create function public.review_requirement(p_requirement_id uuid, p_decision text, p_comment text, p_event text)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_req public.document_requirements;
  v_client uuid;
begin
  if p_decision not in ('validated', 'to_correct') then
    raise exception 'Décision inconnue.';
  end if;
  select * into v_req from public.document_requirements r where r.id = p_requirement_id for update;
  if not found then
    raise exception 'Pièce introuvable, ou vous n''avez pas le droit de la modifier.';
  end if;
  if v_req.status not in ('received', 'to_verify') then
    raise exception 'Cette pièce n''est pas en attente de vérification.';
  end if;

  update public.document_requirements r set
    status = p_decision,
    reviewed_at = now(),
    reviewed_by = private.member_id(v_req.organization_id),
    review_comment = case when p_decision = 'to_correct' then p_comment end
  where r.id = p_requirement_id;

  select c.client_id into v_client from public.cases c where c.id = v_req.case_id;
  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (v_req.organization_id, private.member_id(v_req.organization_id), v_client, v_req.case_id, p_event);
end;
$$;

-- Rattache à une pièce le fichier que le navigateur vient de déposer dans Storage.
-- Le chemin doit être « agence/dossier/pièce/… » et le fichier doit exister.
create function public.register_requirement_file(p_requirement_id uuid, p_storage_path text, p_file_name text, p_event text)
returns text
language plpgsql security invoker set search_path = '' as $$
declare
  v_req public.document_requirements;
  v_client uuid;
begin
  select * into v_req from public.document_requirements r where r.id = p_requirement_id for update;
  if not found then
    raise exception 'Pièce introuvable, ou vous n''avez pas le droit de la modifier.';
  end if;
  if p_storage_path not like v_req.organization_id || '/' || v_req.case_id || '/' || v_req.id || '/%' then
    raise exception 'Emplacement du fichier invalide.';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name = p_storage_path) then
    raise exception 'Le fichier n''a pas été reçu. Recommencez l''envoi.';
  end if;

  update public.document_requirements r set
    status = 'received',
    file_name = left(p_file_name, 200),
    storage_path = p_storage_path,
    received_at = now(),
    review_comment = null,
    reviewed_at = null,
    reviewed_by = null
  where r.id = p_requirement_id;

  select c.client_id into v_client from public.cases c where c.id = v_req.case_id;
  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (v_req.organization_id, private.member_id(v_req.organization_id), v_client, v_req.case_id, p_event);

  -- Ancien fichier éventuel, à supprimer du stockage par l'application.
  return v_req.storage_path;
end;
$$;

-- Paiements -------------------------------------------------------------------------------------

-- Enregistre un paiement, sa répartition sur les prestations et le numéro de reçu, en une transaction.
-- Le dossier est verrouillé pendant l'opération : deux encaissements simultanés ne peuvent pas
-- dépasser ensemble le reste à payer. p_event peut contenir {recu}, remplacé par le numéro attribué.
create function public.record_payment(
  p_case_id uuid,
  p_amount_minor bigint,
  p_method_kind text,
  p_method_label text,
  p_transaction_reference text,
  p_payer_name text,
  p_paid_at timestamptz,
  p_allocations jsonb,
  p_event text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_case public.cases;
  v_payment public.payments;
  v_total bigint;
  v_invalid integer;
begin
  select * into v_case from public.cases c where c.id = p_case_id for update;
  if not found or not private.has_role(v_case.organization_id, array['owner', 'admin', 'agent', 'accountant']) then
    raise exception 'Dossier introuvable, ou vous n''avez pas le droit d''y enregistrer un paiement.';
  end if;
  if v_case.status = 'cancelled' then
    raise exception 'Ce dossier est annulé : aucun paiement ne peut y être enregistré.';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'Le montant doit être supérieur à zéro.';
  end if;
  if p_paid_at is null or p_paid_at > now() + interval '1 day' then
    raise exception 'La date du paiement ne peut pas être dans le futur.';
  end if;
  if jsonb_typeof(p_allocations) is distinct from 'array' or jsonb_array_length(p_allocations) = 0 then
    raise exception 'Le paiement doit être réparti sur au moins une prestation.';
  end if;

  select coalesce(sum((a ->> 'amount_minor')::bigint), 0) into v_total from jsonb_array_elements(p_allocations) a;
  if v_total <> p_amount_minor then
    raise exception 'La répartition du paiement ne correspond pas à son montant.';
  end if;

  select count(*) into v_invalid
  from jsonb_array_elements(p_allocations) a
  left join public.charges ch
    on ch.id = (a ->> 'charge_id')::uuid and ch.case_id = v_case.id and ch.organization_id = v_case.organization_id
  where ch.id is null
     or (a ->> 'amount_minor')::bigint <= 0
     or (a ->> 'amount_minor')::bigint > ch.amount_minor - coalesce((
          select sum(pa.amount_minor)
          from public.payment_allocations pa
          join public.payments p on p.id = pa.payment_id
          where pa.charge_id = ch.id and p.status = 'recorded'
        ), 0);
  if v_invalid > 0 then
    raise exception 'Le montant dépasse le reste à payer d''une prestation du dossier.';
  end if;

  insert into public.payments (
    organization_id, case_id, client_id, amount_minor, currency, method_kind, method_label,
    transaction_reference, payer_name, paid_at, received_by
  ) values (
    v_case.organization_id, v_case.id, v_case.client_id, p_amount_minor, v_case.billing_currency, p_method_kind,
    p_method_label, nullif(trim(p_transaction_reference), ''), nullif(trim(p_payer_name), ''), p_paid_at,
    private.member_id(v_case.organization_id)
  ) returning * into v_payment;

  insert into public.payment_allocations (organization_id, payment_id, charge_id, amount_minor)
  select v_case.organization_id, v_payment.id, (a ->> 'charge_id')::uuid, (a ->> 'amount_minor')::bigint
  from jsonb_array_elements(p_allocations) a;

  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (
    v_case.organization_id, private.member_id(v_case.organization_id), v_case.client_id, v_case.id,
    replace(p_event, '{recu}', v_payment.receipt_number)
  );

  return jsonb_build_object('id', v_payment.id, 'receipt_number', v_payment.receipt_number);
end;
$$;

-- Invitations -----------------------------------------------------------------------------------

-- Ce que voit la personne invitée avant d'accepter (le jeton fait office de secret).
create function public.get_invitation(p_token uuid)
returns table (agency_name text, email text, role text, status text)
language sql stable security definer set search_path = '' as $$
  select o.name, i.email, i.role,
    case
      when i.revoked_at is not null then 'revoked'
      when i.accepted_at is not null then 'accepted'
      when i.expires_at < now() then 'expired'
      else 'pending'
    end
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  where i.token = p_token;
$$;

-- Invitations en attente pour l'adresse e-mail du compte connecté.
create function public.my_invitations()
returns table (token uuid, agency_name text, role text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.token, o.name, i.role, i.expires_at
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  where i.email = lower(coalesce(auth.jwt() ->> 'email', ''))
    and i.accepted_at is null and i.revoked_at is null and i.expires_at >= now()
  order by i.created_at desc;
$$;

create function public.accept_invitation(p_token uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_inv public.invitations;
begin
  if v_uid is null then
    raise exception 'Connectez-vous pour accepter l''invitation.';
  end if;
  select * into v_inv from public.invitations i where i.token = p_token for update;
  if not found or v_inv.revoked_at is not null then
    raise exception 'Invitation introuvable ou annulée.';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'Cette invitation a déjà été utilisée.';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'Cette invitation a expiré : demandez-en une nouvelle à l''agence.';
  end if;
  if v_inv.email <> v_email then
    raise exception 'Cette invitation est destinée à une autre adresse e-mail (%).', v_inv.email;
  end if;
  if exists (select 1 from public.members m where m.user_id = v_uid) then
    raise exception 'Votre compte est déjà rattaché à une agence.';
  end if;

  insert into public.members (organization_id, user_id, full_name, email, role, job_title)
  values (
    v_inv.organization_id, v_uid,
    coalesce(nullif(trim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''), split_part(v_email, '@', 1)),
    v_email, v_inv.role, v_inv.job_title
  );
  update public.invitations i set accepted_at = now(), accepted_by = v_uid where i.id = v_inv.id;
  return v_inv.organization_id;
end;
$$;

-- Droits : uniquement les utilisateurs connectés ------------------------------------------------

revoke all on function
  public.create_organization(text, text, text, text, text, text, text, text, boolean, uuid),
  public.create_demo_organization(text, text, uuid, jsonb),
  public.leave_demo_organization(),
  public.import_demo_data(uuid, jsonb),
  public.create_case(jsonb, jsonb, jsonb, text),
  public.apply_case_transition(uuid, integer, jsonb, jsonb, text),
  public.review_requirement(uuid, text, text, text),
  public.register_requirement_file(uuid, text, text, text),
  public.record_payment(uuid, bigint, text, text, text, text, timestamptz, jsonb, text),
  public.get_invitation(uuid),
  public.my_invitations(),
  public.accept_invitation(uuid)
from public, anon;

grant execute on function
  public.create_organization(text, text, text, text, text, text, text, text, boolean, uuid),
  public.create_demo_organization(text, text, uuid, jsonb),
  public.leave_demo_organization(),
  public.import_demo_data(uuid, jsonb),
  public.create_case(jsonb, jsonb, jsonb, text),
  public.apply_case_transition(uuid, integer, jsonb, jsonb, text),
  public.review_requirement(uuid, text, text, text),
  public.register_requirement_file(uuid, text, text, text),
  public.record_payment(uuid, bigint, text, text, text, text, timestamptz, jsonb, text),
  public.get_invitation(uuid),
  public.my_invitations(),
  public.accept_invitation(uuid)
to authenticated;

-- La page d'invitation s'affiche aussi avant la connexion (le lien contient le jeton).
grant execute on function public.get_invitation(uuid) to anon;

revoke all on function private.with_org(jsonb, uuid, jsonb) from public;
