-- SELECT Agency — Bureaux d'une agence (demande de l'utilisateur du 25/11/2026).
--
-- Une agence peut avoir plusieurs bureaux (villes, points de vente) dans le même compte et le même abonnement.
-- - Chaque bureau : nom, code court (badge « DLA »), ville, couleur, coordonnées (reçus et factures).
-- - Chaque membre est rattaché à un ou plusieurs bureaux ; chaque client (et prospect) à un bureau, rempli avec le
--   bureau du conseiller qui le crée ; chaque paiement au bureau où il est encaissé (caisse par bureau).
-- - Nombre de bureaux selon la formule : STARTER 1, PRO 3, BUSINESS sans limite (essai : sans limite).
-- - Visibilité par bureau (réglage de l'agence, désactivé au départ) : les conseillers, comptables et lectures
--   seules ne voient que les clients de leurs bureaux (et ceux sans bureau) ; propriétaire et administrateurs
--   voient tout. Règles « restrictives » ajoutées PAR-DESSUS les règles existantes, sans les modifier : elles ne
--   changent rien pour une agence qui n'active pas le réglage, ni pour les partenaires et l'espace client.

-- 1. Bureaux ------------------------------------------------------------------------------------------------------

create table public.bureaux (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  code text not null check (code ~ '^[A-Z0-9]{2,5}$'),
  city text not null default '' check (char_length(city) <= 80),
  color text not null default '#023764' check (color ~ '^#[0-9A-F]{6}$'),
  address text not null default '' check (char_length(address) <= 200),
  phone text not null default '' check (char_length(phone) <= 40),
  email text not null default '' check (char_length(email) <= 254),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create unique index bureaux_code_idx on public.bureaux (organization_id, code) where archived_at is null;
create trigger bureaux_touch before update on public.bureaux for each row execute function private.touch_updated_at();

create table public.member_bureaux (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null,
  bureau_id uuid not null,
  primary key (member_id, bureau_id),
  foreign key (organization_id, member_id) references public.members (organization_id, id) on delete cascade,
  foreign key (organization_id, bureau_id) references public.bureaux (organization_id, id) on delete cascade
);

create index member_bureaux_bureau_idx on public.member_bureaux (bureau_id);

alter table public.bureaux enable row level security;
alter table public.member_bureaux enable row level security;
revoke all on public.bureaux, public.member_bureaux from anon;
revoke insert, update, delete on public.bureaux, public.member_bureaux from authenticated;

-- Lecture par les membres de l'agence ; écriture seulement par les fonctions ci-dessous.
create policy bureaux_select on public.bureaux for select to authenticated
  using (organization_id in (select private.my_org_ids()));
create policy member_bureaux_select on public.member_bureaux for select to authenticated
  using (organization_id in (select private.my_org_ids()));

-- 2. Bureau d'un client, d'un paiement, d'une clôture de caisse ; réglage de visibilité --------------------------

alter table public.clients add column bureau_id uuid;
alter table public.clients add constraint clients_bureau_fk
  foreign key (organization_id, bureau_id) references public.bureaux (organization_id, id) on delete set null (bureau_id);
create index clients_bureau_idx on public.clients (organization_id, bureau_id);

alter table public.payments add column bureau_id uuid;
alter table public.payments add constraint payments_bureau_fk
  foreign key (organization_id, bureau_id) references public.bureaux (organization_id, id) on delete set null (bureau_id);
create index payments_bureau_idx on public.payments (organization_id, bureau_id);

alter table public.organizations add column restrict_by_bureau boolean not null default false;

-- Un seul bureau pour le membre : c'est le sien (sinon : vide, le formulaire le fait choisir).
create function private.single_bureau_of(p_member_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select case when count(*) = 1 then min(mb.bureau_id::text)::uuid end
  from public.member_bureaux mb
  join public.bureaux b on b.id = mb.bureau_id and b.archived_at is null
  where mb.member_id = p_member_id;
$$;

-- Nouveau client sans bureau choisi : celui du conseiller qui le crée, s'il n'en a qu'un.
create function private.client_default_bureau() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.bureau_id is null and not private.importing() then
    new.bureau_id := private.single_bureau_of(private.member_id(new.organization_id));
  end if;
  return new;
end;
$$;

create trigger clients_default_bureau before insert on public.clients
for each row execute function private.client_default_bureau();

-- Changement de bureau d'une fiche (transfert) : noté dans son historique.
create function private.log_client_bureau_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.importing() or new.bureau_id is not distinct from old.bureau_id then
    return null;
  end if;
  insert into public.activity_events (organization_id, actor_id, client_id, text)
  values (
    new.organization_id, private.member_id(new.organization_id), new.id,
    format('Fiche %s transférée : bureau %s → bureau %s.', new.reference,
      coalesce((select b.name from public.bureaux b where b.id = old.bureau_id), 'aucun'),
      coalesce((select b.name from public.bureaux b where b.id = new.bureau_id), 'aucun'))
  );
  return null;
end;
$$;

create trigger clients_bureau_history after update of bureau_id on public.clients
for each row execute function private.log_client_bureau_change();

-- Paiement : bureau où il est encaissé (celui du membre qui le reçoit s'il n'en a qu'un, sinon celui du client).
create function private.payment_default_bureau() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.bureau_id is null then
    new.bureau_id := coalesce(
      private.single_bureau_of(new.received_by),
      (select c.bureau_id from public.clients c where c.id = new.client_id)
    );
  end if;
  return new;
end;
$$;

create trigger payments_default_bureau before insert on public.payments
for each row execute function private.payment_default_bureau();

-- 3. Gestion des bureaux (propriétaire et administrateurs) --------------------------------------------------------

-- Nombre de bureaux selon la formule ; sans limite pendant l'essai, en démonstration ou pour une ancienne formule.
create function private.bureau_limit(p_org uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select case
    when o.is_demo or s.organization_id is null or s.status = 'trialing' or pl.tier is null then null
    when pl.tier = 'starter' then 1
    when pl.tier = 'pro' then 3
    else null
  end
  from public.organizations o
  left join public.subscriptions s on s.organization_id = o.id
  left join public.plans pl on pl.id = s.plan_id
  where o.id = p_org;
$$;

create function public.save_bureau(
  p_org uuid, p_id uuid, p_name text, p_code text, p_city text, p_color text, p_address text, p_phone text, p_email text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_color text := upper(trim(coalesce(p_color, '')));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_limit integer;
  v_id uuid;
begin
  if not private.has_role(p_org, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs de l''agence gèrent les bureaux.';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 80 then
    raise exception 'Indiquez le nom du bureau (de 2 à 80 caractères).';
  end if;
  if v_code !~ '^[A-Z0-9]{2,5}$' then
    raise exception 'Code du bureau invalide : de 2 à 5 lettres ou chiffres (exemple : DLA).';
  end if;
  if v_color !~ '^#[0-9A-F]{6}$' then
    v_color := '#023764';
  end if;
  if v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse e-mail du bureau invalide.';
  end if;
  if exists (
    select 1 from public.bureaux b
    where b.organization_id = p_org and b.code = v_code and b.archived_at is null and b.id is distinct from p_id
  ) then
    raise exception 'Un autre bureau utilise déjà le code %.', v_code;
  end if;

  if p_id is null then
    v_limit := private.bureau_limit(p_org);
    if v_limit is not null and (select count(*) from public.bureaux b where b.organization_id = p_org and b.archived_at is null) >= v_limit then
      raise exception 'Votre formule permet % bureau(x). Passez à une formule supérieure dans Paramètres, Abonnement.', v_limit;
    end if;
    insert into public.bureaux (organization_id, name, code, city, color, address, phone, email)
    values (p_org, trim(p_name), v_code, trim(coalesce(p_city, '')), v_color, trim(coalesce(p_address, '')), trim(coalesce(p_phone, '')), v_email)
    returning id into v_id;
    insert into public.activity_events (organization_id, actor_id, text)
    values (p_org, private.member_id(p_org), format('Bureau « %s » (%s) créé.', trim(p_name), v_code));
  else
    update public.bureaux b set
      name = trim(p_name), code = v_code, city = trim(coalesce(p_city, '')), color = v_color,
      address = trim(coalesce(p_address, '')), phone = trim(coalesce(p_phone, '')), email = v_email
    where b.id = p_id and b.organization_id = p_org
    returning b.id into v_id;
    if v_id is null then
      raise exception 'Bureau introuvable.';
    end if;
  end if;
  return v_id;
end;
$$;

-- Fermer (ou rouvrir) un bureau : ses clients et ses paiements gardent leur bureau ; il n'est plus proposé.
create function public.set_bureau_archived(p_id uuid, p_archived boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_bureau public.bureaux;
  v_limit integer;
begin
  select * into v_bureau from public.bureaux b where b.id = p_id for update;
  if not found or not private.has_role(v_bureau.organization_id, array['owner', 'admin']) then
    raise exception 'Bureau introuvable, ou vous n''avez pas le droit de le modifier.';
  end if;
  if not coalesce(p_archived, false) and v_bureau.archived_at is not null then
    v_limit := private.bureau_limit(v_bureau.organization_id);
    if v_limit is not null and (select count(*) from public.bureaux b where b.organization_id = v_bureau.organization_id and b.archived_at is null) >= v_limit then
      raise exception 'Votre formule permet % bureau(x). Passez à une formule supérieure dans Paramètres, Abonnement.', v_limit;
    end if;
    if exists (select 1 from public.bureaux b where b.organization_id = v_bureau.organization_id and b.code = v_bureau.code and b.archived_at is null) then
      raise exception 'Un autre bureau utilise déjà le code %.', v_bureau.code;
    end if;
  end if;
  update public.bureaux b set archived_at = case when coalesce(p_archived, false) then coalesce(b.archived_at, now()) end where b.id = p_id;
  insert into public.activity_events (organization_id, actor_id, text)
  values (v_bureau.organization_id, private.member_id(v_bureau.organization_id),
          format('Bureau « %s » %s.', v_bureau.name, case when coalesce(p_archived, false) then 'fermé' else 'rouvert' end));
end;
$$;

-- Bureaux d'un membre (liste complète, remplace la précédente).
create function public.set_member_bureaux(p_member_id uuid, p_bureau_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.members;
begin
  select * into v_member from public.members m where m.id = p_member_id;
  if not found or not private.has_role(v_member.organization_id, array['owner', 'admin']) then
    raise exception 'Membre introuvable, ou vous n''avez pas le droit de modifier ses bureaux.';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_bureau_ids, '{}')) as x(id)
    where not exists (select 1 from public.bureaux b where b.id = x.id and b.organization_id = v_member.organization_id)
  ) then
    raise exception 'Bureau introuvable.';
  end if;
  delete from public.member_bureaux mb where mb.member_id = p_member_id;
  insert into public.member_bureaux (organization_id, member_id, bureau_id)
  select v_member.organization_id, p_member_id, x.id from unnest(coalesce(p_bureau_ids, '{}')) as x(id)
  on conflict do nothing;
end;
$$;

-- Visibilité par bureau : réglage du propriétaire.
create function public.set_bureau_restriction(p_org uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role(p_org, array['owner']) then
    raise exception 'Seul le propriétaire de l''agence choisit qui voit les clients de chaque bureau.';
  end if;
  update public.organizations o set restrict_by_bureau = coalesce(p_on, false) where o.id = p_org;
  insert into public.activity_events (organization_id, actor_id, text)
  values (p_org, private.member_id(p_org), case when coalesce(p_on, false)
    then 'Visibilité par bureau activée : conseillers, comptables et lectures seules ne voient que les clients de leurs bureaux.'
    else 'Visibilité par bureau désactivée : chaque membre voit les clients de tous les bureaux.' end);
end;
$$;

-- 4. Visibilité par bureau (règles restrictives) ------------------------------------------------------------------

-- Agences où je suis cloisonné : réglage activé et rôle autre que propriétaire ou administrateur.
create function private.my_restricted_org_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.organization_id
  from public.members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid()) and m.removed_at is null and o.restrict_by_bureau and m.role not in ('owner', 'admin');
$$;

create function private.my_bureau_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select mb.bureau_id
  from public.member_bureaux mb
  join public.members m on m.id = mb.member_id
  where m.user_id = (select auth.uid()) and m.removed_at is null;
$$;

-- Clients que je vois dans les agences où je suis cloisonné : ceux de mes bureaux, et ceux sans bureau.
create function private.restricted_visible_client_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select c.id
  from public.clients c
  where c.organization_id in (select private.my_restricted_org_ids())
    and (c.bureau_id is null or c.bureau_id in (select private.my_bureau_ids()));
$$;

create function private.restricted_visible_case_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select k.id from public.cases k where k.client_id in (select private.restricted_visible_client_ids());
$$;

-- Fiches clients : d'après leur bureau (vérifié aussi à l'écriture : pas de client créé dans un autre bureau).
create policy clients_bureau on public.clients as restrictive for all to authenticated
  using (
    organization_id not in (select private.my_restricted_org_ids())
    or bureau_id is null
    or bureau_id in (select private.my_bureau_ids())
  );

-- Données rattachées à un client et/ou à un dossier : visibles si le client (et le dossier) le sont.
do $$
declare
  t text;
begin
  -- Tables avec client_id et case_id.
  foreach t in array array[
    'appointments', 'tasks', 'payments', 'activity_events', 'communication_logs', 'quotes', 'invoices', 'service_clients', 'email_outbox'
  ] loop
    execute format(
      'create policy %1$s_bureau on public.%1$I as restrictive for all to authenticated
         using (
           organization_id not in (select private.my_restricted_org_ids())
           or ((client_id is null or client_id in (select private.restricted_visible_client_ids()))
               and (case_id is null or case_id in (select private.restricted_visible_case_ids())))
         )',
      t
    );
  end loop;
  -- Tables avec client_id seulement.
  foreach t in array array['cases', 'client_sensitive', 'partner_commissions', 'client_portal_access'] loop
    execute format(
      'create policy %1$s_bureau on public.%1$I as restrictive for all to authenticated
         using (organization_id not in (select private.my_restricted_org_ids()) or client_id in (select private.restricted_visible_client_ids()))',
      t
    );
  end loop;
  -- Tables avec case_id seulement.
  foreach t in array array['case_steps', 'document_requirements', 'charges', 'expenses'] loop
    execute format(
      'create policy %1$s_bureau on public.%1$I as restrictive for all to authenticated
         using (
           organization_id not in (select private.my_restricted_org_ids())
           or case_id is null
           or case_id in (select private.restricted_visible_case_ids())
         )',
      t
    );
  end loop;
end;
$$;

-- Pièces des dossiers (stockage « documents », chemin agence/dossier/…) : même règle en lecture.
create policy select_agency_documents_bureau on storage.objects as restrictive for select to authenticated
  using (
    bucket_id <> 'documents'
    or split_part(name, '/', 1) not in (select x::text from private.my_restricted_org_ids() as x)
    or split_part(name, '/', 2) in (select x::text from private.restricted_visible_case_ids() as x)
  );

-- 5. Clôture de caisse par bureau ---------------------------------------------------------------------------------

alter table public.cash_closings add column bureau_id uuid;
alter table public.cash_closings add constraint cash_closings_bureau_fk
  foreign key (organization_id, bureau_id) references public.bureaux (organization_id, id) on delete set null (bureau_id);
alter table public.cash_closings drop constraint if exists cash_closings_organization_id_closing_date_currency_key;
alter table public.cash_closings add constraint cash_closings_day_key
  unique nulls not distinct (organization_id, closing_date, currency, bureau_id);

drop function public.close_daily_cash(date, text, bigint, text);

-- Même fonction que la migration 20261122180000, avec le bureau en plus (vide = toute l'agence).
create function public.close_daily_cash(
  p_closing_date date,
  p_currency text,
  p_actual_cash_minor bigint,
  p_notes text default null,
  p_bureau_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.members;
  v_org uuid;
  v_bureau public.bureaux;
  v_expected_cash bigint := 0;
  v_total_collected bigint := 0;
  v_breakdown jsonb := '{}'::jsonb;
  v_closing public.cash_closings;
  v_event text;
begin
  select * into v_member from public.members m where m.user_id = auth.uid() and m.removed_at is null order by m.created_at limit 1;
  if not found then
    raise exception 'Membre introuvable.';
  end if;
  v_org := v_member.organization_id;
  if not private.has_role(v_org, array['owner', 'admin', 'accountant']) then
    raise exception 'Seuls le propriétaire, les administrateurs et le comptable peuvent clôturer la caisse.';
  end if;
  if p_bureau_id is not null then
    select * into v_bureau from public.bureaux b where b.id = p_bureau_id and b.organization_id = v_org;
    if not found then
      raise exception 'Bureau introuvable.';
    end if;
  end if;
  if p_closing_date is null or p_closing_date > private.attendance_day(v_org, now()) then
    raise exception 'Choisissez une journée passée ou celle d''aujourd''hui.';
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'Devise invalide.';
  end if;
  if p_actual_cash_minor is null or p_actual_cash_minor < 0 then
    raise exception 'Le montant des espèces comptées est invalide.';
  end if;

  select
    coalesce(sum(case when p.method_kind = 'cash' then p.m_sum else 0 end), 0),
    coalesce(sum(p.m_sum), 0),
    coalesce(jsonb_object_agg(p.method_kind, p.m_sum), '{}'::jsonb)
  into v_expected_cash, v_total_collected, v_breakdown
  from (
    select pay.method_kind, sum(pay.amount_minor) as m_sum
    from public.payments pay
    where pay.organization_id = v_org
      and pay.currency = p_currency
      and pay.status = 'recorded'
      and private.attendance_day(v_org, pay.paid_at) = p_closing_date
      and (p_bureau_id is null or pay.bureau_id = p_bureau_id)
    group by pay.method_kind
  ) p;

  insert into public.cash_closings (
    organization_id, closing_date, currency, bureau_id, closed_by, closed_at,
    expected_cash_minor, actual_cash_minor, total_collected_minor, breakdown, notes
  ) values (
    v_org, p_closing_date, p_currency, p_bureau_id, v_member.id, now(),
    v_expected_cash, p_actual_cash_minor, v_total_collected, v_breakdown, nullif(trim(coalesce(p_notes, '')), '')
  )
  on conflict (organization_id, closing_date, currency, bureau_id) do update set
    closed_by = excluded.closed_by,
    closed_at = excluded.closed_at,
    expected_cash_minor = excluded.expected_cash_minor,
    actual_cash_minor = excluded.actual_cash_minor,
    total_collected_minor = excluded.total_collected_minor,
    breakdown = excluded.breakdown,
    notes = excluded.notes
  returning * into v_closing;

  v_event := format(
    'Clôture de caisse du %s%s : total encaissé %s, espèces attendues %s, espèces comptées %s (écart : %s).',
    to_char(p_closing_date, 'DD/MM/YYYY'),
    case when v_bureau.id is not null then format(' (bureau %s)', v_bureau.name) else '' end,
    private.format_money(v_total_collected, p_currency),
    private.format_money(v_expected_cash, p_currency),
    private.format_money(p_actual_cash_minor, p_currency),
    private.format_money(v_closing.discrepancy_minor, p_currency)
  );
  insert into public.activity_events (organization_id, actor_id, text)
  values (v_org, v_member.id, v_event);

  return to_jsonb(v_closing);
end;
$$;

-- 6. Site web : le visiteur choisit son bureau -----------------------------------------------------------------------

create or replace function public.public_agency_website(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_site public.agency_websites;
  v_org public.organizations;
begin
  select * into v_site from public.agency_websites w
  where w.slug = lower(trim(coalesce(p_slug, ''))) and w.is_online and w.published is not null;
  if not found then
    return null;
  end if;
  if not private.org_has_feature(v_site.organization_id, 'website') or not private.org_can_write(v_site.organization_id) then
    return null;
  end if;
  select * into v_org from public.organizations o where o.id = v_site.organization_id;
  return jsonb_build_object(
    'slug', v_site.slug,
    'content', v_site.published,
    'published_at', v_site.published_at,
    'country_code', v_org.country_code,
    -- Bureaux ouverts (nom et ville seulement) : le visiteur choisit celui qui lui convient.
    'bureaux', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'city', b.city) order by b.name)
      from public.bureaux b where b.organization_id = v_org.id and b.archived_at is null
    ), '[]'::jsonb)
  );
end;
$$;

drop function public.website_submit_lead(text, text, text, text, text, text, text, text, text);

create function public.website_submit_lead(
  p_slug text, p_first_name text, p_last_name text, p_phone text, p_email text, p_service text, p_destination text, p_message text,
  p_service_motive text default null, p_bureau_id uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_site public.agency_websites;
  v_org public.organizations;
  v_owner uuid;
  v_phone text := trim(coalesce(p_phone, ''));
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_first text := trim(coalesce(p_first_name, ''));
  v_last text := trim(coalesce(p_last_name, ''));
  v_motive text := case
    when p_service_motive in ('study_abroad', 'tourist_visa', 'business_travel', 'family_reunion', 'administrative', 'custom_trip', 'other')
    then p_service_motive
  end;
  v_bureau uuid;
  v_client_id uuid;
  v_reference text;
  v_notes text;
begin
  select * into v_site from public.agency_websites w
  where w.slug = lower(trim(coalesce(p_slug, ''))) and w.is_online and w.published is not null;
  if not found or not private.org_has_feature(v_site.organization_id, 'website') or not private.org_can_write(v_site.organization_id) then
    raise exception 'Ce site n''est pas disponible.';
  end if;
  if char_length(v_first) not between 1 and 80 or char_length(v_last) not between 1 and 80 then
    raise exception 'Indiquez votre prénom et votre nom.';
  end if;
  if v_phone !~ '^\+[0-9]{6,15}$' then
    raise exception 'Numéro de téléphone invalide.';
  end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Adresse e-mail invalide.';
  end if;
  if char_length(coalesce(p_service, '')) > 120 or char_length(coalesce(p_destination, '')) > 120 or char_length(coalesce(p_message, '')) > 1500 then
    raise exception 'Message trop long.';
  end if;

  select * into v_org from public.organizations o where o.id = v_site.organization_id;
  -- Bureau choisi par le visiteur : seulement un bureau ouvert de cette agence.
  select b.id into v_bureau from public.bureaux b where b.id = p_bureau_id and b.organization_id = v_org.id and b.archived_at is null;

  -- Anti-abus : au plus 3 demandes par numéro et par jour, 100 demandes par jour pour un site.
  if (
    select count(*) from public.activity_events e
    join public.clients c on c.id = e.client_id
    where e.organization_id = v_org.id and c.phone_e164 = v_phone
      and e.at > now() - interval '1 day' and e.text like '%par le site web de l''agence%'
  ) >= 3 then
    raise exception 'Votre demande a déjà été reçue : l''agence vous recontacte rapidement.';
  end if;
  if (
    select count(*) from public.activity_events e
    where e.organization_id = v_org.id and e.at > now() - interval '1 day' and e.text like '%par le site web de l''agence%'
  ) >= 100 then
    raise exception 'Trop de demandes aujourd''hui : réessayez demain, ou contactez l''agence par téléphone.';
  end if;

  select m.id into v_owner from public.members m
  where m.organization_id = v_org.id and m.role = 'owner' and m.removed_at is null
  order by m.created_at limit 1;
  if v_owner is null then
    raise exception 'Ce site n''est pas disponible.';
  end if;

  v_notes := left(concat_ws(E'\n',
    'Demande reçue par le site web de l''agence.',
    case when v_bureau is not null then 'Bureau choisi : ' || (select b.name from public.bureaux b where b.id = v_bureau) end,
    case when coalesce(trim(p_service), '') <> '' then 'Service souhaité : ' || trim(p_service) end,
    case when coalesce(trim(p_destination), '') <> '' then 'Destination : ' || trim(p_destination) end,
    case when coalesce(trim(p_message), '') <> '' then 'Message : ' || trim(p_message) end
  ), 2000);

  perform set_config('select_agency.importing', 'on', true);

  select c.id, c.reference into v_client_id, v_reference from public.clients c
  where c.organization_id = v_org.id and c.phone_e164 = v_phone and c.archived_at is null
  order by c.registered_at limit 1;

  if v_client_id is null then
    insert into public.clients (
      organization_id, reference, client_type, first_name, last_name, email, phone_e164, whatsapp_e164,
      residence_country, city, assigned_to, status, source, source_detail, notes, service_motive, bureau_id
    ) values (
      v_org.id, private.formatted_number(v_org.id, 'client', 'CLI'), 'individual', v_first, v_last, v_email, v_phone, v_phone,
      v_org.country_code, '', v_owner, 'prospect', 'website', 'Formulaire du site', v_notes, v_motive, v_bureau
    ) returning id, reference into v_client_id, v_reference;
    insert into public.activity_events (organization_id, actor_id, at, client_id, text)
    values (v_org.id, v_owner, now(), v_client_id,
            format('Prospect %s reçu par le site web de l''agence (formulaire de contact).', v_reference));
  else
    insert into public.activity_events (organization_id, actor_id, at, client_id, text)
    values (v_org.id, v_owner, now(), v_client_id,
            left(format('Nouvelle demande reçue par le site web de l''agence. %s', replace(v_notes, E'\n', ' · ')), 600));
  end if;

  insert into public.tasks (organization_id, title, assigned_to, due_at, priority, status, client_id)
  values (v_org.id, left(format('Rappeler %s %s (demande du site web)', v_first, v_last), 160), v_owner, now(), 'high', 'todo', v_client_id);

  perform set_config('select_agency.importing', 'off', true);
end;
$$;

-- Droits d'exécution -------------------------------------------------------------------------------------------

revoke all on function
  private.single_bureau_of(uuid),
  private.client_default_bureau(),
  private.log_client_bureau_change(),
  private.payment_default_bureau(),
  private.bureau_limit(uuid)
from public, anon, authenticated;

-- Fonctions des règles de visibilité : appelées par les règles, donc ouvertes aux personnes connectées.
revoke all on function
  private.my_restricted_org_ids(), private.my_bureau_ids(), private.restricted_visible_client_ids(), private.restricted_visible_case_ids()
from public, anon;
grant execute on function
  private.my_restricted_org_ids(), private.my_bureau_ids(), private.restricted_visible_client_ids(), private.restricted_visible_case_ids()
to authenticated;

revoke all on function
  public.save_bureau(uuid, uuid, text, text, text, text, text, text, text),
  public.set_bureau_archived(uuid, boolean),
  public.set_member_bureaux(uuid, uuid[]),
  public.set_bureau_restriction(uuid, boolean),
  public.close_daily_cash(date, text, bigint, text, uuid),
  public.website_submit_lead(text, text, text, text, text, text, text, text, text, uuid)
from public, anon;

grant execute on function
  public.save_bureau(uuid, uuid, text, text, text, text, text, text, text),
  public.set_bureau_archived(uuid, boolean),
  public.set_member_bureaux(uuid, uuid[]),
  public.set_bureau_restriction(uuid, boolean),
  public.close_daily_cash(date, text, bigint, text, uuid)
to authenticated;

grant execute on function public.website_submit_lead(text, text, text, text, text, text, text, text, text, uuid) to anon, authenticated;
