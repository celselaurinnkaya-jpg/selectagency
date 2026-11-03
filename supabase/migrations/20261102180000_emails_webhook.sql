-- Webhook Brevo (étape 6) : suivi réel de la livraison.
--
-- L'e-mail concerné est retrouvé par son identifiant Brevo, ou à défaut par son étiquette unique
-- « outbox-<id> » (que Brevo renvoie dans l'événement) : cela couvre un événement arrivé avant que
-- l'identifiant soit enregistré, et un e-mail retrouvé chez Brevo sans identifiant après une coupure.
-- Un identifiant Brevo déjà enregistré et différent n'est jamais remplacé.
-- Un report temporaire (soft_bounce, deferred) ne remplace plus le message d'un e-mail déjà livré.

drop function public.apply_brevo_webhook(text, text, text, text);

create function public.apply_brevo_webhook(
  p_secret text,
  p_brevo_message_id text,
  p_event text,
  p_reason text default null,
  p_outbox_id uuid default null
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.email_outbox;
  v_message_id text := nullif(trim(coalesce(p_brevo_message_id, '')), '');
  v_event text := lower(trim(coalesce(p_event, '')));
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_new_status text;
begin
  if not private.check_system_secret('brevo_webhook', p_secret) then
    raise exception 'Secret webhook invalide.' using errcode = '42501';
  end if;

  if v_event = '' or (v_message_id is null and p_outbox_id is null) then
    return false;
  end if;

  if v_message_id is not null then
    select * into v_row from public.email_outbox e
    where e.brevo_message_id = v_message_id
    order by e.created_at desc limit 1
    for update;
  end if;
  if v_row.id is null and p_outbox_id is not null then
    select * into v_row from public.email_outbox e
    where e.id = p_outbox_id
      and (e.brevo_message_id is null or v_message_id is null or e.brevo_message_id = v_message_id)
    for update;
  end if;
  if v_row.id is null then
    return false;
  end if;

  update public.email_outbox e set
    last_event = left(v_event, 40),
    last_event_at = now(),
    brevo_message_id = coalesce(e.brevo_message_id, left(v_message_id, 160))
  where e.id = v_row.id;

  if v_event = 'delivered' then
    -- La livraison prouve l'envoi, même après une réponse perdue ; mais un e-mail rejeté
    -- ou signalé comme indésirable ne repasse jamais « livré ».
    if v_row.status in ('queued', 'sending', 'sent', 'failed') then
      v_new_status := 'delivered';
    end if;
  elsif v_event in ('hard_bounce', 'invalid_email', 'blocked', 'error') then
    v_new_status := 'bounced';
  elsif v_event in ('spam', 'complaint') then
    v_new_status := 'complained';
  elsif v_event in ('soft_bounce', 'deferred') then
    -- Report temporaire : Brevo réessaie lui-même, le statut ne change pas.
    if v_row.status not in ('delivered', 'bounced', 'complained') then
      update public.email_outbox e set
        last_error = left(coalesce(v_reason, 'Distribution retardée, Brevo réessaie.'), 500)
      where e.id = v_row.id;
    end if;
  elsif v_event = 'unsubscribed' then
    if v_row.client_id is not null then
      update public.clients c set email_opt_out = true, email_opt_out_at = coalesce(c.email_opt_out_at, now())
      where c.id = v_row.client_id;
    end if;
  end if;

  if v_new_status is not null then
    update public.email_outbox e set
      status = v_new_status,
      sent_at = coalesce(e.sent_at, case when v_new_status = 'delivered' then now() end),
      delivered_at = case when v_new_status = 'delivered' then coalesce(e.delivered_at, now()) else e.delivered_at end,
      last_error = case
        when v_new_status in ('bounced', 'complained') then left(coalesce(v_reason, v_event), 500)
        when v_new_status = 'delivered' then null
        else e.last_error
      end
    where e.id = v_row.id;

    update public.communication_logs cl set status = v_new_status
    where cl.email_outbox_id = v_row.id;

    if v_new_status = 'complained' and v_row.client_id is not null then
      update public.clients c set email_opt_out = true, email_opt_out_at = coalesce(c.email_opt_out_at, now())
      where c.id = v_row.client_id;
    end if;
  end if;

  return true;
end;
$$;

revoke all on function public.apply_brevo_webhook(text, text, text, text, uuid) from public;
grant execute on function public.apply_brevo_webhook(text, text, text, text, uuid) to anon, authenticated;
