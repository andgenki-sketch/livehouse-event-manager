alter table public.timetable_items add column if not exists kind text not null default 'other';
alter table public.timetable_items add column if not exists artist_name text not null default '';
alter table public.timetable_items add column if not exists note text not null default '';
create table if not exists public.event_timetable_imports (
 id uuid primary key,
 event_id uuid not null references public.events(id) on delete cascade,
 team_id uuid not null references public.teams(id) on delete cascade,
 source_document_id uuid references public.event_documents(id) on delete set null,
 performers jsonb not null default '[]',
 source_text text not null default '',
 row_count integer not null,
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 constraint timetable_performers_array check(jsonb_typeof(performers)='array')
);
create index if not exists timetable_imports_event_created on public.event_timetable_imports(event_id,created_at desc);
create index if not exists timetable_imports_team on public.event_timetable_imports(team_id);
create index if not exists timetable_imports_document on public.event_timetable_imports(source_document_id);
alter table public.event_timetable_imports enable row level security;
grant select,insert on public.event_timetable_imports to authenticated;
revoke all on public.event_timetable_imports from anon;
drop policy if exists timetable_import_read on public.event_timetable_imports;
create policy timetable_import_read on public.event_timetable_imports for select to authenticated using(public.is_team_member(team_id) and exists(select 1 from public.events e where e.id=event_id and e.team_id=event_timetable_imports.team_id));
drop policy if exists timetable_import_insert on public.event_timetable_imports;
create policy timetable_import_insert on public.event_timetable_imports for insert to authenticated with check(created_by=(select auth.uid()) and public.can_edit_team(team_id) and exists(select 1 from public.events e where e.id=event_id and e.team_id=event_timetable_imports.team_id));

create or replace function public.import_event_timetable(p_event_id uuid,p_import_id uuid,p_rows jsonb,p_performers jsonb default '[]',p_source_text text default '',p_document jsonb default null,p_replace boolean default false,p_expected jsonb default '[]')
returns integer language plpgsql security invoker set search_path='' as $$
declare v_team uuid; v_row jsonb; v_count integer:=0; v_document uuid; v_current jsonb; v_expected jsonb; v_order integer; v_existing public.event_timetable_imports%rowtype;
begin
 if auth.uid() is null then raise exception 'ログインが必要です'; end if;
 select e.team_id into v_team from public.events e where e.id=p_event_id for update;
 if v_team is null or not exists(select 1 from public.team_members m where m.team_id=v_team and m.user_id=auth.uid() and m.role in ('owner','member')) then raise exception 'タイムテーブルの編集権限がありません'; end if;
 if p_import_id is null then raise exception '登録IDが必要です'; end if;
 select * into v_existing from public.event_timetable_imports where id=p_import_id;
 if found then
  if v_existing.event_id<>p_event_id or v_existing.created_by<>auth.uid() then raise exception '登録IDが一致しません'; end if;
  return v_existing.row_count;
 end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 200 then raise exception '登録行は1〜200行にしてください'; end if;
 if jsonb_typeof(p_performers) is distinct from 'array' or jsonb_array_length(p_performers)>100 or octet_length(p_performers::text)>100000 or length(coalesce(p_source_text,''))>100000 then raise exception '出演者情報または読み取りテキストが大きすぎます'; end if;
 for v_row in select value from jsonb_array_elements(p_rows) loop
  if length(trim(coalesce(v_row->>'title','')))=0 or length(v_row->>'title')>500 or length(coalesce(v_row->>'artist_name',''))>500 or length(coalesce(v_row->>'note',''))>2000 then raise exception '内容・出演者・備考を確認してください'; end if;
  if coalesce(v_row->>'start_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (coalesce(v_row->>'end_time','')<>'' and (v_row->>'end_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception '開始・終了時刻を確認してください'; end if;
  if coalesce(v_row->>'kind','') not in ('loadin','soundcheck','rehearsal','prep','open','live','changeover','merch','other') then raise exception '区分を確認してください'; end if;
 end loop;
 if p_replace then
  if jsonb_typeof(p_expected) is distinct from 'array' then raise exception '再読み込みしてください'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'start_time',start_time,'end_time',end_time,'sort_order',sort_order,'kind',kind,'artist_name',artist_name,'note',note) order by id),'[]') into v_current from public.timetable_items where event_id=p_event_id;
  select coalesce(jsonb_agg(value order by value->>'id'),'[]') into v_expected from jsonb_array_elements(p_expected);
  if v_current<>v_expected then raise exception '他の人がタイムテーブルを変更しました。閉じて開き直してください'; end if;
 end if;
 if p_document is not null and p_document<>'null'::jsonb then
  if split_part(p_document->>'storage_path','/',1)<>v_team::text or split_part(p_document->>'storage_path','/',2)<>p_event_id::text or split_part(p_document->>'storage_path','/',3) not like p_import_id::text||'.%' or length(coalesce(p_document->>'name','')) not between 1 and 255 then raise exception '元資料の情報が正しくありません'; end if;
  if not exists(select 1 from storage.objects where bucket_id='event-documents' and name=p_document->>'storage_path') then raise exception '元資料のアップロードを確認してください'; end if;
  insert into public.event_documents(team_id,event_id,name,storage_path,content_type) values(v_team,p_event_id,p_document->>'name',p_document->>'storage_path',p_document->>'content_type') returning id into v_document;
 end if;
 if p_replace then delete from public.timetable_items where event_id=p_event_id; end if;
 select coalesce(max(sort_order),-1)+1 into v_order from public.timetable_items where event_id=p_event_id;
 for v_row in select value from jsonb_array_elements(p_rows) loop
  if exists(select 1 from public.timetable_items t where t.event_id=p_event_id and t.start_time=(v_row->>'start_time')::time and t.end_time is not distinct from nullif(v_row->>'end_time','')::time and t.title=trim(v_row->>'title') and t.artist_name=trim(coalesce(v_row->>'artist_name','')) and t.kind=v_row->>'kind') then continue; end if;
  insert into public.timetable_items(event_id,title,start_time,end_time,sort_order,kind,artist_name,note) values(p_event_id,trim(v_row->>'title'),(v_row->>'start_time')::time,nullif(v_row->>'end_time','')::time,v_order,v_row->>'kind',trim(coalesce(v_row->>'artist_name','')),trim(coalesce(v_row->>'note','')));
  v_count:=v_count+1;v_order:=v_order+1;
 end loop;
 if v_count=0 then raise exception '同じ予定がすでに登録されています'; end if;
 insert into public.event_timetable_imports(id,event_id,team_id,source_document_id,performers,source_text,row_count) values(p_import_id,p_event_id,v_team,v_document,p_performers,coalesce(p_source_text,''),v_count);
 return v_count;
end $$;
revoke all on function public.import_event_timetable(uuid,uuid,jsonb,jsonb,text,jsonb,boolean,jsonb) from public,anon;
grant execute on function public.import_event_timetable(uuid,uuid,jsonb,jsonb,text,jsonb,boolean,jsonb) to authenticated;
