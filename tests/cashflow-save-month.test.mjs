import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCashflowMonthSave,validateCashflowEntry} from '../app/components/cashflow-model.mjs';

// The screen preview intentionally uses a full YYYY-MM-01 date for calculations.
const previewRow={
 month:'2026-11-01',scenario:'plan',opening_balance:-2780000,
 sales_cash:3900000,employee_salary:1200000,long_loan_out:380000,
 reported_closing_balance:-3070000
};

test('planned cashflow saves selected YYYY-MM as database YYYY-MM-01 without rejecting preview date',()=>{
 const before={...previewRow};
 const saved=prepareCashflowMonthSave(previewRow,'2026-11','plan');
 assert.equal(saved.month,'2026-11-01');
 assert.equal(saved.scenario,'plan');
 assert.equal(saved.sales_cash,3900000);
 assert.equal(saved.opening_balance,-2780000);
 assert.equal(saved.reported_closing_balance,-3070000);
 assert.equal(saved.employee_salary,1200000);
 assert.deepEqual(previewRow,before);
});

test('actual cashflow uses the same safe conversion and keeps explicitly entered zero',()=>{
 const saved=prepareCashflowMonthSave({
  month:'2027-01-01',scenario:'actual',opening_balance:-100000,
  sales_cash:0,sales_cashless:100000,reported_closing_balance:0
 },'2027-01','actual');
 assert.equal(saved.month,'2027-01-01');
 assert.equal(saved.scenario,'actual');
 assert.equal(saved.sales_cash,0);
 assert.equal(saved.sales_cashless,100000);
 assert.equal(saved.reported_closing_balance,0);
 assert.equal(saved.loan_interest,null);
});

test('invalid selected month and category amounts fail before the database call',()=>{
 assert.throws(()=>prepareCashflowMonthSave(previewRow,'2026-13','plan'),/対象月/);
 assert.throws(()=>prepareCashflowMonthSave(previewRow,'2026-11-01','plan'),/対象月/);
 assert.throws(()=>prepareCashflowMonthSave(previewRow,'2026-11','difference'),/実績・計画区分/);
 assert.throws(()=>prepareCashflowMonthSave({...previewRow,sales_cash:-1},'2026-11','plan'),/0円以上/);
});

test('the model still rejects SQL formatted month if passed directly to its input validator',()=>{
 assert.throws(()=>validateCashflowEntry(previewRow),/対象月/);
 assert.doesNotThrow(()=>validateCashflowEntry({...previewRow,month:'2026-11'}));
});
