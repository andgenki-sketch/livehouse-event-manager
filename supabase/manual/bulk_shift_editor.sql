create or replace function public.save_day_shifts(p_team_id uuid,p_date date,p_rows jsonb,p_expected jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare owner_access boolean:=public.is_team_owner(p_team_id); technical_access boolean:=public.is_technical_manager(p_team_id); item jsonb; sid uuid; eid uuid; rid uuid; saved integer:=0;
begin
 if auth.uid() is null or not(owner_access or technical_access) then raise exception 'シフトを編集する権限がありません'; end if;
 if p_date is null or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_typeof(p_expected) is distinct from 'array' or jsonb_array_length(p_rows)>500 then raise exception 'シフトの形式が不正です'; end if;
 perform pg_advisory_xact_lock(hashtext(p_team_id::text||p_date::text));
 if exists(select 1 from public.shift_schedules s where s.team_id=p_team_id and s.shift_date=p_date and (owner_access or s.role_name in('PA','照明','SS','映像')) and not exists(select 1 from jsonb_array_elements(p_expected) x where (x->>'id')::uuid=s.id and (x->>'updated_at')::timestamptz=s.updated_at))
 or exists(select 1 from jsonb_array_elements(p_expected) x where not exists(select 1 from public.shift_schedules s where s.id=(x->>'id')::uuid and s.team_id=p_team_id and s.shift_date=p_date and s.updated_at=(x->>'updated_at')::timestamptz and (owner_access or s.role_name in('PA','照明','SS','映像')))) then raise exception '別の画面でシフトが変更されました。一覧を再読み込みしてから編集してください'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) x group by x->>'staff_id',coalesce(x->>'event_id',''),x->>'role_name' having count(*)>1) then raise exception '同じスタッフ・勤務先・担当が重複しています'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) x where nullif(x->>'id','') is not null group by x->>'id' having count(*)>1) then raise exception '同じシフトが重複しています'; end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  sid:=(item->>'staff_id')::uuid; eid:=nullif(item->>'event_id','')::uuid; rid:=nullif(item->>'id','')::uuid;
  if not exists(select 1 from public.venue_staff where id=sid and team_id=p_team_id) then raise exception 'スタッフとチームが一致しません'; end if;
  if eid is not null and not exists(select 1 from public.events where id=eid and team_id=p_team_id and event_date=p_date) then raise exception 'イベントの勤務日が一致しません'; end if;
  if coalesce(trim(item->>'role_name'),'')='' or (not owner_access and item->>'role_name' not in('PA','照明','SS','映像')) then raise exception '担当を選択してください'; end if;
  if rid is not null and not exists(select 1 from jsonb_array_elements(p_expected) x where (x->>'id')::uuid=rid) then raise exception '編集対象が一致しません'; end if;
 end loop;
 delete from public.shift_schedules s where s.team_id=p_team_id and s.shift_date=p_date and (owner_access or s.role_name in('PA','照明','SS','映像')) and not exists(select 1 from jsonb_array_elements(p_rows) x where nullif(x->>'id','')::uuid=s.id);
 for item in select value from jsonb_array_elements(p_rows) loop
  insert into public.shift_schedules(id,team_id,shift_date,staff_id,event_id,role_name,planned_start,planned_end,break_minutes,note,status,updated_at)
  values(coalesce(nullif(item->>'id','')::uuid,gen_random_uuid()),p_team_id,p_date,(item->>'staff_id')::uuid,nullif(item->>'event_id','')::uuid,item->>'role_name',nullif(item->>'planned_start','')::time,nullif(item->>'planned_end','')::time,coalesce((item->>'break_minutes')::integer,0),coalesce(item->>'note',''),'confirmed',now())
  on conflict(id) do update set event_id=excluded.event_id,role_name=excluded.role_name,planned_start=excluded.planned_start,planned_end=excluded.planned_end,break_minutes=excluded.break_minutes,note=excluded.note,status=excluded.status,updated_at=excluded.updated_at;
  saved:=saved+1;
 end loop;
 return saved;
end $$;
revoke all on function public.save_day_shifts(uuid,date,jsonb,jsonb) from public,anon;
grant execute on function public.save_day_shifts(uuid,date,jsonb,jsonb) to authenticated;
