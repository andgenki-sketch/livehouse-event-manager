import test from 'node:test';
import assert from 'node:assert/strict';
import {studioSalesSummary,studioSalesReportLine} from '../app/components/studio-sales-summary.mjs';
import {monthlyExecutiveReportHtml} from '../app/components/monthly-management-report.mjs';
import {nextMonthBudgetReportHtml} from '../app/components/next-month-budget-report.mjs';

const monthData={
 month:'2026-10',sales:190000,salaryTotal:350000,hasConfirmed:true,payroll:[],
 manualPayroll:[],salaryExceptions:[],pending:[],expectedCount:2,confirmedCount:2,
 payrollComplete:true,salesAvailable:true,expenseTotal:19000,outsideTotal:41500,
 ledgerExpense:7000,eventExpense:12000,ledgerOutside:16500,eventOutside:25000,
 eventsCount:1,reportedEventsCount:1,missingReports:[],warnings:[],
 referenceBalance:-220500,monthlyBudget:null
};
const budgetData={
 month:'2026-12',revenue:1500000,labor:400000,salary:300000,hourly:100000,
 cost:200000,contractor:150000,projectedBalance:750000,
 plannedEvents:[],plannedCount:0,eventBudgetCount:0,eventUnassignedCount:0,
 eventTargets:0,warnings:[],goalsComplete:true,comments:'',budgetExists:true
};
test('studio sales report shows unregistered as missing rather than zero',()=>{
 assert.deepEqual(studioSalesSummary(null),{cash:null,cashless:null,total:null,complete:false,reviewed:false,status:'未入力'});
 assert.match(studioSalesReportLine(null),/未入力/);
 assert.doesNotMatch(studioSalesReportLine(null),/¥0/);
});
test('zero sales is a valid explicitly entered amount',()=>{
 const x=studioSalesSummary({studio_sales_cash:0,studio_sales_cashless:0,status:'reviewed'});
 assert.equal(x.total,0);
 assert.equal(x.complete,true);
 assert.equal(x.reviewed,true);
 assert.match(studioSalesReportLine({studio_sales_cash:0,studio_sales_cashless:0,status:'reviewed'}),/¥0/);
});
test('partially entered studio cashless does not pretend the month is fully complete',()=>{
 const x=studioSalesSummary({studio_sales_cash:258100,studio_sales_cashless:null});
 assert.equal(x.total,258100);
 assert.equal(x.status,'一部未入力');
 assert.equal(x.complete,false);
 assert.match(studioSalesReportLine({studio_sales_cash:258100,studio_sales_cashless:null}),/※暫定/);
});
test('invalid data is rejected and notes are HTML-safe',()=>{
 assert.throws(()=>studioSalesSummary({studio_sales_cash:-1}),/不正/);
 assert.throws(()=>studioSalesSummary({studio_sales_cash:1.2}),/不正/);
 assert.match(studioSalesReportLine({studio_sales_cash:100,studio_sales_cashless:150}),/¥250/);
});
test('previous-month management summary shows studio receipts independently of event sales',()=>{
 const actual={month:'2026-10-01',scenario:'actual',studio_sales_cash:100000,studio_sales_cashless:158100,status:'draft'};
 const html=monthlyExecutiveReportHtml({data:monthData,cashflowActual:actual});
 assert.match(html,/STUDIO SNAKE \/ スタジオ売上入金実績/);
 assert.match(html,/現金：¥100,000/);
 assert.match(html,/キャッシュレス：¥158,100/);
 assert.match(html,/¥258,100/);
 assert.match(html,/イベント等の売上（登録済み収支）/);
 assert.match(html,/¥190,000/);
 assert.match(html,/スタジオ入金は別集計/);
 assert.equal(monthData.referenceBalance,-220500);
 assert.match(html,/資金繰り・勘定項目別明細/);
});
test('next-month planning summary prints separate studio estimate, not made-up addition to revenue target',()=>{
 const plan={month:'2026-12-01',scenario:'plan',studio_sales_cash:150000,studio_sales_cashless:120000,status:'draft'};
 const html=nextMonthBudgetReportHtml({data:budgetData,cashflowPlan:plan});
 assert.match(html,/STUDIO SNAKE \/ スタジオ売上入金計画/);
 assert.match(html,/¥270,000/);
 assert.match(html,/月次売上目標（スタジオ内訳未分離）/);
 assert.match(html,/¥1,500,000/);
 assert.match(html,/月次売上目標にスタジオ分を含めている場合は再加算しません/);
 assert.equal(budgetData.projectedBalance,750000);
});
test('missing studio cashflow plan stays missing even when overall budget is set',()=>{
 const html=nextMonthBudgetReportHtml({data:budgetData,cashflowPlan:null});
 assert.match(html,/STUDIO SNAKE \/ スタジオ売上入金計画/);
 assert.match(html,/未入力/);
 assert.doesNotMatch(html,/スタジオ売上入金計画[^<]*<\/b>\s*<\/div>\s*<strong[^>]*>¥0/);
});
