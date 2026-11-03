-- Sécurité S6 : l'historique est écrit par la base ; une ligne ajoutée à la main est marquée comme une note.
--
-- Constat (audit du 3 novembre 2026, confirmé sur le projet de test) : par l'API, un membre pouvait ajouter dans
-- l'historique de son agence une ligne au texte inventé (par exemple « Visa accordé par le consulat »), qui
-- ressemblait à un événement réel (son nom restait affiché comme auteur).
--
-- Désormais :
-- 1. Les dernières lignes que l'application écrivait elle-même sont écrites par la base, au moment où la donnée
--    change (même texte qu'avant) : rendez-vous programmé, modifié ou supprimé ; fiche client ou prospect créée,
--    modifiée ou supprimée ; prestation ajoutée. Les dossiers, étapes et pièces le faisaient déjà (S1, S2).
-- 2. Une ligne ajoutée directement par un membre (navigateur, API) est marquée « note » et son texte commence
--    par « Note ajoutée à la main : » : elle ne peut plus passer pour un événement enregistré par l'application.

-- 1. Origine de chaque ligne d'historique --------------------------------------------------------------

alter table public.activity_events
  add column origin text not null default 'system' check (origin in ('system', 'note'));

create function private.mark_manual_note() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Les fonctions et déclencheurs de la base (SECURITY DEFINER) écrivent sous leur propriétaire.
  if current_user = 'authenticated' then
    new.origin := 'note';
    new.text := left('Note ajoutée à la main : ' || coalesce(new.text, ''), 2000);
  else
    new.origin := 'system';
  end if;
  return new;
end;
$$;

create trigger activity_events_origin before insert on public.activity_events
for each row execute function private.mark_manual_note();

-- 2. Mise en forme (identique à l'application : src/lib/format.ts) ------------------------------------

create function private.format_money(p_amount bigint, p_currency text) returns text
language sql immutable set search_path = '' as $$
  with d as (select case when p_currency in ('XAF', 'XOF') then 0 else 2 end as digits)
  select
    case when p_amount < 0 then '-' else '' end
    || regexp_replace((abs(p_amount) / (10 ^ d.digits)::bigint)::text, '(\d)(?=(\d{3})+$)', '\1' || chr(8239), 'g')
    || case when d.digits > 0 then ',' || lpad((abs(p_amount) % (10 ^ d.digits)::bigint)::text, d.digits, '0') else '' end
    || chr(160)
    || case p_currency
         when 'XAF' then 'FCFA'
         when 'XOF' then 'F' || chr(8239) || 'CFA'
         when 'EUR' then '€'
         when 'USD' then '$US'
         else p_currency
       end
  from d;
$$;

create function private.appointment_label(p_kind text) returns text
language sql immutable set search_path = '' as $$
  select case p_kind
    when 'consultation' then 'Consultation'
    when 'prep_interview' then 'Préparation d''entretien'
    when 'administrative' then 'Rendez-vous administratif'
    when 'application_deadline' then 'Échéance de candidature'
    when 'document_deadline' then 'Date limite de pièces'
    when 'follow_up' then 'Suivi'
    when 'departure' then 'Départ prévu'
    else p_kind
  end;
$$;

create function private.appointment_when(p_starts_at timestamptz, p_all_day boolean, p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select to_char(p_starts_at at time zone coalesce(o.timezone, 'Africa/Douala'),
                 case when p_all_day then 'DD/MM/YYYY' else 'DD/MM/YYYY HH24:MI' end)
  from public.organizations o where o.id = p_org;
$$;

create function private.source_label(p_source text) returns text
language sql immutable set search_path = '' as $$
  select case p_source
    when 'facebook' then 'Facebook'
    when 'instagram' then 'Instagram'
    when 'whatsapp' then 'WhatsApp'
    when 'tiktok' then 'TikTok'
    when 'referral' then 'Recommandation'
    when 'walk_in' then 'Visite à l''agence'
    when 'website' then 'Site internet'
    when 'phone' then 'Appel téléphonique'
    when 'other' then 'Autre'
    else coalesce(p_source, 'non précisée')
  end;
$$;

-- 3. Historique écrit par la base ----------------------------------------------------------------------

-- Rendez-vous (écrit par un membre) : programmé (si lié à un client), modifié ou supprimé (si lié à un dossier).
create function private.log_appointment_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.importing() then
    return null;
  end if;
  if tg_op = 'INSERT' then
    if new.client_id is not null then
      insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
      values (new.organization_id, private.member_id(new.organization_id), new.client_id, new.case_id,
              format('Rendez-vous programmé : %s (%s, %s).', new.title, private.appointment_label(new.kind),
                     private.appointment_when(new.starts_at, new.all_day, new.organization_id)));
    end if;
  elsif tg_op = 'UPDATE' then
    if new.case_id is not null and (
      new.title, new.kind, new.starts_at, new.ends_at, new.all_day, new.location
    ) is distinct from (
      old.title, old.kind, old.starts_at, old.ends_at, old.all_day, old.location
    ) then
      insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
      values (new.organization_id, private.member_id(new.organization_id), new.client_id, new.case_id,
              format('Rendez-vous modifié : %s (%s, %s).', new.title, private.appointment_label(new.kind),
                     private.appointment_when(new.starts_at, new.all_day, new.organization_id)));
    end if;
  elsif old.case_id is not null and exists (select 1 from public.cases c where c.id = old.case_id) then
    insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
    values (old.organization_id, private.member_id(old.organization_id),
            (select c.id from public.clients c where c.id = old.client_id), old.case_id,
            format('Rendez-vous supprimé : %s (%s).', old.title,
                   private.appointment_when(old.starts_at, old.all_day, old.organization_id)));
  end if;
  return null;
end;
$$;

create trigger appointments_z_history after insert or update or delete on public.appointments
for each row when (current_user = 'authenticated')
execute function private.log_appointment_event();

-- Fiche client ou prospect : créée, modifiée ou supprimée par un membre (les fonctions de la base, comme la
-- transformation d'un prospect ou le choix du partenaire, écrivent leur propre ligne).
create function private.log_client_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.importing() then
    return null;
  end if;
  if tg_op = 'INSERT' then
    insert into public.activity_events (organization_id, actor_id, client_id, text)
    values (new.organization_id, private.member_id(new.organization_id), new.id,
            case when new.status = 'prospect'
              then format('Prospect %s enregistré (origine : %s%s).', new.reference, private.source_label(new.source),
                          case when coalesce(trim(new.source_detail), '') <> '' then ' — ' || trim(new.source_detail) else '' end)
              else format('Fiche client %s créée.', new.reference)
            end);
  elsif tg_op = 'UPDATE' then
    insert into public.activity_events (organization_id, actor_id, client_id, text)
    values (new.organization_id, private.member_id(new.organization_id), new.id, format('Fiche client %s modifiée.', new.reference));
  else
    insert into public.activity_events (organization_id, actor_id, text)
    values (old.organization_id, private.member_id(old.organization_id),
            format('Fiche client %s (%s %s) supprimée définitivement.', old.reference, old.first_name, old.last_name));
  end if;
  return null;
end;
$$;

-- Seule l'écriture directe d'un membre est historisée ici (rôle « authenticated » de la requête).
create trigger clients_z_history after insert or update or delete on public.clients
for each row when (current_user = 'authenticated')
execute function private.log_client_event();

-- Prestation ajoutée à un dossier par un membre (les devis acceptés et les services écrivent leur propre ligne).
create function private.log_charge_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.importing() then
    return null;
  end if;
  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  select new.organization_id, private.member_id(new.organization_id), c.client_id, c.id,
         format('Prestation ajoutée : %s (%s).', new.label, private.format_money(new.amount_minor, new.currency))
  from public.cases c where c.id = new.case_id;
  return null;
end;
$$;

create trigger charges_z_history after insert on public.charges
for each row when (current_user = 'authenticated')
execute function private.log_charge_event();

-- Droits d'exécution -----------------------------------------------------------------------------------

revoke all on function
  private.mark_manual_note(),
  private.format_money(bigint, text),
  private.appointment_label(text),
  private.appointment_when(timestamptz, boolean, uuid),
  private.source_label(text),
  private.log_appointment_event(),
  private.log_client_event(),
  private.log_charge_event()
from public, anon, authenticated;
