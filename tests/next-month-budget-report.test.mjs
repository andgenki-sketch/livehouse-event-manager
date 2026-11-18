import test from 'node:test';
import assert from 'node:assert/strict';
import {nextJapanMonth,buildNextMonthBudgetSummary,nextMonthBudgetReportHtml} from '../app/components/next-month-budget-report.mjs';

const teamId='team-A';
const month='2026-12';
const staff=[
 {team_id:teamId,id:'salary1',name:'社員A',active:true,hourly_wage:0},
 {team_id:teamId,id:'hourly1',name:'時給B',active:true,hourly_wage:1200},
 {team_id:teamId,id:'contractor',name:'外注C',active:true}
];
const compensation=[
 {team_id:teamId,staff_id:'salary1',effective_from:'2026-11-01',monthly_salary:300000},
 {team_id:teamId,staff_id:'hourly1',effective_from:'2026-11-01',monthly_salary:0}
];
const externalConfigs=[{team_id:teamId,staff_id:'contractor',default_mode:'external'}];
const budget={team_id:teamId,year:2026,month:12,revenue_budget:1500000,hourly_labor_budget:100000,labor_budget:400000,cost_budget:200000,outsourcing_budget:150000,note:'企業協賛の相談'};
const events=[
 {team_id:teamId,id:'1',event_date:'2026-12-04',title:'12月イベントA',revenue_budget:300000},
 {team_id:teamId,id:'2',event_date:'2026-12-11',title:'12月イベントB',revenue_budget:0},
 {team_id:teamId,id:'3',event_date:'2026-12-19',title:'12月イベントC',revenue_budget:120000},
 {team_id:teamId,id:'4',event_date:'2027-01-03',title:'対象外',revenue_budget:999000},
 {team_id:'other',id:'5',event_date:'2026-12-01',title:'他チーム',revenue_budget:150000}
];
const input={month,teamId,staff,compensation,externalConfigs,events,budget};
const build=overrides=>buildNextMonthBudgetSummary({...input,...overrides});

test('following-month selection is JST aware, including year change',()=>{
 assert.equal(nextJapanMonth(new Date('2026-11-15T12:00:00+09:00')),'2026-12');
 assert.equal(nextJapanMonth(new Date('2026-12-31T23:55:00+09:00')),'2027-01');
 assert.equal(nextJapanMonth(new Date('2026-11-30T16:00:00Z')),'2027-01');
});
test('budget totals use fixed monthly salary once plus hourly budget, expenses and separate outsourcing',()=>{
 const r=build();
 assert.equal(r.salary,300000);
 assert.equal(r.hourly,100000);
 assert.equal(r.labor,400000);
 assert.equal(r.revenue,1500000);
 assert.equal(r.cost,200000);
 assert.equal(r.contractor,150000);
 assert.equal(r.projectedBalance,750000);
 assert.equal(r.goalsComplete,true);
});
test('outsourcing missing is not silently equivalent to zero',()=>{
 const r=build({budget:{...budget,outsourcing_budget:null}});
 assert.equal(r.contractor,null);
 assert.equal(r.projectedBalance,null);
 assert.equal(r.goalsComplete,false);
 assert.match(r.warnings.join(' '),/外注費予算が未設定/);
});
test('no monthly budget still reports event count but refuses to invent monetary budget',()=>{
 const r=build({budget:null});
 assert.equal(r.plannedCount,3);
 assert.equal(r.revenue,null);
 assert.equal(r.labor,null);
 assert.equal(r.projectedBalance,null);
 assert.equal(r.budgetExists,false);
 assert.match(r.warnings.join(' '),/月次予算は未登録/);
 const html=nextMonthBudgetReportHtml({data:r});
 assert.match(html,/未設定/);
 assert.match(html,/未算出/);
});
test('event-level budgets are evidence only, not substituted for company revenue target',()=>{
 const r=build();
 assert.equal(r.plannedCount,3);
 assert.equal(r.eventBudgetCount,2);
 assert.equal(r.eventUnassignedCount,1);
 assert.equal(r.eventTargets,420000);
 assert.equal(r.revenue,1500000);
 assert.match(r.warnings.join(' '),/1件/);
});
test('legacy labor budget does not falsely show hourly and fixed breakdown',()=>{
 const r=build({budget:{...budget,hourly_labor_budget:null,labor_budget:550000}});
 assert.equal(r.laborMode,'legacy');
 assert.equal(r.labor,550000);
 assert.equal(r.salary,null);
 assert.equal(r.hourly,null);
 assert.equal(r.projectedBalance,600000);
 assert.match(r.warnings.join(' '),/旧方式/);
});
test('different team or month budget is rejected as unavailable',()=>{
 const r1=build({budget:{...budget,team_id:'other'}});
 const r2=build({budget:{...budget,month:11}});
 assert.equal(r1.budgetExists,false);
 assert.equal(r2.budgetExists,false);
});
test('rendered owner report is an A4 monthly budget plan, not an actual earnings report',()=>{
 const html=nextMonthBudgetReportHtml({data:build(),teamName:'TSA'});
 assert.match(html,/<title>2026-12_月次予算計画サマリー<\/title>/);
 assert.match(html,/@page\{size:A4 portrait/);
 assert.match(html,/予定イベント/);
 assert.match(html,/¥750,000/);
 assert.match(html,/送付は自動ではありません/);
});
test('all user-entered budget notes and event titles are HTML escaped',()=>{
 const r=build({budget:{...budget,note:'<img src=x>'},events:[{...events[0],title:'<script>alert(1)</script>'}]});
 const html=nextMonthBudgetReportHtml({data:r,teamName:'<svg/onload=1>',ownerNote:'<img src=notok>'});
 assert.match(html,/&lt;img src=x&gt;/);
 assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
 assert.doesNotMatch(html,/<img src=notok>/);
});
test('invalid budget amount fails closed rather than producing a misleading total',()=>{
 assert.throws(()=>build({budget:{...budget,outsourcing_budget:-1}}),/予算額/);
});
