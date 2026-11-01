create or replace function public.timetable_artist_key(p_name text) returns text language sql immutable security invoker set search_path='' as $$select lower(regexp_replace(normalize(trim(coalesce(p_name,'')),NFKC),'[[:space:]　]+','','g'))$$;
revoke all on function public.timetable_artist_key(text) from public,anon;
grant execute on function public.timetable_artist_key(text) to authenticated;

create or replace function public.import_event_timetable_with_event(p_event_id uuid,p_import_id uuid,p_rows jsonb,p_performers jsonb default '[]',p_source_text text default '',p_document jsonb default null,p_replace boolean default false,p_expected jsonb default '[]',p_event_info jsonb default '{}')
returns integer language plpgsql security invoker set search_path='' as $$
declare v_event public.events%rowtype; v_history public.event_timetable_imports%rowtype; v_artist jsonb; v_artist_id uuid; v_booking_id uuid; v_sort integer; v_count integer; v_name text; v_key text; v_update_open boolean; v_update_start boolean; v_add_artists boolean; v_existing_memo text;
begin
 if auth.uid() is null then raise exception 'ログインが必要です'; end if;
 select id,team_id,open_time,start_time into v_event.id,v_event.team_id,v_event.open_time,v_event.start_time from public.events where id=p_event_id for update;
 if v_event.id is null or not exists(select 1 from public.team_members where team_id=v_event.team_id and user_id=auth.uid() and role in ('owner','member')) then raise exception '編集権限がありません'; end if;
 select * into v_history from public.event_timetable_imports where id=p_import_id;
 if found then
  if v_history.event_id<>p_event_id or v_history.created_by<>auth.uid() then raise exception '登録IDが一致しません'; end if;
  return v_history.row_count;
 end if;
 if jsonb_typeof(p_event_info) is distinct from 'object' then raise exception 'イベント情報を確認してください'; end if;
 v_update_open:=coalesce((p_event_info->>'update_open')::boolean,false);v_update_start:=coalesce((p_event_info->>'update_start')::boolean,false);v_add_artists:=coalesce((p_event_info->>'add_artists')::boolean,false);
 if v_update_open then
  if coalesce(p_event_info->>'open_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'OPENの時刻を確認してください'; end if;
  if v_event.open_time is distinct from nullif(p_event_info->>'expected_open','')::time then raise exception 'OPENが他の人に変更されています。閉じて開き直してください'; end if;
 end if;
 if v_update_start then
  if coalesce(p_event_info->>'start_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'STARTの時刻を確認してください'; end if;
  if v_event.start_time is distinct from nullif(p_event_info->>'expected_start','')::time then raise exception 'STARTが他の人に変更されています。閉じて開き直してください'; end if;
 end if;
 if v_add_artists then
  if jsonb_typeof(p_event_info->'artists') is distinct from 'array' or jsonb_array_length(p_event_info->'artists')>100 then raise exception '出演者情報を確認してください'; end if;
  for v_artist in select value from jsonb_array_elements(p_event_info->'artists') loop
   if length(trim(coalesce(v_artist->>'name',''))) not between 1 and 300 or length(coalesce(v_artist->>'memo',''))>2000 or (coalesce(v_artist->>'performance_time','')<>'' and v_artist->>'performance_time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception '出演者名・出演時刻・備考を確認してください'; end if;
  end loop;
 end if;
 if jsonb_typeof(p_rows)='array' and jsonb_array_length(p_rows)=0 and not(v_update_open or v_update_start or (v_add_artists and jsonb_array_length(p_event_info->'artists')>0)) then raise exception '反映するイベント情報または予定を選択してください'; end if;
 v_count:=public.import_event_timetable(p_event_id,p_import_id,p_rows,p_performers,p_source_text,p_document,p_replace,p_expected);
 if v_update_open or v_update_start then update public.events set open_time=case when v_update_open then (p_event_info->>'open_time')::time else open_time end,start_time=case when v_update_start then (p_event_info->>'start_time')::time else start_time end,updated_at=now() where id=p_event_id; end if;
 if v_add_artists then
  select coalesce(max(sort_order),-1)+1 into v_sort from public.event_artists where event_id=p_event_id;
  for v_key in select distinct public.timetable_artist_key(value->>'name') from jsonb_array_elements(p_event_info->'artists') order by 1 loop perform pg_advisory_xact_lock(hashtextextended(v_event.team_id::text||':timetable-artist:'||v_key,0)); end loop;
  for v_artist in select value from jsonb_array_elements(p_event_info->'artists') loop
   v_name:=trim(v_artist->>'name');v_key:=public.timetable_artist_key(v_name);v_artist_id:=null;v_booking_id:=null;
   select a.id,ea.id into v_artist_id,v_booking_id from public.event_artists ea join public.artists a on a.id=ea.artist_id where ea.event_id=p_event_id and public.timetable_artist_key(a.name)=v_key order by ea.created_at,ea.id limit 1 for update of ea;
   if v_booking_id is not null then
    select value->>'memo' into v_existing_memo from jsonb_array_elements(public.get_event_artist_contracts(p_event_id)) where value->>'id'=v_booking_id::text;
    update public.event_artists set performance_time=coalesce(performance_time,nullif(v_artist->>'performance_time','')::time) where id=v_booking_id;
    if trim(coalesce(v_existing_memo,''))='' and trim(coalesce(v_artist->>'memo',''))<>'' then update public.event_artists set memo=v_artist->>'memo' where id=v_booking_id; end if;
    continue;
   end if;
   select id into v_artist_id from public.artists where team_id=v_event.team_id and public.timetable_artist_key(name)=v_key order by created_at,id limit 1;
   if v_artist_id is null then insert into public.artists(team_id,name) values(v_event.team_id,v_name) returning id into v_artist_id; end if;
   insert into public.event_artists(team_id,event_id,artist_id,booking_status,performance_time,sort_order,memo) values(v_event.team_id,p_event_id,v_artist_id,'confirmed',nullif(v_artist->>'performance_time','')::time,v_sort,coalesce(v_artist->>'memo',''));
   v_sort:=v_sort+1;
  end loop;
 end if;
 return v_count;
end $$;
revoke all on function public.import_event_timetable_with_event(uuid,uuid,jsonb,jsonb,text,jsonb,boolean,jsonb,jsonb) from public,anon;
grant execute on function public.import_event_timetable_with_event(uuid,uuid,jsonb,jsonb,text,jsonb,boolean,jsonb,jsonb) to authenticated;
