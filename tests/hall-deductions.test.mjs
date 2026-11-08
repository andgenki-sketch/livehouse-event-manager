import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeHallDeductions,hallDeductionTotal} from '../app/components/hall-deductions.mjs';

test('normalizes labeled deduction lines', () => {
  assert.deepEqual(normalizeHallDeductions([{label:'  値引き  ',amount:5000},{label:'',amount:0}]), [{label:'値引き',amount:5000}]);
});
test('zero and absent values do not reduce sales', () => {
  assert.equal(hallDeductionTotal(undefined),0);
  assert.equal(hallDeductionTotal([]),0);
  assert.equal(hallDeductionTotal([{label:'確認待ち',amount:0}]),0);
});
test('multiple deductions are counted once', () => {
  assert.equal(hallDeductionTotal([{label:'値引',amount:3000},{label:'返金',amount:1200}]),4200);
  assert.equal(100000-hallDeductionTotal([{label:'値引',amount:3000},{label:'返金',amount:1200}]),95800);
});
test('rejects negative, fractional, or invalid amounts', () => {
  assert.equal(hallDeductionTotal([{label:'負値',amount:-5},{label:'小数',amount:5.5},{label:'不正',amount:'abc'}]),0);
});
test('supports amounts with comma formatting', () => {
  assert.equal(hallDeductionTotal([{label:'割引',amount:'¥2,500'}]),2500);
});
test('limits to eight line items', () => {
  assert.equal(normalizeHallDeductions(Array.from({length:12},(_,i)=>({label:String(i),amount:1}))).length,8);
});
test('does not count deductions as outside expense', () => {
  const revenue=100000, labor=20000, expenses=13000, outsourced=7000, deduction=hallDeductionTotal([{label:'値引',amount:3000}]);
  assert.equal((revenue-deduction)-labor-expenses-outsourced,57000);
});
