import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {studioDailySaleInput,validStudioSalesDate,studioDailySalesSummary} from '../app/components/studio-daily-sales.mjs';
import {monthlyRevenueOverview,monthlyExecutiveReportHtml} from '../app/components/monthly-management-report.mjs';

const data={month:'2026-11',sales:200000,eventStudioSales:10000,salesAvailable:true,
 salaryTotal:0,hasConfirmed:false,payroll:[],pending:[],expectedCount:0,confirmedCount:0,
 payrollComplete:false,expenseTotal:0,outsideTotal:0,ledgerExpense:0,eventExpense:0,
 ledgerOutside:0,eventOutside:0,eventsCount:1,reportedEventsCount:1,missingReports:[],warnings:[],monthlyBudget:null};

test('validates one cash amount for the full studio per day including a recorded zero',()=>{
 assert.equal(studioDailySaleInput('25000'),25000);
 assert.equal(studioDailySaleInput('0'),0);
 for(const v of ['',null,'-1','1.5','1,000','abc'])assert.throws(()=>studioDailySaleInput(v));
 assert.equal(validStudioSalesDate('2026-11-21'),true);
 assert.equal(validStudioSalesDate('2026-02-30'),false);
 assert.equal(validStudioSalesDate('2024-02-29'),true);
 assert.equal(validStudioSalesDate('2026-13-01'),false);
});

test('monthly aggregate excludes missing days and counts an explicitly recorded zero',()=>{
 const summary=studioDailySalesSummary([{sales_date:'2026-11-01',amount:12500},{sales_date:'2026-11-02',amount:0},{sales_date:'2026-11-03',amount:22500}]);
 assert.deepEqual(summary,{total:35000,days:3,entered:true});
 assert.deepEqual(studioDailySalesSummary([]),{total:null,days:0,entered:false});
 assert.throws(()=>studioDailySalesSummary([{amount:-1}]));
 assert.throws(()=>studioDailySalesSummary([{amount:2.2}]));
});

test('daily sales are the studio revenue source when present, not added to cashflow deposits',()=>{
 const cashflowActual={studio_sales_cash:35000,studio_sales_cashless:0,status:'reviewed'};
 const rows=[{sales_date:'2026-11-01',amount:14000},{sales_date:'2026-11-02',amount:21000}];
 const result=monthlyRevenueOverview({data,cashflowActual,studioDailySales:rows});
 assert.equal(result.livehouse,190000);
 assert.equal(result.studio.total,35000);
 assert.equal(result.total,225000);
 assert.equal(result.studio.source,'daily');
 assert.equal(result.studio.days,2);
 assert.equal(result.studio.gap,0);
 assert.equal(result.reviewed,true);
 const html=monthlyExecutiveReportHtml({data,cashflowActual,studioDailySales:rows});
 assert.match(html,/STUDIO SNAKE 売上 \/ 日次売上台帳/);
 assert.match(html,/日次現金売上 2日分/);
 assert.doesNotMatch(html,/キャッシュレス：/);
 assert.match(html,/月間売上合計（経営確認用）<\/span><strong>¥225,000<\/strong>/);
});

test('different cashflow receipts remain reconciliation-only',()=>{
 const result=monthlyRevenueOverview({data,cashflowActual:{studio_sales_cash:50000,studio_sales_cashless:0,status:'reviewed'},studioDailySales:[{amount:35000}]});
 assert.equal(result.studio.total,35000);
 assert.equal(result.studio.cashflowReference,50000);
 assert.equal(result.studio.gap,-15000);
 assert.equal(result.total,225000);
 assert.equal(result.reviewed,false);
 assert.match(result.status,/要照合/);
});

test('cashflow fallback preserves historical months until daily ledger has any row',()=>{
 const actual={studio_sales_cash:50000,studio_sales_cashless:0,status:'reviewed'};
 const result=monthlyRevenueOverview({data,cashflowActual:actual,studioDailySales:[]});
 assert.equal(result.studio.source,'cashflow');
 assert.equal(result.total,240000);
 const zero=monthlyRevenueOverview({data,cashflowActual:actual,studioDailySales:[{amount:0}]});
 assert.equal(zero.studio.source,'daily');
 assert.equal(zero.studio.total,0);
 assert.equal(zero.total,190000);
});

test('revenue screen exposes staff-only studio entry, while finance and livehouse stay gated',()=>{
 const page=readFileSync(new URL('../app/page.js',import.meta.url),'utf8');
 assert.match(page,/import StudioDailySales from '\.\/components\/StudioDailySales';/);
 assert.match(page,/<StudioDailySales client=\{supabase\} team=\{team\} userId=\{session\?\.user\?\.id\}/);
 assert.match(page,/canViewContracts&&revenueTab==='events'/);
 assert.match(page,/<FinanceRegister client=\{supabase\} team=\{team\} schedules=\{shiftSchedules\}/);
 assert.match(page,/onOpenStudio=\{\(\)=>\{setRevenueTab\('studio'\);setView\('money'\)\}\}/);
 const view=readFileSync(new URL('../app/components/StudioDailySales.js',import.meta.url),'utf8');
 assert.match(view,/\.from\('studio_daily_sales'\)/);
 assert.match(view,/\.insert\(\{team_id:team\.id,sales_date:date,amount:value,created_by:userId\}\)/);
 assert.match(view,/\.update\(\{amount:value\}\)/);
 assert.doesNotMatch(view,/studio_sales_cashless/);
});
