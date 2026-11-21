import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const page=read('app/page.js');
const dash=read('app/components/FinanceOverview.js');
const card=read('app/components/ProductionMonthlyLaborProgress.js');
const sql=read('supabase/migrations/20261121074430_finance_monthly_labor_progress_aggregate.sql');

test('production budget receives aggregate labor card instead of hidden partial wages',()=>{
 assert.match(page,/restrictedLaborActual\?<ProductionMonthlyLaborProgress client=\{client\} team=\{team\} year=\{year\} month=\{month\}/);
 assert.match(page,/<FinanceRegister client=\{supabase\} team=\{team\}/);
 assert.match(page,/canEditBudget=\{financeOwner\} restrictedLaborActual=\{!financeOwner\}/);
 assert.match(page,/financeOwner&&activeFinanceTab==='payroll'/);
});

test('dashboard shows team labor progress for production member',()=>{
 assert.match(dash,/team\?\.role==='member'&&<ProductionMonthlyLaborProgress/);
 assert.match(dash,/year=\{Number\(month\.slice\(0,4\)\)\} month=\{Number\(month\.slice\(5\)\)\}/);
});

test('production sees only budget, spent, remaining, and progress via one RPC call',()=>{
 assert.match(card,/client\.rpc\('finance_monthly_labor_progress'/);
 assert.match(card,/p_team_id:team\.id,p_month:monthDate/);
 assert.match(card,/月間人件費予算/);
 assert.match(card,/現在の人件費使用額/);
 assert.match(card,/予算残額/);
 assert.match(card,/予算超過/);
 assert.match(card,/月間人件費の予算消化率/);
 assert.match(card,/月給の固定分と打刻完了済みの時給分/);
 for(const table of ['staff_compensation_history','payroll_confirmations','event_attendance','staff_external_pay_settings']){
  assert.doesNotMatch(card,new RegExp("from\\(['\\\"]"+table));
 }
 assert.doesNotMatch(card,/\.select\(['"]\*['"]\)/);
});

test('SECURITY DEFINER returns one role-checked aggregate and does not expose payroll details',()=>{
 assert.match(sql,/SECURITY DEFINER/i);
 assert.match(sql,/from public\.team_members tm/);
 assert.match(sql,/tm\.role in \('owner','member'\)/i);
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/returns jsonb/i);
 assert.match(sql,/v_spent:=v_fixed\+v_hourly;/);
 assert.match(sql,/b\.hourly_labor_budget is not null/);
 assert.match(sql,/v_fixed/);
 assert.match(sql,/open_timecards/);
 assert.match(sql,/revoke all on function public\.finance_monthly_labor_progress\(uuid,date\) from public, anon, authenticated;/);
 assert.match(sql,/grant execute on function public\.finance_monthly_labor_progress\(uuid,date\) to authenticated;/);
 assert.doesNotMatch(sql,/'staff_id',|'monthly_salary',|'hourly_wage',/);
});

test('sensitive individual payroll stays owner only and event report still hides incomplete net income',()=>{
 const start=page.indexOf("{canViewFinance&&view==='finance'");
 const end=page.indexOf("{view==='money'&&<>",start);
 const finance=page.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.match(finance,/financeOwner&&activeFinanceTab==='payroll'/);
 assert.match(finance,/\{financeOwner&&<section className="card"><h3>給与支払依頼書/);
 assert.match(page,/restrictedLaborActual\?'人件費未集計'/);
 assert.match(page,/restrictedLaborActual\?'未算出'/);
});
