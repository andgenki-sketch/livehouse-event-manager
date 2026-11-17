import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedPayrollRows,payrollReportHtml} from '../app/components/payroll-report.mjs';
import {payrollConfirmationEligibility,payrollBulkReview,payrollSelectedTotal,canManualConfirmPayroll,manualPayrollValues,canQuickConfirmMonthlySalary,monthlySalaryExceptionValues} from '../app/components/payroll-bulk-confirm.mjs';
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

test('incomplete timecards are manual-review candidates but not automatic confirmation',()=>{
 const r=payrollBulkReview([example('a',20000,{incomplete:[{}]}),example('b',45000,{unclocked:[{}]})]);
 assert.equal(r.eligible.length,0);
 assert.equal(r.manualCandidates.length,2);
 assert.equal(r.blocked.length,2);
});
test('external-only staff and mixed-payroll days can never use the exception path',()=>{
 assert.equal(canManualConfirmPayroll(example('a',20000,{isExternalOnly:true,incomplete:[{}]})),false);
 assert.equal(canManualConfirmPayroll(example('b',20000,{mixedDays:['2026-11-02'],incomplete:[{}]})),false);
 assert.equal(canManualConfirmPayroll(example('c',20000,{incomplete:[{}],confirmed:{id:'confirmed'}})),false);
});
test('manual confirmation demands owner acknowledgement and independently verified fields',()=>{
 const valid={amount:'29545',hours:'23.5',days:'4',reason:'勤務時間を本人と照合済み',acknowledged:true};
 assert.deepEqual(manualPayrollValues(valid),{ok:true,amount:29545,minutes:1410,days:4,reason:'勤務時間を本人と照合済み'});
 assert.equal(manualPayrollValues({...valid,acknowledged:false}).ok,false);
 assert.equal(manualPayrollValues({...valid,amount:''}).ok,false);
 assert.equal(manualPayrollValues({...valid,hours:''}).ok,false);
 assert.equal(manualPayrollValues({...valid,days:''}).ok,false);
 assert.equal(manualPayrollValues({...valid,reason:'短い'}).ok,false);
});
test('payroll exception amounts cannot be negative, fractional yen or zero',()=>{
 const base={amount:'10000',hours:'5.5',days:'1',reason:'本人に確認済みの申告記録',acknowledged:true};
 for(const amount of ['-100','0','2.5','abc','NaN','Infinity']){
  assert.equal(manualPayrollValues({...base,amount}).ok,false,amount);
 }
});
test('manual hour and day range checks reject implausible input',()=>{
 const base={amount:'10000',hours:'5',days:'1',reason:'本人に確認済みの申告記録',acknowledged:true};
 for(const hours of ['-1','745','a','1.234'])assert.equal(manualPayrollValues({...base,hours}).ok,false,hours);
 for(const days of ['0','32','1.5','abc'])assert.equal(manualPayrollValues({...base,days}).ok,false,days);
});

test('salaried staff with missing punches can be approved with one explicit checkbox',()=>{
 const row=example('salary',302000,{
  monthly:300000,hourly:0,usedMinutes:0,unclocked:[{id:'one'}],transportTotal:2000,
  adj:{adjustment_amount:0}
 });
 const review=payrollBulkReview([row]);
 assert.equal(review.eligible.length,0);
 assert.equal(review.salaryCandidates.length,1);
 assert.equal(review.manualCandidates.length,0);
 assert.equal(canQuickConfirmMonthlySalary(row),true);
 assert.equal(monthlySalaryExceptionValues(row,false).ok,false);
 const approved=monthlySalaryExceptionValues(row,true);
 assert.equal(approved.ok,true);
 assert.equal(approved.amount,302000);
 assert.equal(approved.minutes,0);
 assert.equal(approved.days,0);
 assert.match(approved.reason,/月給制・打刻不完全/);
});
test('salaried staff totals include allowances and saved adjustment',()=>{
 const row=example('salary',293500,{
  monthly:300000,hourly:0,incomplete:[{id:'punch'}],transportTotal:3500,
  adj:{adjustment_amount:-10000}
 });
 assert.equal(canQuickConfirmMonthlySalary(row),true);
 assert.equal(monthlySalaryExceptionValues(row,true).amount,293500);
});
test('salaried quick confirmation never permits external-only, mixed, confirmed or invalid totals',()=>{
 const base={monthly:300000,hourly:0,incomplete:[{}],transportTotal:0,adj:{adjustment_amount:0}};
 assert.equal(canQuickConfirmMonthlySalary(example('x',300000,{...base,isExternalOnly:true})),false);
 assert.equal(canQuickConfirmMonthlySalary(example('x',300000,{...base,mixedDays:['2026-11-03']})),false);
 assert.equal(canQuickConfirmMonthlySalary(example('x',300000,{...base,confirmed:{id:'already'}})),false);
 assert.equal(canQuickConfirmMonthlySalary(example('x',299999,base)),false);
 assert.equal(canQuickConfirmMonthlySalary(example('x',-1,base)),false);
});
test('hourly staff still need full reason time and days for incomplete punches',()=>{
 const row=example('hourly',40000,{monthly:0,hourly:1400,incomplete:[{}]});
 assert.equal(canQuickConfirmMonthlySalary(row),false);
 const review=payrollBulkReview([row]);
 assert.equal(review.manualCandidates.length,1);
 assert.equal(review.salaryCandidates.length,0);
});
test('salaried staff with complete punches remain in regular payroll workflow',()=>{
 const row=example('salary',300000,{monthly:300000,hourly:0,transportTotal:0});
 assert.equal(canQuickConfirmMonthlySalary(row),false);
 assert.equal(payrollBulkReview([row]).eligible.length,1);
});

test('salary exception PDF shows work time as unverified, never 0 actual hours or 0 actual days',()=>{
 const team='team1',staff=[{id:'s1',team_id:team,name:'月給社員'}];
 const confirmations=[{
  team_id:team,staff_id:'s1',payroll_month:'2026-10-01',
  confirmed_amount:300000,confirmed_minutes:0,work_days:0,
  confirmation_method:'salary_exception',exception_reason:'月給制につき金額確認'
 }];
 const rows=confirmedPayrollRows(confirmations,staff,team,'2026-10');
 assert.equal(rows[0].method,'salary_exception');
 const html=payrollReportHtml({rows,month:'2026-10',teamName:'ThunderSnakeATSUGI'});
 assert.match(html,/月給簡単確定/);
 assert.match(html,/未確認/);
 assert.doesNotMatch(html,/月給社員<\/td>/);
 assert.equal(rows[0].days,0);
 assert.equal(rows[0].minutes,0);
});
