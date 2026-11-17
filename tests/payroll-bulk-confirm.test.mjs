import test from 'node:test';
import assert from 'node:assert/strict';
import {payrollConfirmationEligibility,payrollBulkReview,payrollSelectedTotal} from '../app/components/payroll-bulk-confirm.mjs';
const example=(id,total=40000,rest={})=>({
 s:{id,name:'スタッフ'+id},monthly:0,hourly:1200,total,usedMinutes:1800,
 mixedDays:[],unclocked:[],incomplete:[],isExternalOnly:false,confirmed:null,...rest
});
test('only unconfirmed payable staff is eligible',()=>{
 const r=payrollBulkReview([example('a',40000),example('b',60000,{confirmed:{id:'confirmed'}})]);
 assert.equal(r.eligible.length,1);assert.equal(r.confirmed.length,1);
 assert.equal(payrollSelectedTotal(r.eligible).total,40000);
});
test('unclocked and incomplete attendance cannot be batch confirmed',()=>{
 const r=payrollBulkReview([example('a',40000,{unclocked:[{id:1}]}),example('b',60000,{incomplete:[{}]})]);
 assert.equal(r.eligible.length,0);assert.equal(r.blocked.length,2);
});
test('mixed contractor and salary shifts must be reviewed',()=>{
 const r=payrollBulkReview([example('a',40000,{mixedDays:['2026-10-03']})]);
 assert.equal(r.blocked[0].label,'給与・外注の混在');
});
test('external-only staff are excluded from payroll',()=>{
 const r=payrollBulkReview([example('a',0,{isExternalOnly:true})]);
 assert.equal(r.excluded.length,1);assert.equal(r.eligible.length,0);
});
test('staff with unconfigured hourly wage must be reviewed even if transport creates a positive total',()=>{
 const r=payrollBulkReview([example('a',500,{hourly:0,monthly:0,usedMinutes:600})]);
 assert.equal(r.eligible.length,0);assert.equal(r.blocked[0].label,'時給が未設定');
});
test('monthly salary staff can be confirmed with no timecards',()=>{
 const r=payrollBulkReview([example('a',280000,{monthly:280000,hourly:0,usedMinutes:0})]);
 assert.equal(r.eligible.length,1);
});
test('no work and zero pay are skipped without creating zero confirmation rows',()=>{
 const r=payrollBulkReview([example('a',0,{usedMinutes:0})]);
 assert.equal(r.excluded.length,1);
});
test('negative and nonfinite totals are blocked',()=>{
 const r=payrollBulkReview([example('a',-100),example('b',Number.NaN)]);
 assert.equal(r.blocked.length,2);
});
test('manual exclusions only affect the selected set and total',()=>{
 const r=payrollBulkReview([example('a',40000),example('b',60000)]);
 const a=payrollSelectedTotal(r.eligible,['b']);
 assert.equal(a.count,1);assert.equal(a.total,40000);
});
test('confirmed rows cannot be accidentally overwritten in an eligibility check',()=>{
 const c=payrollConfirmationEligibility(example('a',30000,{confirmed:{id:'old'},incomplete:[]}));
 assert.equal(c.status,'confirmed');
});
