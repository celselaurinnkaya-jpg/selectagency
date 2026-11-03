-- SELECT Agency — Modèles d'étapes personnalisés par l'agence.
--
-- Les modèles de départ (études en France par Campus France ou Parcoursup, école privée, visa
-- touristique…) sont fournis par l'application. Une agence peut adapter les étapes d'un modèle à sa
-- façon de travailler : renommer, ajouter, déplacer, retirer. Sa version remplace celle de départ pour
-- les dossiers qu'elle ouvre ensuite ; les dossiers déjà ouverts gardent leur copie. Revenir au modèle
-- de départ efface la version de l'agence.

create table public.workflow_templates (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  template_key text not null check (template_key ~ '^[a-z_]{2,40}$'),
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 2 and 60),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (organization_id, template_key),
  foreign key (organization_id, updated_by) references public.members (organization_id, id)
);

create index workflow_templates_updated_by_idx on public.workflow_templates (organization_id, updated_by);

alter table public.workflow_templates enable row level security;
revoke all on public.workflow_templates from anon;
revoke insert, update, delete on public.workflow_templates from authenticated;
grant select on public.workflow_templates to authenticated;

create policy workflow_templates_select on public.workflow_templates for select to authenticated
  using (organization_id in (select private.my_org_ids()));

-- Enregistre la version de l'agence. L'application vérifie la forme détaillée (transitions, étapes
-- liées à une décision) ; la base garantit le minimum : clés uniques, libellés, types, clôture finale.
create function public.save_workflow_template(p_organization_id uuid, p_template_key text, p_steps jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  if not private.has_role(p_organization_id, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs peuvent modifier les modèles d''étapes.';
  end if;
  if p_template_key is null or p_template_key !~ '^[a-z_]{2,40}$' then
    raise exception 'Modèle inconnu.';
  end if;
  if jsonb_typeof(p_steps) is distinct from 'array' or jsonb_array_length(p_steps) not between 2 and 60 then
    raise exception 'Un modèle compte de 2 à 60 étapes.';
  end if;
  select count(*) into v_count
  from jsonb_array_elements(p_steps) s
  where coalesce(s ->> 'key', '') !~ '^[a-z0-9_]{1,40}$'
     or char_length(trim(coalesce(s ->> 'label', ''))) not between 2 and 120
     or coalesce(s ->> 'kind', '') not in ('agency_action', 'client_action', 'external_event', 'outcome', 'closure');
  if v_count > 0 then
    raise exception 'Chaque étape doit avoir un nom de 2 à 120 caractères et un type connu.';
  end if;
  if (select count(distinct s ->> 'key') from jsonb_array_elements(p_steps) s) <> jsonb_array_length(p_steps) then
    raise exception 'Deux étapes portent la même clé.';
  end if;
  if p_steps -> -1 ->> 'kind' is distinct from 'closure' then
    raise exception 'La dernière étape doit être la clôture du dossier.';
  end if;

  insert into public.workflow_templates (organization_id, template_key, steps, updated_by)
  values (p_organization_id, p_template_key, p_steps, private.member_id(p_organization_id))
  on conflict (organization_id, template_key) do update
    set steps = excluded.steps, updated_by = excluded.updated_by, updated_at = now();
end;
$$;

create function public.reset_workflow_template(p_organization_id uuid, p_template_key text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role(p_organization_id, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs peuvent modifier les modèles d''étapes.';
  end if;
  delete from public.workflow_templates w where w.organization_id = p_organization_id and w.template_key = p_template_key;
end;
$$;

revoke all on function public.save_workflow_template(uuid, text, jsonb), public.reset_workflow_template(uuid, text) from public, anon;
grant execute on function public.save_workflow_template(uuid, text, jsonb), public.reset_workflow_template(uuid, text) to authenticated;
