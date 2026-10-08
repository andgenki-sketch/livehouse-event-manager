-- Owner-only overview of LINE invitation statuses. Never expose invitation tokens.
create or replace function public.list_staff_link_invites(p_team_id uuid)
returns table(id uuid, role text, created_at timestamptz, expires_at timestamptz, used_at timestamptz, revoked_at timestamptz, used_by uuid)
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_team_owner(p_team_id) then
    raise exception 'Not authorized';
  end if;
  return query
  select i.id, i.role, i.created_at, i.expires_at, i.used_at, i.revoked_at, i.used_by
  from public.staff_link_invites i
  where i.team_id = p_team_id
  order by i.created_at desc
  limit 200;
end;
$$;
revoke all on function public.list_staff_link_invites(uuid) from public, anon;
grant execute on function public.list_staff_link_invites(uuid) to authenticated;
