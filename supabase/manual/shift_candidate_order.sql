begin;
alter table public.staff_positions add column technical_order integer not null default 0 check(technical_order>=0);
alter table public.staff_positions add column operations_order integer not null default 0 check(operations_order>=0);
alter table public.staff_positions add column unassigned_order integer not null default 0 check(unassigned_order>=0);
create function public.reorder_shift_candidates(p_team_id uuid,p_group text,p_staff_ids uuid[]) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not public.is_team_owner(p_team_id) then raise exception '並び替えはオーナーのみ操作できます' using errcode='42501'; end if;
 if p_group not in ('technical','operations','unassigned') or p_group is null then raise exception '区分が正しくありません'; end if;
 if p_staff_ids is null or cardinality(p_staff_ids)=0 or cardinality(p_staff_ids)>1000 then raise exception 'スタッフ一覧が正しくありません'; end if;
 if (select count(distinct x) from unnest(p_staff_ids) x)<>cardinality(p_staff_ids) then raise exception 'スタッフが重複しています'; end if;
 if exists(select 1 from unnest(p_staff_ids) x where not exists(select 1 from public.venue_staff s where s.id=x and s.team_id=p_team_id and s.active)) then raise exception '対象外のスタッフが含まれています'; end if;
 insert into public.staff_positions(team_id,staff_id,technical_order,operations_order,unassigned_order)
 select p_team_id,x.id,case when p_group='technical' then x.ord::integer else 0 end,case when p_group='operations' then x.ord::integer else 0 end,case when p_group='unassigned' then x.ord::integer else 0 end from unnest(p_staff_ids) with ordinality x(id,ord)
 on conflict(team_id,staff_id) do update set
 technical_order=case when p_group='technical' then excluded.technical_order else staff_positions.technical_order end,
 operations_order=case when p_group='operations' then excluded.operations_order else staff_positions.operations_order end,
 unassigned_order=case when p_group='unassigned' then excluded.unassigned_order else staff_positions.unassigned_order end,
 updated_at=now();
end $$;
revoke all on function public.reorder_shift_candidates(uuid,text,uuid[]) from public,anon;
grant execute on function public.reorder_shift_candidates(uuid,text,uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;
