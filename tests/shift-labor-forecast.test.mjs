import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateMonthlyShiftLabor,DEFAULT_SHIFT_PAID_HOURS,fixedMonthlySalaryTotal,resolveMonthlyLaborBudget,compareShiftLaborBudget} from '../app/components/shift-labor-forecast.mjs';

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

const yama={staff_id:'contractor',default_mode:'external',day_rate:16500,night_rate:16500,all_rate:27500};
const contractor={id:'contractor',name:'山岡真司',active:true};
const contractorRows=rows=>estimateMonthlyShiftLabor({month:'2026-11',staff:[contractor],schedules:rows,compensation:[],externalConfigs:[yama]});
test('contractor day two shifts and full one shift total 60,500 yen independent of payroll',()=>{
 const result=contractorRows([
  s('2026-11-01','day','PA','contractor'),
  s('2026-11-02','day','照明','contractor'),
  s('2026-11-03','all','PA','contractor')
 ]);
 assert.equal(result.outsourcing,60500);
 assert.equal(result.hourly,0);
 assert.equal(result.salary,0);
 assert.equal(result.total,0);
 assert.equal(result.combinedTotal,60500);
 assert.equal(result.externalDays,3);
 assert.deepEqual(result.missingRates,[]);
});
test('two half-day contractor shifts on one day are billed once at all-day amount',()=>{
 const result=contractorRows([
  s('2026-11-04','day','PA','contractor'),
  s('2026-11-04','night','照明','contractor')
 ]);
 assert.equal(result.outsourcing,27500);
 assert.equal(result.externalDays,1);
});
test('multiple same-day same-period contractor roles do not double bill',()=>{
 const result=contractorRows([
  s('2026-11-05','day','PA','contractor'),
  s('2026-11-05','day','照明','contractor')
 ]);
 assert.equal(result.outsourcing,16500);
});
test('hourly override on contractor shift is excluded from outsourcing and uses hourly pay',()=>{
 const wages=[{staff_id:'contractor',effective_from:'2026-11-01',hourly_wage:1400,monthly_salary:0,transportation_fee:0}];
 const result=estimateMonthlyShiftLabor({month:'2026-11',staff:[contractor],
  schedules:[s('2026-11-06','all','PA','contractor',{payment_override:'hourly'})],
  compensation:wages,externalConfigs:[yama]});
 assert.equal(result.hourly,11200);
 assert.equal(result.outsourcing,0);
 assert.equal(result.total,11200);
});
test('contractor is excluded from fixed salary budget, even with older salary history',()=>{
 const wages=[{staff_id:'contractor',effective_from:'2026-09-01',monthly_salary:200000,hourly_wage:0}];
 assert.equal(fixedMonthlySalaryTotal({month:'2026-11',staff:[contractor],compensation:wages,externalConfigs:[yama]}),0);
 const result=estimateMonthlyShiftLabor({month:'2026-11',staff:[contractor],compensation:wages,
 schedules:[s('2026-11-07','all','PA','contractor')],externalConfigs:[yama]});
 assert.equal(result.salary,0);
 assert.equal(result.outsourcing,27500);
});
test('unconfigured external day rate warns rather than treating zero as actual',()=>{
 const result=estimateMonthlyShiftLabor({month:'2026-11',staff:[contractor],
  schedules:[s('2026-11-07','all','PA','contractor',{payment_override:'external'})],externalConfigs:[]});
 assert.equal(result.outsourcing,0);
 assert.equal(result.missingExternalRates.length,1);
});
test('mixed payment modes for same person and date flags review',()=>{
 const wages=[{staff_id:'contractor',effective_from:'2026-11-01',hourly_wage:1400}];
 const result=estimateMonthlyShiftLabor({month:'2026-11',staff:[contractor],compensation:wages,externalConfigs:[yama],
  schedules:[s('2026-11-08','day','PA','contractor'),s('2026-11-08','night','受付','contractor',{payment_override:'hourly'})]});
 assert.equal(result.outsourcing,16500);
 assert.equal(result.hourly,5*1400);
 assert.equal(result.mixedDays.length,1);
});

test('2026-11 hourly budget 100,000 plus salary 850,000 yields 950,000 total, not 100,000',()=>{
 const c=compareShiftLaborBudget({row:{hourly_labor_budget:100000,labor_budget:950000},
  salary:850000,hourly:203581});
 assert.equal(c.budget,950000);
 assert.equal(c.forecast,1053581);
 assert.equal(c.remaining,-103581);
 assert.equal(c.hourlyDifference,103581);
 assert.equal(c.status,'over');
 assert.equal(Math.round(c.ratio),111);
});
test('legacy total budget cannot be mistaken for 100,000 yen hourly budget',()=>{
 const c=compareShiftLaborBudget({row:{hourly_labor_budget:null,labor_budget:100000},salary:850000,hourly:203581});
 assert.equal(c.status,'legacy');
 assert.equal(c.remaining,null);
 assert.equal(c.ratio,null);
 assert.equal(c.hourlyDifference,null);
});
test('a salary-inclusive labor budget stays within 80 percent with hourly budget slack',()=>{
 const c=compareShiftLaborBudget({row:{hourly_labor_budget:150000},salary:850000,hourly:10000});
 assert.equal(c.budget,1000000);
 assert.equal(c.forecast,860000);
 assert.equal(c.remaining,140000);
 assert.equal(c.hourlyDifference,-140000);
 assert.equal(c.status,'warning');
});
test('no budget is not interpreted as over budget',()=>{
 const c=compareShiftLaborBudget({row:undefined,salary:850000,hourly:300000});
 assert.equal(c.status,'unset');
 assert.equal(c.ratio,null);
});
test('zero hourly budget still includes fixed salary and flags hourly overage',()=>{
 const c=compareShiftLaborBudget({row:{hourly_labor_budget:0},salary:850000,hourly:10000});
 assert.equal(c.budget,850000);
 assert.equal(c.forecast,860000);
 assert.equal(c.remaining,-10000);
 assert.equal(c.status,'over');
});
