-- Owner-only staff records. Additive; existing staff and attendance are retained.
create unique index if not exists venue_staff_team_id_id_key on public.venue_staff(team_id,id);

create table public.staff_positions (
 team_id uuid not null, staff_id uuid not null, positions text[] not null default '{}',
 updated_at timestamptz not null default now(), primary key(team_id,staff_id),
 foreign key(team_id,staff_id) references public.venue_staff(team_id,id) on delete cascade,
 check(positions <@ array['PA','照明','SS','映像','受付','Bar','制作','仕切り','スタジオ','フード','外出']::text[])
);
create table public.staff_private_profiles (
 team_id uuid not null, staff_id uuid not null, employment_type text not null default '',
 joined_on date, email text not null default '', phone text not null default '', note text not null default '',
 updated_at timestamptz not null default now(), primary key(team_id,staff_id),
 foreign key(team_id,staff_id) references public.venue_staff(team_id,id) on delete cascade
);
create table public.staff_coaching_records (
 id uuid primary key default gen_random_uuid(), team_id uuid not null, staff_id uuid not null,
 meeting_on date not null, strengths text not null default '', challenges text not null default '',
 goal text not null default '', support text not null default '', next_review_on date,
 created_at timestamptz not null default now(),
 foreign key(team_id,staff_id) references public.venue_staff(team_id,id) on delete cascade
);
create index on public.staff_coaching_records(team_id,staff_id,meeting_on desc);
create table public.staff_production_plans (
 team_id uuid not null, staff_id uuid not null, target_month date not null,
 event_goal integer not null default 0 check(event_goal>=0), goal text not null default '',
 progress text not null default '', support text not null default '', updated_at timestamptz not null default now(),
 primary key(team_id,staff_id,target_month),check(extract(day from target_month)=1),
 foreign key(team_id,staff_id) references public.venue_staff(team_id,id) on delete cascade
);
create table public.staff_compensation_history (
 team_id uuid not null, staff_id uuid not null, effective_from date not null,
 hourly_wage integer not null default 0 check(hourly_wage>=0),
 monthly_salary integer not null default 0 check(monthly_salary>=0),
 transportation_fee integer not null default 0 check(transportation_fee>=0),
 created_at timestamptz not null default now(),primary key(team_id,staff_id,effective_from),
 check(extract(day from effective_from)=1), check(hourly_wage=0 or monthly_salary=0),
 foreign key(team_id,staff_id) references public.venue_staff(team_id,id) on delete cascade
);
-- Baseline retains the old calculator's monthly-salary priority when both were set.
insert into public.staff_compensation_history(team_id,staff_id,effective_from,hourly_wage,monthly_salary,transportation_fee)
select c.team_id,c.staff_id,'0001-01-01'::date,case when c.monthly_salary>0 then 0 else greatest(c.hourly_wage,0) end,greatest(c.monthly_salary,0),greatest(c.transportation_fee,0)
from public.staff_compensation c join public.venue_staff s on s.team_id=c.team_id and s.id=c.staff_id;

alter table public.staff_positions enable row level security;
create policy positions_read on public.staff_positions for select to authenticated using(public.is_team_member(team_id));
create policy positions_owner on public.staff_positions for all to authenticated using(public.is_team_owner(team_id)) with check(public.is_team_owner(team_id));
alter table public.staff_private_profiles enable row level security;
create policy profile_owner on public.staff_private_profiles for all to authenticated using(public.is_team_owner(team_id)) with check(public.is_team_owner(team_id));
alter table public.staff_coaching_records enable row level security;
create policy coaching_owner on public.staff_coaching_records for all to authenticated using(public.is_team_owner(team_id)) with check(public.is_team_owner(team_id));
alter table public.staff_production_plans enable row level security;
create policy production_owner on public.staff_production_plans for all to authenticated using(public.is_team_owner(team_id)) with check(public.is_team_owner(team_id));
alter table public.staff_compensation_history enable row level security;
create policy compensation_history_read on public.staff_compensation_history for select to authenticated using(public.is_team_owner(team_id));
create policy compensation_history_insert on public.staff_compensation_history for insert to authenticated with check(public.is_team_owner(team_id));
create policy compensation_history_update on public.staff_compensation_history for update to authenticated using(public.is_team_owner(team_id)) with check(public.is_team_owner(team_id));
-- Past-month and confirmed-period rates are immutable.
create function public.validate_staff_pay_period() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='UPDATE' and (new.team_id<>old.team_id or new.staff_id<>old.staff_id or new.effective_from<>old.effective_from) then raise exception '給与履歴の識別情報は変更できません'; end if;
 if new.effective_from < date_trunc('month',now() at time zone 'Asia/Tokyo')::date then
  raise exception '過去月の給与設定は変更できません';
 end if;
 if exists(select 1 from public.payroll_confirmations p where p.team_id=new.team_id and p.staff_id=new.staff_id and p.payroll_month>=new.effective_from) then
  raise exception '対象月以降の給与が確定済みです。給与確定を確認してください';
 end if;
 return new;
end $$;
revoke all on function public.validate_staff_pay_period() from public,anon,authenticated;
create trigger validate_staff_pay_period before insert or update on public.staff_compensation_history for each row execute function public.validate_staff_pay_period();
-- Existing compensation values are now owner-only as well.
drop policy if exists staff_compensation_select on public.staff_compensation;
create policy staff_compensation_select on public.staff_compensation for select to authenticated using(public.is_team_owner(team_id));
revoke all on public.staff_positions,public.staff_private_profiles,public.staff_coaching_records,public.staff_production_plans,public.staff_compensation_history from public,anon,authenticated;
grant select,insert,update,delete on public.staff_positions,public.staff_private_profiles,public.staff_coaching_records,public.staff_production_plans to authenticated;
grant select,insert,update on public.staff_compensation_history to authenticated;
notify pgrst,'reload schema';

alter policy shift_schedules_technical_insert on public.shift_schedules with check (role_name in ('PA','照明','SS','映像') and public.is_technical_manager(team_id));
alter policy shift_schedules_technical_update on public.shift_schedules using (role_name in ('PA','照明','SS','映像') and public.is_technical_manager(team_id)) with check (role_name in ('PA','照明','SS','映像') and public.is_technical_manager(team_id));
alter policy shift_schedules_technical_delete on public.shift_schedules using (role_name in ('PA','照明','SS','映像') and public.is_technical_manager(team_id));
