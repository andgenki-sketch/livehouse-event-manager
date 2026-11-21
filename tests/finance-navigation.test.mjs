import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../app/page.js',import.meta.url),'utf8');
const slice=(start,end)=>{
 const a=page.indexOf(start);
 assert.ok(a>=0,'start marker must exist: '+start);
 const b=page.indexOf(end,a+start.length);
 assert.ok(b>a,'end marker must follow start: '+end);
 return page.slice(a,b);
};

test('financial management owns the payroll calculation and confirmation panel',()=>{
 const finance=slice("{team?.role==='owner'&&view==='finance'","{view==='money'&&<>");
 assert.match(finance,/\['payroll','給与計算・確定'\]/);
 assert.match(finance,/financeTab==='payroll'&&\(!payrollLoaded\|\|payrollLoadError/);
 assert.match(finance,/<PayrollPanel staff=\{staff\} schedules=\{shiftSchedules\} attendance=\{allAttendance\}/);
 assert.match(finance,/confirmations=\{payrollConfirmations\}/);
 assert.match(finance,/reload=\{loadCompensation\}/);
});

test('shift view has no duplicate owner payroll tab',()=>{
 const shift=slice('function ShiftView(', 'function TodayEventView(');
 assert.doesNotMatch(shift,/tab==='payroll'/);
 assert.doesNotMatch(shift,/onClick=\{\(\)=>setTab\('payroll'\)\}/);
 assert.match(shift,/tab==='request'/);
 assert.match(shift,/tab==='all'/);
});

test('MyPage shift calendar uses full-day roster dialog, not shift request route',()=>{
 const mypage=slice('function MyPage(', 'function groupStaffShifts(');
 assert.match(page,/<MyPage staff=\{currentStaff\} rosterStaff=\{staff\}/);
 assert.match(mypage,/rosterStaff=\[\]/);
 assert.match(mypage,/<DayShiftRosterDialog date=\{rosterDate\}/);
 assert.match(mypage,/schedules\.filter\(s=>s\.shift_date===rosterDate\)/);
 assert.match(mypage,/new Map\(rosterStaff\.map\(s=>\[s\.id,s\]\)\)/);
 assert.match(mypage,/aria-haspopup=\{ss\.length\?'dialog':undefined\}/);
 assert.match(mypage,/onClick=\{\(\)=>setRosterDate\(ds\)\}/);
 assert.doesNotMatch(mypage,/ss\.length&&setView\('shifts'\)/);
});

test('existing shared shift dialog retains accessible close behavior',()=>{
 const dialog=slice('function DayShiftRosterDialog(', 'function ShiftView(');
 assert.match(dialog,/node\.showModal\(\)/);
 assert.match(dialog,/onCancel=\{e=>\{e\.preventDefault\(\);onClose\(\)\}\}/);
 assert.match(dialog,/<DailyStaffShiftTable shifts=\{shifts\} staffMap=\{staffMap\} events=\{events\}/);
});
