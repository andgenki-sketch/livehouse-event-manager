/**
 * Early monthly salary forecast based on confirmed shift schedules and
 * owner-visible effective payroll history. This is NOT finalized payroll.
 * Preset durations are paid hours after breaks. Rows for the same person/date
 * often represent multiple roles; do not count overlapping periods twice.
 */
export const DEFAULT_SHIFT_PAID_HOURS = Object.freeze({
  day: 5, night: 5, all: 8, studioEarly: 5, studioLate: 5
});

function safeMoney(n) { const v=Number(n); return Number.isFinite(v)&&v>0?v:0; }
function shiftKind(shift) {
  const role=String(shift.role_name||'').trim();
  if (role==='スタジオ早番') return 'studioEarly';
  if (role==='スタジオ遅番') return 'studioLate';
  return shift.work_period==='day'?'day':shift.work_period==='night'?'night':'all';
}
export function shiftLaborKind(shift) { return shiftKind(shift); }
export function shiftPaymentMode(shift,config) {
 const override=shift?.payment_override;
 return override==='hourly'||override==='external'?override:(config?.default_mode==='external'?'external':'hourly');
}
export function externalDailyRate(rows,config) {
 const kinds=new Set(rows.map(shiftKind));
 const full=kinds.has('all')||(kinds.has('day')&&kinds.has('night'))||(kinds.has('studioEarly')&&kinds.has('studioLate'));
 const rate=full?'all_rate':kinds.has('day')||kinds.has('studioEarly')?'day_rate':'night_rate';
 return {rate:Math.max(0,Number(config?.[rate]||0)),kind:full?'all':rate==='day_rate'?'day':'night'};
}
export function shiftLaborRuleKey(role,kind) { return JSON.stringify([String(role||'').trim(),kind]); }
function paidHours(shift, assumptions, ruleMap) {
  const start=String(shift.planned_start||''),end=String(shift.planned_end||'');
  if (/^\d{2}:\d{2}/.test(start)&&/^\d{2}:\d{2}/.test(end)) {
    const mins=s=>{const [h,m]=s.slice(0,5).split(':').map(Number);return h*60+m;};
    const time=(mins(end)-mins(start)+1440)%1440;
    return Math.max(0,(time-safeMoney(shift.break_minutes))/60);
  }
  const kind=shiftKind(shift);
  const specific=ruleMap.get(shiftLaborRuleKey(shift.role_name,kind));
  const value=Number(specific===undefined?assumptions[kind]:specific);
  return Number.isFinite(value)?Math.max(0,Math.min(24,value)):0;
}
function dailyHours(rows, assumptions, ruleMap) {
  const byPeriod=new Map();
  for (const row of rows) {
    const key=shiftKind(row),hours=paidHours(row,assumptions,ruleMap);
    byPeriod.set(key,Math.max(byPeriod.get(key)||0,hours));
  }
  const venue=Math.max(byPeriod.get('all')||0,(byPeriod.get('day')||0)+(byPeriod.get('night')||0));
  const studio=(byPeriod.get('studioEarly')||0)+(byPeriod.get('studioLate')||0);
  // Without clock times, venue and studio assignments may overlap.
  // Use the larger estimate, rather than double-charge two roles on one day.
  return Math.min(24,Math.max(venue,studio));
}
function monthPay(staffId, month, history, staff) {
  const start=month+'-01';
  const recent=history.filter(p=>p.staff_id===staffId&&String(p.effective_from||'')<=start).sort((a,b)=>String(b.effective_from).localeCompare(String(a.effective_from)))[0];
  return {
    monthlySalary:safeMoney(recent?.monthly_salary),
    hourlyWage:safeMoney(recent?.hourly_wage)||(!recent?safeMoney(staff.hourly_wage):0),
    transport:safeMoney(recent?.transportation_fee)||(!recent?safeMoney(staff.transportation_fee):0)
  };
}
/**
 * Monthly payroll fixed portion is counted once per active employee, regardless
 * of the number of assigned shifts. Salary history at the chosen month applies.
 */
export function fixedMonthlySalaryTotal({month,staff=[],compensation=[],externalConfigs=[]}) {
 const byExternal=new Map(externalConfigs.map(r=>[r.staff_id,r]));
 return Math.round(staff.filter(person=>person?.id&&person.active!==false&&byExternal.get(person.id)?.default_mode!=='external')
  .reduce((sum,person)=>sum+monthPay(person.id,month,compensation,person).monthlySalary,0));
}
/**
 * Keep legacy total labor budget records unchanged until the owner explicitly
 * enters an hourly budget. New records store variable wages separately, and
 * dynamically add the effective monthly salaries for owner displays.
 */
export function resolveMonthlyLaborBudget(row,fixedSalary=0) {
 if(!row)return {mode:'unset',hourly:null,fixed:null,total:null};
 if(row.hourly_labor_budget===null||row.hourly_labor_budget===undefined)
  return {mode:'legacy',hourly:null,fixed:null,total:Number(row.labor_budget||0)};
 const hourly=Number(row.hourly_labor_budget||0);
 const fixed=Number(fixedSalary||0);
 return {mode:'variable',hourly,fixed,total:hourly+fixed};
}
/**
 * Salary-inclusive budget comparison; hourly-only targets are stored separately.
 * Legacy budgets are NEVER treated as hourly spending limits automatically.
 */
export function compareShiftLaborBudget({row,salary=0,hourly=0}) {
 const plan=resolveMonthlyLaborBudget(row,salary);
 const forecast=Number(salary||0)+Number(hourly||0);
 if(plan.mode!=='variable')
  return {plan,forecast,budget:plan.total,remaining:null,ratio:null,
    status:plan.mode, hourlyDifference:null};
 const budget=Number(plan.total);
 const remaining=budget-forecast;
 const ratio=budget>0?forecast/budget*100:null;
 const hourlyBudget=Number(plan.hourly||0),hourlyForecast=Number(hourly||0);
 const hourlyDifference=hourlyForecast-hourlyBudget;
 const hourlyRatio=hourlyBudget>0?hourlyForecast/hourlyBudget*100:null;
 // Only the controllable hourly portion triggers attention; fixed salaries
 // should not make every month look near its spending limit on day one.
 const status=hourlyDifference>0?'over':hourlyBudget>0&&hourlyForecast>=hourlyBudget*.8?'warning':'normal';
 return {plan,forecast,budget,remaining,ratio,status,hourlyDifference,hourlyRatio};
}
export function estimateMonthlyShiftLabor({month,staff=[],schedules=[],compensation=[],hours=DEFAULT_SHIFT_PAID_HOURS,rules=[],externalConfigs=[]}) {
  const externalByStaff=new Map(externalConfigs.map(r=>[r.staff_id,r]));
  const ruleMap=new Map(rules.filter(r=>r&&r.position_name&&r.shift_kind).map(r=>[shiftLaborRuleKey(r.position_name,r.shift_kind),Number(r.paid_hours)]));
  const active=staff.filter(s=>s?.id&&s.active!==false);
  const activeIds=new Set(active.map(s=>s.id));
  const thisMonth=schedules.filter(x=>String(x.shift_date||'').startsWith(month)&&activeIds.has(x.staff_id)&&x.status!=='canceled');
  const daily=new Map();
  for (const row of thisMonth) {
    const key=row.staff_id+'|'+row.shift_date;
    if (!daily.has(key))daily.set(key,[]);
    daily.get(key).push(row);
  }
  const byStaff=new Map(),unconfigured=new Map();
  const mixedDays=[],missingExternalRates=[];
  let outsourcing=0,externalDays=0,externalWorkers=new Set();
  for(const [key,rows] of daily) {
    const id=rows[0].staff_id,config=externalByStaff.get(id);
    const externalRows=rows.filter(row=>shiftPaymentMode(row,config)==='external');
    const hourlyRows=rows.filter(row=>shiftPaymentMode(row,config)!=='external');
    const item=byStaff.get(id)||{days:0,hours:0};
    if(hourlyRows.length){
      item.days+=1;
      item.hours+=dailyHours(hourlyRows,hours,ruleMap);
      byStaff.set(id,item);
      for(const row of hourlyRows){
        if(row.planned_start&&row.planned_end)continue;
        const kind=shiftKind(row),role=String(row.role_name||'').trim();
        const ruleKey=shiftLaborRuleKey(role,kind);
        if(!ruleMap.has(ruleKey))unconfigured.set(ruleKey,{position_name:role||'担当未設定',shift_kind:kind});
      }
    }
    if(externalRows.length){
      externalDays+=1;externalWorkers.add(id);
      const {rate,kind}=externalDailyRate(externalRows,config);
      outsourcing+=rate;
      if(rate<=0)missingExternalRates.push({staff_id:id,shift_date:rows[0].shift_date,kind});
    }
    if(hourlyRows.length&&externalRows.length)mixedDays.push(key);
  }
  let fixed=0,hourly=0,transport=0,missingRates=[],hourlyDays=0;
  for (const person of active) {
    const pay=monthPay(person.id,month,compensation,person);
    const plan=byStaff.get(person.id);
    const isExternal=externalByStaff.get(person.id)?.default_mode==='external';
    if(!isExternal&&pay.monthlySalary>0)fixed+=pay.monthlySalary;
    else if(plan?.days) {
      if(pay.hourlyWage>0)hourly+=Math.round(plan.hours*pay.hourlyWage);
      else missingRates.push(person.name||'スタッフ');
      hourlyDays+=plan.days;
    }
    if(plan?.days)transport+=plan.days*pay.transport;
  }
  const total=Math.round(fixed+hourly+transport);
  return {
    total,salary:Math.round(fixed),hourly:Math.round(hourly),
    transport:Math.round(transport),
    outsourcing:Math.round(outsourcing),
    combinedTotal:Math.round(total+outsourcing),
    externalDays,externalWorkers:externalWorkers.size,mixedDays,missingExternalRates,
    shiftDays:daily.size,shiftCount:thisMonth.length,workers:new Set([...byStaff.keys(),...externalWorkers]).size,
    missingRates,unconfiguredPairs:[...unconfigured.values()],hourlyDays
  };
}
