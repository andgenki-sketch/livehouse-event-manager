-- Independent daily timecard. Existing event_attendance rows are untouched.
create table if not exists public.staff_timecards (
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.teams(id),
 staff_id uuid not null references public.venue_staff(id),
 work_date date not null,
 clock_in_at timestamptz,
 clock_out_at timestamptz,
 break_started_at timestamptz,
 break_minutes integer not null default 0,
 break_log jsonb not null default '[]'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(team_id,staff_id,work_date),
 constraint valid_timecard_order check(clock_out_at is null or (clock_in_at is not null and clock_out_at >= clock_in_at))
);
alter table public.staff_timecards enable row level security;
create policy staff_timecards_read on public.staff_timecards for select to authenticated
 using (public.is_team_owner(team_id) or exists(select 1 from public.venue_staff s where s.id=staff_id and s.team_id=staff_timecards.team_id and s.user_id=(select auth.uid())));
grant select on public.staff_timecards to authenticated;
-- No direct insert/update/delete grant to staff; validated RPC is the sole writer.
revoke insert,update,delete on public.staff_timecards from anon,authenticated;
create or replace function public.staff_daily_timecard_action(p_action text)
returns public.staff_timecards language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := auth.uid(); v_staff public.venue_staff%rowtype; v_row public.staff_timecards%rowtype;
 v_now timestamptz:=now(); v_day date:=(now() at time zone 'Asia/Tokyo')::date; v_elapsed integer;
begin
 if v_uid is null then raise exception 'ログインが必要です'; end if;
 if p_action not in ('in','out','break_start','break_end') then raise exception '不正な打刻操作です'; end if;
 select * into v_staff from public.venue_staff where user_id=v_uid and active=true order by created_at limit 1;
 if not found then raise exception '有効なスタッフ登録が必要です'; end if;
 perform pg_advisory_xact_lock(hashtext(v_staff.id::text || v_day::text));
 select * into v_row from public.staff_timecards where staff_id=v_staff.id and team_id=v_staff.team_id and work_date=v_day for update;
 if p_action='in' then
   if found then raise exception '本日はすでに出勤済みです'; end if;
   insert into public.staff_timecards(team_id,staff_id,work_date,clock_in_at)
   values(v_staff.team_id,v_staff.id,v_day,v_now) returning * into v_row;
 elsif p_action='break_start' then
   if not found or v_row.clock_in_at is null or v_row.clock_out_at is not null or v_row.break_started_at is not null then raise exception '休憩を開始できません'; end if;
   update public.staff_timecards set break_started_at=v_now,updated_at=v_now where id=v_row.id returning * into v_row;
 elsif p_action='break_end' then
   if not found or v_row.break_started_at is null or v_row.clock_out_at is not null then raise exception '休憩中ではありません'; end if;
   v_elapsed:=greatest(0,round(extract(epoch from (v_now-v_row.break_started_at))/60)::integer);
   update public.staff_timecards set break_minutes=break_minutes+v_elapsed,
   break_log=break_log||jsonb_build_array(jsonb_build_object('start',break_started_at,'end',v_now,'minutes',v_elapsed)),
   break_started_at=null,updated_at=v_now where id=v_row.id returning * into v_row;
 elsif p_action='out' then
   if not found or v_row.clock_in_at is null or v_row.clock_out_at is not null or v_row.break_started_at is not null then raise exception '休憩を終了してから退勤してください'; end if;
   update public.staff_timecards set clock_out_at=v_now,updated_at=v_now where id=v_row.id returning * into v_row;
 end if;
 return v_row;
end $$;
revoke all on function public.staff_daily_timecard_action(text) from public,anon;
grant execute on function public.staff_daily_timecard_action(text) to authenticated;
