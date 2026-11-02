-- Run after reviewing the existing team's employee roster. No test requests are inserted.
create table if not exists public.paid_leave_grants (
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.teams(id),
 staff_id uuid not null references public.venue_staff(id),
 granted_on date not null,
 days numeric(5,2) not null check (days>0),
 expires_on date not null,
 created_at timestamptz not null default now(),
 unique(team_id,staff_id,granted_on)
);
create table if not exists public.paid_leave_requests (
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.teams(id),
 staff_id uuid not null references public.venue_staff(id),
 user_id uuid not null references auth.users(id),
 leave_date date not null,
 days numeric(5,2) not null default 1 check(days>0 and days<=1),
 note text not null default '',
 status text not null default 'submitted' check(status in ('submitted','scheduled','taken','adjustment_requested','cancelled')),
 owner_note text not null default '',
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index if not exists paid_leave_active_day_idx on public.paid_leave_requests(staff_id,leave_date) where status in ('submitted','scheduled','taken','adjustment_requested');
create index if not exists paid_leave_requests_team_date_idx on public.paid_leave_requests(team_id,leave_date);
alter table public.paid_leave_grants enable row level security;
alter table public.paid_leave_requests enable row level security;
grant select on public.paid_leave_grants to authenticated;
grant select,insert,update on public.paid_leave_requests to authenticated;
create policy "leave grants only own or owner" on public.paid_leave_grants for select to authenticated using (
 exists(select 1 from public.venue_staff s where s.id=staff_id and s.team_id=paid_leave_grants.team_id and s.user_id=(select auth.uid()))
 or exists(select 1 from public.team_members m where m.team_id=paid_leave_grants.team_id and m.user_id=(select auth.uid()) and m.role='owner')
);
create policy "leave requests own or owner read" on public.paid_leave_requests for select to authenticated using (
 (user_id=(select auth.uid()) and exists(select 1 from public.venue_staff s where s.id=staff_id and s.team_id=paid_leave_requests.team_id and s.user_id=(select auth.uid())))
 or exists(select 1 from public.team_members m where m.team_id=paid_leave_requests.team_id and m.user_id=(select auth.uid()) and m.role='owner')
);
create policy "leave requests employee submit" on public.paid_leave_requests for insert to authenticated with check (
 user_id=(select auth.uid()) and status='submitted' and reviewed_at is null and owner_note='' and
 exists(select 1 from public.venue_staff s where s.id=staff_id and s.team_id=paid_leave_requests.team_id and s.user_id=(select auth.uid()) and s.active=true)
);
-- Do not allow general UPDATE to change sensitive fields; protect them with column-level privileges and triggers.
revoke update on public.paid_leave_requests from authenticated;
grant update(status,owner_note,reviewed_at) on public.paid_leave_requests to authenticated;
create policy "leave request owner update" on public.paid_leave_requests for update to authenticated
 using (exists(select 1 from public.team_members m where m.team_id=paid_leave_requests.team_id and m.user_id=(select auth.uid()) and m.role='owner'))
 with check (exists(select 1 from public.team_members m where m.team_id=paid_leave_requests.team_id and m.user_id=(select auth.uid()) and m.role='owner'));
create policy "leave employee cancellation" on public.paid_leave_requests for update to authenticated
 using (user_id=(select auth.uid()) and status in ('submitted','adjustment_requested'))
 with check (user_id=(select auth.uid()) and status='cancelled');
-- NOTE: employee UPDATE policy must also protect owner_note/reviewed_at; before production release,
-- implement an RPC with old-row checks or separate cancellation endpoint.
