-- Add contractor daily rate forecasts without touching confirmed payroll or expense records.
CREATE TABLE IF NOT EXISTS public.staff_external_pay_settings (
 team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
 staff_id uuid NOT NULL REFERENCES public.venue_staff(id) ON DELETE CASCADE,
 default_mode text NOT NULL DEFAULT 'external' CHECK(default_mode IN('external','hourly')),
 day_rate integer NOT NULL DEFAULT 0 CHECK(day_rate>=0),
 night_rate integer NOT NULL DEFAULT 0 CHECK(night_rate>=0),
 all_rate integer NOT NULL DEFAULT 0 CHECK(all_rate>=0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(team_id,staff_id)
);
ALTER TABLE public.staff_external_pay_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_external_pay_settings FROM anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.staff_external_pay_settings TO authenticated;
DROP POLICY IF EXISTS staff_external_pay_settings_owner_select ON public.staff_external_pay_settings;
CREATE POLICY staff_external_pay_settings_owner_select ON public.staff_external_pay_settings FOR SELECT TO authenticated USING(public.is_team_owner(team_id));
DROP POLICY IF EXISTS staff_external_pay_settings_owner_insert ON public.staff_external_pay_settings;
CREATE POLICY staff_external_pay_settings_owner_insert ON public.staff_external_pay_settings FOR INSERT TO authenticated WITH CHECK(public.is_team_owner(team_id) AND EXISTS (SELECT 1 FROM public.venue_staff v WHERE v.id=staff_id AND v.team_id=team_id));
DROP POLICY IF EXISTS staff_external_pay_settings_owner_update ON public.staff_external_pay_settings;
CREATE POLICY staff_external_pay_settings_owner_update ON public.staff_external_pay_settings FOR UPDATE TO authenticated USING(public.is_team_owner(team_id)) WITH CHECK(public.is_team_owner(team_id) AND EXISTS (SELECT 1 FROM public.venue_staff v WHERE v.id=staff_id AND v.team_id=team_id));
DROP POLICY IF EXISTS staff_external_pay_settings_owner_delete ON public.staff_external_pay_settings;
CREATE POLICY staff_external_pay_settings_owner_delete ON public.staff_external_pay_settings FOR DELETE TO authenticated USING(public.is_team_owner(team_id));
ALTER TABLE public.shift_schedules ADD COLUMN IF NOT EXISTS payment_override text NULL;
ALTER TABLE public.shift_schedules DROP CONSTRAINT IF EXISTS shift_schedules_payment_override_check;
ALTER TABLE public.shift_schedules ADD CONSTRAINT shift_schedules_payment_override_check CHECK(payment_override IS NULL OR payment_override IN('hourly','external'));
CREATE OR REPLACE FUNCTION public.save_day_shifts(p_team_id uuid, p_date date, p_rows jsonb, p_expected jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare owner_access boolean:=public.is_team_owner(p_team_id); technical_access boolean:=public.is_technical_manager(p_team_id); item jsonb; sid uuid; eid uuid; rid uuid; saved integer:=0;
begin
 if auth.uid() is null or not(owner_access or technical_access) then raise exception 'シフトを編集する権限がありません'; end if;
 if p_date is null or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_typeof(p_expected) is distinct from 'array' or jsonb_array_length(p_rows)>500 then raise exception 'シフトの形式が不正です'; end if;
 perform pg_advisory_xact_lock(hashtext(p_team_id::text||p_date::text));
 if exists(select 1 from public.shift_schedules s where s.team_id=p_team_id and s.shift_date=p_date and (owner_access or s.role_name in('PA','照明','SS','映像')) and not exists(select 1 from jsonb_array_elements(p_expected) x where (x->>'id')::uuid=s.id and (x->>'updated_at')::timestamptz=s.updated_at))
 or exists(select 1 from jsonb_array_elements(p_expected) x where not exists(select 1 from public.shift_schedules s where s.id=(x->>'id')::uuid and s.team_id=p_team_id and s.shift_date=p_date and s.updated_at=(x->>'updated_at')::timestamptz and (owner_access or s.role_name in('PA','照明','SS','映像')))) then raise exception '別の画面でシフトが変更されました。一覧を再読み込みしてから編集してください'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) x group by x->>'staff_id',coalesce(x->>'work_period',x->>'event_id',''),x->>'role_name' having count(*)>1) then raise exception '同じスタッフ・勤務先・担当が重複しています'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) x where nullif(x->>'id','') is not null group by x->>'id' having count(*)>1) then raise exception '同じシフトが重複しています'; end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  sid:=(item->>'staff_id')::uuid; eid:=nullif(item->>'event_id','')::uuid; rid:=nullif(item->>'id','')::uuid;
  if not exists(select 1 from public.venue_staff where id=sid and team_id=p_team_id) then raise exception 'スタッフとチームが一致しません'; end if;
  if eid is not null and not exists(select 1 from public.events where id=eid and team_id=p_team_id and event_date=p_date) then raise exception 'イベントの勤務日が一致しません'; end if;
  if coalesce(trim(item->>'role_name'),'')='' or (not owner_access and item->>'role_name' not in('PA','照明','SS','映像')) then raise exception '担当を選択してください'; end if;
  if item->>'work_period' is not null and item->>'work_period' not in('day','night','all') then raise exception '昼の部・夜の部・全日から選択してください'; end if;
  if nullif(item->>'payment_override','') is not null and item->>'payment_override' not in('hourly','external') then raise exception '支払区分が不正です'; end if;
  if not owner_access and nullif(item->>'payment_override','') is not null then raise exception '支払区分はオーナーのみ変更できます'; end if;
  if rid is not null and not exists(select 1 from jsonb_array_elements(p_expected) x where (x->>'id')::uuid=rid) then raise exception '編集対象が一致しません'; end if;
 end loop;
 delete from public.shift_schedules s where s.team_id=p_team_id and s.shift_date=p_date and (owner_access or s.role_name in('PA','照明','SS','映像')) and not exists(select 1 from jsonb_array_elements(p_rows) x where nullif(x->>'id','')::uuid=s.id);
 for item in select value from jsonb_array_elements(p_rows) loop
  insert into public.shift_schedules(id,team_id,shift_date,staff_id,event_id,work_period,role_name,planned_start,planned_end,break_minutes,note,payment_override,status,updated_at)
  values(coalesce(nullif(item->>'id','')::uuid,gen_random_uuid()),p_team_id,p_date,(item->>'staff_id')::uuid,nullif(item->>'event_id','')::uuid,item->>'work_period',item->>'role_name',nullif(item->>'planned_start','')::time,nullif(item->>'planned_end','')::time,coalesce((item->>'break_minutes')::integer,0),coalesce(item->>'note',''),case when owner_access then nullif(item->>'payment_override','') else null end,'confirmed',now())
  on conflict(id) do update set event_id=excluded.event_id,work_period=excluded.work_period,role_name=excluded.role_name,planned_start=excluded.planned_start,planned_end=excluded.planned_end,break_minutes=excluded.break_minutes,note=excluded.note,payment_override=case when owner_access then excluded.payment_override else public.shift_schedules.payment_override end,status=excluded.status,updated_at=excluded.updated_at;
  saved:=saved+1;
 end loop;
 return saved;
end $function$
;
CREATE OR REPLACE FUNCTION public.guard_shift_payment_override() RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.payment_override IS NOT NULL AND NOT public.is_team_owner(NEW.team_id) THEN
   RAISE EXCEPTION '支払区分はオーナーのみ変更できます';
  END IF;
 ELSIF NEW.payment_override IS DISTINCT FROM OLD.payment_override THEN
  IF NOT public.is_team_owner(NEW.team_id) THEN RAISE EXCEPTION '支払区分はオーナーのみ変更できます'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_shift_payment_override_trigger ON public.shift_schedules;
CREATE TRIGGER guard_shift_payment_override_trigger BEFORE INSERT OR UPDATE ON public.shift_schedules
 FOR EACH ROW EXECUTE FUNCTION public.guard_shift_payment_override();
-- Only preseed if there is exactly one matching active person, and never overwrite owner edits.
INSERT INTO public.staff_external_pay_settings(team_id,staff_id,default_mode,day_rate,night_rate,all_rate)
SELECT s.team_id,s.id,'external',16500,16500,27500 FROM public.venue_staff s
WHERE s.name='山岡真司' AND s.active=true
AND (SELECT count(*) FROM public.venue_staff WHERE name='山岡真司' AND active=true)=1
ON CONFLICT(team_id,staff_id) DO NOTHING;
