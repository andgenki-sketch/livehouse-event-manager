import test from 'node:test';
import assert from 'node:assert/strict';
import {CASHFLOW_KEYS,calculateCashflow,cashflowMonthList} from '../app/components/cashflow-model.mjs';
import {CASHFLOW_SHEET_ROWS,cashflowSheetValue,cashflowSheetAnnualValue,cashflowCellToYen,cashflowYenToInput,cashflowYenToDisplay} from '../app/components/cashflow-sheet-layout.mjs';

const plan={
 month:'2026-12-01',scenario:'plan',opening_balance:-3070000,reported_closing_balance:-2610000,
 sales_cash:6000000,sales_cashless:null,purchase_cost:300000,director_salary:300000,employee_salary:1100000,
 transportation:0,entertainment:20000,advertising:0,communications:10000,rent:1000000,utilities:300000,
 other_operating:250000,taxes:300000,statutory_benefits:180000,outsourcing:null,
 long_loan_in:null,short_loan_in:null,other_finance_in:null,long_loan_out:380000,short_loan_out:1400000,
 loan_interest:null,other_finance_out:null,status:'draft'
};
test('workbook row order begins and ends with the exact original flow',()=>{
 const rows=CASHFLOW_SHEET_ROWS;
 assert.deepEqual(rows.slice(0,5).map(r=>r.label),[
  '前月繰越現金・預金','営業収支｜売上高','売上高（現金）','売上高（キャッシュレス）','売上高合計'
 ]);
 assert.deepEqual(rows.slice(-5).map(r=>r.label),[
  '財務収支差引過不足','月別収支合計','翌月繰越現金・預金（計算）',
  '翌月繰越現金・預金（原本・帳簿）','月末残高の照合差額'
 ]);
});
test('every cashflow model field can be edited in original matrix',()=>{
 const inputRows=CASHFLOW_SHEET_ROWS.filter(r=>r.type==='amount').map(r=>r.key);
 assert.deepEqual(new Set(inputRows),new Set(['opening_balance',...CASHFLOW_KEYS,'reported_closing_balance']));
 assert.equal(inputRows.length,24);
});
test('December workbook subtotals exactly reconcile cash movement',()=>{
 const expected={
  sales_total:6000000,cost_total:300000,gross_profit:5700000,expenses_total:3460000,
  operating_profit:2240000,finance_out_total:1780000,finance_balance:-1780000,
  monthly_total:460000,closing_balance:-2610000,reconciliation_delta:0
 };
 for(const [key,value] of Object.entries(expected)){
  assert.equal(cashflowSheetValue(plan,key),value,key);
 }
});
test('blank cells are not silently presented as zero',()=>{
 assert.equal(cashflowSheetValue(plan,'sales_cashless'),null);
 assert.equal(cashflowSheetValue(plan,'loan_interest'),null);
 assert.equal(cashflowSheetValue(null,'sales_total'),null);
 assert.equal(cashflowYenToDisplay(null,'man'),'—');
 assert.equal(cashflowYenToInput(null,'man'),'');
 assert.equal(cashflowCellToYen('','man'),null);
});
test('unit switch preserves yen including fractions of one man-yen',()=>{
 const yenValues=[0,1,12,100,12000,3000123,6000000,-3070000,-2610001];
 for(const n of yenValues){
  const display=cashflowYenToInput(n,'man');
  assert.equal(cashflowCellToYen(display,'man',{signed:true}),n,'round-trip '+n+' '+display);
  assert.equal(cashflowCellToYen(cashflowYenToInput(n,'yen'),'yen',{signed:true}),n);
 }
 assert.equal(cashflowYenToInput(6000000,'man'),'600');
 assert.equal(cashflowYenToInput(3000123,'man'),'300.0123');
 assert.equal(cashflowYenToDisplay(-2610000,'man'),'-261');
});
test('at most four fractional digits in man-yen are allowed',()=>{
 assert.throws(()=>cashflowCellToYen('0.00001','man'),/小数4桁/);
 assert.equal(cashflowCellToYen('0.0001','man'),1);
 assert.throws(()=>cashflowCellToYen('1.5','yen'),/整数/);
 assert.throws(()=>cashflowCellToYen('-1','man'),/小数4桁/);
 assert.equal(cashflowCellToYen('-1.5','man',{signed:true}),-15000);
});
test('annual sum is only populated from known months and labels partial totals',()=>{
 const months=cashflowMonthList(2026);
 const rows={'2026-12':plan};
 const subtotal=cashflowSheetAnnualValue(rows,'monthly_total',months);
 assert.equal(subtotal.value,460000);
 assert.equal(subtotal.available,1);
 assert.equal(subtotal.partial,true);
 const blank=cashflowSheetAnnualValue(rows,'sales_cashless',months);
 assert.equal(blank.value,null);
 assert.equal(cashflowSheetAnnualValue(rows,'opening_balance',months).value,null);
 assert.equal(cashflowSheetAnnualValue(rows,'closing_balance',months).value,null);
});
test('difference view is computed from independently entered actual and plan values',()=>{
 const actual={...plan,sales_cash:5800000,reported_closing_balance:-2800000};
 const sameName=cashflowSheetValue(actual,'sales_cash')-cashflowSheetValue(plan,'sales_cash');
 assert.equal(sameName,-200000);
 assert.equal(cashflowSheetValue(actual,'reported_closing_balance')-cashflowSheetValue(plan,'reported_closing_balance'),-190000);
 assert.equal(calculateCashflow(actual).reportedClosing,-2800000);
});
