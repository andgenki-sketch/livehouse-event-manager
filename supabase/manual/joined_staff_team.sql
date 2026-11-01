-- Prefer the latest accepted staff invitation only while membership still exists.
create or replace function public.get_my_joined_staff_team()
returns uuid language sql stable security definer set search_path = ''
as $$
select i.team_id
from public.staff_link_invites i
join public.team_members m on m.team_id=i.team_id and m.user_id=auth.uid()
where i.used_by=auth.uid() and i.used_at is not null
order by i.used_at desc, i.created_at desc, i.id desc limit 1;
$$;
revoke all on function public.get_my_joined_staff_team() from public, anon;
grant execute on function public.get_my_joined_staff_team() to authenticated;
