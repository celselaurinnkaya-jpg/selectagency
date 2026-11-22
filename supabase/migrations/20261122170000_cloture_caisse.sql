-- SELECT Agency — Clôture de caisse journalière (point 17 du plan d'action du 22 novembre 2026).
--
-- Permet à l'agence d'arrêter les comptes de la journée :
-- - Récapitulatif automatique des encaissements confirmés de la date (espèces, Mobile Money, virement...).
-- - Saisie du comptage physique des espèces pour détecter et tracer les écarts de caisse.
-- - Verrouillage avec date, heure, nom de l'agent ou du propriétaire ayant clôturé, et observation éventuelle.
-- - Réservé aux rôles qui gèrent la finance : propriétaire, administrateur, comptable.

create table if not exists public.cash_closings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  closing_date date not null,
  currency text not null,
  closed_by uuid not null references public.members (id),
  closed_at timestamptz not null default now(),
  expected_cash_minor bigint not null default 0 check (expected_cash_minor >= 0),
  actual_cash_minor bigint not null default 0 check (actual_cash_minor >= 0),
  discrepancy_minor bigint generated always as (actual_cash_minor - expected_cash_minor) stored,
  total_collected_minor bigint not null default 0 check (total_collected_minor >= 0),
  breakdown jsonb not null default '{}'::jsonb,
  notes text check (notes is null or char_length(notes) <= 500),
  unique (organization_id, closing_date, currency)
);

alter table public.cash_closings enable row level security;
revoke all on public.cash_closings from anon;
revoke insert, update, delete on public.cash_closings from authenticated;
grant select on public.cash_closings to authenticated;

create policy cash_closings_select on public.cash_closings for select to authenticated
  using (organization_id in (select private.member_org_ids_with_role(array['owner', 'admin', 'accountant'])));

create or replace function public.close_daily_cash(
  p_closing_date date,
  p_currency text,
  p_actual_cash_minor bigint,
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.members;
  v_org uuid;
  v_expected_cash bigint := 0;
  v_total_collected bigint := 0;
  v_breakdown jsonb := '{}'::jsonb;
  v_closing public.cash_closings;
  v_event text;
begin
  select * into v_member from public.members m where m.user_id = auth.uid() and m.removed_at is null limit 1;
  if not found then
    raise exception 'Membre introuvable.';
  end if;
  v_org := v_member.organization_id;
  if not private.has_role(v_org, array['owner', 'admin', 'accountant']) then
    raise exception 'Seuls le propriétaire, les administrateurs et le comptable peuvent clôturer la caisse.';
  end if;
  if p_actual_cash_minor is null or p_actual_cash_minor < 0 then
    raise exception 'Le montant des espèces comptées est invalide.';
  end if;

  -- Calcul des encaissements confirmés de la journée pour cette devise
  select
    coalesce(sum(case when p.method = 'cash' then p.amount_minor else 0 end), 0),
    coalesce(sum(p.amount_minor), 0),
    coalesce(jsonb_object_agg(p.method, m_sum), '{}'::jsonb)
  into v_expected_cash, v_total_collected, v_breakdown
  from (
    select method, sum(amount_minor) as m_sum
    from public.payments
    where organization_id = v_org
      and currency = p_currency
      and status = 'recorded'
      and paid_at::date = p_closing_date
    group by method
  ) p;

  insert into public.cash_closings (
    organization_id, closing_date, currency, closed_by, closed_at,
    expected_cash_minor, actual_cash_minor, total_collected_minor,
    breakdown, notes
  ) values (
    v_org, p_closing_date, p_currency, v_member.id, now(),
    v_expected_cash, p_actual_cash_minor, v_total_collected,
    v_breakdown, nullif(trim(coalesce(p_notes, '')), '')
  )
  on conflict (organization_id, closing_date, currency) do update set
    closed_by = excluded.closed_by,
    closed_at = excluded.closed_at,
    expected_cash_minor = excluded.expected_cash_minor,
    actual_cash_minor = excluded.actual_cash_minor,
    total_collected_minor = excluded.total_collected_minor,
    breakdown = excluded.breakdown,
    notes = excluded.notes
  returning * into v_closing;

  v_event := format(
    'Clôture de caisse du %s (%s) : total collecté %s, espèces comptées %s (écart : %s).',
    to_char(p_closing_date, 'DD/MM/YYYY'),
    p_currency,
    v_total_collected,
    p_actual_cash_minor,
    v_closing.discrepancy_minor
  );

  insert into public.activity_events (organization_id, actor_id, text)
  values (v_org, v_member.id, v_event);

  return to_jsonb(v_closing);
end;
$$;

revoke all on function public.close_daily_cash(date, text, bigint, text) from public, anon;
grant execute on function public.close_daily_cash(date, text, bigint, text) to authenticated;
