import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateCashflow,validateCashflowEntry,CASHFLOW_KEYS,prepareCashflowMonthSave} from '../app/components/cashflow-model.mjs';
import {CASHFLOW_SHEET_ROWS,cashflowSheetValue,cashflowSheetAnnualValue} from '../app/components/cashflow-sheet-layout.mjs';
import {cashflowExecutiveDetails,cashflowExecutiveHighlights} from '../app/components/cashflow-executive-report.mjs';

const baseline={
 month:'2026-12',scenario:'plan',status:'draft',
 opening_balance:-3070000,reported_closing_balance:-2610000,
 sales_cash:6000000,sales_cashless:null,
 purchase_cost:300000,director_salary:300000,employee_salary:1100000,
 transportation:0,entertainment:20000,advertising:0,communications:10000,
 rent:1000000,utilities:300000,other_operating:250000,taxes:300000,
 statutory_benefits:180000,outsourcing:null,long_loan_in:null,short_loan_in:null,
 other_finance_in:null,long_loan_out:380000,short_loan_out:1400000,
 loan_interest:null,other_finance_out:null
};

test('adds exactly two studio receivable categories while preserving existing generic sales',()=>{
 assert.ok(CASHFLOW_KEYS.includes('studio_sales_cash'));
 assert.ok(CASHFLOW_KEYS.includes('studio_sales_cashless'));
 assert.equal(CASHFLOW_KEYS.filter(k=>k.startsWith('studio_')).length,2);
 const rows=CASHFLOW_SHEET_ROWS;
 assert.equal(rows.find(r=>r.key==='studio_sales_cash')?.type,'amount');
 assert.equal(rows.find(r=>r.key==='studio_sales_cashless')?.type,'amount');
 assert.equal(rows.find(r=>r.key==='studio_sales_total')?.type,'calc');
 assert.equal(rows.filter(r=>r.type==='amount').length,26);
});
test('historical imported plan is unchanged and studio amounts are unknown, not zero',()=>{
 const c=calculateCashflow(baseline);
 assert.equal(c.operatingIncome,6000000);
 assert.equal(c.operatingNet,2240000);
 assert.equal(c.net,460000);
 assert.equal(c.closing,-2610000);
 assert.equal(c.reportedClosing,-2610000);
 assert.equal(c.reconciliationDelta,0);
 assert.equal(c.complete,false);
 assert.equal(c.recorded<CASHFLOW_KEYS.length,true);
 assert.equal(cashflowSheetValue(baseline,'studio_sales_total'),null);
 assert.equal(cashflowSheetValue(baseline,'studio_sales_cash'),null);
});
test('new studio cash and card receipts increase cashflow once and are visible in the detail',()=>{
 const actual={...baseline,month:'2026-12-01',scenario:'actual',
  studio_sales_cash:200000,studio_sales_cashless:58100};
 const c=calculateCashflow(actual);
 assert.equal(c.operatingIncome,6258100);
 assert.equal(c.operatingNet,2498100);
 assert.equal(c.net,718100);
 assert.equal(c.closing,-2351900);
 assert.equal(c.reconciliationDelta,-258100);
 assert.equal(cashflowSheetValue(actual,'studio_sales_total'),258100);
 assert.equal(cashflowSheetValue(actual,'sales_total'),6258100);
 assert.equal(cashflowSheetValue(actual,'gross_profit'),5958100);
 const pdf=cashflowExecutiveDetails({actual,mode:'actual'});
 assert.match(pdf,/スタジオ売上（現金入金）/);
 assert.match(pdf,/スタジオ売上（キャッシュレス入金）/);
 assert.match(pdf,/スタジオ売上合計/);
 assert.match(pdf,/¥258,100/);
 const front=cashflowExecutiveHighlights({actual,mode:'actual'});
 assert.match(front,/スタジオ売上入金/);
 assert.match(front,/¥258,100/);
});
test('moving previously included studio revenue from legacy sales retains same total',()=>{
 const amount=258100;
 const moved={...baseline,sales_cash:baseline.sales_cash-amount,
  studio_sales_cash:200000,studio_sales_cashless:58100};
 const c=calculateCashflow(moved);
 assert.equal(c.operatingIncome,6000000);
 assert.equal(c.net,460000);
 assert.equal(c.closing,-2610000);
});
test('studio values must be verified yen amounts, negative input and fractions are rejected',()=>{
 assert.equal(validateCashflowEntry({...baseline,studio_sales_cash:0,studio_sales_cashless:0}).studio_sales_cash,0);
 assert.throws(()=>validateCashflowEntry({...baseline,studio_sales_cash:-1}),/0円以上/);
 assert.throws(()=>validateCashflowEntry({...baseline,studio_sales_cashless:0.1}),/整数/);
 assert.equal(prepareCashflowMonthSave({...baseline,studio_sales_cash:10000},'2026-12','plan').studio_sales_cash,10000);
});
test('for a new review, blank studio categories must be verified, including explicit zero',()=>{
 const filled=Object.fromEntries(CASHFLOW_KEYS.map(key=>[key,baseline[key]??0]));
 assert.doesNotThrow(()=>validateCashflowEntry({...baseline,...filled,studio_sales_cash:0,studio_sales_cashless:0},{complete:true}));
 assert.throws(()=>validateCashflowEntry({...baseline,...filled,studio_sales_cash:null},{complete:true}),/全項目/);
});
test('studio subtotal annual entries sum only known months; no invented zero entries',()=>{
 const months=['2026-09','2026-10'];
 const rows={'2026-09':{studio_sales_cash:100000,studio_sales_cashless:50000}};
 const summed=cashflowSheetAnnualValue(rows,'studio_sales_total',months);
 assert.deepEqual(summed,{value:150000,available:1,partial:true});
});
