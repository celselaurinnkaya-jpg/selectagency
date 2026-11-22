-- SELECT Agency — Alertes au propriétaire par e-mail (rapport de test du 21/11 et plan v2, point 17).
--
-- Le propriétaire, souvent à distance, reçoit un e-mail (au nom de SELECT Agency) quand :
-- - un paiement est annulé ;
-- - une facture émise est annulée ;
-- - une facture est émise avec une remise importante (20 % ou plus du montant avant remise) ;
-- - une fiche client est supprimée ;
-- - la ligne WhatsApp Business de l'agence se déconnecte.
-- Pas d'alerte pour ses propres actions (il les connaît déjà), sauf la déconnexion WhatsApp. Activées par défaut,
-- désactivables dans les réglages des e-mails. Envoi par la file existante (Brevo), avec la même revérification
-- juste avant l'envoi ; une agence de démonstration n'envoie rien (private.enqueue_email).

alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in (
  'agency_welcome',
  'payment_confirmed',
  'document_send',
  'missing_documents',
  'case_status_changed',
  'appointment_reminder',
  'subscription_notice',
  'owner_alert'
));

alter table public.email_settings add column notify_owner_alerts boolean not null default true;

create or replace function public.save_email_settings(p_organization_id uuid, p_settings jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_reply text := lower(trim(coalesce(p_settings ->> 'reply_to_email', '')));
begin
  if not private.has_role(p_organization_id, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs peuvent modifier les réglages des e-mails.';
  end if;
  if v_reply <> '' and v_reply !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'L''adresse e-mail de réponse est invalide.';
  end if;

  insert into public.email_settings as s (
    organization_id, sender_name, reply_to_email,
    notify_payment_confirmed, notify_appointment_reminder,
    notify_case_status, notify_missing_documents, notify_owner_alerts
  ) values (
    p_organization_id,
    left(trim(coalesce(p_settings ->> 'sender_name', '')), 120),
    v_reply,
    coalesce((p_settings ->> 'notify_payment_confirmed')::boolean, false),
    coalesce((p_settings ->> 'notify_appointment_reminder')::boolean, false),
    coalesce((p_settings ->> 'notify_case_status')::boolean, false),
    coalesce((p_settings ->> 'notify_missing_documents')::boolean, false),
    -- Absent de la demande (ancien écran) : on garde les alertes, protection du propriétaire.
    coalesce((p_settings ->> 'notify_owner_alerts')::boolean, true)
  )
  on conflict (organization_id) do update set
    sender_name = excluded.sender_name,
    reply_to_email = excluded.reply_to_email,
    notify_payment_confirmed = excluded.notify_payment_confirmed,
    notify_appointment_reminder = excluded.notify_appointment_reminder,
    notify_case_status = excluded.notify_case_status,
    notify_missing_documents = excluded.notify_missing_documents,
    notify_owner_alerts = excluded.notify_owner_alerts;
end;
$$;

-- Inscrit une alerte pour le propriétaire de l'agence (une seule fois par clé).
create function private.alert_owner(
  p_org uuid,
  p_key text,
  p_subject text,
  p_title text,
  p_message text,
  p_rows jsonb,
  p_link text,
  p_skip_when_owner_acts boolean default true
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_owner public.members;
begin
  if private.importing() then
    return;
  end if;
  if exists (select 1 from public.email_settings s where s.organization_id = p_org and not s.notify_owner_alerts) then
    return;
  end if;
  select * into v_owner from public.members m
  where m.organization_id = p_org and m.role = 'owner' and m.removed_at is null
  order by m.created_at limit 1;
  if not found or coalesce(trim(v_owner.email), '') = '' then
    return;
  end if;
  if p_skip_when_owner_acts and private.member_id(p_org) = v_owner.id then
    return;
  end if;
  perform private.enqueue_email(
    p_org, 'owner_alert', p_key, v_owner.email, v_owner.full_name, p_subject,
    jsonb_build_object(
      'owner_name', v_owner.full_name,
      'alert_title', p_title,
      'alert_message', p_message,
      'alert_rows', coalesce(p_rows, '[]'::jsonb),
      'link_path', coalesce(p_link, '/dashboard'),
      'actor_name', coalesce((select m.full_name from public.members m where m.id = private.member_id(p_org)), '')
    )
  );
end;
$$;

-- 1. Paiement annulé.
create function private.alert_owner_payment_voided() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_client public.clients;
begin
  select * into v_client from public.clients c where c.id = new.client_id;
  perform private.alert_owner(
    new.organization_id,
    'owner_alert:payment_voided:' || new.id,
    'Paiement annulé : ' || private.format_money(new.amount_minor, new.currency),
    'Un paiement a été annulé',
    'Un membre de votre équipe a annulé un paiement. Vérifiez que l''annulation est justifiée.',
    jsonb_build_array(
      jsonb_build_object('label', 'Montant', 'value', private.format_money(new.amount_minor, new.currency)),
      jsonb_build_object('label', 'Reçu', 'value', coalesce(new.receipt_number, 'aucun (paiement à vérifier)')),
      jsonb_build_object('label', 'Client', 'value', coalesce(v_client.first_name || ' ' || v_client.last_name, '')),
      jsonb_build_object('label', 'Motif', 'value', coalesce(new.void_reason, ''))
    ),
    '/finance/receipts/' || new.id
  );
  return null;
end;
$$;

create trigger payments_alert_owner_voided after update of status on public.payments
for each row when (new.status = 'voided' and old.status is distinct from 'voided')
execute function private.alert_owner_payment_voided();

-- 2. Facture émise annulée, et 3. facture émise avec une remise importante.
create function private.alert_owner_invoice() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_client public.clients;
  v_before_discount bigint := new.subtotal_minor + new.tax_minor;
begin
  select * into v_client from public.clients c where c.id = new.client_id;
  if new.status = 'cancelled' and old.status = 'issued' then
    perform private.alert_owner(
      new.organization_id,
      'owner_alert:invoice_cancelled:' || new.id,
      'Facture annulée : ' || new.number,
      'Une facture émise a été annulée',
      'Une facture déjà remise au client a été annulée. Le motif est noté dans l''historique du client.',
      jsonb_build_array(
        jsonb_build_object('label', 'Facture', 'value', new.number),
        jsonb_build_object('label', 'Montant', 'value', private.format_money(new.total_minor, new.currency)),
        jsonb_build_object('label', 'Client', 'value', coalesce(v_client.first_name || ' ' || v_client.last_name, ''))
      ),
      '/finance/invoices/' || new.id
    );
  end if;
  if new.status = 'issued' and new.discount_minor > 0 and v_before_discount > 0 and new.discount_minor * 5 >= v_before_discount then
    perform private.alert_owner(
      new.organization_id,
      'owner_alert:invoice_discount:' || new.id,
      'Remise importante sur la facture ' || new.number,
      'Une facture a été émise avec une remise importante',
      'La remise atteint au moins 20 % du montant de la facture.',
      jsonb_build_array(
        jsonb_build_object('label', 'Facture', 'value', new.number),
        jsonb_build_object('label', 'Montant avant remise', 'value', private.format_money(v_before_discount, new.currency)),
        jsonb_build_object('label', 'Remise', 'value', private.format_money(new.discount_minor, new.currency)),
        jsonb_build_object('label', 'Client', 'value', coalesce(v_client.first_name || ' ' || v_client.last_name, ''))
      ),
      '/finance/invoices/' || new.id
    );
  end if;
  return null;
end;
$$;

create trigger invoices_alert_owner after update of status, subtotal_minor, tax_minor, discount_minor on public.invoices
for each row execute function private.alert_owner_invoice();

-- 4. Fiche client supprimée.
create function private.alert_owner_client_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.alert_owner(
    old.organization_id,
    'owner_alert:client_deleted:' || old.id,
    'Fiche client supprimée : ' || old.first_name || ' ' || old.last_name,
    'Une fiche client a été supprimée',
    'La fiche et ses informations ne sont plus consultables. Vérifiez que la suppression était voulue.',
    jsonb_build_array(
      jsonb_build_object('label', 'Client', 'value', old.first_name || ' ' || old.last_name),
      jsonb_build_object('label', 'Référence', 'value', old.reference)
    ),
    '/clients'
  );
  return null;
end;
$$;

create trigger clients_alert_owner_deleted after delete on public.clients
for each row execute function private.alert_owner_client_deleted();

-- 5. Ligne WhatsApp Business déconnectée (toujours signalée, même si le propriétaire l'a déconnectée).
create function private.alert_owner_whatsapp_disconnected() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.alert_owner(
    new.organization_id,
    'owner_alert:whatsapp_disconnected:' || new.id || ':' || to_char(now(), 'YYYYMMDDHH24MI'),
    'Ligne WhatsApp déconnectée : ' || new.display_phone_number,
    'La ligne WhatsApp Business de l''agence est déconnectée',
    'Tant qu''elle est déconnectée, l''agent IA ne répond plus aux clients. Reconnectez-la dans Agent IA, onglet Connexion.',
    jsonb_build_array(
      jsonb_build_object('label', 'Numéro', 'value', new.display_phone_number),
      jsonb_build_object('label', 'État', 'value', case new.status when 'error' then 'En erreur' when 'pending' then 'En attente' else 'Déconnectée' end)
    ),
    '/agent-ia/connexion',
    false
  );
  return null;
end;
$$;

create trigger wa_accounts_alert_owner after update of status on public.wa_accounts
for each row when (old.status = 'connected' and new.status <> 'connected')
execute function private.alert_owner_whatsapp_disconnected();

-- Les alertes ne sont lisibles que par le propriétaire (les autres e-mails de la file restent visibles comme avant).
alter policy email_outbox_select on public.email_outbox
  using (
    organization_id in (select private.member_org_ids_with_role(array['owner', 'admin', 'agent', 'accountant']))
    and (kind <> 'owner_alert' or organization_id in (select private.member_org_ids_with_role(array['owner'])))
  );

-- Revérification juste avant l'envoi : même fonction qu'avant, plus la règle des alertes désactivées.
create or replace function private.tidy_email_outbox(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Annule ce qui ne doit plus partir.
  with obsolete as (
    select e.id,
      case
        -- Message de la plateforme resté en attente (par exemple avant l'activation de l'envoi) : plus d'actualité.
        when e.kind in ('agency_welcome', 'subscription_notice')
          and e.created_at < now() - interval '3 days'
          then 'Annulé : message trop ancien pour être encore utile.'
        when e.kind in ('payment_confirmed', 'document_send', 'missing_documents', 'case_status_changed', 'appointment_reminder')
          and e.client_id is null
          then 'Annulé : la fiche client a été supprimée.'
        when e.kind = 'payment_confirmed' and not exists (
            select 1 from public.payments p
            where p.id = e.payment_id and p.organization_id = e.organization_id
              and p.status = 'recorded' and p.receipt_number is not null
          )
          then 'Annulé : le paiement n''est plus confirmé.'
        when e.kind in ('missing_documents', 'case_status_changed', 'appointment_reminder')
          and exists (select 1 from public.clients c where c.id = e.client_id and c.email_opt_out)
          then 'Annulé : le client s''est désinscrit des e-mails.'
        when e.is_automatic
          and e.kind in ('payment_confirmed', 'appointment_reminder', 'case_status_changed', 'missing_documents')
          and not exists (
            select 1 from public.email_settings s
            where s.organization_id = e.organization_id
              and case e.kind
                when 'payment_confirmed' then s.notify_payment_confirmed
                when 'appointment_reminder' then s.notify_appointment_reminder
                when 'case_status_changed' then s.notify_case_status
                when 'missing_documents' then s.notify_missing_documents
              end
          )
          then 'Annulé : cette notification est désactivée par l''agence.'
        when e.kind = 'case_status_changed'
          and e.payload ? 'case_version'
          and not exists (
            select 1 from public.cases cs
            where cs.id = e.case_id and cs.organization_id = e.organization_id
              and cs.version::text = e.payload ->> 'case_version'
          )
          then 'Annulé : le dossier a encore changé depuis (nouvelle étape ou retour en arrière).'
        when e.kind = 'missing_documents'
          and not exists (
            select 1 from public.cases cs
            where cs.id = e.case_id and cs.organization_id = e.organization_id and cs.status = 'active'
          )
          then 'Annulé : le dossier n''est plus en cours.'
        when e.kind = 'appointment_reminder'
          and not exists (
            select 1 from public.appointments a
            where a.id = e.appointment_id and a.organization_id = e.organization_id
              and a.status in ('planned', 'confirmed')
              and a.starts_at > now()
              and (e.payload ->> 'starts_at') is not null
              and a.starts_at = (e.payload ->> 'starts_at')::timestamptz
          )
          then 'Annulé : le rendez-vous a été déplacé, annulé ou est déjà passé.'
        -- Alertes au propriétaire désactivées entre l'inscription et l'envoi : elles ne partent pas.
        when e.kind = 'owner_alert'
          and exists (select 1 from public.email_settings s where s.organization_id = e.organization_id and not s.notify_owner_alerts)
          then 'Annulé : les alertes au propriétaire sont désactivées.'
      end as reason
    from public.email_outbox e
    where (p_org is null or e.organization_id = p_org)
      and (e.status = 'queued' or (e.status = 'sending' and e.updated_at < now() - interval '15 minutes'))
  ), done as (
    update public.email_outbox e set status = 'cancelled', last_error = o.reason
    from obsolete o
    where e.id = o.id and o.reason is not null
    returning e.id
  )
  update public.communication_logs cl set status = 'cancelled'
  from done d where cl.email_outbox_id = d.id;

  -- Un envoi bloqué qui a épuisé ses tentatives passe en échec (sans renvoi automatique).
  with stuck as (
    update public.email_outbox e set
      status = 'failed',
      last_error = 'Envoi interrompu sans réponse de Brevo. Vérifiez dans Brevo avant de renvoyer.'
    where (p_org is null or e.organization_id = p_org)
      and e.status = 'sending'
      and e.updated_at < now() - interval '15 minutes'
      and e.attempts >= e.max_attempts
    returning e.id
  )
  update public.communication_logs cl set status = 'failed'
  from stuck s where cl.email_outbox_id = s.id;
end;
$$;

revoke all on function private.tidy_email_outbox(uuid) from public, anon, authenticated;
revoke all on function
  private.alert_owner(uuid, text, text, text, text, jsonb, text, boolean),
  private.alert_owner_payment_voided(),
  private.alert_owner_invoice(),
  private.alert_owner_client_deleted(),
  private.alert_owner_whatsapp_disconnected()
from public, anon, authenticated;
