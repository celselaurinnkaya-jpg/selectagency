-- Sécurité S3 : les informations sensibles de la fiche client ne changent que par leurs circuits prévus.
--
-- Constat (audit du 3 novembre 2026, confirmé sur le projet de test) : par l'API, un membre pouvait réinscrire
-- aux e-mails un client qui s'était désinscrit, changer directement l'apporteur (donc les commissions) ou le
-- statut prospect / client. De plus, le code du lien de désinscription est lisible par l'agence : il lui
-- permettait de « réinscrire » le client par la page publique de désinscription.
--
-- Désormais :
-- 1. Écriture directe (navigateur, API) sur la fiche : la base refuse de changer l'apporteur, le statut, la date
--    de transformation, l'agence, la référence, le code de désinscription ou la marque « démonstration ». Elle
--    accepte de DÉSINSCRIRE un client (à sa demande) mais jamais de le réinscrire. Les fonctions de la base
--    (transformation d'un prospect, choix du partenaire, webhook Brevo…) font leurs propres contrôles.
-- 2. Page de désinscription : se désinscrire donne au client un code de réinscription à usage unique, que
--    l'agence ne voit jamais (seule son empreinte est gardée). « Me réinscrire » exige ce code.

-- 1. Garde des colonnes sensibles ----------------------------------------------------------------------

alter table public.clients
  add column email_resubscribe_hash text check (email_resubscribe_hash ~ '^[0-9a-f]{64}$');

create function private.guard_client_columns() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Seule l'écriture directe d'un membre est contrôlée ici : les fonctions de la base (SECURITY DEFINER)
  -- s'exécutent sous leur propriétaire et appliquent leurs propres règles.
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.partner_id is not null then
      raise exception 'Le partenaire d''un client se choisit avec son code, dans le formulaire.';
    end if;
    new.converted_at := null;
    new.is_demo_fixture := false;
    new.email_resubscribe_hash := null;
    new.email_unsubscribe_token := gen_random_uuid();
    new.email_opt_out := coalesce(new.email_opt_out, false);
    new.email_opt_out_at := case when new.email_opt_out then now() end;
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.reference is distinct from old.reference
     or new.email_unsubscribe_token is distinct from old.email_unsubscribe_token
     or new.email_resubscribe_hash is distinct from old.email_resubscribe_hash
     or new.is_demo_fixture is distinct from old.is_demo_fixture then
    raise exception 'Cette information de la fiche client ne peut pas être modifiée.';
  end if;
  if new.partner_id is distinct from old.partner_id then
    raise exception 'Le partenaire d''un client se change depuis sa fiche, avec les règles des commissions.';
  end if;
  if new.status is distinct from old.status or new.converted_at is distinct from old.converted_at then
    raise exception 'Un prospect devient client avec le bouton « Transformer en client » ou à l''ouverture d''un dossier.';
  end if;
  if old.email_opt_out and not new.email_opt_out then
    raise exception 'Ce client s''est désinscrit des e-mails : lui seul peut se réinscrire, depuis la page de désinscription.';
  end if;
  if new.email_opt_out and not old.email_opt_out then
    new.email_opt_out_at := now();
  else
    new.email_opt_out_at := old.email_opt_out_at;
  end if;
  return new;
end;
$$;

create trigger clients_guard before insert or update on public.clients
for each row execute function private.guard_client_columns();

-- 2. Page de désinscription : réinscription avec un code à usage unique --------------------------------

drop function public.unsubscribe_client_email(uuid, boolean);

create function public.unsubscribe_client_email(
  p_token uuid,
  p_resubscribe boolean default false,
  p_resubscribe_code text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_client public.clients;
  v_agency_name text;
  v_code text;
begin
  if p_token is null then
    raise exception 'Lien de désinscription invalide.';
  end if;
  select * into v_client from public.clients c where c.email_unsubscribe_token = p_token for update;
  if not found then
    raise exception 'Lien de désinscription introuvable ou expiré.';
  end if;

  if coalesce(p_resubscribe, false) then
    -- Seule la personne qui vient de se désinscrire possède ce code (l'agence n'en connaît que l'empreinte).
    if v_client.email_resubscribe_hash is null
       or char_length(coalesce(p_resubscribe_code, '')) < 32
       or v_client.email_resubscribe_hash <> encode(sha256(convert_to(p_resubscribe_code, 'UTF8')), 'hex') then
      raise exception 'La réinscription n''est possible que juste après la désinscription, depuis la même page.';
    end if;
    update public.clients c set email_opt_out = false, email_opt_out_at = null, email_resubscribe_hash = null
    where c.id = v_client.id
    returning * into v_client;
  else
    v_code := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    update public.clients c set
      email_opt_out = true,
      email_opt_out_at = coalesce(c.email_opt_out_at, now()),
      email_resubscribe_hash = encode(sha256(convert_to(v_code, 'UTF8')), 'hex')
    where c.id = v_client.id
    returning * into v_client;
  end if;

  select o.name into v_agency_name from public.organizations o where o.id = v_client.organization_id;
  return jsonb_build_object(
    'first_name', v_client.first_name,
    'agency_name', coalesce(v_agency_name, 'SELECT Agency'),
    'unsubscribed', v_client.email_opt_out,
    'resubscribe_code', v_code
  );
end;
$$;

-- Droits d'exécution -----------------------------------------------------------------------------------

revoke all on function private.guard_client_columns() from public, anon, authenticated;
revoke all on function public.unsubscribe_client_email(uuid, boolean, text) from public;
grant execute on function public.unsubscribe_client_email(uuid, boolean, text) to anon, authenticated;
