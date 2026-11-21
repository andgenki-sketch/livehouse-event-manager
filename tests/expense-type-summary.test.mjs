import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {expenseType,expenseTypeSummary,expenseCategoryLabel} from '../app/components/expense-type-summary.mjs';

test('purchase and consumables categories include legacy ledger values',()=>{
 assert.equal(expenseType('仕入'),'purchase');
 assert.equal(expenseType('仕入れ'),'purchase');
 assert.equal(expenseType('消耗品費'),'consumables');
 assert.equal(expenseType('消耗品'),'consumables');
 assert.equal(expenseCategoryLabel('仕入'),'仕入れ');
 assert.equal(expenseCategoryLabel('消耗品費'),'消耗品');
});

test('split by category across events and common store entries without double counting',()=>{
 const rows=[
  {category:'仕入',event_id:'event-1',amount:7000},
  {category:'仕入',event_id:null,amount:3500},
  {category:'消耗品費',event_id:'event-1',amount:1000},
  {category:'消耗品費',event_id:null,amount:1500},
  {category:'広告宣伝費',event_id:'event-2',amount:2000},
  {category:'交通費',event_id:null,amount:500},
  {category:'外注費',event_id:'event-1',amount:8000}
 ];
 assert.deepEqual(expenseTypeSummary(rows),{
  purchase:10500,consumables:2500,other:2500,outsourcing:8000,total:15500,count:7
 });
});

test('unknown or missing historic categories stay in other, not automatically counted as consumables',()=>{
 const actual=expenseTypeSummary([{category:'不明',amount:1200},{amount:100}]);
 assert.equal(actual.other,1300);
 assert.equal(actual.purchase,0);
 assert.equal(actual.consumables,0);
 assert.equal(actual.total,1300);
 assert.equal(expenseCategoryLabel(null),'未分類');
});

test('zero and blank ledger totals remain zero',()=>{
 assert.deepEqual(expenseTypeSummary([]),{purchase:0,consumables:0,other:0,outsourcing:0,total:0,count:0});
 assert.throws(()=>expenseTypeSummary([{category:'仕入',amount:'not an amount'}]),/不正な金額/);
});

test('expense view renders purchase/consumables headings and retains event associations',()=>{
 const page=readFileSync(new URL('../app/page.js',import.meta.url),'utf8');
 const i=page.indexOf('function ExpenseView('),j=page.indexOf('function MyPage(',i);
 assert.ok(i>=0&&j>i);
 const view=page.slice(i,j);
 assert.match(view,/breakdown=expenseTypeSummary\(rows\)/);
 assert.match(view,/<small>仕入れ<\/small>/);
 assert.match(view,/<small>消耗品<\/small>/);
 assert.match(view,/<small>その他経費<\/small>/);
 assert.doesNotMatch(view,/<small>イベント経費<\/small>/);
 assert.doesNotMatch(view,/<small>店舗共通経費<\/small>/);
 assert.match(view,/x\.event_id\?\(em\.get/);
});
