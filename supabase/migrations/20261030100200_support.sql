-- SELECT Agency — Support : demandes des agences à l'équipe SELECT et réponses.
--
-- Une demande reste possible quand l'abonnement est suspendu : c'est justement là qu'on en a besoin.
-- Dans l'agence, les responsables (propriétaire, administrateur) voient toutes les demandes ; les
-- autres membres, celles qu'ils ont ouvertes. La console y accède par les fonctions platform_*.
-- Les écritures passent toutes par des fonctions (aucune politique d'écriture).

create sequence private.support_ticket_number;
revoke all on sequence private.support_ticket_number from public, anon, authenticated;

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Numéro unique sur toute la plateforme (SUP-2026-00042) : la console traite toutes les agences.
  reference text not null unique,
  subject text not null check (char_length(subject) between 3 and 160),
  category text not null check (category in ('question', 'problem', 'billing', 'account', 'suggestion')),
  status text not null default 'open' check (status in ('open', 'answered', 'resolved')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, created_by) references public.members (organization_id, id)
);

create index support_tickets_org_idx on public.support_tickets (organization_id, updated_at desc);
create index support_tickets_status_idx on public.support_tickets (status, updated_at desc);
create index support_tickets_created_by_idx on public.support_tickets (organization_id, created_by);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ticket_id uuid not null,
  author_kind text not null check (author_kind in ('agency', 'platform')),
  -- Membre de l'agence auteur du message ; vide pour une réponse de l'équipe SELECT.
  author_member_id uuid,
  author_name text not null check (char_length(author_name) between 1 and 120),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (organization_id, ticket_id) references public.support_tickets (organization_id, id) on delete cascade,
  foreign key (organization_id, author_member_id) references public.members (organization_id, id)
);

create index support_messages_ticket_idx on public.support_messages (organization_id, ticket_id, created_at);
create index support_messages_author_idx on public.support_messages (organization_id, author_member_id);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

revoke all on public.support_tickets, public.support_messages from anon;
revoke insert, update, delete on public.support_tickets, public.support_messages from authenticated;
grant select on public.support_tickets, public.support_messages to authenticated;

create policy support_tickets_select on public.support_tickets for select to authenticated
  using (
    organization_id in (select private.member_org_ids_with_role(array['owner', 'admin']))
    or created_by = private.member_id(organization_id)
  );

-- Un message est lisible si sa demande l'est (la RLS de support_tickets s'applique à la sous-requête).
create policy support_messages_select on public.support_messages for select to authenticated
  using (exists (select 1 from public.support_tickets t where t.id = ticket_id));

-- Demande visible par la personne connectée, verrouillée pour la mise à jour ; erreur sinon.
create function private.visible_ticket(p_ticket_id uuid) returns public.support_tickets
language plpgsql security definer set search_path = '' as $$
declare
  v_ticket public.support_tickets;
begin
  select * into v_ticket from public.support_tickets t where t.id = p_ticket_id for update;
  -- coalesce : pour une personne extérieure à l'agence, member_id est vide et la comparaison vaut
  -- NULL, ce qui ferait échapper la condition au refus.
  if not found or not (
    coalesce(private.member_id(v_ticket.organization_id) = v_ticket.created_by, false)
    or exists (
      select 1 from public.members m
      where m.organization_id = v_ticket.organization_id and m.user_id = auth.uid() and m.role in ('owner', 'admin')
    )
  ) then
    raise exception 'Demande introuvable.';
  end if;
  return v_ticket;
end;
$$;

create function public.create_support_ticket(p_subject text, p_category text, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.members;
  v_ticket public.support_tickets;
begin
  select * into v_member from public.members m where m.user_id = auth.uid() and m.removed_at is null order by m.created_at limit 1;
  if v_member.id is null then
    raise exception 'Seul un membre d''une agence peut écrire au support.';
  end if;
  if char_length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Décrivez votre demande.';
  end if;

  insert into public.support_tickets (organization_id, reference, subject, category, created_by)
  values (
    v_member.organization_id,
    'SUP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('private.support_ticket_number')::text, 5, '0'),
    trim(p_subject), p_category, v_member.id
  ) returning * into v_ticket;

  insert into public.support_messages (organization_id, ticket_id, author_kind, author_member_id, author_name, body)
  values (v_member.organization_id, v_ticket.id, 'agency', v_member.id, v_member.full_name, trim(p_body));

  return jsonb_build_object('id', v_ticket.id, 'reference', v_ticket.reference);
end;
$$;

-- Réponse de l'agence : la demande repasse « en attente de SELECT ».
create function public.reply_support_ticket(p_ticket_id uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ticket public.support_tickets := private.visible_ticket(p_ticket_id);
  v_member public.members;
begin
  select * into v_member from public.members m where m.organization_id = v_ticket.organization_id and m.user_id = auth.uid();
  if char_length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Écrivez votre message.';
  end if;
  insert into public.support_messages (organization_id, ticket_id, author_kind, author_member_id, author_name, body)
  values (v_ticket.organization_id, v_ticket.id, 'agency', v_member.id, v_member.full_name, trim(p_body));
  update public.support_tickets t set status = 'open' where t.id = v_ticket.id;
end;
$$;

create function public.resolve_support_ticket(p_ticket_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ticket public.support_tickets := private.visible_ticket(p_ticket_id);
begin
  update public.support_tickets t set status = 'resolved' where t.id = v_ticket.id;
end;
$$;

create trigger support_tickets_touch before update on public.support_tickets
for each row execute function private.touch_updated_at();

-- Console : liste et lecture des demandes, réponse au nom de « l'équipe SELECT » -----------------

create function public.platform_tickets(p_status text default null, p_org uuid default null)
returns table (
  id uuid, reference text, organization_id uuid, organization_name text, subject text, category text, status text,
  created_by_name text, created_at timestamptz, updated_at timestamptz, messages integer
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_platform_admin();
  return query
  select t.id, t.reference, t.organization_id, o.name, t.subject, t.category, t.status, m.full_name, t.created_at, t.updated_at,
    (select count(*)::integer from public.support_messages sm where sm.ticket_id = t.id)
  from public.support_tickets t
  join public.organizations o on o.id = t.organization_id
  left join public.members m on m.id = t.created_by
  where (p_status is null or t.status = p_status) and (p_org is null or t.organization_id = p_org)
  order by (t.status = 'open') desc, t.updated_at desc;
end;
$$;

create function public.platform_ticket(p_ticket_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_result jsonb;
begin
  perform private.require_platform_admin();
  select jsonb_build_object(
    'id', t.id, 'reference', t.reference, 'organization_id', t.organization_id, 'organization_name', o.name,
    'subject', t.subject, 'category', t.category, 'status', t.status, 'created_at', t.created_at,
    'created_by_name', m.full_name, 'created_by_email', m.email,
    'messages', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', sm.id, 'author_kind', sm.author_kind, 'author_name', sm.author_name, 'body', sm.body, 'created_at', sm.created_at
      ) order by sm.created_at), '[]'::jsonb)
      from public.support_messages sm where sm.ticket_id = t.id
    )
  ) into v_result
  from public.support_tickets t
  join public.organizations o on o.id = t.organization_id
  left join public.members m on m.id = t.created_by
  where t.id = p_ticket_id;
  return v_result;
end;
$$;

create function public.platform_reply_ticket(p_ticket_id uuid, p_body text, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ticket public.support_tickets;
begin
  perform private.require_platform_admin();
  if p_status not in ('answered', 'resolved') then
    raise exception 'Statut inconnu.';
  end if;
  if char_length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Écrivez la réponse.';
  end if;
  select * into v_ticket from public.support_tickets t where t.id = p_ticket_id for update;
  if not found then
    raise exception 'Demande introuvable.';
  end if;
  insert into public.support_messages (organization_id, ticket_id, author_kind, author_name, body)
  values (v_ticket.organization_id, v_ticket.id, 'platform', 'Équipe SELECT', trim(p_body));
  update public.support_tickets t set status = p_status where t.id = v_ticket.id;
  perform private.log_platform_action('support.replied', v_ticket.organization_id, jsonb_build_object('ticket', v_ticket.reference, 'status', p_status));
end;
$$;

create function public.platform_set_ticket_status(p_ticket_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ticket public.support_tickets;
begin
  perform private.require_platform_admin();
  if p_status not in ('open', 'answered', 'resolved') then
    raise exception 'Statut inconnu.';
  end if;
  update public.support_tickets t set status = p_status where t.id = p_ticket_id returning * into v_ticket;
  if v_ticket.id is null then
    raise exception 'Demande introuvable.';
  end if;
  perform private.log_platform_action('support.status_changed', v_ticket.organization_id, jsonb_build_object('ticket', v_ticket.reference, 'status', p_status));
end;
$$;

revoke all on function private.visible_ticket(uuid) from public, anon, authenticated;

revoke all on function
  public.create_support_ticket(text, text, text),
  public.reply_support_ticket(uuid, text),
  public.resolve_support_ticket(uuid),
  public.platform_tickets(text, uuid),
  public.platform_ticket(uuid),
  public.platform_reply_ticket(uuid, text, text),
  public.platform_set_ticket_status(uuid, text)
from public, anon;

grant execute on function
  public.create_support_ticket(text, text, text),
  public.reply_support_ticket(uuid, text),
  public.resolve_support_ticket(uuid),
  public.platform_tickets(text, uuid),
  public.platform_ticket(uuid),
  public.platform_reply_ticket(uuid, text, text),
  public.platform_set_ticket_status(uuid, text)
to authenticated;
