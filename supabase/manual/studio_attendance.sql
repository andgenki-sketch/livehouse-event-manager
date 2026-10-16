begin;
alter table public.event_attendance alter column event_id drop not null;
alter table public.event_attendance add column work_date date;
alter table public.event_attendance add constraint attendance_workplace_date check ((event_id is not null and work_date is null) or (event_id is null and work_date is not null));
create unique index studio_attendance_staff_date on public.event_attendance(team_id,staff_id,work_date) where event_id is null;
create function public.validate_attendance_workplace() returns trigger language plpgsql security invoker set search_path='' as $$
declare actual_date date; old_date date;
begin
 if not exists(select 1 from public.venue_staff s where s.id=new.staff_id and s.team_id=new.team_id) then raise exception 'スタッフとチームが一致しません'; end if;
 if new.event_id is not null then
  select e.event_date into actual_date from public.events e where e.id=new.event_id and e.team_id=new.team_id;
  if actual_date is null then raise exception 'イベントとチームが一致しません'; end if;
 else actual_date:=new.work_date; end if;
 if actual_date is null then raise exception '勤務日を指定してください'; end if;
 if TG_OP='UPDATE' then
  if old.event_id is null then old_date:=old.work_date; else select e.event_date into old_date from public.events e where e.id=old.event_id; end if;
 end if;
 if exists(select 1 from public.payroll_confirmations p where p.team_id=new.team_id and p.staff_id=new.staff_id and p.payroll_month=date_trunc('month',actual_date)::date)
 or (TG_OP='UPDATE' and exists(select 1 from public.payroll_confirmations p where p.team_id=old.team_id and p.staff_id=old.staff_id and p.payroll_month=date_trunc('month',old_date)::date)) then
  raise exception '給与確定済みの月です。給与計算画面で確定を解除してから修正してください';
 end if;
 if new.clock_in is not null and new.clock_out is not null and new.break_minutes > ((extract(epoch from (new.clock_out-new.clock_in))::integer+86400)%86400)/60 then
  raise exception '休憩時間が勤務時間を超えています';
 end if;
 return new;
end $$;
revoke all on function public.validate_attendance_workplace() from public,anon,authenticated;
create trigger validate_attendance_workplace before insert or update on public.event_attendance for each row execute function public.validate_attendance_workplace();
notify pgrst,'reload schema';
commit;
