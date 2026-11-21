-- Applied to project dfvuynqpfpgeekgoksyu through Supabase migration history.
-- One cash-only daily amount for all STUDIO SNAKE rooms. No payment/room splits.
create table if not exists public.studio_daily_sales (
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.teams(id) on delete cascade,
 sales_date date not null,
 amount bigint not null check (amount >= 0),
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint studio_daily_sales_one_per_date unique (team_id, sales_date)
);

create index if not exists studio_daily_sales_team_month_idx
 on public.studio_daily_sales (team_id, sales_date desc);

alter table public.studio_daily_sales enable row level security;
revoke all on table public.studio_daily_sales from anon, authenticated;
grant select, insert, delete on table public.studio_daily_sales to authenticated;
grant update (amount) on table public.studio_daily_sales to authenticated;

create policy studio_daily_sales_select on public.studio_daily_sales
 for select to authenticated
 using (public.is_team_member(team_id) or public.is_team_owner(team_id));

create policy studio_daily_sales_insert on public.studio_daily_sales
 for insert to authenticated
 with check (
  created_by = (select auth.uid())
  and (
   public.is_team_owner(team_id)
   or exists (
    select 1 from public.team_members tm
    where tm.team_id=studio_daily_sales.team_id
      and tm.user_id=(select auth.uid())
      and tm.role in ('member','general_staff','technical_manager')
   )
  )
 );

create policy studio_daily_sales_update on public.studio_daily_sales
 for update to authenticated
 using (
  public.is_team_owner(team_id)
  or (
   created_by=(select auth.uid())
   and exists (
    select 1 from public.team_members tm
    where tm.team_id=studio_daily_sales.team_id
      and tm.user_id=(select auth.uid())
      and tm.role in ('member','general_staff','technical_manager')
   )
  )
 )
 with check (
  public.is_team_owner(team_id)
  or (
   created_by=(select auth.uid())
   and exists (
    select 1 from public.team_members tm
    where tm.team_id=studio_daily_sales.team_id
      and tm.user_id=(select auth.uid())
      and tm.role in ('member','general_staff','technical_manager')
   )
  )
 );

create policy studio_daily_sales_delete on public.studio_daily_sales
 for delete to authenticated using (public.is_team_owner(team_id));

create or replace function public.touch_studio_daily_sales_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
 new.updated_at=now();
 return new;
end
$function$;

revoke all on function public.touch_studio_daily_sales_updated_at()
 from public, anon, authenticated;

create trigger studio_daily_sales_touch_updated
 before update on public.studio_daily_sales
 for each row execute function public.touch_studio_daily_sales_updated_at();

comment on table public.studio_daily_sales is
 'One daily cash sales total across all STUDIO SNAKE rooms. Staff entry; owner-only financial reconciliation is stored separately in cashflow_monthly.';
