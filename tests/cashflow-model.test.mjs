import test from 'node:test';
import assert from 'node:assert/strict';
import {
 CASHFLOW_FIELDS,CASHFLOW_KEYS,calculateCashflow,validateCashflowEntry,cashflowMonthList,cashflowYearStart,
 cashflowVariance,cashflowReportSection
} from '../app/components/cashflow-model.mjs';
import {monthlyExecutiveReportHtml} from '../app/components/monthly-management-report.mjs';
import {nextMonthBudgetReportHtml} from '../app/components/next-month-budget-report.mjs';

const plan={
 month:'2026-12',scenario:'plan',opening_balance:-3070000,reported_closing_balance:-2610000,
 sales_cash:6000000,sales_cashless:null,purchase_cost:300000,
 director_salary:300000,employee_salary:1100000,transportation:0,entertainment:20000,
 advertising:0,communications:10000,rent:1000000,utilities:300000,
 other_operating:250000,taxes:300000,statutory_benefits:180000,
 outsourcing:null,long_loan_in:null,short_loan_in:null,other_finance_in:null,
 long_loan_out:380000,short_loan_out:1400000,loan_interest:null,other_finance_out:null,
 status:'draft',source_note:'原本 資金繰り表'
};

test('all source categories and independent contractor/debt controls are included',()=>{
 assert.equal(CASHFLOW_KEYS.length,22);
 assert.deepEqual(CASHFLOW_KEYS,CASHFLOW_FIELDS.map(x=>x.key));
 for(const key of ['sales_cash','sales_cashless','employee_salary','statutory_benefits','outsourcing','long_loan_out','short_loan_out','loan_interest']){
  assert.ok(CASHFLOW_KEYS.includes(key),key);
 }
});
test('source month December preserves exact yen numbers and negative balances',()=>{
 const v=calculateCashflow(plan);
 assert.equal(v.opening,-3070000);
 assert.equal(v.operatingIncome,6000000);
 assert.equal(v.operatingOut,3760000);
 assert.equal(v.financialOut,1780000);
 assert.equal(v.net,460000);
 assert.equal(v.closing,-2610000);
 assert.equal(v.reportedClosing,-2610000);
 assert.equal(v.reconciliationDelta,0);
 assert.equal(v.reviewed,false);
 assert.equal(v.complete,false);
});
test('blank is never treated as an explicitly verified zero',()=>{
 const v=calculateCashflow({month:'2026-11',scenario:'actual',opening_balance:0,sales_cash:null});
 assert.equal(v.recorded,0);
 assert.equal(v.closing,null);
 assert.equal(v.net,null);
 assert.equal(v.complete,false);
 assert.deepEqual(validateCashflowEntry({month:'2026-11',scenario:'actual',opening_balance:0,sales_cash:0}).sales_cash,0);
});
test('reported bank/ledger balance differences remain visible for discussion',()=>{
 const row={...plan,reported_closing_balance:-2700000};
 const v=calculateCashflow(row);
 assert.equal(v.closing,-2610000);
 assert.equal(v.reportedClosing,-2700000);
 assert.equal(v.reconciliationDelta,-90000);
});
test('validating complete reviewed cashflow requires every category explicitly entered',()=>{
 const row={...plan,...Object.fromEntries(CASHFLOW_KEYS.filter(k=>plan[k]===null).map(k=>[k,0]))};
 assert.doesNotThrow(()=>validateCashflowEntry(row,{complete:true}));
 assert.throws(()=>validateCashflowEntry(plan,{complete:true}),/全項目/);
});
test('negative opening and bank balances are legal, negative unclassified expense is not',()=>{
 assert.equal(validateCashflowEntry(plan).opening_balance,-3070000);
 assert.equal(validateCashflowEntry(plan).reported_closing_balance,-2610000);
 assert.throws(()=>validateCashflowEntry({...plan,purchase_cost:-1}),/0円以上/);
 assert.throws(()=>validateCashflowEntry({...plan,purchase_cost:0.1}),/整数/);
});
test('financial loan repayments affect cash but are not called operating income',()=>{
 const row={...plan,long_loan_out:380000,short_loan_out:1400000};
 const result=calculateCashflow(row);
 assert.equal(result.operatingNet,2240000);
 assert.equal(result.financialOut,1780000);
 assert.equal(result.net,460000);
});
test('twelve-month report follows September to August fiscal year',()=>{
 const expected=['2026-09','2026-10','2026-11','2026-12','2027-01','2027-02','2027-03','2027-04','2027-05','2027-06','2027-07','2027-08'];
 assert.deepEqual(cashflowMonthList(2026),expected);
 assert.equal(cashflowYearStart('2027-01'),2026);
 assert.equal(cashflowYearStart('2026-09'),2026);
});
test('actual vs plan variance is only comparable where both values were recorded',()=>{
 assert.equal(cashflowVariance({...plan,sales_cash:6200000},plan,'sales_cash'),200000);
 assert.equal(cashflowVariance({...plan,sales_cash:null},plan,'sales_cash'),null);
});
test('cashflow PDF sections are safely escaped and include separate balance measurements',()=>{
 const text=cashflowReportSection({actual:{...plan,scenario:'actual',management_note:'<script>alert(1)</script>'},plan,mode:'actual'});
 assert.match(text,/資金繰り実績/);
 assert.match(text,/月末残高（原本・帳簿等）/);
 assert.match(text,/残高の照合差額/);
 assert.match(text,/従業員給与/);
 assert.match(text,/借入金利息/);
 assert.doesNotMatch(text,/<script>alert/);
 assert.match(text,/&lt;script&gt;/);
});
test('unentered monthly cashflow must be shown as missing not zero yen',()=>{
 const text=cashflowReportSection({actual:null,plan});
 assert.match(text,/未登録/);
 assert.match(text,/未入力/);
});
test('the management summary PDF includes actual and baseline separately from payroll',()=>{
 const data={month:'2026-10',sales:0,salaryTotal:0,hasConfirmed:false,payroll:[],manualPayroll:[],salaryExceptions:[],
 pending:[],expectedCount:0,confirmedCount:0,payrollComplete:false,salesAvailable:true,
 expenseTotal:0,outsideTotal:0,ledgerExpense:0,eventExpense:0,ledgerOutside:0,eventOutside:0,
 eventsCount:0,reportedEventsCount:0,missingReports:[],warnings:[],
 referenceBalance:null,monthlyBudget:null};
 const html=monthlyExecutiveReportHtml({data,cashflowActual:{...plan,month:'2026-10',scenario:'actual'},cashflowPlan:{...plan,month:'2026-10'}});
 assert.match(html,/資金繰り実績/);
 assert.match(html,/現金・預金/);
 assert.match(html,/<h2>スタッフ別 給与確定一覧/);
});
test('next month budget PDF includes cashflow plan even without an entered budget',()=>{
 const data={month:'2026-12',revenue:null,labor:null,salary:null,hourly:null,cost:null,
 contractor:null,projectedBalance:null,plannedEvents:[],plannedCount:0,
 eventBudgetCount:0,eventTargets:0,warnings:[],goalsComplete:false,comments:''};
 const html=nextMonthBudgetReportHtml({data,cashflowPlan:plan,cashflowActual:null});
 assert.match(html,/資金繰り計画/);
 assert.match(html,/−¥2,610,000/);
 assert.match(html,/未入力/);
});
