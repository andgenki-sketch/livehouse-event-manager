import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveMonthlyLaborBudget} from '../app/components/shift-labor-forecast.mjs';

const page=readFileSync(new URL('../app/page.js',import.meta.url),'utf8');
const section=(start,end)=>{
 const i=page.indexOf(start),j=page.indexOf(end,i+start.length);
 assert.ok(i>=0&&j>i,'find section '+start);
 return page.slice(i,j);
};
const register=section('function FinanceRegister(','function savedEventReport(');
const money=section("{view==='money'&&<>","{modal==='timetable'");

test('event income/expense view explicitly asks for hourly-only scope',()=>{
 assert.match(money,/canEditBudget=\{false\} laborBudgetScope="hourly"/);
 assert.match(register,/laborBudgetScope='total'/);
 assert.match(register,/hourlyOnly=laborBudgetScope==='hourly'/);
});

test('budget pulse uses hourly planned amount and matching hourly actual',()=>{
 assert.match(register,/displayedLaborBudget=hourlyOnly\?laborPlan\.hourly:/);
 assert.match(register,/displayedLaborActual=hourlyOnly\|\|\(laborPlan\.mode==='variable'&&canEditBudget\)\?actualHourlyLabor:actualLabor/);
 assert.match(register,/<BudgetPulseCard title=\{hourlyOnly\?'時給人件費'/);
 assert.match(register,/budget=\{displayedLaborBudget\} actual=\{displayedLaborActual\}/);
});

test('monthly salary remains in the total plan but is not included in event screen budget',()=>{
 const plan=resolveMonthlyLaborBudget({hourly_labor_budget:120000,labor_budget:390000},270000);
 assert.deepEqual({hourly:plan.hourly,total:plan.total}, {hourly:120000,total:390000});
 assert.notEqual(plan.hourly,plan.total);
 assert.match(register,/hourlyOnly\?laborPlan\.hourly:laborPlan\.total/);
});

test('historical total budget without hourly breakdown is not guessed',()=>{
 const plan=resolveMonthlyLaborBudget({labor_budget:400000,hourly_labor_budget:null},300000);
 assert.equal(plan.hourly,null);
 assert.equal(plan.total,400000);
 assert.match(register,/fyLaborMissing=hourlyOnly\?fiscalRows\.filter\(row=>row\.hourly_labor_budget==null\)\.length:0/);
 assert.match(register,/fyOutsideMissing\|\|fyLaborMissing\?'未算出'/);
});

test('yearly hourly-only summary has explicit label and salary-excluding reference balance',()=>{
 assert.match(register,/年間時給人件費予算/);
 assert.match(register,/年間参考予算収支（月給除く）/);
 assert.match(register,/参考予算収支（月給を含まず、時給・外注費を控除）/);
});

test('finance management continues to use original salary-inclusive scope',()=>{
 const finance=section("{team?.role==='owner'&&view==='finance'","{canViewContracts&&view==='money'&&financeLoadError");
 assert.match(finance,/canEditBudget=\{true\} staff=\{staff\}/);
 assert.doesNotMatch(finance,/laborBudgetScope="hourly"/);
});
