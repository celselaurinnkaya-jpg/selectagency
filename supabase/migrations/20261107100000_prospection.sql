-- SELECT Agency — Prospection, WhatsApp et réseaux sociaux (phase 1).
--
-- Décision du 7 novembre 2026 (journal, Session 26). Rien n'est envoyé par SELECT : l'agent ouvre WhatsApp
-- (ou appelle, ou répond sur Facebook…) lui-même, puis note l'échange. Le journal dit « préparé » ou « noté »,
-- jamais « envoyé » ni « livré » (ces statuts restent réservés aux e-mails confirmés par Brevo).
--
-- 1. Échanges : nouveaux canaux (Facebook, Instagram, TikTok, SMS), sens (reçu ou envoyé), date réelle de
--    l'échange et résumé plus long. Un membre ne peut écrire qu'un échange « préparé » ou « noté ».
-- 2. Campagne ou publication à l'origine d'un prospect (saisie par l'agence, sans connexion aux réseaux).
-- 3. Modèles de messages de l'agence, avec des zones remplies par l'application ({prenom}, {dossier}…).

-- 1. Échanges ---------------------------------------------------------------------------------------------

alter table public.communication_logs drop constraint communication_logs_channel_check;
alter table public.communication_logs
  add constraint communication_logs_channel_check
  check (channel in ('whatsapp', 'email', 'phone', 'in_person', 'facebook', 'instagram', 'tiktok', 'sms'));

alter table public.communication_logs drop constraint communication_logs_summary_check;
alter table public.communication_logs
  add constraint communication_logs_summary_check check (char_length(summary) between 1 and 1000);

alter table public.communication_logs
  add column direction text check (direction in ('inbound', 'outbound')),
  -- Moment de l'échange déclaré par l'agent (un appel d'hier noté aujourd'hui) ; « at » reste l'heure de saisie.
  add column occurred_at timestamptz;

create function private.guard_communication_log() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Seule l'écriture directe d'un membre est contrôlée : les e-mails sont écrits par les fonctions de la base.
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.status not in ('prepared_manual', 'logged') then
    raise exception 'Un échange noté à la main est « préparé » ou « noté » : seul SELECT indique un e-mail envoyé ou livré.';
  end if;
  new.email_outbox_id := null;
  new.recipient_email := null;
  new.summary := trim(new.summary);
  if new.occurred_at is null then
    new.occurred_at := now();
  elsif new.occurred_at > now() + interval '10 minutes' then
    raise exception 'La date de l''échange ne peut pas être dans le futur.';
  elsif new.occurred_at < now() - interval '1 year' then
    raise exception 'La date de l''échange doit dater de moins d''un an.';
  end if;
  return new;
end;
$$;

create trigger communication_logs_guard before insert on public.communication_logs
for each row execute function private.guard_communication_log();

-- 2. Campagne -------------------------------------------------------------------------------------------

alter table public.clients
  add column campaign text check (char_length(campaign) <= 120);

create index clients_campaign_idx on public.clients (organization_id, lower(campaign)) where campaign is not null;

-- 3. Modèles de messages ---------------------------------------------------------------------------------

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  body text not null check (char_length(body) between 5 and 2000),
  -- Pour qui le modèle est proposé : prospects, clients, ou tous.
  audience text not null default 'any' check (audience in ('prospect', 'client', 'any')),
  position integer not null default 0,
  is_active boolean not null default true,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index message_templates_title_idx on public.message_templates (organization_id, lower(title));

create trigger message_templates_touch before update on public.message_templates
for each row execute function private.touch_updated_at();

alter table public.message_templates enable row level security;
revoke all on public.message_templates from anon;
revoke insert, update, delete on public.message_templates from authenticated;
grant select on public.message_templates to authenticated;

create policy message_templates_select on public.message_templates for select to authenticated
  using (organization_id in (select private.my_org_ids()));

-- Modèles de départ (l'agence les modifie ou les supprime ensuite). Ton factuel, aucune promesse de résultat.
create function private.seed_message_templates(p_org uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.message_templates (organization_id, title, body, audience, position)
  values
    (p_org, 'Réponse à une demande (réseaux sociaux)',
      E'Bonjour {prenom},\n\nMerci pour votre message. Je suis {conseiller}, de {agence}. Pour bien comprendre votre projet, pouvez-vous me préciser le pays visé, la période souhaitée et votre situation actuelle (études, travail) ?\n\nNous pouvons aussi en parler lors d''un rendez-vous à l''agence.\n\n{agence}',
      'prospect', 10),
    (p_org, 'Relance après un premier contact',
      E'Bonjour {prenom},\n\nJe reviens vers vous après notre premier échange. Avez-vous pu réfléchir à votre projet ? Je reste disponible pour répondre à vos questions ou fixer un rendez-vous.\n\n{conseiller}, {agence}',
      'prospect', 20),
    (p_org, 'Invitation à un rendez-vous',
      E'Bonjour {prenom},\n\nPour avancer sur votre projet, je vous propose un rendez-vous à l''agence. Quel jour et quelle heure vous conviendraient cette semaine ?\n\n{conseiller}, {agence}',
      'prospect', 30),
    (p_org, 'Bienvenue',
      E'Bonjour {prenom},\n\nBienvenue chez {agence}. Votre interlocuteur est {conseiller} : vous pouvez nous écrire ici pour toute question sur votre dossier.\n\n{agence}',
      'client', 40),
    (p_org, 'Pièces manquantes',
      E'Bonjour {prenom},\n\nPour avancer sur votre dossier {dossier}, il nous manque encore :\n{pieces_manquantes}\n\nMerci de nous les transmettre dès que possible.\n\n{agence}',
      'client', 50),
    (p_org, 'Rappel de rendez-vous',
      E'Bonjour {prenom},\n\nNous vous rappelons votre rendez-vous : {rendez_vous}.\n\nMerci de nous prévenir en cas d''empêchement.\n\n{agence}',
      'any', 60),
    (p_org, 'Solde à régler',
      E'Bonjour {prenom},\n\nLe solde restant à régler pour votre dossier {dossier} est de {solde}. Vous pouvez passer à l''agence ou nous contacter pour convenir du règlement.\n\n{agence}',
      'client', 70),
    (p_org, 'Message libre', E'Bonjour {prenom},\n\n\n\n{agence}', 'any', 80)
  on conflict do nothing;
$$;

select private.seed_message_templates(o.id) from public.organizations o;

create function private.seed_message_templates_on_create() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.seed_message_templates(new.id);
  return new;
end;
$$;

create trigger organizations_seed_message_templates after insert on public.organizations
for each row execute function private.seed_message_templates_on_create();

-- Créer ou modifier un modèle : propriétaire et administrateurs (comme les autres réglages de l'agence).
create function public.save_message_template(
  p_organization_id uuid,
  p_id uuid,
  p_title text,
  p_body text,
  p_audience text,
  p_is_active boolean default true
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_title text := trim(coalesce(p_title, ''));
  v_body text := trim(coalesce(p_body, ''));
begin
  if not private.has_role(p_organization_id, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs peuvent modifier les modèles de messages.';
  end if;
  if char_length(v_title) not between 2 and 80 then
    raise exception 'Le nom du modèle doit faire de 2 à 80 caractères.';
  end if;
  if char_length(v_body) not between 5 and 2000 then
    raise exception 'Le texte du modèle doit faire de 5 à 2 000 caractères.';
  end if;
  if coalesce(p_audience, '') not in ('prospect', 'client', 'any') then
    raise exception 'Choisissez pour qui le modèle est proposé.';
  end if;

  begin
    if p_id is null then
      insert into public.message_templates (organization_id, title, body, audience, is_active, position, updated_by)
      values (
        p_organization_id, v_title, v_body, p_audience, coalesce(p_is_active, true),
        coalesce((select max(t.position) from public.message_templates t where t.organization_id = p_organization_id), 0) + 10,
        private.member_id(p_organization_id)
      )
      returning id into v_id;
    else
      update public.message_templates t set
        title = v_title, body = v_body, audience = p_audience, is_active = coalesce(p_is_active, true),
        updated_by = private.member_id(p_organization_id)
      where t.id = p_id and t.organization_id = p_organization_id
      returning t.id into v_id;
      if v_id is null then
        raise exception 'Modèle introuvable.';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'Un autre modèle porte déjà le nom « % ».', v_title;
  end;
  return v_id;
end;
$$;

create function public.delete_message_template(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select t.organization_id into v_org from public.message_templates t where t.id = p_id;
  if v_org is null or not private.has_role(v_org, array['owner', 'admin']) then
    raise exception 'Modèle introuvable, ou vous n''avez pas le droit de le supprimer.';
  end if;
  delete from public.message_templates t where t.id = p_id;
end;
$$;

-- Droits d'exécution -----------------------------------------------------------------------------------

revoke all on function
  private.guard_communication_log(),
  private.seed_message_templates(uuid),
  private.seed_message_templates_on_create()
from public, anon, authenticated;

revoke all on function
  public.save_message_template(uuid, uuid, text, text, text, boolean),
  public.delete_message_template(uuid)
from public, anon;
grant execute on function
  public.save_message_template(uuid, uuid, text, text, text, boolean),
  public.delete_message_template(uuid)
to authenticated;
