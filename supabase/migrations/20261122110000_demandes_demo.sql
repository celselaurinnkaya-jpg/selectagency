-- SELECT Agency — Demandes de démonstration envoyées depuis le site public (rapport de re-test du 22 novembre 2026).
--
-- Le formulaire « Demander une démonstration » enregistre la demande ; seule la console SELECT la lit, par les
-- fonctions « platform_* » (la table est dans le schéma private : aucune lecture directe, ni par les agences ni
-- par les visiteurs). Une demande n'est liée à aucune agence : la personne n'a pas encore de compte.
-- Anti-abus : au plus 3 demandes par téléphone ou par e-mail en 24 heures, et 300 demandes par jour au total.

create table private.demo_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null check (char_length(full_name) between 2 and 120),
  agency_name text not null check (char_length(agency_name) between 2 and 160),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  phone text not null check (char_length(phone) between 6 and 40),
  email text check (email is null or char_length(email) between 3 and 254),
  message text not null default '' check (char_length(message) <= 1000),
  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  handled_at timestamptz
);

create index demo_requests_created_idx on private.demo_requests (created_at desc);
alter table private.demo_requests enable row level security;
revoke all on private.demo_requests from public, anon, authenticated;

-- Formulaire du site : ouvert aux visiteurs (anon) comme aux personnes connectées.
create function public.request_demo(
  p_full_name text,
  p_agency_name text,
  p_country_code text,
  p_phone text,
  p_email text,
  p_message text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := trim(coalesce(p_phone, ''));
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  if char_length(trim(coalesce(p_full_name, ''))) not between 2 and 120 then
    raise exception 'Indiquez votre nom (de 2 à 120 caractères).';
  end if;
  if char_length(trim(coalesce(p_agency_name, ''))) not between 2 and 160 then
    raise exception 'Indiquez le nom de votre agence.';
  end if;
  if coalesce(p_country_code, '') !~ '^[A-Z]{2}$' then
    raise exception 'Choisissez votre pays.';
  end if;
  if char_length(v_phone) not between 6 and 40 then
    raise exception 'Indiquez un numéro de téléphone ou WhatsApp.';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse e-mail invalide.';
  end if;
  if char_length(coalesce(p_message, '')) > 1000 then
    raise exception 'Message trop long (1 000 caractères au plus).';
  end if;
  if (
    select count(*) from private.demo_requests d
    where d.created_at > now() - interval '1 day' and (d.phone = v_phone or (v_email is not null and d.email = v_email))
  ) >= 3 then
    raise exception 'Votre demande a déjà été reçue : l''équipe SELECT vous recontacte rapidement.';
  end if;
  if (select count(*) from private.demo_requests d where d.created_at > now() - interval '1 day') >= 300 then
    raise exception 'Trop de demandes aujourd''hui : réessayez demain, ou écrivez-nous directement.';
  end if;

  insert into private.demo_requests (full_name, agency_name, country_code, phone, email, message)
  values (trim(p_full_name), trim(p_agency_name), p_country_code, v_phone, v_email, trim(coalesce(p_message, '')));
end;
$$;

-- Console SELECT : liste des demandes, les nouvelles d'abord.
create function public.platform_demo_requests(p_status text default null)
returns table (
  id uuid, created_at timestamptz, full_name text, agency_name text, country_code text, phone text, email text,
  message text, status text, handled_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_platform_admin();
  return query
  select d.id, d.created_at, d.full_name, d.agency_name, d.country_code, d.phone, d.email, d.message, d.status, d.handled_at
  from private.demo_requests d
  where p_status is null or d.status = p_status
  order by (d.status = 'new') desc, d.created_at desc
  limit 500;
end;
$$;

create function public.platform_set_demo_request_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_request private.demo_requests;
begin
  perform private.require_platform_admin();
  if p_status not in ('new', 'contacted', 'closed') then
    raise exception 'Statut inconnu.';
  end if;
  update private.demo_requests d
  set status = p_status, handled_at = case when p_status = 'new' then null else now() end
  where d.id = p_id
  returning * into v_request;
  if v_request.id is null then
    raise exception 'Demande introuvable.';
  end if;
  perform private.log_platform_action('demo.status_changed', null, jsonb_build_object('agence', v_request.agency_name, 'status', p_status));
end;
$$;

revoke all on function
  public.request_demo(text, text, text, text, text, text),
  public.platform_demo_requests(text),
  public.platform_set_demo_request_status(uuid, text)
from public, anon;

grant execute on function public.request_demo(text, text, text, text, text, text) to anon, authenticated;

grant execute on function
  public.platform_demo_requests(text),
  public.platform_set_demo_request_status(uuid, text)
to authenticated;
