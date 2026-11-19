import test from 'node:test';
import assert from 'node:assert/strict';
import {cashflowExecutiveAlerts,cashflowExecutiveHighlights,cashflowExecutiveDiscussion,cashflowExecutiveDetails,cashflowExecutiveStyles} from '../app/components/cashflow-executive-report.mjs';
import {monthlyExecutiveReportHtml} from '../app/components/monthly-management-report.mjs';
import {nextMonthBudgetReportHtml} from '../app/components/next-month-budget-report.mjs';

const plan={
 month:'2026-12-01',scenario:'plan',status:'draft',
 opening_balance:-3070000,reported_closing_balance:-2610000,
 sales_cash:6000000,sales_cashless:null,purchase_cost:300000,director_salary:300000,
 employee_salary:1100000,transportation:0,entertainment:20000,advertising:0,
 communications:10000,rent:1000000,utilities:300000,other_operating:250000,
 taxes:300000,statutory_benefits:180000,outsourcing:null,
 long_loan_in:null,short_loan_in:null,other_finance_in:null,
 long_loan_out:380000,short_loan_out:1400000,loan_interest:null,
 other_finance_out:null,source_note:'サンスネ資金繰り表',
 management_note:'要確認：短期返済の扱い'
};
const monthlyData={
 month:'2026-10',sales:190000,salaryTotal:350000,hasConfirmed:true,
 payroll:[{id:'h',name:'堀井',amount:150000},{id:'o',name:'尾崎',amount:200000}],
 manualPayroll:[],salaryExceptions:[],pending:[],expectedCount:2,confirmedCount:2,
 payrollComplete:true,salesAvailable:true,expenseTotal:19000,outsideTotal:41500,
 ledgerExpense:7000,eventExpense:12000,ledgerOutside:16500,eventOutside:25000,
 eventsCount:1,reportedEventsCount:1,warnings:[],referenceBalance:-220500,monthlyBudget:null
};
const budgetData={
 month:'2026-12',revenue:1500000,labor:400000,salary:300000,hourly:100000,
 cost:200000,contractor:150000,projectedBalance:750000,
 plannedEvents:[{event_date:'2026-12-04',title:'ライブA',revenue_budget:300000}],
 plannedCount:1,eventBudgetCount:1,eventUnassignedCount:0,eventTargets:300000,
 comments:'集客施策の確認',warnings:[],goalsComplete:true
};
test('budget executive facts retain 2026-12 baseline values without making them actuals',()=>{
 const html=cashflowExecutiveHighlights({plan,actual:null,mode:'plan'});
 for(const str of ['¥460,000','¥1,780,000','−¥2,610,000','資金繰り計画','未入力'])
  assert.ok(html.includes(str),str);
 assert.match(html,/暫定/);
});
test('missing actual cash figures are never copied from the plan',()=>{
 const html=cashflowExecutiveHighlights({plan,actual:null,mode:'actual'});
 assert.match(html,/資金繰り実績の要点/);
 assert.match(html,/未登録/);
 assert.match(html,/未入力/);
 assert.match(html,/−¥2,610,000/);
});
test('negative reported balance and reconciliation difference remain visible',()=>{
 const changed={...plan,reported_closing_balance:-2700000};
 assert.ok(cashflowExecutiveAlerts({plan:changed,mode:'plan'}).some(x=>x.includes('照合差額')));
 assert.ok(cashflowExecutiveAlerts({plan:changed,mode:'plan'}).some(x=>x.includes('マイナス')));
 assert.match(cashflowExecutiveHighlights({plan:changed,mode:'plan'}),/−¥90,000/);
});
test('unset action fields stay unset; actual owner decisions are escaped and printed',()=>{
 const noDecision=cashflowExecutiveDiscussion({plan,mode:'plan'});
 for(const str of ['未決定','担当未設定','期限未設定'])assert.ok(noDecision.includes(str));
 const input={...plan,discussion_topic:'<確認する>返済条件',
 discussion_decision:'12月の返済日を確認',discussion_assignee:'担当者A',
 discussion_deadline:'2026-11-30',management_note:'<img src=x onerror=1>'};
 const html=cashflowExecutiveDiscussion({plan:input,mode:'plan'});
 for(const str of ['&lt;確認する&gt;','12月の返済日を確認','担当者A','2026-11-30'])assert.ok(html.includes(str));
 assert.doesNotMatch(html,/<img src=x/);
});
test('second-page detail has all individual cash categories and does not use blank as zero',()=>{
 const html=cashflowExecutiveDetails({plan,mode:'plan'});
 for(const str of ['売上高（キャッシュレス）','法定福利費','外注費','長期借入金返済',
  '短期借入金返済','翌月繰越現金・預金（原本・帳簿）','月別収支合計','未入力','計画－同月実績'])
  assert.ok(html.includes(str),str);
});
test('monthly actual and next month plan are both three-section printable reports',()=>{
 const prev=monthlyExecutiveReportHtml({data:monthlyData,cashflowActual:null,cashflowPlan:{...plan,month:'2026-10-01'}});
 const next=nextMonthBudgetReportHtml({data:budgetData,cashflowActual:null,cashflowPlan:plan});
 for(const html of [prev,next]){
  assert.equal((html.match(/class="report-page/g)||[]).length,2);
  const first=html.indexOf('資金繰り');
  const appendix=html.indexOf('資金繰り・勘定項目別明細');
  const third=html.indexOf('class="report-page page-three"');
  assert.ok(first>=0&&appendix>first&&third>appendix);
  assert.match(html,/@page\{size:A4 portrait/);
  assert.match(html,/break-before:page/);
 }
 assert.match(prev,/<title>2026-10_月次経営サマリー<\/title>/);
 assert.doesNotMatch(prev,/兼給与支払依頼書/);
 assert.match(prev,/スタッフ別 給与確定一覧/);
 assert.ok(prev.includes('<td>尾崎</td>'));
 assert.match(next,/<title>2026-12_月次予算計画サマリー<\/title>/);
 assert.match(next,/イベント予定と売上予算の設定状況/);
});
test('decision-making summary precedes the supporting cashflow appendix and preserves no-auto-send',()=>{
 const actual=monthlyExecutiveReportHtml({data:monthlyData,cashflowPlan:plan,note:'別途照合予定'});
 const budget=nextMonthBudgetReportHtml({data:budgetData,cashflowPlan:plan});
 for(const html of [actual,budget])
  assert.ok(html.indexOf('経営協議事項・次のアクション')<html.indexOf('資金繰り・勘定項目別明細'));
 assert.match(actual,/送付は自動では行われません/);
 assert.match(budget,/送付は自動ではありません/);
 assert.match(cashflowExecutiveStyles,/.cfe-detail-table/);
});
