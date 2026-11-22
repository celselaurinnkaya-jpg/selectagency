-- SELECT Agency — Membres qui ne pointent pas (rapport de re-test du 22 novembre 2026).
--
-- Le propriétaire (souvent à l'étranger) était compté absent tous les jours. Le propriétaire et les
-- administrateurs choisissent les membres dispensés de pointage : ils ne sont plus comptés absents et le
-- bouton de pointage ne leur est plus proposé. Leurs présences déjà enregistrées restent consultables.

alter table public.attendance_settings add column exempt_member_ids uuid[] not null default '{}';

create function public.save_attendance_exemptions(p_organization_id uuid, p_member_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[] := coalesce((select array_agg(distinct x order by x) from unnest(coalesce(p_member_ids, '{}')) x), '{}');
begin
  if not private.has_role(p_organization_id, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs choisissent qui pointe.';
  end if;
  if exists (
    select 1 from unnest(v_ids) x
    where not exists (select 1 from public.members m where m.id = x and m.organization_id = p_organization_id and m.removed_at is null)
  ) then
    raise exception 'Membre introuvable dans l''équipe.';
  end if;
  insert into public.attendance_settings as s (organization_id, exempt_member_ids, updated_by)
  values (p_organization_id, v_ids, private.member_id(p_organization_id))
  on conflict (organization_id) do update set exempt_member_ids = excluded.exempt_member_ids, updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.save_attendance_exemptions(uuid, uuid[]) from public, anon;
grant execute on function public.save_attendance_exemptions(uuid, uuid[]) to authenticated;
