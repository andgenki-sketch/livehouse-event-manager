-- Run in Supabase SQL Editor before deploying the LINE invitation UI.
create table if not exists public.staff_link_invites (
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.teams(id),
 token uuid not null unique default gen_random_uuid(),
 role text not null check(role in ('member','general_staff','technical_manager','viewer')),
 created_by uuid not null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '7 days'),
 used_at timestamptz,
 used_by uuid,
 revoked_at timestamptz
);
alter table public.staff_link_invites enable row level security;
revoke all on public.staff_link_invites from anon,authenticated;
create or replace function public.create_staff_link_invite(p_team_id uuid,p_role text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_token uuid;
begin
 if auth.uid() is null or not public.is_team_owner(p_team_id) then raise exception 'Owner only'; end if;
 if p_role is null or p_role not in ('member','general_staff','technical_manager','viewer') then raise exception 'Invalid role'; end if;
 insert into public.staff_link_invites(team_id,role,created_by)
 values(p_team_id,p_role,auth.uid()) returning token into v_token;
 return v_token;
end $$;
create or replace function public.accept_staff_link_invite(p_token uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.staff_link_invites%rowtype;
begin
 if auth.uid() is null then raise exception 'Login required'; end if;
 select * into v from public.staff_link_invites where token=p_token for update;
 if not found or v.used_at is not null or v.revoked_at is not null or v.expires_at<=now() then raise exception 'Invite expired or already used'; end if;
 if exists(select 1 from public.team_members where team_id=v.team_id and user_id=auth.uid()) then raise exception 'Already a member'; end if;
 insert into public.team_members(team_id,user_id,role) values(v.team_id,auth.uid(),v.role);
 update public.staff_link_invites set used_at=now(),used_by=auth.uid() where id=v.id;
 return v.team_id;
end $$;
revoke all on function public.create_staff_link_invite(uuid,text) from public;
revoke all on function public.accept_staff_link_invite(uuid) from public;
grant execute on function public.create_staff_link_invite(uuid,text) to authenticated;
grant execute on function public.accept_staff_link_invite(uuid) to authenticated;
