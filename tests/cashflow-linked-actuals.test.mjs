import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCashflowLinkedReferences,fetchCashflowLinkedReferences,previousCashflowMonth,verifiedCarryover,salesAllocation,payrollPaymentSuggestion} from '../app/components/cashflow-linked-actuals.mjs';
import {calculateCashflow} from '../app/components/cashflow-model.mjs';
import {cashflowExecutiveDetails} from '../app/components/cashflow-executive-report.mjs';
import {CASHFLOW_SHEET_ROWS} from '../app/components/cashflow-sheet-layout.mjs';
import {readFileSync} from 'node:fs';

const team='team1';
const events=[
 {id:'a',team_id:team,event_date:'2026-10-18',event_genre:'通常',title:'A'},
 {id:'b',team_id:team,event_date:'2026-10-19',event_genre:'通常',title:'B'},
 {id:'c',team_id:team,event_date:'2026-11-10',event_genre:'通常',title:'C'},
 {id:'foreign',team_id:'other',event_date:'2026-10-19',event_genre:'通常',title:'別チーム'}
];
const settlements=[
 {event_id:'a',team_id:team,ticket_sales:20000,bar_sales:8000,other_income:1000},
 {event_id:'c',team_id:team,ticket_sales:30000,bar_sales:12000},
 {event_id:'foreign',team_id:'other',ticket_sales:500000}
];
const artistFinance=[
 {event_id:'a',team_id:team,ticket_sales:15000,electronic_ticket_sales:5000,ticket_back:3000},
 {event_id:'foreign',team_id:'other',ticket_sales:999999}
];
const confirmations=[
 {team_id:team,payroll_month:'2026-09-01',confirmed_amount:111000,staff_id:'s1'},
 {team_id:team,payroll_month:'2026-10-01',confirmed_amount:'200000',staff_id:'s1'},
 {team_id:team,payroll_month:'2026-10-01',confirmed_amount:175000,staff_id:'s2'},
 {team_id:'other',payroll_month:'2026-10-01',confirmed_amount:999999,staff_id:'else'}
];
const linked=()=>buildCashflowLinkedReferences({teamId:team,events,settlements,artistFinance,confirmations});

test('monthly sales use the existing management-report calculation, never cash drawer balance or invented split',()=>{
 const {sales}=linked();
 assert.deepEqual(sales['2026-10'],{total:26000,events:2,registered:1,missing:1,month:'2026-10'});
 assert.equal(sales['2026-11'].total,42000);
 assert.equal(sales['2026-11'].registered,1);
 assert.equal(sales['2026-10'].total<500000,true);
});
test('confirmed payroll is grouped by WORK month and not marked as paid',()=>{
 const {payroll}=linked();
 assert.deepEqual(payroll['2026-10'],{total:375000,confirmed:2,month:'2026-10'});
 assert.equal(payroll['2026-09'].total,111000);
 assert.equal(payrollPaymentSuggestion(payroll['2026-10']),375000);
 assert.throws(()=>payrollPaymentSuggestion(null),/確定給与がありません/);
});
test('cannot allocate an incomplete month or a mismatch to cashflow deposit fields',()=>{
 const {sales}=linked();
 assert.throws(()=>salesAllocation({reference:sales['2026-10'],receivedCash:26000,receivedCashless:0}),/未登録/);
 const candidate={total:42000,registered:1,missing:0};
 assert.deepEqual(salesAllocation({reference:candidate,receivedCash:25000,receivedCashless:17000}),{sales_cash:25000,sales_cashless:17000});
 assert.throws(()=>salesAllocation({reference:candidate,receivedCash:42000,receivedCashless:1000}),/一致しません/);
 assert.throws(()=>salesAllocation({reference:candidate,receivedCash:-10,receivedCashless:42010}),/0円以上/);
});
test('carryover only from independently reviewed ACTUAL closing balance and never overwrites',()=>{
 const prior={scenario:'actual',status:'reviewed',reported_closing_balance:-3070000};
 assert.equal(verifiedCarryover(prior,null),-3070000);
 assert.equal(verifiedCarryover({...prior,reported_closing_balance:0},null),0);
 assert.equal(verifiedCarryover(prior,{opening_balance:0}),null);
 assert.equal(verifiedCarryover(prior,{opening_balance:-2780000}),null);
 assert.equal(verifiedCarryover({...prior,status:'draft'},null),null);
 assert.equal(verifiedCarryover({...prior,scenario:'plan'},null),null);
 assert.equal(verifiedCarryover({...prior,reported_closing_balance:null},null),null);
 assert.equal(previousCashflowMonth('2026-11'),'2026-10');
 assert.equal(previousCashflowMonth('2027-01'),'2026-12');
});
test('reference rows are present but excluded from the cashflow model and management PDF money arithmetic',()=>{
 const references=CASHFLOW_SHEET_ROWS.filter(x=>x.type==='reference');
 assert.deepEqual(references.map(x=>x.key),['linked_sales','linked_payroll']);
 const model=calculateCashflow({scenario:'actual',opening_balance:0,sales_cash:20000,employee_salary:13000});
 assert.equal(model.operatingIncome,20000);
 assert.equal(model.operatingOut,13000);
 const html=cashflowExecutiveDetails({actual:{scenario:'actual',month:'2026-10-01',opening_balance:0,sales_cash:20000}});
 assert.doesNotMatch(html,/アプリ登録売上（入金・決済区分未照合）/);
 assert.doesNotMatch(html,/確定給与（勤務月ベース・支払未照合）/);
});
test('UI does not auto-post reference numbers as cash without explicit owner action',()=>{
 const src=readFileSync(new URL('../app/components/CashflowSpreadsheet.js',import.meta.url),'utf8');
 assert.match(src,/selectedSales/);
 assert.match(src,/onClick=\{applySales\}/);
 assert.match(src,/onClick=\{applyPayroll\}/);
 assert.match(src,/verifiedCarryover/);
 assert.match(src,/資金繰り合計に加算されません/);
});
test('failed source read does not require a broad permission grant',async()=>{
 const calls=[];
 function builder(name){
  return {
   select(cols){calls.push({name,columns:cols});return this},
   eq(){return this},gte(){return this},lt(){return this},order(){return this},
   in(){return this},
   then(resolve,reject){
    const dataset=name==='events'?events.filter(x=>x.team_id===team):
      name==='payroll_confirmations'?confirmations.filter(x=>x.team_id===team):
      name==='settlements'?settlements.filter(x=>x.team_id===team):
      name==='event_artist_finance'?artistFinance.filter(x=>x.team_id===team):[];
    return Promise.resolve({data:dataset,error:null}).then(resolve,reject);
   }
  };
 }
 const client={from:builder};
 const result=await fetchCashflowLinkedReferences(client,team,2026);
 assert.equal(result.sales['2026-10'].total,26000);
 assert.equal(result.payroll['2026-10'].total,375000);
 const selectedEvents=calls.find(x=>x.name==='events');
 assert.ok(selectedEvents);
 assert.doesNotMatch(selectedEvents.columns,/revenue_budget/);
 assert.ok(calls.every(c=>!c.columns.includes('secret')));
});
