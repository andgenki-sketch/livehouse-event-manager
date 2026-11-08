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
function paidHours(shift, assumptions) {
  const start=String(shift.planned_start||''),end=String(shift.planned_end||'');
  if (/^\d{2}:\d{2}/.test(start)&&/^\d{2}:\d{2}/.test(end)) {
    const mins=s=>{const [h,m]=s.slice(0,5).split(':').map(Number);return h*60+m;};
    const time=(mins(end)-mins(start)+1440)%1440;
    return Math.max(0,(time-safeMoney(shift.break_minutes))/60);
  }
  const kind=shiftKind(shift);
  const value=Number(assumptions[kind]);
  return Number.isFinite(value)?Math.max(0,Math.min(24,value)):0;
}
function dailyHours(rows, assumptions) {
  const byPeriod=new Map();
  for (const row of rows) {
    const key=shiftKind(row),hours=paidHours(row,assumptions);
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
export function estimateMonthlyShiftLabor({month,staff=[],schedules=[],compensation=[],hours=DEFAULT_SHIFT_PAID_HOURS}) {
  const active=staff.filter(s=>s?.id&&s.active!==false);
  const activeIds=new Set(active.map(s=>s.id));
  const thisMonth=schedules.filter(x=>String(x.shift_date||'').startsWith(month)&&activeIds.has(x.staff_id)&&x.status!=='canceled');
  const daily=new Map();
  for (const row of thisMonth) {
    const key=row.staff_id+'|'+row.shift_date;
    if (!daily.has(key))daily.set(key,[]);
    daily.get(key).push(row);
  }
  const byStaff=new Map();
  for(const [key,rows] of daily) {
    const id=rows[0].staff_id;
    if (!byStaff.has(id)) byStaff.set(id,{days:0,hours:0});
    const item=byStaff.get(id);
    item.days+=1;
    item.hours+=dailyHours(rows,hours);
  }
  let fixed=0,hourly=0,transport=0,missingRates=[],hourlyDays=0;
  for (const person of active) {
    const pay=monthPay(person.id,month,compensation,person);
    const plan=byStaff.get(person.id);
    if (pay.monthlySalary>0)fixed+=pay.monthlySalary;
    else if(plan?.days) {
      if (pay.hourlyWage>0)hourly+=Math.round(plan.hours*pay.hourlyWage);
      else missingRates.push(person.name||'スタッフ');
      hourlyDays+=plan.days;
    }
    if(plan?.days)transport+=plan.days*pay.transport;
  }
  return {
    total:Math.round(fixed+hourly+transport),
    salary:Math.round(fixed),
    hourly:Math.round(hourly),
    transport:Math.round(transport),
    shiftDays:daily.size,
    shiftCount:thisMonth.length,
    workers:byStaff.size,
    missingRates,
    hourlyDays
  };
}
