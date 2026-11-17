import test from 'node:test';
import assert from 'node:assert/strict';
import {reportMonthRange,previousJapanMonth,buildMonthlyExecutiveSummary,monthlyExecutiveReportHtml} from '../app/components/monthly-management-report.mjs';

const teamId='t1',month='2026-10';
const staff=[
 {id:'a',team_id:teamId,name:'社員A',active:true},
 {id:'b',team_id:teamId,name:'アルバイトB',active:true},
 {id:'c',team_id:teamId,name:'外注C',active:true}
];
const events=[
 {id:'e1',team_id:teamId,event_date:'2026-10-03',event_genre:'ホールレンタル',title:'ホールレンタル'},
 {id:'e2',team_id:teamId,event_date:'2026-10-04',event_genre:'ブッキング',title:'報告待ち'},
 {id:'e3',team_id:teamId,event_date:'2026-11-01',event_genre:'ブッキング',title:'別月'}
];
const settlements=[{team_id:teamId,event_id:'e1',hall_rental_sales:200000,
 hall_deductions:[{label:'値引',amount:10000}],venue_cost:10000,purchase_cost:2000,outsourcing_cost:25000}];
const expenses=[
 {team_id:teamId,event_id:'e1',expense_date:'2026-10-03',category:'仕入',amount:7000},
 {team_id:teamId,event_id:'e1',expense_date:'2026-10-03',category:'外注費',amount:16500},
 {team_id:teamId,expense_date:'2026-11-02',category:'仕入',amount:999999}
];
const confirmations=[
 {staff_id:'a',team_id:teamId,payroll_month:'2026-10-01',confirmed_amount:300000,confirmed_minutes:9600,work_days:20},
 {staff_id:'b',team_id:teamId,payroll_month:'2026-10-01',confirmed_amount:50000,confirmed_minutes:2400,work_days:5}
];
const shifts=[
 {team_id:teamId,staff_id:'b',shift_date:'2026-10-03',status:'confirmed'},
 {team_id:teamId,staff_id:'c',shift_date:'2026-10-03',status:'confirmed'}
];
const attendance=[];
const compensation=[{team_id:teamId,staff_id:'a',effective_from:'2026-09-01',monthly_salary:300000}];
const externalConfigs=[{team_id:teamId,staff_id:'c',default_mode:'external'}];
const budget={team_id:teamId,year:2026,month:10,revenue_budget:250000,labor_budget:350000,cost_budget:20000};
const input={teamId,month,staff,events,settlements,expenses,confirmations,shifts,attendance,compensation,externalConfigs,budget};
const build=overrides=>buildMonthlyExecutiveSummary({...input,...overrides});

test('monthly range respects year rollover and rejects malformed month',()=>{
 assert.deepEqual(reportMonthRange('2026-12'),{start:'2026-12-01',end:'2027-01-01',year:2026,monthNumber:12});
 assert.throws(()=>reportMonthRange('2026-13'));
});
test('the 15th in November defaults to October report, including January rollover',()=>{
 assert.equal(previousJapanMonth(new Date('2026-11-17T14:00:00+09:00')),'2026-10');
 assert.equal(previousJapanMonth(new Date('2027-01-15T10:00:00+09:00')),'2026-12');
});
test('sale is net of hall deductions; other months are excluded',()=>{
 const r=build();
 assert.equal(r.sales,190000);
 assert.equal(r.eventsCount,2);
 assert.equal(r.reportedEventsCount,1);
 assert.equal(r.missingReports.length,1);
 assert.equal(r.salesAvailable,false);
});
test('payroll comes ONLY from confirmed amounts and excludes contractor-only staff',()=>{
 const r=build();
 assert.equal(r.salaryTotal,350000);
 assert.equal(r.confirmedCount,2);
 assert.equal(r.expectedCount,2);
 assert.equal(r.payrollComplete,true);
 assert.deepEqual(r.pending,[]);
 assert.equal(r.payroll.length,2);
});
test('expense and contractor fee are kept separate and show source breakdown',()=>{
 const r=build();
 assert.equal(r.ledgerExpense,7000);
 assert.equal(r.eventExpense,12000);
 assert.equal(r.expenseTotal,19000);
 assert.equal(r.ledgerOutside,16500);
 assert.equal(r.eventOutside,25000);
 assert.equal(r.outsideTotal,41500);
 assert.equal(r.referenceBalance,190000-350000-19000-41500);
});
test('unconfirmed payroll stays visible as a warning and is not quietly added',()=>{
 const r=build({confirmations:confirmations.slice(0,1)});
 assert.equal(r.salaryTotal,300000);
 assert.equal(r.payrollComplete,false);
 assert.deepEqual(r.pending,['アルバイトB']);
 assert.match(r.warnings.join(' '),/未確定/);
});
test('no confirmed payroll does not pretend the payable amount is zero',()=>{
 const r=build({confirmations:[]});
 assert.equal(r.hasConfirmed,false);
 assert.equal(r.referenceBalance,null);
 const html=monthlyExecutiveReportHtml({data:r});
 assert.match(html,/未確定/);
 assert.match(html,/未算出/);
});
test('report HTML escapes user-controlled names and notes',()=>{
 const r=build({staff:[{...staff[0],name:'<script>evil</script>'},...staff.slice(1)]});
 const html=monthlyExecutiveReportHtml({data:r,teamName:'<svg/onload=alert(1)>',note:'<img src=x>'});
 assert.doesNotMatch(html,/<script>evil<\/script>/);
 assert.doesNotMatch(html,/<img src=x>/);
 assert.match(html,/&lt;script&gt;evil&lt;\/script&gt;/);
 assert.match(html,/&lt;img src=x&gt;/);
 assert.match(html,/&lt;svg\/onload=alert\(1\)&gt;/);
});
test('summary has two A4 printable pages and no automatic sending',()=>{
 const html=monthlyExecutiveReportHtml({data:build()});
 assert.match(html,/@page\{size:A4 portrait/);
 assert.match(html,/page-break-before:always/);
 assert.match(html,/給与支払依頼・内訳/);
 assert.match(html,/送付は自動では行われません/);
});
test('multiple settlements costs and ledger costs are explicitly flagged for double-entry review',()=>{
 const r=build();
 assert.match(r.warnings.join(' '),/二重登録/);
 assert.ok(r.monthlyBudget);
});
