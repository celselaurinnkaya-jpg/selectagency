-- SELECT Agency — Correction de la clôture de caisse (migration 20261122170000).
--
-- 1. La fonction lisait une colonne « method » qui n'existe pas dans public.payments (la colonne s'appelle
--    « method_kind ») : chaque clôture échouait.
-- 2. Le jour était calculé en heure UTC, alors que l'écran affiche les encaissements du jour de l'agence
--    (fuseau de l'agence) : les deux totaux pouvaient différer en début ou en fin de journée.
-- 3. L'historique affichait les montants en unités brutes (« 150000 ») : ils sont maintenant formatés.
-- Même signature : les droits accordés à la fonction sont conservés.

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
  select * into v_member from public.members m where m.user_id = auth.uid() and m.removed_at is null order by m.created_at limit 1;
  if not found then
    raise exception 'Membre introuvable.';
  end if;
  v_org := v_member.organization_id;
  if not private.has_role(v_org, array['owner', 'admin', 'accountant']) then
    raise exception 'Seuls le propriétaire, les administrateurs et le comptable peuvent clôturer la caisse.';
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

  -- Encaissements confirmés de la journée de l'agence (son fuseau), par moyen de paiement.
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
    group by pay.method_kind
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
    'Clôture de caisse du %s : total encaissé %s, espèces attendues %s, espèces comptées %s (écart : %s).',
    to_char(p_closing_date, 'DD/MM/YYYY'),
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
