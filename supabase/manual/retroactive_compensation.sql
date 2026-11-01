-- Allow owners to enter historical pay rates while retaining confirmed-payroll protection.
create or replace function public.validate_staff_pay_period()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='UPDATE' and (new.team_id<>old.team_id or new.staff_id<>old.staff_id or new.effective_from<>old.effective_from) then
  raise exception '給与履歴の識別情報は変更できません';
 end if;
 if exists(select 1 from public.payroll_confirmations p where p.team_id=new.team_id and p.staff_id=new.staff_id and p.payroll_month>=new.effective_from) then
  raise exception '対象月以降の給与が確定済みです。給与計算画面で確定を解除してから設定してください';
 end if;
 return new;
end $$;
revoke all on function public.validate_staff_pay_period() from public,anon,authenticated;
