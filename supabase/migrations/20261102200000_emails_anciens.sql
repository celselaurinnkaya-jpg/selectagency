-- E-mails de la plateforme trop anciens (correction avant la mise en ligne).
--
-- Depuis la première migration des e-mails, chaque nouvelle agence reçoit un message de bienvenue en file. Tant
-- que l'envoi n'est pas activé en production, ces messages attendent. Sans cette règle, la première tâche
-- quotidienne les enverrait avec des jours ou des semaines de retard. Désormais, un message de bienvenue ou une
-- alerte d'abonnement restés en attente plus de 3 jours sont annulés juste avant l'envoi (avec leur raison).
-- Une alerte d'abonnement d'actualité est de toute façon préparée de nouveau à l'étape suivante.

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
