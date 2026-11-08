import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {financeAttendanceRates} from '../app/components/finance-attendance.mjs';
import {shiftEventTargets} from '../app/components/shift-periods.js';
const source=fs.readFileSync(new URL('../app/page.js',import.meta.url),'utf8');
const functions=source.slice(source.indexOf('function attendanceMinutes('),source.indexOf('function FinanceRegister('));
const cost=Function('shiftEventTargets',functions+';return eventAttendanceCost')(shiftEventTargets);
const events=[{id:'event',team_id:'team',event_date:'2026-11-01'}];
const history=[1350,1300,1279].map((hourly_wage,i)=>({team_id:'team',staff_id:String(i),effective_from:'2026-11-01',hourly_wage,monthly_salary:0,transportation_fee:0}));
const rows=[['14:16','22:49',40],['17:02','22:58',0],['16:21','22:59',0]].map(([clock_in,clock_out,break_minutes],i)=>({id:String(i),team_id:'team',staff_id:String(i),work_date:'2026-11-01',hourly_wage:0,transportation_fee:0,clock_in,clock_out,break_minutes}));
test('November 1 daily timecards resolve to 26,840 yen without rewriting timecards',()=>{
 const resolved=financeAttendanceRates(rows,events,history);
 assert.equal(cost('event',rows,events,[]),0);
 assert.equal(cost('event',resolved,events,[]),26840);
 assert.deepEqual(resolved.map(r=>cost('event',[r],events,[])),[10643,7713,8484]);
 assert.deepEqual(rows.map(r=>r.hourly_wage),[0,0,0]);
});
test('uses effective month, scopes staff by team, and keeps explicit rates/transport',()=>{
 const rates=[...history,{...history[0],effective_from:'2026-12-01',hourly_wage:1900},{...history[0],team_id:'other',hourly_wage:9999}];
 assert.equal(financeAttendanceRates(rows,events,rates)[0].hourly_wage,1350);
 const explicit={...rows[0],hourly_wage:1600,transportation_fee:500};
 assert.equal(financeAttendanceRates([explicit],events,rates)[0],explicit);
 assert.equal(financeAttendanceRates([{...rows[0],work_date:'2026-10-31'}],events,rates)[0].hourly_wage,0);
 const fee=financeAttendanceRates([{...rows[0],transportation_fee:300}],events,[{...history[0],transportation_fee:700}])[0];assert.equal(fee.transportation_fee,300);
});
test('legacy event records, overnight work and monthly salary remain supported',()=>{
 const legacy={...rows[0],event_id:'event',work_date:null,clock_in:'22:00',clock_out:'02:00',break_minutes:30};
 assert.equal(cost('event',financeAttendanceRates([legacy],events,history),events,[]),4725);
 const monthly=financeAttendanceRates([legacy],events,[{...history[0],monthly_salary:250000,hourly_wage:0}]);assert.equal(cost('event',monthly,events,[]),0);
});
test('multiple events allocate the daily amount once and keep total rounding',()=>{
 const two=[events[0],{...events[0],id:'event2'}],resolved=financeAttendanceRates(rows,two,history);
 assert.equal(cost('event',resolved,two,[])+cost('event2',resolved,two,[]),26840);
 const shifts=rows.map(r=>({team_id:'team',staff_id:r.staff_id,shift_date:r.work_date,work_period:'all'}));
 assert.equal(cost('event',resolved,two,shifts)+cost('event2',resolved,two,shifts),26840);
});
