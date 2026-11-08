import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateMonthlyShiftLabor,DEFAULT_SHIFT_PAID_HOURS,fixedMonthlySalaryTotal,resolveMonthlyLaborBudget} from '../app/components/shift-labor-forecast.mjs';

const staff=[{id:'salary',name:'社員',active:true},{id:'hourly',name:'アルバイト',active:true}];
const compensation=[
 {staff_id:'salary',effective_from:'2026-09-01',monthly_salary:250000,hourly_wage:0,transportation_fee:0},
 {staff_id:'hourly',effective_from:'2026-09-01',monthly_salary:0,hourly_wage:1300,transportation_fee:500}
];
const s=(date,period='all',role='PA',id='hourly',other={})=>({shift_date:date,staff_id:id,work_period:period,role_name:role,...other});
const calc=(schedules,hours=DEFAULT_SHIFT_PAID_HOURS,other={})=>estimateMonthlyShiftLabor({month:'2026-11',staff,compensation,schedules,hours,...other});

test('includes monthly salary once even with no shifts',()=>assert.deepEqual([calc([]).salary,calc([]).total],[250000,250000]));
test('hourly estimate and transport once per day',()=>{
 const result=calc([s('2026-11-04'),s('2026-11-04','all','照明'),s('2026-11-05')]);
 assert.equal(result.salary,250000);
 assert.equal(result.hourly,2*8*1300);
 assert.equal(result.transport,2*500);
 assert.equal(result.total,271800);
 assert.equal(result.shiftDays,2);
});
test('day and night parts combine, duplicate daytime role ignored',()=>{
 const result=calc([s('2026-11-10','day'),s('2026-11-10','day','受付'),s('2026-11-10','night')]);
 assert.equal(result.hourly,(5+5)*1300);
 assert.equal(result.transport,500);
});
test('all-day takes place of shorter part of same day',()=>{
 const result=calc([s('2026-11-10','all'),s('2026-11-10','day')]);
 assert.equal(result.hourly,8*1300);
});
test('studio early and late both estimate',()=>{
 const result=calc([s('2026-11-05','all','スタジオ早番'),s('2026-11-05','all','スタジオ遅番')]);
 assert.equal(result.hourly,10*1300);
});
test('uses real planned clock times when available',()=>{
 const result=calc([s('2026-11-05','all','PA','hourly',{planned_start:'16:00',planned_end:'23:00',break_minutes:60})]);
 assert.equal(result.hourly,6*1300);
});
test('uses editable period assumptions',()=>{
 const result=calc([s('2026-11-05','day')],{...DEFAULT_SHIFT_PAID_HOURS,day:6});
 assert.equal(result.hourly,6*1300);
});
test('excludes other months and inactive staff',()=>{
 const result=calc([s('2026-12-05'),s('2026-11-05','all','PA','removed')]);
 assert.equal(result.total,250000);
});
test('uses most recent monthly compensation record',()=>{
 const result=calc([s('2026-11-05')],DEFAULT_SHIFT_PAID_HOURS,{compensation:[...compensation,{staff_id:'hourly',effective_from:'2026-11-01',hourly_wage:1400,transportation_fee:600}]});
 assert.equal(result.hourly,8*1400);
 assert.equal(result.transport,600);
});
test('missing wage clearly reported instead of treating as actual zero',()=>{
 const result=calc([s('2026-11-05')],DEFAULT_SHIFT_PAID_HOURS,{compensation:compensation.filter(x=>x.staff_id!=='hourly')});
 assert.deepEqual(result.missingRates,['アルバイト']);
 assert.equal(result.hourly,0);
});
test('does not count salary twice when staff has multiple events',()=>{
 const result=calc([s('2026-11-05','day','PA','salary'),s('2026-11-05','night','照明','salary')]);
 assert.equal(result.salary,250000);
 assert.equal(result.hourly,0);
});


test('position-specific all-day hours produce different costs for PA and reception',()=>{
 const people=[{id:'a',name:'PA'},{id:'b',name:'受付'}];
 const pay=people.map(person=>({staff_id:person.id,effective_from:'2026-11-01',hourly_wage:1300,monthly_salary:0,transportation_fee:0}));
 const result=estimateMonthlyShiftLabor({month:'2026-11',staff:people,compensation:pay,schedules:[
  s('2026-11-14','all','PA','a'),s('2026-11-14','all','受付','b')
 ],rules:[
  {position_name:'PA',shift_kind:'all',paid_hours:10},
  {position_name:'受付',shift_kind:'all',paid_hours:6}
 ]});
 assert.equal(result.hourly,(10+6)*1300);
 assert.equal(result.unconfiguredPairs.length,0);
});
test('position and period both affect forecast, while overlapping roles do not duplicate hours',()=>{
 const result=calc([
  s('2026-11-07','day','PA'),s('2026-11-07','day','照明'),
  s('2026-11-07','night','受付')
 ],DEFAULT_SHIFT_PAID_HOURS,{rules:[
  {position_name:'PA',shift_kind:'day',paid_hours:7},
  {position_name:'照明',shift_kind:'day',paid_hours:8},
  {position_name:'受付',shift_kind:'night',paid_hours:4}
 ]});
 assert.equal(result.hourly,(8+4)*1300);
 assert.equal(result.transport,500);
});
test('actual planned clock times supersede saved position rules',()=>{
 const result=calc([
  s('2026-11-08','all','PA','hourly',{planned_start:'15:00',planned_end:'21:00',break_minutes:60})
 ],DEFAULT_SHIFT_PAID_HOURS,{rules:[{position_name:'PA',shift_kind:'all',paid_hours:12}]});
 assert.equal(result.hourly,5*1300);
 assert.deepEqual(result.unconfiguredPairs,[]);
});
test('unconfigured role and period are marked provisional',()=>{
 const result=calc([s('2026-11-08','all','PA')],DEFAULT_SHIFT_PAID_HOURS,{rules:[{position_name:'PA',shift_kind:'night',paid_hours:9}]});
 assert.equal(result.hourly,8*1300);
 assert.deepEqual(result.unconfiguredPairs,[{position_name:'PA',shift_kind:'all'}]);
});
test('studio early and late roles can use independent paid hours',()=>{
 const result=calc([s('2026-11-08','all','スタジオ早番'),s('2026-11-08','all','スタジオ遅番')],DEFAULT_SHIFT_PAID_HOURS,{rules:[
  {position_name:'スタジオ早番',shift_kind:'studioEarly',paid_hours:4},
  {position_name:'スタジオ遅番',shift_kind:'studioLate',paid_hours:6}
 ]});
 assert.equal(result.hourly,10*1300);
});

test('fixed monthly salary is added to the entered hourly-only labor budget',()=>{
 const month='2026-11';
 const fixed=fixedMonthlySalaryTotal({month,staff,compensation});
 const plan=resolveMonthlyLaborBudget({hourly_labor_budget:100000,labor_budget:350000},fixed);
 assert.equal(fixed,250000);
 assert.deepEqual(plan,{mode:'variable',hourly:100000,fixed:250000,total:350000});
});
test('monthly salaries are counted once per employee and respect effective payroll histories',()=>{
 const employees=[...staff,{id:'second',name:'社員2',active:true}];
 const history=[...compensation,
  {staff_id:'salary',effective_from:'2026-12-01',monthly_salary:300000},
  {staff_id:'second',effective_from:'2026-10-01',monthly_salary:220000}
 ];
 assert.equal(fixedMonthlySalaryTotal({month:'2026-11',staff:employees,compensation:history}),470000);
 assert.equal(fixedMonthlySalaryTotal({month:'2026-12',staff:employees,compensation:history}),520000);
});
test('legacy budget remains the original total until hourly budget explicitly saved',()=>{
 const legacy=resolveMonthlyLaborBudget({labor_budget:400000,hourly_labor_budget:null},250000);
 assert.deepEqual(legacy,{mode:'legacy',hourly:null,fixed:null,total:400000});
 assert.deepEqual(resolveMonthlyLaborBudget(undefined,250000),{mode:'unset',hourly:null,fixed:null,total:null});
});
test('zero hourly budget still adds monthly salary without treating it as unset',()=>{
 const plan=resolveMonthlyLaborBudget({hourly_labor_budget:0,labor_budget:250000},250000);
 assert.deepEqual(plan,{mode:'variable',hourly:0,fixed:250000,total:250000});
});
