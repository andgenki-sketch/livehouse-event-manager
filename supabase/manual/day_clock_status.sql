-- Shared attendance badges only; actual times, wages and payroll data stay private.
create or replace function public.get_team_day_clock_status(p_team_id uuid,p_date date)
returns table(staff_id uuid,has_clock_in boolean,is_working boolean,is_on_break boolean,has_clock_out boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.team_members m where m.team_id=p_team_id and m.user_id=auth.uid()) then raise exception 'チームの出勤状況を閲覧する権限がありません'; end if;
 if p_date is null then raise exception '日付を指定してください'; end if;
 return query
 select a.staff_id,bool_or(a.clock_in is not null),bool_or(a.clock_in is not null and a.clock_out is null),bool_or(a.clock_in is not null and a.clock_out is null and a.break_started_at is not null),bool_or(a.clock_out is not null)
 from public.event_attendance a
 join public.venue_staff s on s.id=a.staff_id and s.team_id=a.team_id
 left join public.events e on e.id=a.event_id and e.team_id=a.team_id
 where a.team_id=p_team_id and coalesce(a.work_date,e.event_date)=p_date
 group by a.staff_id;
end $$;
revoke all on function public.get_team_day_clock_status(uuid,date) from public,anon;
grant execute on function public.get_team_day_clock_status(uuid,date) to authenticated;
