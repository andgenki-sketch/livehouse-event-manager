-- Daily timecards; retain event-based records already punched today.
create or replace function public.staff_daily_timecard_action(p_team_id uuid,p_action text)
returns public.event_attendance language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); s public.venue_staff%rowtype; r public.event_attendance%rowtype; n timestamptz:=now(); d date:=(now() at time zone 'Asia/Tokyo')::date; elapsed integer; ids uuid[]; wage integer:=0; transport integer:=0;
begin
 if u is null then raise exception 'ログインが必要です'; end if;
 select * into s from public.venue_staff where team_id=p_team_id and user_id=u and active=true;
 if not found or not public.is_team_member(p_team_id) then raise exception 'スタッフ登録が必要です'; end if;
 perform pg_advisory_xact_lock(hashtext(p_team_id::text||s.id::text));
 select array_agg(a.id order by (a.clock_in is not null and a.clock_out is null) desc,(a.clock_in is not null) desc,a.created_at) into ids from public.event_attendance a left join public.events e on e.id=a.event_id where a.team_id=p_team_id and a.staff_id=s.id and (coalesce(a.work_date,e.event_date)=d or (coalesce(a.work_date,e.event_date)=d-1 and a.clock_in is not null and a.clock_out is null));
 if (select count(*) from public.event_attendance where id=any(ids) and clock_in is not null and clock_out is null)>1 then raise exception '勤務中の記録が複数あります。管理者に修正を依頼してください'; end if;
 select * into r from public.event_attendance where id=ids[1] for update;
 if p_action='in' then
  if r.clock_in is not null then raise exception '出勤済みの記録があります。退勤後に出勤してください'; end if;
  if r.id is null then
   select hourly_wage,transportation_fee into wage,transport from public.staff_compensation_history where team_id=p_team_id and staff_id=s.id and effective_from<=date_trunc('month',d)::date order by effective_from desc limit 1;
   insert into public.event_attendance(team_id,staff_id,event_id,work_date,role_name,clock_in,hourly_wage,transportation_fee) values(p_team_id,s.id,null,d,coalesce(nullif(s.default_role,''),'勤務'),(n at time zone 'Asia/Tokyo')::time,coalesce(wage,0),coalesce(transport,0)) returning * into r;
  else update public.event_attendance set clock_in=(n at time zone 'Asia/Tokyo')::time,updated_at=n where id=r.id returning * into r; end if;
 elsif p_action='break_start' then
  if r.clock_in is null or r.clock_out is not null or r.break_started_at is not null then raise exception '休憩を開始できません'; end if;
  update public.event_attendance set break_started_at=n,updated_at=n where id=r.id returning * into r;
 elsif p_action='break_end' then
  if r.break_started_at is null or r.clock_out is not null then raise exception '休憩中ではありません'; end if;
  elapsed:=greatest(0,round(extract(epoch from(n-r.break_started_at))/60)::integer);
  update public.event_attendance set break_minutes=break_minutes+elapsed,break_log=break_log||jsonb_build_array(jsonb_build_object('start',break_started_at,'end',n,'minutes',elapsed)),break_started_at=null,updated_at=n where id=r.id returning * into r;
 elsif p_action='out' then
  if r.clock_in is null or r.clock_out is not null or r.break_started_at is not null then raise exception '休憩を終了してから退勤してください'; end if;
  update public.event_attendance set clock_out=(n at time zone 'Asia/Tokyo')::time,updated_at=n where id=r.id returning * into r;
 else raise exception '不正な打刻操作です'; end if;
 return r;
end $$;
revoke all on function public.staff_daily_timecard_action(uuid,text) from public,anon;
grant execute on function public.staff_daily_timecard_action(uuid,text) to authenticated;
