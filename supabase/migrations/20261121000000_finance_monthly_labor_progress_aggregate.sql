CREATE OR REPLACE FUNCTION public.finance_monthly_labor_progress(p_team_id uuid, p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_start date;
 v_end date;
 v_fixed numeric := 0;
 v_hourly numeric := 0;
 v_budget numeric;
 v_spent numeric;
 v_unclosed integer := 0;
 v_complete integer := 0;
begin
 if p_team_id is null or p_month is null
    or not exists (
       select 1 from public.team_members tm
       where tm.team_id=p_team_id
         and tm.user_id=(select auth.uid())
         and tm.role in ('owner','member')
    ) then
   raise exception '財務人件費サマリーを参照する権限がありません' using errcode='42501';
 end if;

 v_start := date_trunc('month',p_month::timestamp)::date;
 v_end := (v_start + interval '1 month')::date;

 -- Match the owner finance budget's monthly effective fixed salary baseline.
 with rates as (
  select s.id, coalesce(h.monthly_salary,0) monthly,
   coalesce(pay.default_mode,'hourly') pay_mode
  from public.venue_staff s
  left join lateral (
   select c.monthly_salary
   from public.staff_compensation_history c
   where c.team_id=p_team_id and c.staff_id=s.id and c.effective_from<=v_start
   order by c.effective_from desc limit 1
  ) h on true
  left join public.staff_external_pay_settings pay
   on pay.team_id=p_team_id and pay.staff_id=s.id
  where s.team_id=p_team_id and s.active is distinct from false
 )
 select coalesce(sum(greatest(r.monthly,0)),0) into v_fixed
 from rates r where r.pay_mode<>'external';

 -- Only completed, accrued hourly work to date. No future unworked shifts.
 -- Existing monthly-salary staff are covered by v_fixed, not charged hourly again.
 with rates as (
  select s.id, coalesce(h.monthly_salary,0) monthly,
   coalesce(nullif(h.hourly_wage,0),s.hourly_wage,0) hourly,
   coalesce(pay.default_mode,'hourly') pay_mode
  from public.venue_staff s
  left join lateral (
   select c.monthly_salary,c.hourly_wage
   from public.staff_compensation_history c
   where c.team_id=p_team_id and c.staff_id=s.id and c.effective_from<=v_start
   order by c.effective_from desc limit 1
  ) h on true
  left join public.staff_external_pay_settings pay
   on pay.team_id=p_team_id and pay.staff_id=s.id
  where s.team_id=p_team_id and s.active is distinct from false
 ),
 work as (
  select a.clock_in,a.clock_out,a.break_minutes,a.hourly_wage,a.transportation_fee,
    r.hourly as fallback_hourly,
    a.staff_id,a.role_name,coalesce(a.work_date,e.event_date) as duty_date,
    r.pay_mode
  from public.event_attendance a
  left join public.events e on e.id=a.event_id and e.team_id=p_team_id
  join rates r on r.id=a.staff_id and r.monthly<=0
  where a.team_id=p_team_id
    and coalesce(a.work_date,e.event_date)>=v_start
    and coalesce(a.work_date,e.event_date)<v_end
    and coalesce(a.work_date,e.event_date)<=(now() at time zone 'Asia/Tokyo')::date
 ),
 eligible as (
  select w.*
  from work w
  where (
   w.pay_mode<>'external'
   or exists(
    select 1 from public.shift_schedules ss
    where ss.team_id=p_team_id and ss.staff_id=w.staff_id
      and ss.shift_date=w.duty_date
      and ss.payment_override='hourly'
      and (w.role_name is null or w.role_name=ss.role_name)
   )
  )
  and not exists(
   select 1 from public.shift_schedules ss
   where ss.team_id=p_team_id and ss.staff_id=w.staff_id
     and ss.shift_date=w.duty_date
     and ss.payment_override='external'
     and (w.role_name is null or w.role_name=ss.role_name)
  )
 )
 select coalesce(sum(
  case when clock_in is not null and clock_out is not null then
   round(
    greatest(
     0,
     mod(extract(epoch from (clock_out-clock_in))::numeric+86400,86400)/60
     - greatest(coalesce(break_minutes,0),0)
    ) / 60 * greatest(coalesce(nullif(hourly_wage,0),fallback_hourly,0),0)
   )+greatest(coalesce(transportation_fee,0),0)
  else 0 end
 ),0),
 count(*) filter(where clock_in is not null and clock_out is not null),
 count(*) filter(where clock_in is null or clock_out is null)
 into v_hourly,v_complete,v_unclosed
 from eligible;

 select case
  when b.id is null then null
  when b.hourly_labor_budget is not null
   then greatest(coalesce(b.hourly_labor_budget,0),0)+v_fixed
  else b.labor_budget::numeric end
 into v_budget
 from (select 1) seed
 left join public.monthly_budgets b
   on b.team_id=p_team_id and b.year=extract(year from v_start)::integer
   and b.month=extract(month from v_start)::integer;

 v_spent:=v_fixed+v_hourly;

 return jsonb_build_object(
  'month',to_char(v_start,'YYYY-MM'),
  'budget',v_budget,
  'spent',v_spent,
  'remaining',case when v_budget is null then null else v_budget-v_spent end,
  'percent',case when v_budget is not null and v_budget>0
   then round((v_spent/v_budget)*100,1) else null end,
  'closed_timecards',v_complete,
  'open_timecards',v_unclosed,
  'provisional',true
 );
end
$function$
;

-- Keep the function callable only by authenticated users; internal role check
-- accepts owner or production (member) of the requested team.
revoke all on function public.finance_monthly_labor_progress(uuid,date) from public, anon, authenticated;
grant execute on function public.finance_monthly_labor_progress(uuid,date) to authenticated;

comment on function public.finance_monthly_labor_progress(uuid,date) is 'Team aggregate fixed salary baseline plus accrued completed hourly timecards versus monthly total budget. Only owner/member roles; no per-person data returned.';
