import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {financeRoleCanView,financeRoleIsOwner,financeMenuItems,visibleFinanceTab} from '../app/components/finance-access.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const page=read('app/page.js');
const cash=read('app/components/CashflowSpreadsheet.js');
const report=read('app/components/ProductionFinanceReports.js');
const rls=read('supabase/migrations/20261121073441_cashflow_read_for_production_staff.sql');
const financeStart=page.indexOf("{canViewFinance&&view==='finance'"),financeEnd=page.indexOf("{view==='money'&&<>",financeStart);
const finance=page.slice(financeStart,financeEnd);

test('finance is visible to owner and production only',()=>{
 assert.equal(financeRoleCanView('owner'),true);
 assert.equal(financeRoleCanView('member'),true);
 for(const role of ['general_staff','technical_manager','viewer',undefined])assert.equal(financeRoleCanView(role),false);
 assert.match(page,/\.\.\.\(canViewFinance\?\[\['finance','¥ 財務管理'\]\]:\[\]\)/);
 assert.match(page,/\{canViewFinance&&view==='finance'/);
});

test('production sees all non-payroll finance tabs while owner keeps payroll',()=>{
 assert.deepEqual(financeMenuItems('member').map(x=>x[0]),['overview','budget','cashflow','expenses','reports']);
 assert.deepEqual(financeMenuItems('owner').map(x=>x[0]),['overview','budget','payroll','cashflow','expenses','reports']);
 assert.equal(financeRoleIsOwner('member'),false);
 assert.equal(visibleFinanceTab('member','payroll'),'overview');
 assert.equal(visibleFinanceTab('owner','payroll'),'payroll');
 assert.match(finance,/financeOwner&&activeFinanceTab==='payroll'/);
 assert.match(finance,/<PayrollPanel staff=\{staff\}/);
});

test('member is read-only in budget and incomplete event labor actuals are hidden',()=>{
 assert.match(finance,/canEditBudget=\{financeOwner\} restrictedLaborActual=\{!financeOwner\}/);
 assert.match(page,/showActual=\{!restrictedLaborActual\}/);
 assert.match(page,/restrictedLaborActual\?'人件費未集計'/);
 assert.match(page,/restrictedLaborActual\?'未集計'/);
 assert.match(page,/restrictedLaborActual\?'未算出'/);
});

test('member cashflow loads but does not allow saving or payroll-linked actions',()=>{
 assert.match(cash,/const owner=team\?\.role==='owner',canView=owner\|\|team\?\.role==='member'/);
 assert.match(cash,/if\(!canView\|\|!team\?\.id\)return/);
 assert.match(cash,/const cellInput=\(row\)=>owner&&/);
 assert.match(cash,/const editable=owner&&view!=='difference'/);
 assert.match(cash,/\{owner&&view==='actual'&&<section className="cashflow-sheet-linked"/);
 assert.match(cash,/owner\?fetchCashflowLinkedReferences/);
 assert.match(cash,/制作：閲覧専用/);
 assert.match(rls,/for select to authenticated/);
 assert.match(rls,/can_view_event_contracts\(team_id\)/);
 assert.doesNotMatch(rls,/for (insert|update|delete)/i);
});

test('production reports are aggregate only with no payroll detail queries',()=>{
 assert.match(finance,/\{financeOwner\?<><MonthlyManagementReport/);
 assert.match(finance,/<ProductionFinanceReports client=\{supabase\} team=\{team\}/);
 assert.match(finance,/\{financeOwner&&<section className="card"><h3>給与支払依頼書/);
 assert.match(report,/制作向け財務サマリー/);
 assert.match(report,/from\('monthly_budgets'\)/);
 assert.match(report,/from\('cashflow_monthly'\)/);
 assert.doesNotMatch(report,/from\('payroll_confirmations'\)/);
 assert.doesNotMatch(report,/from\('staff_compensation_history'\)/);
 assert.doesNotMatch(report,/confirmed_amount/);
 assert.match(report,/PDF保存・印刷/);
});
